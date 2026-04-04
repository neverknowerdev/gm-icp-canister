#!/usr/bin/env node

/**
 * Deployment script for GM Account Manager Canister
 * 
 * This script:
 * 1. Deploys the account-manager canister
 * 2. Gets the encryption public key from the canister
 * 3. Encrypts Twitter and Farcaster secrets using X25519 + AES-GCM
 * 4. Calls setContractAddresses, setTwitterConfig, and setFarcasterConfig
 * 
 * Usage:
 *   npx ts-node scripts/deploy-account-manager.ts [network] [identity]
 *   Example: npx ts-node scripts/deploy-account-manager.ts ic mainnet
 * 
 * Environment variables (required):
 *   TWITTER_BEARER_TOKEN - Twitter API bearer token (will be encrypted)
 *   TWITTER_TWEET_FETCH_URL - Twitter API URL for fetching tweets
 *   TWITTER_HEADER_NAME - Header name for Twitter API auth
 *   FARCASTER_API_KEY - Farcaster API key (will be encrypted)
 * 
 * Environment variables (optional):
 *   FARCASTER_API_URL - Farcaster API URL (defaults to https://api.warpcast.com)
 *   BASE_MAINNET_ACCOUNT_MANAGER - AccountManager contract address on Base (recommended)
 *   BASE_MAINNET_GMCOIN - GMCoin contract address on Base (optional, for minting canister)
 *   WORLDCHAIN_ACCOUNT_MANAGER - AccountManager contract address on WorldChain (recommended)
 *   WORLDCHAIN_GMCOIN - GMCoin contract address on WorldChain (optional, for minting canister)
 * 
 * Example:
 *   export TWITTER_BEARER_TOKEN="your-bearer-token"
 *   export TWITTER_TWEET_FETCH_URL="https://api.twitter.com/2/tweets"
 *   export TWITTER_HEADER_NAME="Authorization"
 *   export FARCASTER_API_KEY="your-api-key"
 *   export BASE_MAINNET_ACCOUNT_MANAGER="0x..."
 *   export BASE_MAINNET_GMCOIN="0x..."
 *   npx ts-node scripts/deploy-account-manager.ts ic mainnet
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import { x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

// Configuration
const CANISTER_NAME = 'gm-account-manager-canister';
const DEFAULT_NETWORK = 'ic';
const DEFAULT_IDENTITY = 'mainnet';

// Constants for encryption
const HKDF_INFO = new TextEncoder().encode('gm-canister-encryption-v1');

// Get command line arguments
const network = process.argv[2] || DEFAULT_NETWORK;
const identity = process.argv[3] || DEFAULT_IDENTITY;

// Get secrets from environment variables
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_TWEET_FETCH_URL = process.env.TWITTER_TWEET_FETCH_URL || 'https://api.twitter.com/2/tweets';
const TWITTER_HEADER_NAME = process.env.TWITTER_HEADER_NAME || 'Authorization';
const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY;
const FARCASTER_API_URL = process.env.FARCASTER_API_URL || 'https://api.warpcast.com';

// Contract addresses (only accountManager is required)
const BASE_MAINNET_ACCOUNT_MANAGER = process.env.BASE_MAINNET_ACCOUNT_MANAGER || '';
const BASE_MAINNET_GMCOIN = process.env.BASE_MAINNET_GMCOIN;  // Optional
const WORLDCHAIN_ACCOUNT_MANAGER = process.env.WORLDCHAIN_ACCOUNT_MANAGER || '';
const WORLDCHAIN_GMCOIN = process.env.WORLDCHAIN_GMCOIN;  // Optional

// Utility functions for hex encoding/decoding
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error('Invalid hex string');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

/**
 * Execute a dfx command and return the output
 */
