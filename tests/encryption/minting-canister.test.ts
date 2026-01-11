import {
    initializeEncryption,
    getPublicKey,
    decryptSecret,
    encryptSecret,
    isEncryptionInitialized,
} from '../../src/gm-minting-canister/encryption';
import { initializeTwitter } from '../../src/gm-minting-canister/workers/twitter/process';
import { initializeFarcaster } from '../../src/gm-minting-canister/workers/farcaster/process';
import { clearMockStorageById } from '../mocks/azle.mock';
import * as crypto from 'crypto';

// Encryption module uses memory ID 0 for minting canister
const ENCRYPTION_STORAGE_ID = 0;

// Helper to generate random bytes for testing
function getRandomBytes(size: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(size));
}

// Reset storage before each test
beforeEach(() => {
    clearMockStorageById(ENCRYPTION_STORAGE_ID);
});

describe('Minting Canister Encryption Module', () => {
    describe('initializeEncryption', () => {
        it('should generate and store X25519 key pair', () => {
            initializeEncryption();

            const publicKey = getPublicKey();
            expect(publicKey).toBeDefined();
            // X25519 public key is 32 bytes = 64 hex chars
            expect(publicKey).toHaveLength(64);
            expect(/^[0-9a-f]+$/.test(publicKey)).toBe(true);
        });

        it('should not regenerate keys if they already exist', async () => {
            initializeEncryption();
            const firstPublicKey = getPublicKey();

            // Initialize again
            initializeEncryption();
            const secondPublicKey = getPublicKey();

            // Should be the same key
            expect(firstPublicKey).toBe(secondPublicKey);
        });

        it('should set isEncryptionInitialized to true', async () => {
            expect(isEncryptionInitialized()).toBe(false);
            initializeEncryption();
            expect(isEncryptionInitialized()).toBe(true);
        });
    });

    describe('getPublicKey', () => {
        it('should return public key as hex string', async () => {
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
    });

    describe('decryptSecret', () => {
        it('should decrypt a secret that was encrypted with the public key', async () => {
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

        it('should handle different secret values', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Test various secret types
            const testSecrets = [
                'simple-secret',
                'medium-length-secret-12345',
                'secret-with-special-chars!@#$%',
            ];

            for (const originalSecret of testSecrets) {
                const randomBytes = getRandomBytes(44);
                const encryptedHex = encryptSecret(originalSecret, publicKeyHex, randomBytes);
                const decryptedSecret = decryptSecret(encryptedHex);

                expect(decryptedSecret).toBe(originalSecret);
            }
        });
    });

    describe('Twitter Initialization with Encrypted Secrets', () => {
        it('should initialize Twitter with encrypted bearerToken and optimizedAPISecretKey', async () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Original secrets
            const bearerToken = 'twitter-bearer-token-abc123';
            const optimizedAPISecretKey = 'optimized-api-secret-key-xyz789';
            const authHeaderName = 'X-API-Key';
            const tweetLookupURL = 'https://api.twitter.com/v2/tweets';
            const twitterOptimizedServerHost = 'https://optimized-server.com';

            // Encrypt secrets
            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedBearerToken = encryptSecret(bearerToken, publicKeyHex, randomBytes1);
            const encryptedSecretKey = encryptSecret(optimizedAPISecretKey, publicKeyHex, randomBytes2);

            // Decrypt and initialize (simulating canister behavior)
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);
            const decryptedSecretKey = decryptSecret(encryptedSecretKey);

            // Initialize Twitter with decrypted secrets
            initializeTwitter(
                {
                    bearerToken: decryptedBearerToken,
                    optimizedAPISecretKey: decryptedSecretKey,
                    authHeaderName: authHeaderName,
                },
                tweetLookupURL,
                twitterOptimizedServerHost
            );

            // Verify secrets were decrypted correctly
            expect(decryptedBearerToken).toBe(bearerToken);
            expect(decryptedSecretKey).toBe(optimizedAPISecretKey);
        });

        it('should handle full Twitter initialization flow with encryption', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const secrets = {
                bearerToken: 'bearer-token-123',
                optimizedAPISecretKey: 'secret-key-456',
                authHeaderName: 'Authorization',
            };

            // Step 1: Encrypt secrets on client side
            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedSecrets = {
                bearerTokenEncrypted: encryptSecret(secrets.bearerToken, publicKeyHex, randomBytes1),
                optimizedAPISecretKeyEncrypted: encryptSecret(secrets.optimizedAPISecretKey, publicKeyHex, randomBytes2),
                authHeaderName: secrets.authHeaderName,
            };

            // Step 2: Decrypt on canister side (simulating canister behavior)
            const decryptedSecrets = {
                bearerToken: decryptSecret(encryptedSecrets.bearerTokenEncrypted),
                optimizedAPISecretKey: decryptSecret(encryptedSecrets.optimizedAPISecretKeyEncrypted),
                authHeaderName: encryptedSecrets.authHeaderName,
            };

            // Step 3: Initialize with decrypted secrets
            initializeTwitter(
                decryptedSecrets,
                'https://api.twitter.com/v2/tweets',
                'https://optimized-server.com'
            );

            // Step 4: Verify
            expect(decryptedSecrets.bearerToken).toBe(secrets.bearerToken);
            expect(decryptedSecrets.optimizedAPISecretKey).toBe(secrets.optimizedAPISecretKey);
        });
    });

    describe('Farcaster Initialization with Encrypted Secrets', () => {
        it('should initialize Farcaster with encrypted apiKey', async () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Original secrets
            const apiKey = 'farcaster-api-key-abc123';
            const farcasterAPIURL = 'https://api.warpcast.com';

            // Encrypt apiKey
            const randomBytes = getRandomBytes(44);
            const encryptedApiKey = encryptSecret(apiKey, publicKeyHex, randomBytes);

            // Decrypt and initialize (simulating canister behavior)
            const decryptedApiKey = decryptSecret(encryptedApiKey);

            // Initialize Farcaster with decrypted secret
            initializeFarcaster(
                {
                    apiKey: decryptedApiKey,
                },
                farcasterAPIURL
            );

            // Verify secret was decrypted correctly
            expect(decryptedApiKey).toBe(apiKey);
        });

        it('should initialize Farcaster with encrypted apiKey and bearerToken', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            // Original secrets
            const apiKey = 'farcaster-api-key-abc123';
            const bearerToken = 'farcaster-bearer-token-xyz789';
            const farcasterAPIURL = 'https://api.warpcast.com';

            // Encrypt secrets
            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedApiKey = encryptSecret(apiKey, publicKeyHex, randomBytes1);
            const encryptedBearerToken = encryptSecret(bearerToken, publicKeyHex, randomBytes2);

            // Decrypt and initialize (simulating canister behavior)
            const decryptedApiKey = decryptSecret(encryptedApiKey);
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);

            // Initialize Farcaster with decrypted secrets
            initializeFarcaster(
                {
                    apiKey: decryptedApiKey,
                    bearerToken: decryptedBearerToken,
                },
                farcasterAPIURL
            );

            // Verify secrets were decrypted correctly
            expect(decryptedApiKey).toBe(apiKey);
            expect(decryptedBearerToken).toBe(bearerToken);
        });

        it('should handle full Farcaster initialization flow with encryption', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const secrets = {
                apiKey: 'api-key-123',
                bearerToken: 'bearer-token-456',
            };

            // Step 1: Encrypt secrets on client side
            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedSecrets = {
                apiKeyEncrypted: encryptSecret(secrets.apiKey, publicKeyHex, randomBytes1),
                bearerTokenEncrypted: encryptSecret(secrets.bearerToken, publicKeyHex, randomBytes2),
            };

            // Step 2: Decrypt on canister side (simulating canister behavior)
            const decryptedApiKey = decryptSecret(encryptedSecrets.apiKeyEncrypted);
            const decryptedBearerToken = decryptSecret(encryptedSecrets.bearerTokenEncrypted);

            // Step 3: Initialize with decrypted secrets
            initializeFarcaster(
                {
                    apiKey: decryptedApiKey,
                    bearerToken: decryptedBearerToken,
                },
                'https://api.warpcast.com'
            );

            // Step 4: Verify
            expect(decryptedApiKey).toBe(secrets.apiKey);
            expect(decryptedBearerToken).toBe(secrets.bearerToken);
        });

        it('should handle Farcaster initialization with only apiKey (no bearerToken)', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const apiKey = 'api-key-only-123';

            // Encrypt apiKey
            const randomBytes = getRandomBytes(44);
            const encryptedApiKey = encryptSecret(apiKey, publicKeyHex, randomBytes);

            // Decrypt and initialize
            const decryptedApiKey = decryptSecret(encryptedApiKey);

            // Initialize Farcaster with only apiKey
            initializeFarcaster(
                {
                    apiKey: decryptedApiKey,
                },
                'https://api.warpcast.com'
            );

            // Verify
            expect(decryptedApiKey).toBe(apiKey);
        });
    });

    describe('Full encryption/decryption flow for both services', () => {
        it('should work end-to-end for Twitter: encrypt on client, decrypt on canister', async () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyHex = getPublicKey();

            // Step 3: Client encrypts secrets using public key
            const bearerToken = 'twitter-bearer-token-abc123';
            const secretKey = 'optimized-api-secret-key-xyz789';

            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedBearerToken = encryptSecret(bearerToken, publicKeyHex, randomBytes1);
            const encryptedSecretKey = encryptSecret(secretKey, publicKeyHex, randomBytes2);

            // Step 4: Canister decrypts the secrets
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);
            const decryptedSecretKey = decryptSecret(encryptedSecretKey);

            // Step 5: Verify they match
            expect(decryptedBearerToken).toBe(bearerToken);
            expect(decryptedSecretKey).toBe(secretKey);
        });

        it('should work end-to-end for Farcaster: encrypt on client, decrypt on canister', async () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyHex = getPublicKey();

            // Step 3: Client encrypts secrets using public key
            const apiKey = 'farcaster-api-key-abc123';
            const bearerToken = 'farcaster-bearer-token-xyz789';

            const randomBytes1 = getRandomBytes(44);
            const randomBytes2 = getRandomBytes(44);
            const encryptedApiKey = encryptSecret(apiKey, publicKeyHex, randomBytes1);
            const encryptedBearerToken = encryptSecret(bearerToken, publicKeyHex, randomBytes2);

            // Step 4: Canister decrypts the secrets
            const decryptedApiKey = decryptSecret(encryptedApiKey);
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);

            // Step 5: Verify they match
            expect(decryptedApiKey).toBe(apiKey);
            expect(decryptedBearerToken).toBe(bearerToken);
        });

        it('should handle multiple sequential encryptions/decryptions for both services', async () => {
            initializeEncryption();
            const publicKeyHex = getPublicKey();

            const twitterSecrets = [
                { bearerToken: 'token1', secretKey: 'key1' },
                { bearerToken: 'token2', secretKey: 'key2' },
                { bearerToken: 'token3', secretKey: 'key3' },
            ];

            const farcasterSecrets = [
                { apiKey: 'apikey1', bearerToken: 'token1' },
                { apiKey: 'apikey2', bearerToken: 'token2' },
                { apiKey: 'apikey3', bearerToken: 'token3' },
            ];

            // Test Twitter secrets
            for (const secret of twitterSecrets) {
                const randomBytes1 = getRandomBytes(44);
                const randomBytes2 = getRandomBytes(44);
                const encryptedBearerToken = encryptSecret(secret.bearerToken, publicKeyHex, randomBytes1);
                const encryptedSecretKey = encryptSecret(secret.secretKey, publicKeyHex, randomBytes2);

                const decryptedBearerToken = decryptSecret(encryptedBearerToken);
                const decryptedSecretKey = decryptSecret(encryptedSecretKey);

                expect(decryptedBearerToken).toBe(secret.bearerToken);
                expect(decryptedSecretKey).toBe(secret.secretKey);
            }

            // Test Farcaster secrets
            for (const secret of farcasterSecrets) {
                const randomBytes1 = getRandomBytes(44);
                const randomBytes2 = getRandomBytes(44);
                const encryptedApiKey = encryptSecret(secret.apiKey, publicKeyHex, randomBytes1);
                const encryptedBearerToken = encryptSecret(secret.bearerToken, publicKeyHex, randomBytes2);

                const decryptedApiKey = decryptSecret(encryptedApiKey);
                const decryptedBearerToken = decryptSecret(encryptedBearerToken);

                expect(decryptedApiKey).toBe(secret.apiKey);
                expect(decryptedBearerToken).toBe(secret.bearerToken);
            }
        });
    });
});
