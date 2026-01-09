import {
    initializeEncryption,
    getPublicKey,
    decryptSecret,
} from '../../src/gm-account-manager-canister/encryption';
import { clearMockStorageById } from '../mocks/azle.mock';
import * as forge from 'node-forge';

// Encryption module uses memory ID 8
const ENCRYPTION_STORAGE_ID = 8;

// Reset storage before each test
beforeEach(() => {
    clearMockStorageById(ENCRYPTION_STORAGE_ID);
});

describe('Encryption Module', () => {
    describe('initializeEncryption', () => {
        it('should generate and store RSA key pair', () => {
            initializeEncryption();

            const publicKey = getPublicKey();
            expect(publicKey).toBeDefined();
            expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
            expect(publicKey).toContain('-----END PUBLIC KEY-----');
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
    });

    describe('getPublicKey', () => {
        it('should return public key in PEM format', () => {
            initializeEncryption();
            const publicKey = getPublicKey();

            expect(publicKey).toBeDefined();
            expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
            expect(publicKey).toContain('-----END PUBLIC KEY-----');

            // Verify it's a valid PEM public key
            const publicKeyObj = forge.pki.publicKeyFromPem(publicKey);
            expect(publicKeyObj).toBeDefined();
        });

        it('should auto-initialize if keys do not exist', () => {
            // Don't call initializeEncryption first
            const publicKey = getPublicKey();

            expect(publicKey).toBeDefined();
            expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
        });
    });

    describe('decryptSecret', () => {
        it('should decrypt a secret that was encrypted with the public key', () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyPem = getPublicKey();

            // Original secret
            const originalSecret = 'my-super-secret-api-key-12345';

            // Encrypt using the public key (simulating client-side encryption)
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
            const encryptedBytes = publicKey.encrypt(originalSecret, 'RSA-OAEP');
            const encryptedBase64 = forge.util.encode64(encryptedBytes);

            // Decrypt using the canister's decryptSecret function
            const decryptedSecret = decryptSecret(encryptedBase64);

            // Should match the original
            expect(decryptedSecret).toBe(originalSecret);
        });

        it('should handle different secret values', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            // RSA-OAEP with 2048-bit key can encrypt up to ~214 bytes
            // Test various secret types within this limit
            const testSecrets = [
                'simple-secret',
                'medium-length-secret-12345',
                'secret-with-special-chars!@#$%',
            ];

            for (const originalSecret of testSecrets) {
                const encryptedBytes = publicKey.encrypt(originalSecret, 'RSA-OAEP');
                const encryptedBase64 = forge.util.encode64(encryptedBytes);
                const decryptedSecret = decryptSecret(encryptedBase64);

                expect(decryptedSecret).toBe(originalSecret);
            }
        });


        it('should auto-initialize if keys do not exist', () => {
            // Don't call initializeEncryption first
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const originalSecret = 'test-secret';
            const encryptedBytes = publicKey.encrypt(originalSecret, 'RSA-OAEP');
            const encryptedBase64 = forge.util.encode64(encryptedBytes);

            const decryptedSecret = decryptSecret(encryptedBase64);
            expect(decryptedSecret).toBe(originalSecret);
        });

        it('should throw error for invalid encrypted data', () => {
            initializeEncryption();

            expect(() => {
                decryptSecret('invalid-base64-encrypted-data!!!');
            }).toThrow();
        });

        it('should throw error for corrupted encrypted data', () => {
            initializeEncryption();

            // Valid base64 but not valid encrypted data
            const invalidBytes = forge.util.createBuffer(new Uint8Array([1, 2, 3, 4, 5]));
            const invalidBase64 = forge.util.encode64(invalidBytes.getBytes());

            expect(() => {
                decryptSecret(invalidBase64);
            }).toThrow();
        });
    });

    describe('Full encryption/decryption flow', () => {
        it('should work end-to-end: encrypt on client, decrypt on canister', () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyPem = getPublicKey();

            // Step 3: Client encrypts secret using public key
            const clientSecret = 'twitter-client-secret-abc123';
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
            const encryptedBytes = publicKey.encrypt(clientSecret, 'RSA-OAEP');
            const encryptedBase64 = forge.util.encode64(encryptedBytes);

            // Step 4: Canister decrypts the secret
            const decryptedSecret = decryptSecret(encryptedBase64);

            // Step 5: Verify they match
            expect(decryptedSecret).toBe(clientSecret);
        });

        it('should handle multiple sequential encryptions/decryptions', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const secrets = [
                'secret1',
                'secret2',
                'secret3',
            ];

            for (const secret of secrets) {
                const encryptedBytes = publicKey.encrypt(secret, 'RSA-OAEP');
                const encryptedBase64 = forge.util.encode64(encryptedBytes);
                const decrypted = decryptSecret(encryptedBase64);

                expect(decrypted).toBe(secret);
            }
        });
    });
});