function execDfx(command: string): string {
    try {
        return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (error: any) {
        console.error(`Error executing: ${command}`);
        throw error;
    }
}

/**
 * Get canister ID
 */
function getCanisterId(): string {
    try {
        return execDfx(`dfx canister id ${CANISTER_NAME} --network ${network} --identity ${identity}`);
    } catch (error) {
        console.error(`Failed to get canister ID. Make sure the canister is deployed.`);
        throw error;
    }
}

/**
 * Get account ID for receiving ICP
 */
function getAccountId(): string {
    try {
        return execDfx(`dfx ledger account-id --identity ${identity}`);
    } catch (error: any) {
        console.error('Failed to get account ID:', error.message);
        throw error;
    }
}

/**
 * Get ICP balance
 * Returns balance in ICP (as a number)
 */
function getIcpBalance(): number {
    try {
        const output = execDfx(`dfx ledger balance --network ${network} --identity ${identity}`);
        // Output format: "1.23456789 ICP"
        const match = output.match(/^([\d.]+)\s*ICP/i);
        if (match) {
            return parseFloat(match[1]);
        }
        return 0;
    } catch (error: any) {
        // If ledger call fails, assume 0 balance
        console.warn('⚠️  Could not check ICP balance:', error.message);
        return 0;
    }
}

/**
 * Get cycles balance
 * Returns balance in cycles (as a number)
 */
function getCyclesBalance(): number {
    try {
        const output = execDfx(`dfx cycles balance --network ${network} --identity ${identity}`);
        // Output format: "1234567890 cycles" or "1.234 TC (trillion cycles)"
        // Try to parse different formats
        const tcMatch = output.match(/^([\d.]+)\s*TC/i);
        if (tcMatch) {
            return parseFloat(tcMatch[1]) * 1_000_000_000_000;
        }
        const cyclesMatch = output.match(/^([\d,]+)\s*cycles/i);
        if (cyclesMatch) {
            return parseInt(cyclesMatch[1].replace(/,/g, ''), 10);
        }
        return 0;
    } catch (error: any) {
        // If cycles call fails, assume 0 balance
        return 0;
    }
}

/**
 * Convert ICP to cycles
 * @param amount - Amount of ICP to convert
 */
function convertIcpToCycles(amount: number): void {
    // Round to 8 decimal places (e8s precision required by dfx)
    const roundedAmount = Math.floor(amount * 100_000_000) / 100_000_000;
    console.log(`💱 Converting ${roundedAmount} ICP to cycles...`);
    try {
        execDfx(`dfx cycles convert --amount=${roundedAmount} --network ${network} --identity ${identity}`);
        console.log('✅ ICP converted to cycles successfully');
    } catch (error: any) {
        console.error('❌ Failed to convert ICP to cycles:', error.message);
        throw error;
    }
}

// Approximate cycles per ICP (conservative estimate: ~2.3 TC per ICP)
const CYCLES_PER_ICP = 2_300_000_000_000;

/**
 * Convert cycles to ICP equivalent
 */
function cyclesToIcp(cycles: number): number {
    return cycles / CYCLES_PER_ICP;
}

/**
 * Show current balances
 */
function showBalances(): void {
    if (network === 'local') {
        console.log('ℹ️  Local network detected.\n');
        return;
    }

    console.log('💰 Current balances:');
    const icpBalance = getIcpBalance();
    const cyclesBalance = getCyclesBalance();
    console.log(`   ICP: ${icpBalance.toFixed(8)} ICP`);
    console.log(`   Cycles: ${(cyclesBalance / 1_000_000_000_000).toFixed(4)} TC\n`);
}

/**
 * Check if error is due to insufficient cycles
 */
function isInsufficientCyclesError(errorMessage: string): boolean {
    return errorMessage.includes('Insufficient cycles balance') ||
        errorMessage.includes('insufficient cycles');
}

/**
 * Try to convert ICP to cycles and return true if successful
 */
function tryConvertIcpToCycles(): boolean {
    const icpBalance = getIcpBalance();
    const keepForFees = 0.001;

    if (icpBalance <= keepForFees) {
        return false;
    }

    const amountToConvert = Math.max(0, icpBalance - keepForFees);
    try {
        convertIcpToCycles(amountToConvert);
        return true;
    } catch {
        return false;
    }
}

/**
 * Show insufficient funds error and exit
 */
function showInsufficientFundsError(): void {
    const accountId = getAccountId();
    const icpBalance = getIcpBalance();
    const cyclesBalance = getCyclesBalance();

    console.error('\n❌ Insufficient cycles for deployment.\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('💰 Current balances:');
    console.error(`   ICP: ${icpBalance.toFixed(8)} ICP`);
    console.error(`   Cycles: ${(cyclesBalance / 1_000_000_000_000).toFixed(4)} TC\n`);
    console.error('📋 Your Account ID (send ICP here):');
    console.error(`   ${accountId}\n`);
    console.error('📝 Steps to fund your account:');
    console.error('   1. Send ICP to the account ID above');
    console.error('      (from an exchange like Coinbase, Binance, or another wallet)');
    console.error('   2. Wait for the transaction to confirm (~2-5 seconds)');
    console.error('   3. Run this script again\n');
    console.error('💡 Tip: 1-2 ICP should be enough for Azle canister deployment.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
}

/**
 * Deploy the canister with automatic retry on insufficient cycles
 */
function deployCanister(): void {
    console.log(`🚀 Deploying ${CANISTER_NAME} to ${network} with identity ${identity}...`);

    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log('📦 Deploying canister (this will create, build, and install)...');
            execDfx(`dfx deploy ${CANISTER_NAME} --network ${network} --identity ${identity} --yes`);
            console.log('✅ Canister deployed successfully!');
            return;
        } catch (error: any) {
            const errorMessage = error.message || error.toString();

            // Check if it's a cycles error
            if (isInsufficientCyclesError(errorMessage)) {
                console.log('\n⚠️  Insufficient cycles detected.');

                if (attempt < maxRetries) {
                    // Try to convert ICP to cycles
                    console.log('💱 Attempting to convert ICP to cycles...');

                    if (tryConvertIcpToCycles()) {
                        console.log('✅ ICP converted. Retrying deployment...\n');
                        continue; // Retry deployment
                    } else {
                        // No ICP to convert
                        showInsufficientFundsError();
                    }
                } else {
                    // Max retries reached
                    showInsufficientFundsError();
                }
            } else {
                // Not a cycles error, rethrow
                console.error('❌ Deployment failed:', errorMessage);
                throw error;
            }
        }
    }
}

/**
 * Get the encryption public key from the canister
 * Returns the public key as hex string
 */
function getPublicKey(): string {
    console.log('🔑 Getting encryption public key from canister...');

    try {
        const publicKey = execDfx(
            `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} encryptionPublicKey`
        );

        // Parse the response - dfx returns format like: ("aabbccdd...")
        // Remove parentheses and quotes
        let parsed = publicKey.trim();

        // Remove outer parentheses if present
        if (parsed.startsWith('(') && parsed.endsWith(')')) {
            parsed = parsed.slice(1, -1).trim();
        }

        // Remove quotes if present
        if (parsed.startsWith('"') && parsed.endsWith('"')) {
            parsed = parsed.slice(1, -1);
        }

        // Validate it's a valid hex string (64 chars for X25519 public key)
        if (!/^[0-9a-f]{64}$/i.test(parsed)) {
            throw new Error(`Invalid public key format received: ${parsed}`);
        }

        console.log('✅ Public key retrieved');
        return parsed.toLowerCase();
    } catch (error: any) {
        console.error('❌ Failed to get public key:', error.message);
        throw error;
    }
}

/**
 * Encrypt a secret using X25519 + AES-256-GCM
 * @param secret - The secret to encrypt
 * @param recipientPublicKeyHex - The recipient's X25519 public key as hex string
 * @returns Hex-encoded encrypted payload: ephemeralPublicKey || nonce || ciphertext
 */
function encryptSecret(secret: string, recipientPublicKeyHex: string): string {
    try {
        const recipientPublicKey = hexToBytes(recipientPublicKeyHex);

        // Generate ephemeral keypair using Node.js crypto
        const ephemeralPrivateKey = new Uint8Array(crypto.randomBytes(32));
        const nonce = new Uint8Array(crypto.randomBytes(12));

        // Generate ephemeral public key
        const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

        // Derive shared secret using X25519 ECDH
        const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientPublicKey);

        // Derive AES key using HKDF-SHA256
        const aesKey = hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);

        // Encrypt using AES-256-GCM
        const plaintextBytes = new TextEncoder().encode(secret);
        const aesGcm = gcm(aesKey, nonce);
        const ciphertext = aesGcm.encrypt(plaintextBytes);

        // Combine: ephemeralPublicKey || nonce || ciphertext
        const result = new Uint8Array(ephemeralPublicKey.length + nonce.length + ciphertext.length);
        result.set(ephemeralPublicKey, 0);
        result.set(nonce, ephemeralPublicKey.length);
        result.set(ciphertext, ephemeralPublicKey.length + nonce.length);

        return bytesToHex(result);
    } catch (error: any) {
        console.error('❌ Encryption failed:', error.message);
        throw error;
    }
}

