/**
 * Standalone encryption utility for encrypting secrets with canister's public key
 * Uses the same encryption scheme as the canister (X25519 + AES-256-GCM)
 */

import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

const HKDF_INFO = new TextEncoder().encode('gm-canister-encryption-v1');

/**
 * Encrypt a secret using a public key
 * Generates random bytes automatically (44 bytes: 32 for ephemeral key + 12 for nonce)
 */
export function encryptSecret(secret: string, publicKeyHex: string): string {
    try {
        // Generate 44 bytes of randomness (32 for ephemeral key, 12 for nonce)
        const randomBytesArray = randomBytes(44);
        
        const recipientPublicKey = hexToBytes(publicKeyHex);
        
        // Use provided randomness for ephemeral key and nonce
        const ephemeralPrivateKey = randomBytesArray.slice(0, 32);
        const nonce = randomBytesArray.slice(32, 44);
        
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
        throw new Error(`Encryption failed: ${error.message || error}`);
    }
}

