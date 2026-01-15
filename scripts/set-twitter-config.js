#!/usr/bin/env node

/**
 * Script to set Twitter API configuration for the canister
 * 
 * Usage:
 *   node scripts/set-twitter-config.js <tweetFetchURL> <headerName> <bearerToken>
 * 
 * Example:
 *   node scripts/set-twitter-config.js "https://api.twitter.com/2/tweets" "Authorization" "Bearer YOUR_TOKEN"
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

const CANISTER_ID = 'ylges-qaaaa-aaaal-qtlsq-cai';

// X25519 and AES-GCM encryption (simplified - you'll need to implement full encryption)
// For now, this script will guide you through the process

function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error('Usage: node scripts/set-twitter-config.js <tweetFetchURL> <headerName> <bearerToken>');
        console.error('\nExample:');
        console.error('  node scripts/set-twitter-config.js "https://api.twitter.com/2/tweets" "Authorization" "Bearer YOUR_TOKEN"');
        process.exit(1);
    }

    const [tweetFetchURL, headerName, bearerToken] = args;

    try {
        console.log('📋 Setting up Twitter API configuration...\n');
        
        // Get public key
        console.log('1. Fetching canister public key...');
        const publicKeyOutput = execSync(
            `export DFX_WARNING=-mainnet_plaintext_identity && dfx canister call ${CANISTER_ID} encryptionPublicKey --network ic --identity default`,
            { encoding: 'utf-8', shell: '/bin/zsh' }
        );
        
        const publicKeyMatch = publicKeyOutput.match(/"([^"]+)"/);
        if (!publicKeyMatch) {
            throw new Error('Failed to get public key');
        }
        const publicKey = publicKeyMatch[1];
        console.log(`   Public key: ${publicKey.substring(0, 20)}...\n`);

        console.log('⚠️  Encryption requires TypeScript compilation.');
        console.log('   Please use the TypeScript version or encrypt manually.\n');
        console.log('   To encrypt manually, you need to:');
        console.log('   1. Use X25519 key exchange + AES-256-GCM');
        console.log('   2. Or use the encryption function from the canister code\n');
        
        console.log('📝 For now, you can set unencrypted values temporarily by modifying the canister code,');
        console.log('   or implement the encryption in a TypeScript script.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();

