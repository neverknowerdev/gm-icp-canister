import {
    initializeEncryption,
    getPublicKey,
    decryptSecret,
    encryptSecret,
    isEncryptionInitialized,
} from '../../src/gm-account-manager-canister/encryption';
import { clearMockStorageById } from '../mocks/azle.mock';
import * as crypto from 'crypto';

// Encryption module uses memory ID 8
const ENCRYPTION_STORAGE_ID = 8;

// Helper to generate random bytes for testing
function getRandomBytes(size: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(size));
}

// Reset storage before each test
beforeEach(() => {
    clearMockStorageById(ENCRYPTION_STORAGE_ID);
});

describe('Encryption Module', () => {
    describe('initializeEncryption', () => {
        it('should generate and store X25519 key pair', () => {
            initializeEncryption();

            const publicKey = getPublicKey();
            expect(publicKey).toBeDefined();
            // X25519 public key is 32 bytes = 64 hex chars
            expect(publicKey).toHaveLength(64);
            expect(/^[0-9a-f]+$/.test(publicKey)).toBe(true);
        });

        it('should not regenerate keys if they already exist', () => {
            initializeEncryption();
            const firstPublicKey = getPublicKey();

            // Initialize again
            initializeEncryption();
            const secondPublicKey = getPublicKey();

            // Should be the same key
            expect(firstPublicKey).toBe(secondPublicKey);
        });

        it('should set isEncryptionInitialized to true', () => {
            expect(isEncryptionInitialized()).toBe(false);
            initializeEncryption();
            expect(isEncryptionInitialized()).toBe(true);
        });
    });

    describe('getPublicKey', () => {
        it('should return public key as hex string', () => {
            initializeEncryption();
            const publicKey = getPublicKey();

            expect(publicKey).toBeDefined();
            // X25519 public key is 32 bytes = 64 hex chars
            expect(publicKey).toHaveLength(64);
            expect(/^[0-9a-f]+$/.test(publicKey)).toBe(true);
        });

        it('should throw if keys are not initialized', () => {
            expect(() => getPublicKey()).toThrow('Encryption not initialized');
        });

        it('should handle storage returning undefined gracefully', () => {
            // Before initialization, storage.get() returns undefined
            // This should throw a proper error, not crash with "cannot read property of undefined"
            expect(() => getPublicKey()).toThrow('Encryption not initialized');
        });
    });

    describe('isEncryptionInitialized', () => {
        it('should return false when storage is empty (undefined values)', () => {
            // Storage.get() returns undefined for non-existent keys
            expect(isEncryptionInitialized()).toBe(false);
        });

        it('should return true after initialization', () => {
            initializeEncryption();
            expect(isEncryptionInitialized()).toBe(true);
        });

        it('should not throw when storage returns undefined', () => {
            // This should not throw, just return false
            expect(() => isEncryptionInitialized()).not.toThrow();
            expect(isEncryptionInitialized()).toBe(false);
        });
    });

    describe('decryptSecret', () => {
        it('should decrypt a secret that was encrypted with the public key', () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Original secret
            const originalSecret = 'my-super-secret-api-key-12345';

            // Encrypt using the encryptSecret function with random bytes
            const randomBytes = getRandomBytes(44);
            const encryptedHex = encryptSecret(originalSecret, publicKeyHex, randomBytes);

            // Decrypt using the canister's decryptSecret function
            const decryptedSecret = decryptSecret(encryptedHex);

            // Should match the original
            expect(decryptedSecret).toBe(originalSecret);
        });

        it('should handle different secret values', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Test various secret types
            const testSecrets = [
                'simple-secret',
                'medium-length-secret-12345',
                'secret-with-special-chars!@#$%',
                'unicode-secret-🔐🔑',
                'a'.repeat(100), // Longer secret
            ];

            for (const originalSecret of testSecrets) {
                const randomBytes = getRandomBytes(44);
                const encryptedHex = encryptSecret(originalSecret, publicKeyHex, randomBytes);
                const decryptedSecret = decryptSecret(encryptedHex);

                expect(decryptedSecret).toBe(originalSecret);
            }
        });

        it('should throw error if encryption not initialized', () => {
            expect(() => {
                decryptSecret('deadbeef');
            }).toThrow('Encryption not initialized');
        });

        it('should handle storage returning undefined gracefully', () => {
            // Before initialization, storage.get() returns undefined
            // This should throw a proper error, not crash with "cannot read property of undefined"
            expect(() => {
                decryptSecret('deadbeef');
            }).toThrow('Encryption not initialized');
        });

        it('should throw error for invalid encrypted data', () => {
            initializeEncryption();

            expect(() => {
                decryptSecret('invalid-hex-data!!!');
            }).toThrow();
        });

        it('should throw error for corrupted encrypted data', () => {
            initializeEncryption();

            // Valid hex but wrong size/format
            const invalidHex = '0102030405';

            expect(() => {
                decryptSecret(invalidHex);
            }).toThrow();
        });

        it('should throw error for tampered ciphertext', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const originalSecret = 'test-secret';
            const randomBytes = getRandomBytes(44);
            const encryptedHex = encryptSecret(originalSecret, publicKeyHex, randomBytes);

            // Tamper with the ciphertext (flip a bit in the middle)
            const tamperedHex = encryptedHex.slice(0, 100) + 'ff' + encryptedHex.slice(102);

            expect(() => {
                decryptSecret(tamperedHex);
            }).toThrow();
        });
    });

    describe('encryptSecret', () => {
        it('should encrypt a secret deterministically with same randomness', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const secret = 'test-secret';
            const randomBytes = getRandomBytes(44);

            const encrypted1 = encryptSecret(secret, publicKeyHex, randomBytes);
            const encrypted2 = encryptSecret(secret, publicKeyHex, randomBytes);

            // Same randomness should produce same ciphertext
            expect(encrypted1).toBe(encrypted2);
        });

        it('should produce different ciphertext with different randomness', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const secret = 'test-secret';
            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);

            const encrypted1 = encryptSecret(secret, publicKeyHex, randomBytes1);
            const encrypted2 = encryptSecret(secret, publicKeyHex, randomBytes2);

            // Different randomness should produce different ciphertext
            expect(encrypted1).not.toBe(encrypted2);
        });

        it('should throw if not enough random bytes provided', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            expect(() => {
                encryptSecret('test', publicKeyHex, new Uint8Array(10));
            }).toThrow('Need at least 44 bytes of randomness');
        });
    });

    describe('Full encryption/decryption flow', () => {
        it('should work end-to-end: encrypt on client, decrypt on canister', () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyHex = getPublicKey();

            // Step 3: Client encrypts secret using public key
            const clientSecret = 'twitter-client-secret-abc123';
            const randomBytes = getRandomBytes(44);
            const encryptedHex = encryptSecret(clientSecret, publicKeyHex, randomBytes);

            // Step 4: Canister decrypts the secret
            const decryptedSecret = decryptSecret(encryptedHex);

            // Step 5: Verify they match
            expect(decryptedSecret).toBe(clientSecret);
        });

        it('should handle multiple sequential encryptions/decryptions', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const secrets = [
                'secret1',
                'secret2',
                'secret3',
            ];

            for (const secret of secrets) {
                const randomBytes = getRandomBytes(44);
                const encryptedHex = encryptSecret(secret, publicKeyHex, randomBytes);
                const decrypted = decryptSecret(encryptedHex);

                expect(decrypted).toBe(secret);
            }
        });

        it('should handle JSON secrets', () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const jsonSecret = JSON.stringify({
                apiKey: 'my-api-key',
                apiSecret: 'my-api-secret',
                nested: { value: 123 }
            });

            const randomBytes = getRandomBytes(44);
            const encryptedHex = encryptSecret(jsonSecret, publicKeyHex, randomBytes);
            const decrypted = decryptSecret(encryptedHex);

            expect(decrypted).toBe(jsonSecret);
            expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonSecret));
        });
    });

    describe('Edge cases with StableBTreeMap returning undefined', () => {
        it('should handle getPublicKey when storage returns undefined', () => {
            // Storage is cleared in beforeEach, so get() returns undefined
            // The function should throw a meaningful error, not crash
            expect(() => getPublicKey()).toThrow('Encryption not initialized');
        });

        it('should handle decryptSecret when storage returns undefined', () => {
            // Storage is cleared in beforeEach, so get() returns undefined
            // The function should throw a meaningful error, not crash
            expect(() => decryptSecret('aabbccdd')).toThrow('Encryption not initialized');
        });

        it('should handle isEncryptionInitialized when storage returns undefined', () => {
            // Storage is cleared in beforeEach, so get() returns undefined
            // The function should return false without throwing
            expect(isEncryptionInitialized()).toBe(false);
        });

        it('should handle initializeEncryption when storage returns undefined (first run)', () => {
            // Storage is cleared in beforeEach, so get() returns undefined
            // The function should generate new keys without throwing
            expect(() => initializeEncryption()).not.toThrow();
            expect(isEncryptionInitialized()).toBe(true);
        });
    });
});