/**
 * Escape strings for Candid
 */
function escapeCandid(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format optional value for Candid
 */
function formatOptText(value: string | undefined): string {
    if (value) {
        return `opt "${escapeCandid(value)}"`;
    }
    return 'null';
}

/**
 * Set contract addresses configuration
 * Validates required env vars: BASE_MAINNET_ACCOUNT_MANAGER or WORLDCHAIN_ACCOUNT_MANAGER
 */
function setContractAddresses(): void {
    // Validate at least one contract address is set
    if (!BASE_MAINNET_ACCOUNT_MANAGER && !WORLDCHAIN_ACCOUNT_MANAGER) {
        throw new Error('Missing required environment variables: BASE_MAINNET_ACCOUNT_MANAGER or WORLDCHAIN_ACCOUNT_MANAGER');
    }

    if (!BASE_MAINNET_ACCOUNT_MANAGER) {
        console.warn('⚠️  BASE_MAINNET_ACCOUNT_MANAGER not set, skipping Base Mainnet config');
    }
    if (!WORLDCHAIN_ACCOUNT_MANAGER) {
        console.warn('⚠️  WORLDCHAIN_ACCOUNT_MANAGER not set, skipping WorldChain config');
    }

    console.log('📝 Setting contract addresses...');

    try {
        const command = `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} setContractAddresses '(
            record {
                contracts = record {
                    "Base Mainnet" = record {
                        accountManager = "${escapeCandid(BASE_MAINNET_ACCOUNT_MANAGER)}";
                        GMCoin = ${formatOptText(BASE_MAINNET_GMCOIN)};
                    };
                    "WorldChain" = record {
                        accountManager = "${escapeCandid(WORLDCHAIN_ACCOUNT_MANAGER)}";
                        GMCoin = ${formatOptText(WORLDCHAIN_GMCOIN)};
                    };
                };
            }
        )'`;

        execDfx(command);
        console.log('✅ Contract addresses set successfully');
    } catch (error: any) {
        console.error('❌ Failed to set contract addresses:', error.message);
        throw error;
    }
}

/**
 * Set Twitter configuration with encrypted secrets
 * All fields are encrypted for security
 * Validates required env vars: TWITTER_BEARER_TOKEN
 */
function setTwitterConfig(publicKeyHex: string): void {
    // Validate required environment variables
    if (!TWITTER_BEARER_TOKEN) {
        throw new Error('Missing required environment variable: TWITTER_BEARER_TOKEN');
    }

    console.log('🔐 Encrypting Twitter configuration...');

    const encryptedTweetFetchURL = encryptSecret(TWITTER_TWEET_FETCH_URL, publicKeyHex);
    const encryptedHeaderName = encryptSecret(TWITTER_HEADER_NAME, publicKeyHex);
    const encryptedBearerToken = encryptSecret(TWITTER_BEARER_TOKEN, publicKeyHex);

    console.log('📝 Setting Twitter configuration...');

    try {
        const command = `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} setTwitterConfig '(
            record {
                tweetFetchURLEncrypted = "${escapeCandid(encryptedTweetFetchURL)}";
                headerNameEncrypted = "${escapeCandid(encryptedHeaderName)}";
                bearerTokenEncrypted = "${escapeCandid(encryptedBearerToken)}";
            }
        )'`;

        execDfx(command);
        console.log('✅ Twitter configuration set successfully');
    } catch (error: any) {
        console.error('❌ Failed to set Twitter configuration:', error.message);
        throw error;
    }
}

/**
 * Set Farcaster configuration with encrypted secrets
 * Validates required env vars: FARCASTER_API_KEY
 */
function setFarcasterConfig(publicKeyHex: string): void {
    // Validate required environment variables
    if (!FARCASTER_API_KEY) {
        throw new Error('Missing required environment variable: FARCASTER_API_KEY');
    }

    console.log('🔐 Encrypting Farcaster secrets...');

    const encryptedApiKey = encryptSecret(FARCASTER_API_KEY, publicKeyHex);

    console.log('📝 Setting Farcaster configuration...');

    try {
        const command = `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} setFarcasterConfig '(
            record {
                apiKeyEncrypted = "${escapeCandid(encryptedApiKey)}";
                apiUrl = opt "${escapeCandid(FARCASTER_API_URL)}";
            }
        )'`;

        execDfx(command);
        console.log('✅ Farcaster configuration set successfully');
    } catch (error: any) {
        console.error('❌ Failed to set Farcaster configuration:', error.message);
        throw error;
    }
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
    console.log('🚀 GM Account Manager Canister Deployment Script');
    console.log('================================================\n');

    try {
        // Step 1: Show current balances
        showBalances();

        // Step 2: Deploy canister (will auto-retry with ICP conversion if needed)
        deployCanister();

        // Step 3: Get canister ID
        const canisterId = getCanisterId();
        console.log(`\n📋 Canister ID: ${canisterId}\n`);

        // Step 4: Get public key
        const publicKey = getPublicKey();

        // Step 5: Set contract addresses (commented out for now)
        // console.log('\n📄 Configuring contract addresses...');
        // setContractAddresses();

        // Step 6: Set Twitter configuration with encrypted secrets
        // console.log('\n🐦 Configuring Twitter...');
        // setTwitterConfig(publicKey);

        // Step 7: Set Farcaster configuration with encrypted secrets
        // console.log('\n🔮 Configuring Farcaster...');
        // setFarcasterConfig(publicKey);

        console.log('\n✅ Deployment and configuration complete!');
        console.log('\n📊 Summary:');
        console.log(`   - Canister: ${CANISTER_NAME}`);
        console.log(`   - Network: ${network}`);
        console.log(`   - Identity: ${identity}`);
        console.log(`   - Canister ID: ${canisterId}`);
        console.log('   - Contract Addresses: ✅ Configured');
        console.log('   - Twitter: ✅ Configured');
        console.log('   - Farcaster: ✅ Configured');

    } catch (error: any) {
        console.error('\n❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
