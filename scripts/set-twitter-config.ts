#!/usr/bin/env ts-node

/**
 * Script to set Twitter API configuration for the canister
 * 
 * Usage:
 *   TWEET_FETCH_URL="https://api.twitter.com/2/tweets" \
 *   HEADER_NAME="Authorization" \
 *   BEARER_TOKEN="Bearer YOUR_TOKEN" \
 *   ts-node scripts/set-twitter-config.ts
 * 
 * Or provide as arguments:
 *   ts-node scripts/set-twitter-config.ts <tweetFetchURL> <headerName> <bearerToken>
 */

import { execSync } from 'child_process';
import { x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

const HKDF_INFO = new TextEncoder().encode('gm-canister-encryption-v1');

function encryptSecret(secret: string, publicKeyHex: string): string {
    try {
        const randomBytesArray = randomBytes(44);
        const recipientPublicKey = hexToBytes(publicKeyHex);
        const ephemeralPrivateKey = randomBytesArray.slice(0, 32);
        const nonce = randomBytesArray.slice(32, 44);
        const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);
        const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientPublicKey);
        const aesKey = hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);
        const plaintextBytes = new TextEncoder().encode(secret);
        const aesGcm = gcm(aesKey, nonce);
        const ciphertext = aesGcm.encrypt(plaintextBytes);
        const result = new Uint8Array(ephemeralPublicKey.length + nonce.length + ciphertext.length);
        result.set(ephemeralPublicKey, 0);
        result.set(nonce, ephemeralPublicKey.length);
        result.set(ciphertext, ephemeralPublicKey.length + nonce.length);
        return bytesToHex(result);
    } catch (error: any) {
        throw new Error(`Encryption failed: ${error.message || error}`);
    }
}

const CANISTER_ID = 'ylges-qaaaa-aaaal-qtlsq-cai';

function getPublicKey(): string {
    console.log('📡 Fetching canister public key...');
    try {
        const output = execSync(
            `export DFX_WARNING=-mainnet_plaintext_identity && dfx canister call ${CANISTER_ID} encryptionPublicKey --network ic --identity default`,
            { encoding: 'utf-8', shell: '/bin/zsh', stdio: 'pipe' }
        );
        
        const match = output.match(/"([a-f0-9]+)"/);
        if (!match) {
            throw new Error('Failed to parse public key from output');
        }
        return match[1];
    } catch (error: any) {
        throw new Error(`Failed to get public key: ${error.message}`);
    }
}

function setTwitterConfig(tweetFetchURLEncrypted: string, headerNameEncrypted: string, bearerTokenEncrypted: string): void {
    console.log('📤 Setting Twitter configuration on canister...');
    try {
        const candidArgs = `'(
  record {
    tweetFetchURLEncrypted = "${tweetFetchURLEncrypted}";
    headerNameEncrypted = "${headerNameEncrypted}";
    bearerTokenEncrypted = "${bearerTokenEncrypted}";
  }
)'`;
        
        execSync(
            `export DFX_WARNING=-mainnet_plaintext_identity && dfx canister call ${CANISTER_ID} setTwitterConfig ${candidArgs} --network ic --identity default`,
            { encoding: 'utf-8', shell: '/bin/zsh', stdio: 'inherit' }
        );
        console.log('✅ Twitter API configuration set successfully!');
    } catch (error: any) {
        throw new Error(`Failed to set Twitter config: ${error.message}`);
    }
}

function main() {
    let tweetFetchURL: string;
    let headerName: string;
    let bearerToken: string;

    // Try environment variables first
    if (process.env.TWEET_FETCH_URL && process.env.HEADER_NAME && process.env.BEARER_TOKEN) {
        tweetFetchURL = process.env.TWEET_FETCH_URL;
        headerName = process.env.HEADER_NAME;
        bearerToken = process.env.BEARER_TOKEN;
        console.log('📋 Using credentials from environment variables');
    } else {
        // Try command line arguments
        const args = process.argv.slice(2);
        if (args.length >= 3) {
            [tweetFetchURL, headerName, bearerToken] = args;
            console.log('📋 Using credentials from command line arguments');
        } else {
            console.error('❌ Missing Twitter API credentials!');
            console.error('\nUsage options:');
            console.error('\n1. Environment variables:');
            console.error('   TWEET_FETCH_URL="https://api.twitter.com/2/tweets" \\');
            console.error('   HEADER_NAME="Authorization" \\');
            console.error('   BEARER_TOKEN="Bearer YOUR_TOKEN" \\');
            console.error('   ts-node scripts/set-twitter-config.ts');
            console.error('\n2. Command line arguments:');
            console.error('   ts-node scripts/set-twitter-config.ts <tweetFetchURL> <headerName> <bearerToken>');
            console.error('\nExample:');
            console.error('   ts-node scripts/set-twitter-config.ts "https://api.twitter.com/2/tweets" "Authorization" "Bearer AAAA...xyz"');
            process.exit(1);
        }
    }

    try {
        // Get public key
        const publicKey = getPublicKey();
        console.log(`   Public key: ${publicKey.substring(0, 20)}...\n`);

        // Encrypt secrets
        console.log('🔐 Encrypting credentials...');
        const tweetFetchURLEncrypted = encryptSecret(tweetFetchURL, publicKey);
        const headerNameEncrypted = encryptSecret(headerName, publicKey);
        const bearerTokenEncrypted = encryptSecret(bearerToken, publicKey);
        console.log('   ✅ Credentials encrypted\n');

        // Set configuration
        setTwitterConfig(tweetFetchURLEncrypted, headerNameEncrypted, bearerTokenEncrypted);
        
        console.log('\n🎉 Twitter API configuration complete!');
        console.log('   The canister can now verify Twitter auth codes.');
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
