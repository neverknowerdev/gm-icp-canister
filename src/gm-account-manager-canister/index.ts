import { query, update, init, postUpgrade, IDL, setTimer } from 'azle';
import { processEvent } from './eventProcessor';
import { initContracts } from './evmContracts/config';
import { getUser, getUserByTwitterId, getUserByFarcasterId, getTwitterUsers as getTwitterUsersFromStore, getFarcasterUsers as getFarcasterUsersFromStore } from './userManagement/userStore';
import { getEthereumAddress, getCachedEthereumAddress, setCachedEthereumAddress } from './evmContracts/thresholdSigning';
import { initializeScanner, scheduleScanner } from './scanner/scannerScheduler';
import { scanAllChains } from './scanner/transactionScanner';
import { initTwitterConfig } from './verification/twitterVerification';
import { initFarcasterConfig } from './verification/farcasterVerification';
import { Chain, isValidChain } from './utils/types';
import { initializeCleanupScheduler, scheduleCleanup } from './storage/storageCleanerScheduler';
import { cleanStorage } from './storage/storageCleaner';
import { initializeEncryption, getPublicKey, decryptSecret } from './encryption';
import { getTransactionStatus } from './storage/transactionTracker';

interface ContractsConfig {
    contracts: {
        [chain: string]: {
            accountManager: string;
            GMCoin: string;
        };
    };
}

export default class {
    constructor() {
        // Initialize scanner on canister creation
        try {
            initializeScanner();
        } catch (error: any) {
            console.error(`Error initializing scanner: ${error}`);
        }

        // Initialize storage cleanup scheduler on canister creation
        try {
            initializeCleanupScheduler();
        } catch (error: any) {
            console.error(`Error initializing storage cleanup scheduler: ${error}`);
        }

        // Initialize encryption key pair on canister creation
        try {
            initializeEncryption();
        } catch (error: any) {
            console.error(`Error initializing encryption: ${error}`);
        }
    }

    /**
     * Initialize EVM wallet address asynchronously
     * Helper function to avoid code duplication
     */
    private initializeEvmWalletAddress(): void {
        try {
            console.log('Setting timer to initialize EVM wallet address...');
            // Set timer with 0 delay (in seconds) to run after init/postUpgrade completes
            const timerId = setTimer(0, async () => {
                try {
                    console.log('[Timer callback] Computing EVM wallet address...');
                    const address = await getEthereumAddress(); // This will cache it internally
                    console.log(`[Timer callback] EVM wallet address initialized: ${address}`);
                } catch (error: any) {
                    console.error(`[Timer callback] Error initializing EVM wallet address: ${error}`);
                    console.error(`[Timer callback] Error stack: ${error.stack || 'No stack trace'}`);
                    console.warn('[Timer callback] EVM wallet address initialization failed. It will be computed on first access.');
                }
            });
            console.log(`Timer set successfully with ID: ${timerId}`);
        } catch (error: any) {
            console.error(`Error setting timer for EVM wallet address: ${error}`);
            console.error(`Error stack: ${error.stack || 'No stack trace'}`);
        }
    }

    /**
     * Init hook - runs on first canister deployment
     * Used to initialize async operations like computing EVM wallet address
     */
    @init([])
    init(): void {
        this.initializeEvmWalletAddress();
    }

    /**
     * Post-upgrade hook - runs after canister upgrade
     * Used to initialize async operations like computing EVM wallet address
     */
    @postUpgrade([])
    postUpgrade(): void {
        this.initializeEvmWalletAddress();
    }

    /**
     * Scanner callback - called by ICP timer system
     * This is an internal method called automatically at the scheduled interval
     */
    @update([], IDL.Null)
    async scannerCallback(): Promise<null> {
        console.log('Scanner callback fired - scanning for unprocessed transactions...');
        try {
            await scanAllChains();
            // Reschedule for next interval
            scheduleScanner();
        } catch (error: any) {
            console.error(`Error in scanner callback: ${error}`);
            // Still reschedule even if there's an error
            scheduleScanner();
        }
        return null;
    }

