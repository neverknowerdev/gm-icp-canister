/**
 * Encryption module for handling sensitive input parameters
 * Uses X25519 for key exchange + AES-256-GCM for encryption
 * WASM-compatible implementation using noble libraries
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { StableBTreeMap, ic } from 'azle';

// Stable storage for encryption keys
// Using memory ID 0 (minting canister uses its own memory space)
const ENCRYPTION_KEY_STORAGE = new StableBTreeMap<string, Uint8Array>(0);

const PRIVATE_KEY_STORAGE_KEY = 'x25519_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'x25519_public_key';

// Constants
const X25519_PUBLIC_KEY_SIZE = 32;
const AES_GCM_NONCE_SIZE = 12;
const HKDF_INFO = new TextEncoder().encode('gm-canister-encryption-v1');

/**
 * Initialize X25519 key pair if not already generated
 * Uses ICP's rawRand for cryptographically secure randomness
 * This should be called once during canister initialization
 */
export async function initializeEncryption(): Promise<void> {
    try {
        // Check if keys already exist
        const existingPrivateKey = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);
        const existingPublicKey = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);

        if (existingPrivateKey.length > 0 && existingPublicKey.length > 0) {
            console.log('Encryption keys already initialized');
            return;
        }

        // Generate X25519 key pair using ICP randomness
        console.log('Generating X25519 key pair for encryption...');

        // Get 32 bytes of randomness from ICP
        const randomBytes = await ic.rawRand();
        const privateKey = new Uint8Array(randomBytes);

        // Derive public key from private key
        const publicKey = x25519.getPublicKey(privateKey);

        // Store keys in stable memory
        ENCRYPTION_KEY_STORAGE.insert(PRIVATE_KEY_STORAGE_KEY, privateKey);
        ENCRYPTION_KEY_STORAGE.insert(PUBLIC_KEY_STORAGE_KEY, publicKey);

        console.log('X25519 key pair generated and stored successfully');
    } catch (error: any) {
        console.error(`Error initializing encryption: ${error}`);
        throw new Error(`Failed to initialize encryption: ${error.message || error}`);
    }
}

/**
 * Get the public key as hex string
 * This can be safely exposed to clients for encryption
 * @returns Public key as hex string
 */
export function getPublicKey(): string {
    try {
        const publicKeyResult = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);

        if (publicKeyResult.length === 0) {
            throw new Error('Encryption not initialized. Call initializeEncryption() first.');
        }

        return bytesToHex(publicKeyResult[0]);
    } catch (error: any) {
        console.error(`Error getting public key: ${error}`);
        throw new Error(`Failed to get public key: ${error.message || error}`);
    }
}

/**
 * Check if encryption has been initialized
 */
export function isEncryptionInitialized(): boolean {
    const privateKeyResult = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);
    const publicKeyResult = ENCRYPTION_KEY_STORAGE.get(PUBLIC_KEY_STORAGE_KEY);
    return privateKeyResult.length > 0 && publicKeyResult.length > 0;
}

/**
 * Decrypt a secret that was encrypted with the public key
 * Expected format: hex-encoded(ephemeralPublicKey || nonce || ciphertext)
 * @param encryptedSecret - Hex-encoded encrypted payload
 * @returns Decrypted secret as string
 */
export function decryptSecret(encryptedSecret: string): string {
    try {
        // Get private key from storage
        const privateKeyResult = ENCRYPTION_KEY_STORAGE.get(PRIVATE_KEY_STORAGE_KEY);

        if (privateKeyResult.length === 0) {
            throw new Error('Encryption not initialized. Call initializeEncryption() first.');
        }

        return decryptWithKey(privateKeyResult[0], encryptedSecret);
    } catch (error: any) {
        console.error(`Error decrypting secret: ${error}`);
        throw new Error(`Failed to decrypt secret: ${error.message || error}`);
    }
}

/**
 * Internal function to decrypt using a private key
 * @param privateKey - X25519 private key bytes
 * @param encryptedSecret - Hex-encoded encrypted payload
 * @returns Decrypted secret as string
 */
function decryptWithKey(privateKey: Uint8Array, encryptedSecret: string): string {
    try {
        // Decode hex to bytes
        const encryptedBytes = hexToBytes(encryptedSecret);

        // Parse the encrypted payload
        // Format: ephemeralPublicKey (32) || nonce (12) || ciphertext
        const minSize = X25519_PUBLIC_KEY_SIZE + AES_GCM_NONCE_SIZE + 1;
        if (encryptedBytes.length < minSize) {
            throw new Error('Encrypted data too short');
        }

        const ephemeralPublicKey = encryptedBytes.slice(0, X25519_PUBLIC_KEY_SIZE);
        const nonce = encryptedBytes.slice(X25519_PUBLIC_KEY_SIZE, X25519_PUBLIC_KEY_SIZE + AES_GCM_NONCE_SIZE);
        const ciphertext = encryptedBytes.slice(X25519_PUBLIC_KEY_SIZE + AES_GCM_NONCE_SIZE);

        // Derive shared secret using X25519 ECDH
        const sharedSecret = x25519.getSharedSecret(privateKey, ephemeralPublicKey);

        // Derive AES key using HKDF-SHA256
        const aesKey = hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);

        // Decrypt using AES-256-GCM
        const aesGcm = gcm(aesKey, nonce);
        const plaintext = aesGcm.decrypt(ciphertext);

        // Convert to string
        return new TextDecoder().decode(plaintext);
    } catch (error: any) {
        console.error(`Error in decryptWithKey: ${error}`);
        throw new Error(`Decryption failed: ${error.message || error}`);
    }
}

/**
 * Encrypt a secret using a public key (for client-side use and testing)
 * @param secret - The secret to encrypt
 * @param publicKeyHex - The recipient's public key as hex string
 * @param randomBytes - 44 bytes of randomness (32 for ephemeral key, 12 for nonce)
 * @returns Hex-encoded encrypted payload
 */
export function encryptSecret(secret: string, publicKeyHex: string, randomBytes: Uint8Array): string {
    try {
        if (randomBytes.length < 44) {
            throw new Error('Need at least 44 bytes of randomness');
        }

        const recipientPublicKey = hexToBytes(publicKeyHex);

        // Use provided randomness for ephemeral key and nonce
        const ephemeralPrivateKey = randomBytes.slice(0, 32);
        const nonce = randomBytes.slice(32, 44);

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
        console.error(`Error encrypting secret: ${error}`);
        throw new Error(`Encryption failed: ${error.message || error}`);
    }
}

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
