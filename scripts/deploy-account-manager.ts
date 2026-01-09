#!/usr/bin/env node

/**
 * Deployment script for GM Account Manager Canister
 * 
 * This script:
 * 1. Deploys the account-manager canister
 * 2. Gets the encryption public key from the canister
 * 3. Encrypts Twitter and Farcaster secrets using the public key
 * 4. Calls setTwitterConfig and setFarcasterConfig with encrypted secrets
 * 
 * Usage:
 *   npx ts-node scripts/deploy-account-manager.ts [network] [identity]
 *   Example: npx ts-node scripts/deploy-account-manager.ts ic mainnet
 * 
 * Environment variables (required):
 *   TWITTER_CLIENT_ID - Twitter OAuth client ID
 *   TWITTER_CLIENT_SECRET - Twitter OAuth client secret (will be encrypted)
 *   TWITTER_REDIRECT_URI - Twitter OAuth redirect URI
 *   FARCASTER_API_KEY - Farcaster API key (will be encrypted)
 * 
 * Environment variables (optional):
 *   FARCASTER_API_URL - Farcaster API URL (defaults to https://api.warpcast.com)
 * 
 * Example:
 *   export TWITTER_CLIENT_ID="your-client-id"
 *   export TWITTER_CLIENT_SECRET="your-client-secret"
 *   export TWITTER_REDIRECT_URI="https://your-app.com/callback"
 *   export FARCASTER_API_KEY="your-api-key"
 *   npx ts-node scripts/deploy-account-manager.ts ic mainnet
 */

import { execSync } from 'child_process';
import * as forge from 'node-forge';

// Configuration
const CANISTER_NAME = 'gm-account-manager-canister';
const DEFAULT_NETWORK = 'ic';
const DEFAULT_IDENTITY = 'mainnet';

// Get command line arguments
const network = process.argv[2] || DEFAULT_NETWORK;
const identity = process.argv[3] || DEFAULT_IDENTITY;

// Get secrets from environment variables
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI;
const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY;
const FARCASTER_API_URL = process.env.FARCASTER_API_URL || 'https://api.warpcast.com';

// Validate required environment variables
function validateEnvVars(): void {
    const missing: string[] = [];

    if (!TWITTER_CLIENT_ID) missing.push('TWITTER_CLIENT_ID');
    if (!TWITTER_CLIENT_SECRET) missing.push('TWITTER_CLIENT_SECRET');
    if (!TWITTER_REDIRECT_URI) missing.push('TWITTER_REDIRECT_URI');
    if (!FARCASTER_API_KEY) missing.push('FARCASTER_API_KEY');

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\nPlease set these environment variables before running the script.');
        process.exit(1);
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
 */
function getPublicKey(): string {
    console.log('🔑 Getting encryption public key from canister...');

    try {
        const publicKey = execDfx(
            `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} encryptionPublicKey`
        );

        // Parse the response - dfx returns format like: ("-----BEGIN PUBLIC KEY-----\n...")
        // Remove parentheses and quotes, handle escaped newlines
        let parsed = publicKey.trim();

        // Remove outer parentheses if present
        if (parsed.startsWith('(') && parsed.endsWith(')')) {
            parsed = parsed.slice(1, -1).trim();
        }

        // Remove quotes if present
        if (parsed.startsWith('"') && parsed.endsWith('"')) {
            parsed = parsed.slice(1, -1);
        }

        // Replace escaped newlines with actual newlines
        parsed = parsed.replace(/\\n/g, '\n');

        if (!parsed.includes('BEGIN PUBLIC KEY')) {
            throw new Error('Invalid public key format received from canister');
        }

        console.log('✅ Public key retrieved');
        return parsed;
    } catch (error: any) {
        console.error('❌ Failed to get public key:', error.message);
        throw error;
    }
}

/**
 * Encrypt a secret using the public key
 */
function encryptSecret(secret: string, publicKeyPem: string): string {
    try {
        const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
        const encryptedBytes = publicKey.encrypt(secret, 'RSA-OAEP');
        return forge.util.encode64(encryptedBytes);
    } catch (error: any) {
        console.error('❌ Encryption failed:', error.message);
        throw error;
    }
}

/**
 * Set Twitter configuration with encrypted secrets
 */
function setTwitterConfig(publicKeyPem: string): void {
    console.log('🔐 Encrypting Twitter secrets...');

    const encryptedClientSecret = encryptSecret(TWITTER_CLIENT_SECRET!, publicKeyPem);

    console.log('📝 Setting Twitter configuration...');

    try {
        // Escape strings for Candid (need to escape backslashes and quotes)
        const escapeCandid = (str: string): string => {
            return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        };

        const clientIdEscaped = escapeCandid(TWITTER_CLIENT_ID!);
        const clientSecretEscaped = escapeCandid(encryptedClientSecret);
        const redirectUriEscaped = escapeCandid(TWITTER_REDIRECT_URI!);

        const command = `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} setTwitterConfig '(
            record {
                clientId = "${clientIdEscaped}";
                clientSecretEncrypted = "${clientSecretEscaped}";
                redirectUri = "${redirectUriEscaped}";
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
function setFarcasterConfig(publicKeyPem: string): void {
    console.log('🔐 Encrypting Farcaster secrets...');

    const encryptedApiKey = encryptSecret(FARCASTER_API_KEY!, publicKeyPem);

    console.log('📝 Setting Farcaster configuration...');

    try {
        // Escape strings for Candid (need to escape backslashes and quotes)
        const escapeCandid = (str: string): string => {
            return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        };

        const apiKeyEscaped = escapeCandid(encryptedApiKey);
        const apiUrlEscaped = escapeCandid(FARCASTER_API_URL);

        const command = `dfx canister call --network ${network} --identity ${identity} ${CANISTER_NAME} setFarcasterConfig '(
            record {
                apiKeyEncrypted = "${apiKeyEscaped}";
                apiUrl = opt "${apiUrlEscaped}";
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

        // Step 4: Set Twitter configuration with encrypted secrets
        console.log('\n🐦 Configuring Twitter...');
        setTwitterConfig(publicKey);

        // Step 5: Set Farcaster configuration with encrypted secrets
        console.log('\n🔮 Configuring Farcaster...');
        setFarcasterConfig(publicKey);

        console.log('\n✅ Deployment and configuration complete!');
        console.log('\n📊 Summary:');
        console.log(`   - Canister: ${CANISTER_NAME}`);
        console.log(`   - Network: ${network}`);
        console.log(`   - Identity: ${identity}`);
        console.log(`   - Canister ID: ${canisterId}`);
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