    /**
     * Cleanup callback - called by ICP timer system daily at 1:00 AM UTC
     * This is an internal method called automatically at the scheduled time
     */
    @update([], IDL.Null)
    async cleanupCallback(): Promise<null> {
        console.log('Cleanup callback fired - cleaning storage...');
        try {
            await cleanStorage();
            // Reschedule for next day
            scheduleCleanup();
        } catch (error: any) {
            console.error(`Error in cleanup callback: ${error}`);
            // Still reschedule even if there's an error
            scheduleCleanup();
        }
        return null;
    }

    @update([IDL.Nat32, IDL.Text], IDL.Null)
    async handleEvent(chain: Chain, transactionId: string): Promise<null> {
        try {
            // Validate chain ID
            if (!isValidChain(chain)) {
                console.error(`Invalid chain ID: ${chain}`);
                return null;
            }
            await processEvent(chain, transactionId);
        } catch (error: any) {
            console.error(`Error processing event: ${error}`);
            if (error.message) {
                console.error(`Error message: ${error.message}`);
            }
        }
        return null;
    }

    /**
     * Set contract addresses for each chain
     * Event signatures are auto-calculated from ABI
     * Only accountManager is required, GMCoin is optional
     */
    @update([IDL.Record({
        contracts: IDL.Record({
            'Base Mainnet': IDL.Record({
                accountManager: IDL.Text,
                GMCoin: IDL.Opt(IDL.Text),
            }),
            'WorldChain': IDL.Record({
                accountManager: IDL.Text,
                GMCoin: IDL.Opt(IDL.Text),
            }),
        }),
    })], IDL.Null)
    setContractAddresses(config: ContractsConfig): null {
        initContracts(config);
        console.log('Contract addresses updated successfully');
        return null;
    }

    /**
     * Initialize Twitter API configuration for verification
     * All fields should be encrypted using the canister's public key (from encryptionPublicKey())
     */
    @update([IDL.Record({
        tweetFetchURLEncrypted: IDL.Text,
        headerNameEncrypted: IDL.Text,
        bearerTokenEncrypted: IDL.Text,
    })], IDL.Null)
    setTwitterConfig(config: { tweetFetchURLEncrypted: string; headerNameEncrypted: string; bearerTokenEncrypted: string }): null {
        try {
            const tweetFetchURL = decryptSecret(config.tweetFetchURLEncrypted);
            const headerName = decryptSecret(config.headerNameEncrypted);
            const bearerToken = decryptSecret(config.bearerTokenEncrypted);

            initTwitterConfig({
                tweetFetchURL,
                headerName,
                bearerToken,
            });
            console.log('Twitter API configuration updated successfully');
        } catch (error: any) {
            console.error(`Error setting Twitter config: ${error}`);
            throw new Error(`Failed to set Twitter config: ${error.message || error}`);
        }
        return null;
    }

    /**
     * Initialize Farcaster API configuration for verification
     * apiKeyEncrypted should be encrypted using the canister's public key (from encryptionPublicKey())
     */
    @update([IDL.Record({
        apiKeyEncrypted: IDL.Text,
        apiUrl: IDL.Opt(IDL.Text),
    })], IDL.Null)
    setFarcasterConfig(config: { apiKeyEncrypted: string; apiUrl?: string }): null {
        try {
            // Decrypt the API key
            const apiKey = decryptSecret(config.apiKeyEncrypted);

            // Pass decrypted values to init function
            initFarcasterConfig({
                apiKey: apiKey,
                apiUrl: config.apiUrl,
            });
            console.log('Farcaster API configuration updated successfully');
        } catch (error: any) {
            console.error(`Error setting Farcaster config: ${error}`);
            throw new Error(`Failed to set Farcaster config: ${error.message || error}`);
        }
        return null;
    }

