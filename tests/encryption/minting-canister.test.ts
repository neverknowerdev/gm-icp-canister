import {
    initializeEncryption,
    getPublicKey,
    decryptSecret,
} from '../../src/gm-minting-canister/encryption';
import { initializeTwitter } from '../../src/gm-minting-canister/workers/twitter/process';
import { initializeFarcaster } from '../../src/gm-minting-canister/workers/farcaster/process';
import { clearMockStorageById } from '../mocks/azle.mock';
import * as forge from 'node-forge';

// Encryption module uses memory ID 0 for minting canister
const ENCRYPTION_STORAGE_ID = 0;

// Reset storage before each test
beforeEach(() => {
    clearMockStorageById(ENCRYPTION_STORAGE_ID);
});

describe('Minting Canister Encryption Module', () => {
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
    });

    describe('Twitter Initialization with Encrypted Secrets', () => {
        it('should initialize Twitter with encrypted bearerToken and optimizedAPISecretKey', () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            // Original secrets
            const bearerToken = 'twitter-bearer-token-abc123';
            const optimizedAPISecretKey = 'optimized-api-secret-key-xyz789';
            const authHeaderName = 'X-API-Key';
            const tweetLookupURL = 'https://api.twitter.com/v2/tweets';
            const twitterOptimizedServerHost = 'https://optimized-server.com';

            // Encrypt secrets
            const encryptedBearerToken = forge.util.encode64(
                publicKey.encrypt(bearerToken, 'RSA-OAEP')
            );
            const encryptedSecretKey = forge.util.encode64(
                publicKey.encrypt(optimizedAPISecretKey, 'RSA-OAEP')
            );

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

        it('should handle full Twitter initialization flow with encryption', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const secrets = {
                bearerToken: 'bearer-token-123',
                optimizedAPISecretKey: 'secret-key-456',
                authHeaderName: 'Authorization',
            };

            // Step 1: Encrypt secrets on client side
            const encryptedSecrets = {
                bearerTokenEncrypted: forge.util.encode64(
                    publicKey.encrypt(secrets.bearerToken, 'RSA-OAEP')
                ),
                optimizedAPISecretKeyEncrypted: forge.util.encode64(
                    publicKey.encrypt(secrets.optimizedAPISecretKey, 'RSA-OAEP')
                ),
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
        it('should initialize Farcaster with encrypted apiKey', () => {
            // Initialize encryption
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            // Original secrets
            const apiKey = 'farcaster-api-key-abc123';
            const farcasterAPIURL = 'https://api.warpcast.com';

            // Encrypt apiKey
            const encryptedApiKey = forge.util.encode64(
                publicKey.encrypt(apiKey, 'RSA-OAEP')
            );

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

        it('should initialize Farcaster with encrypted apiKey and bearerToken', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            // Original secrets
            const apiKey = 'farcaster-api-key-abc123';
            const bearerToken = 'farcaster-bearer-token-xyz789';
            const farcasterAPIURL = 'https://api.warpcast.com';

            // Encrypt secrets
            const encryptedApiKey = forge.util.encode64(
                publicKey.encrypt(apiKey, 'RSA-OAEP')
            );
            const encryptedBearerToken = forge.util.encode64(
                publicKey.encrypt(bearerToken, 'RSA-OAEP')
            );

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

        it('should handle full Farcaster initialization flow with encryption', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const secrets = {
                apiKey: 'api-key-123',
                bearerToken: 'bearer-token-456',
            };

            // Step 1: Encrypt secrets on client side
            const encryptedSecrets = {
                apiKeyEncrypted: forge.util.encode64(
                    publicKey.encrypt(secrets.apiKey, 'RSA-OAEP')
                ),
                bearerTokenEncrypted: forge.util.encode64(
                    publicKey.encrypt(secrets.bearerToken, 'RSA-OAEP')
                ),
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

        it('should handle Farcaster initialization with only apiKey (no bearerToken)', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const apiKey = 'api-key-only-123';

            // Encrypt apiKey
            const encryptedApiKey = forge.util.encode64(
                publicKey.encrypt(apiKey, 'RSA-OAEP')
            );

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
        it('should work end-to-end for Twitter: encrypt on client, decrypt on canister', () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyPem = getPublicKey();

            // Step 3: Client encrypts secrets using public key
            const bearerToken = 'twitter-bearer-token-abc123';
            const secretKey = 'optimized-api-secret-key-xyz789';
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const encryptedBearerToken = forge.util.encode64(
                publicKey.encrypt(bearerToken, 'RSA-OAEP')
            );
            const encryptedSecretKey = forge.util.encode64(
                publicKey.encrypt(secretKey, 'RSA-OAEP')
            );

            // Step 4: Canister decrypts the secrets
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);
            const decryptedSecretKey = decryptSecret(encryptedSecretKey);

            // Step 5: Verify they match
            expect(decryptedBearerToken).toBe(bearerToken);
            expect(decryptedSecretKey).toBe(secretKey);
        });

        it('should work end-to-end for Farcaster: encrypt on client, decrypt on canister', () => {
            // Step 1: Initialize encryption on canister
            initializeEncryption();

            // Step 2: Get public key (simulating encryptionPublicKey() call)
            const publicKeyPem = getPublicKey();

            // Step 3: Client encrypts secrets using public key
            const apiKey = 'farcaster-api-key-abc123';
            const bearerToken = 'farcaster-bearer-token-xyz789';
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

            const encryptedApiKey = forge.util.encode64(
                publicKey.encrypt(apiKey, 'RSA-OAEP')
            );
            const encryptedBearerToken = forge.util.encode64(
                publicKey.encrypt(bearerToken, 'RSA-OAEP')
            );

            // Step 4: Canister decrypts the secrets
            const decryptedApiKey = decryptSecret(encryptedApiKey);
            const decryptedBearerToken = decryptSecret(encryptedBearerToken);

            // Step 5: Verify they match
            expect(decryptedApiKey).toBe(apiKey);
            expect(decryptedBearerToken).toBe(bearerToken);
        });

        it('should handle multiple sequential encryptions/decryptions for both services', () => {
            initializeEncryption();
            const publicKeyPem = getPublicKey();
            const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);

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
                const encryptedBearerToken = forge.util.encode64(
                    publicKey.encrypt(secret.bearerToken, 'RSA-OAEP')
                );
                const encryptedSecretKey = forge.util.encode64(
                    publicKey.encrypt(secret.secretKey, 'RSA-OAEP')
                );

                const decryptedBearerToken = decryptSecret(encryptedBearerToken);
                const decryptedSecretKey = decryptSecret(encryptedSecretKey);

                expect(decryptedBearerToken).toBe(secret.bearerToken);
                expect(decryptedSecretKey).toBe(secret.secretKey);
            }

            // Test Farcaster secrets
            for (const secret of farcasterSecrets) {
                const encryptedApiKey = forge.util.encode64(
                    publicKey.encrypt(secret.apiKey, 'RSA-OAEP')
                );
                const encryptedBearerToken = forge.util.encode64(
                    publicKey.encrypt(secret.bearerToken, 'RSA-OAEP')
                );

                const decryptedApiKey = decryptSecret(encryptedApiKey);
                const decryptedBearerToken = decryptSecret(encryptedBearerToken);

                expect(decryptedApiKey).toBe(secret.apiKey);
                expect(decryptedBearerToken).toBe(secret.bearerToken);
            }
        });
    });
});
