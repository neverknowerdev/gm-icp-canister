/**
 * Encryption module for handling sensitive input parameters
 * Uses RSA-OAEP encryption for secure secret transmission
 */

import * as forge from 'node-forge';
import { StableBTreeMap } from 'azle';

// Stable storage for encryption keys
// Using memory ID 8 (0-7 are used by other modules)
const ENCRYPTION_KEY_STORAGE = new StableBTreeMap<string, string>(8);

const PRIVATE_KEY_STORAGE_KEY = 'rsa_private_key_pem';
const PUBLIC_KEY_STORAGE_KEY = 'rsa_public_key_pem';

/**
 * Initialize RSA key pair if not already generated
 * This should be called once during canister initialization
 */
export function initializeEncryption(): void {
    try {
        // Check if keys already exist
        const existingPrivateKey = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);
        const existingPublicKey = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);

        if (existingPrivateKey.length > 0 && existingPublicKey.length > 0) {
            console.log('Encryption keys already initialized');
            return;
        }

        // Generate RSA key pair (2048 bits for good security)
        console.log('Generating RSA key pair for encryption...');
        const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });

        // Convert to PEM format for storage
        const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
        const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);

        // Store keys in stable memory
        ENCRYPTION_KEY_STORAGE.insert(PRIVATE_KEY_STORAGE_KEY, privateKeyPem);
        ENCRYPTION_KEY_STORAGE.insert(PUBLIC_KEY_STORAGE_KEY, publicKeyPem);

        console.log('RSA key pair generated and stored successfully');
    } catch (error: any) {
        console.error(`Error initializing encryption: ${error}`);
        throw new Error(`Failed to initialize encryption: ${error.message || error}`);
    }
}

/**
 * Get the public key in PEM format
 * This can be safely exposed to clients for encryption
 * @returns Public key as PEM string
 */
export function getPublicKey(): string {
    try {
        const publicKeyResult = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);

        if (publicKeyResult.length === 0) {
            // If keys don't exist, generate them
            initializeEncryption();
            const newPublicKeyResult = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);
            if (newPublicKeyResult.length === 0) {
                throw new Error('Failed to generate public key');
            }
            return newPublicKeyResult[0];
        }

        return publicKeyResult[0];
    } catch (error: any) {
        console.error(`Error getting public key: ${error}`);
        throw new Error(`Failed to get public key: ${error.message || error}`);
    }
}

/**
 * Decrypt a secret that was encrypted with the public key
 * @param encryptedSecret - Base64-encoded encrypted secret
 * @returns Decrypted secret as string
 */
export function decryptSecret(encryptedSecret: string): string {
    try {
        // Get private key from storage
        const privateKeyResult = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);

        if (privateKeyResult.length === 0) {
            // If keys don't exist, generate them
            initializeEncryption();
            const newPrivateKeyResult = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);
            if (newPrivateKeyResult.length === 0) {
                throw new Error('Private key not available');
            }
            return decryptWithKey(newPrivateKeyResult[0], encryptedSecret);
        }

        return decryptWithKey(privateKeyResult[0], encryptedSecret);
    } catch (error: any) {
        console.error(`Error decrypting secret: ${error}`);
        throw new Error(`Failed to decrypt secret: ${error.message || error}`);
    }
}

/**
 * Internal function to decrypt using a private key PEM
 * @param privateKeyPem - Private key in PEM format
 * @param encryptedSecret - Base64-encoded encrypted secret
 * @returns Decrypted secret as string
 */
function decryptWithKey(privateKeyPem: string, encryptedSecret: string): string {
    try {
        // Parse private key from PEM
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

        // Decode base64 encrypted data
        const encryptedBytes = forge.util.decode64(encryptedSecret);

        // Decrypt using RSA-OAEP (Optimal Asymmetric Encryption Padding)
        const decryptedBytes = privateKey.decrypt(encryptedBytes, 'RSA-OAEP');

        // Convert to string
        return forge.util.decodeUtf8(decryptedBytes);
    } catch (error: any) {
        console.error(`Error in decryptWithKey: ${error}`);
        throw new Error(`Decryption failed: ${error.message || error}`);
    }
}