    // User query methods for minting canister
    @query([IDL.Nat64], IDL.Opt(IDL.Record({
        userId: IDL.Nat64,
        chains: IDL.Vec(IDL.Text),
        twitterId: IDL.Nat64,
        farcasterId: IDL.Nat64,
        isVerified: IDL.Bool,
        verifications: IDL.Vec(IDL.Text),
        primaryWallet: IDL.Text,
        primaryChain: IDL.Text,
        wallets: IDL.Vec(IDL.Record({
            wallet: IDL.Text,
            chain: IDL.Text,
        })),
    })))
    getUser(userId: bigint): any {
        const user = getUser(userId);
        if (!user) {
            return [];
        }
        return [{
            userId: user.userId,
            chains: user.chains,
            twitterId: user.twitterId,
            farcasterId: user.farcasterId,
            isVerified: user.isVerified,
            verifications: user.verifications,
            primaryWallet: user.primaryWallet,
            primaryChain: user.primaryChain,
            wallets: user.wallets,
        }];
    }

    @query([IDL.Nat64], IDL.Opt(IDL.Record({
        userId: IDL.Nat64,
        chains: IDL.Vec(IDL.Text),
        twitterId: IDL.Nat64,
        farcasterId: IDL.Nat64,
        isVerified: IDL.Bool,
        verifications: IDL.Vec(IDL.Text),
        primaryWallet: IDL.Text,
        primaryChain: IDL.Text,
        wallets: IDL.Vec(IDL.Record({
            wallet: IDL.Text,
            chain: IDL.Text,
        })),
    })))
    getUserByTwitterId(twitterId: bigint): any {
        const user = getUserByTwitterId(twitterId);
        if (!user) {
            return [];
        }
        return [{
            userId: user.userId,
            chains: user.chains,
            twitterId: user.twitterId,
            farcasterId: user.farcasterId,
            isVerified: user.isVerified,
            verifications: user.verifications,
            primaryWallet: user.primaryWallet,
            primaryChain: user.primaryChain,
            wallets: user.wallets,
        }];
    }

    @query([IDL.Nat64], IDL.Opt(IDL.Record({
        userId: IDL.Nat64,
        chains: IDL.Vec(IDL.Text),
        twitterId: IDL.Nat64,
        farcasterId: IDL.Nat64,
        isVerified: IDL.Bool,
        verifications: IDL.Vec(IDL.Text),
        primaryWallet: IDL.Text,
        primaryChain: IDL.Text,
        wallets: IDL.Vec(IDL.Record({
            wallet: IDL.Text,
            chain: IDL.Text,
        })),
    })))
    getUserByFarcasterId(farcasterId: bigint): any {
        const user = getUserByFarcasterId(farcasterId);
        if (!user) {
            return [];
        }
        return [{
            userId: user.userId,
            chains: user.chains,
            twitterId: user.twitterId,
            farcasterId: user.farcasterId,
            isVerified: user.isVerified,
            verifications: user.verifications,
            primaryWallet: user.primaryWallet,
            primaryChain: user.primaryChain,
            wallets: user.wallets,
        }];
    }

    @query([IDL.Vec(IDL.Nat64)], IDL.Vec(IDL.Record({
        userId: IDL.Nat64,
        chains: IDL.Vec(IDL.Text),
        twitterId: IDL.Nat64,
        farcasterId: IDL.Nat64,
        isVerified: IDL.Bool,
        verifications: IDL.Vec(IDL.Text),
        primaryWallet: IDL.Text,
        primaryChain: IDL.Text,
        wallets: IDL.Vec(IDL.Record({
            wallet: IDL.Text,
            chain: IDL.Text,
        })),
    })))
    getUsers(userIds: bigint[]): any[] {
        const users: any[] = [];
        for (const userId of userIds) {
            const user = getUser(userId);
            if (user) {
                users.push({
                    userId: user.userId,
                    chains: user.chains,
                    twitterId: user.twitterId,
                    farcasterId: user.farcasterId,
                    isVerified: user.isVerified,
                    verifications: user.verifications,
                    primaryWallet: user.primaryWallet,
                    primaryChain: user.primaryChain,
                    wallets: user.wallets,
                });
            }
        }
        return users;
    }

