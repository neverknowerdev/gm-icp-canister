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

// Validate required environment variables
function validateEnvVars(): void {
    const missing: string[] = [];

    if (!TWITTER_BEARER_TOKEN) missing.push('TWITTER_BEARER_TOKEN');
    if (!FARCASTER_API_KEY) missing.push('FARCASTER_API_KEY');

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\nPlease set these environment variables before running the script.');
        process.exit(1);
    }

    // Warn about missing contract addresses
    if (!BASE_MAINNET_ACCOUNT_MANAGER) {
        console.warn('⚠️  Base Mainnet AccountManager address not set. You can set it later.');
    }
    if (!WORLDCHAIN_ACCOUNT_MANAGER) {
        console.warn('⚠️  WorldChain AccountManager address not set. You can set it later.');
    }
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
 * Deploy the canister
 */
function deployCanister(): void {
    console.log(`🚀 Deploying ${CANISTER_NAME} to ${network} with identity ${identity}...`);

    try {
        // Build first
        console.log('🔨 Building canister...');
        execDfx(`dfx build ${CANISTER_NAME} --network ${network} --identity ${identity}`);

        // Deploy
        console.log('📦 Deploying canister...');
        execDfx(`dfx deploy ${CANISTER_NAME} --network ${network} --identity ${identity}`);

        console.log('✅ Canister deployed successfully!');
    } catch (error: any) {
        console.error('❌ Deployment failed:', error.message);
        throw error;
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
 */
function setContractAddresses(): void {
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
 */
function setTwitterConfig(publicKeyHex: string): void {
    console.log('🔐 Encrypting Twitter configuration...');

    const encryptedTweetFetchURL = encryptSecret(TWITTER_TWEET_FETCH_URL, publicKeyHex);
    const encryptedHeaderName = encryptSecret(TWITTER_HEADER_NAME, publicKeyHex);
    const encryptedBearerToken = encryptSecret(TWITTER_BEARER_TOKEN!, publicKeyHex);

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
 */
function setFarcasterConfig(publicKeyHex: string): void {
    console.log('🔐 Encrypting Farcaster secrets...');

    const encryptedApiKey = encryptSecret(FARCASTER_API_KEY!, publicKeyHex);

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

    // Validate environment variables
    validateEnvVars();

    try {
        // Step 1: Deploy canister
        deployCanister();

        // Step 2: Get canister ID
        const canisterId = getCanisterId();
        console.log(`\n📋 Canister ID: ${canisterId}\n`);

        // Step 3: Get public key
        const publicKey = getPublicKey();

        // Step 4: Set contract addresses
        console.log('\n📄 Configuring contract addresses...');
        setContractAddresses();

        // Step 5: Set Twitter configuration with encrypted secrets
        console.log('\n🐦 Configuring Twitter...');
        setTwitterConfig(publicKey);

        // Step 6: Set Farcaster configuration with encrypted secrets
        console.log('\n🔮 Configuring Farcaster...');
        setFarcasterConfig(publicKey);

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