    /**
     * Get Twitter users with pagination
     * Returns array of {userId, accountId, walletAddress} where accountId is Twitter ID
     */
    @query([IDL.Nat32, IDL.Nat64, IDL.Nat64], IDL.Vec(IDL.Record({
        userId: IDL.Nat64,
        accountId: IDL.Nat64,
        walletAddress: IDL.Text,
    })))
    getTwitterUsers(chainId: number, startIndex: bigint, limit: bigint): any[] {
        const results = getTwitterUsersFromStore(chainId, startIndex, limit);
        return results.map(r => ({
            userId: r.userId,
            accountId: r.accountId,
            walletAddress: r.walletAddress,
        }));
    }

    /**
     * Get Farcaster users with pagination
     * Returns array of {userId, accountId, walletAddress} where accountId is Farcaster ID
     */
    @query([IDL.Nat32, IDL.Nat64, IDL.Nat64], IDL.Vec(IDL.Record({
        userId: IDL.Nat64,
        accountId: IDL.Nat64,
        walletAddress: IDL.Text,
    })))
    getFarcasterUsers(chainId: number, startIndex: bigint, limit: bigint): any[] {
        const results = getFarcasterUsersFromStore(chainId, startIndex, limit);
        return results.map(r => ({
            userId: r.userId,
            accountId: r.accountId,
            walletAddress: r.walletAddress,
        }));
    }

    /**
     * Get the Ethereum wallet address derived from the canister's threshold ECDSA public key
     * This is the address that the canister can use for signing transactions
     * Returns the cached address computed during canister initialization
     * Note: If called immediately after deployment, may not be ready yet (computed asynchronously)
     */
    @query([], IDL.Text)
    evmWalletAddress(): string {
        const cached = getCachedEthereumAddress();
        if (cached === null) {
            throw new Error('EVM wallet address not yet initialized. Please call initEvmWalletAddress() update method first, or wait for automatic initialization to complete.');
        }
        return cached;
    }

    /**
     * Manually initialize EVM wallet address (fallback if automatic initialization fails)
     * This is an update method that computes and caches the address
     * Call this if evmWalletAddress query returns an error
     */
    @update([], IDL.Text)
    async initEvmWalletAddress(): Promise<string> {
        try {
            console.log('Manually initializing EVM wallet address...');
            const address = await getEthereumAddress(); // This will cache it internally
            console.log(`EVM wallet address manually initialized: ${address}`);
            return address;
        } catch (error: any) {
            console.error(`Error manually initializing EVM wallet address: ${error}`);
            throw new Error(`Failed to initialize EVM wallet address: ${error.message || error}`);
        }
    }

    /**
     * Get the RSA public key for encryption
     * Clients can use this public key to encrypt sensitive parameters before sending them to the canister
     * @returns RSA public key in PEM format
     */
    @query([], IDL.Text)
    encryptionPublicKey(): string {
        try {
            return getPublicKey();
        } catch (error: any) {
            console.error(`Error getting encryption public key: ${error}`);
            throw new Error(`Failed to get encryption public key: ${error.message || error}`);
        }
    }

    /**
     * Get the processing status of a transaction
     * @param chainId - The chain ID (e.g., 8453 for Base Mainnet)
     * @param txHash - The transaction hash
     * @returns Transaction status: 'processed', 'in_progress', or 'unprocessed'
     */
    @query([IDL.Nat32, IDL.Text], IDL.Text)
    getTransactionStatus(chainId: Chain, txHash: string): string {
        if (!isValidChain(chainId)) {
            return 'unprocessed';
        }
        return getTransactionStatus(chainId, txHash);
    }
}


