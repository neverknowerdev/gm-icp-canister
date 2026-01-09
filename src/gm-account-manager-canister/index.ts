import { query, update, IDL } from 'azle';
import { processEvent } from './eventProcessor';
import { initConfig } from './utils/config';
import { getUser, getUserByTwitterId, getUserByFarcasterId, getTwitterUsers as getTwitterUsersFromStore, getFarcasterUsers as getFarcasterUsersFromStore } from './userManagement/userStore';
import { getEthereumAddress } from './utils/thresholdSigning';
import { initializeScanner, scheduleScanner } from './scanner/scannerScheduler';
import { scanAllChains } from './scanner/transactionScanner';
import { initTwitterConfig } from './utils/twitterVerification';
import { initFarcasterConfig } from './utils/farcasterVerification';
import { Chain, CHAINS, isValidChain } from './utils/types';
import { initializeCleanupScheduler, scheduleCleanup } from './storage/storageCleanerScheduler';
import { cleanStorage } from './storage/storageCleaner';
import { initializeEncryption, getPublicKey, decryptSecret } from './encryption';
import * as timelock from './utils/timelock';
import { Principal, ic } from 'azle';

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
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

        // Initialize timelock mechanism on canister creation
        try {
            timelock.initializeTimelock();
        } catch (error: any) {
            console.error(`Error initializing timelock: ${error}`);
        }
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

    @query([IDL.Text], IDL.Text)
    greet(name: string): string {
        return `Hello, ${name}!`;
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

    @update([IDL.Record({
        contracts: IDL.Record({
            'Base Mainnet': IDL.Vec(IDL.Text),
            'WorldChain': IDL.Vec(IDL.Text),
        }),
        eventSignatures: IDL.Record({
            'VerifyFarcasterRequested': IDL.Text,
            'VerifyTwitterByAuthCodeRequested': IDL.Text,
            'UserCreated': IDL.Text,
            'UserRemoved': IDL.Text,
            'SocialAccountLinked': IDL.Text,
            'PrimaryWalletUpdated': IDL.Text,
            'WalletLinked': IDL.Text,
            'HumanVerificationUpdated': IDL.Text,
        }),
    })], IDL.Null)
    setConfig(config: Config): null {
        initConfig(config);
        console.log('Configuration updated successfully');
        return null;
    }

    /**
     * Initialize Twitter API configuration for verification
     * Uses authCode-based verification (fetch tweet, validate authCode in tweet)
     */
    @update([IDL.Record({
        tweetFetchURL: IDL.Text,
        headerName: IDL.Text,
        bearerTokenEncrypted: IDL.Text,
    })], IDL.Null)
    setTwitterConfig(config: { tweetFetchURL: string; headerName: string; bearerTokenEncrypted: string }): null {
        try {
            const bearerToken = decryptSecret(config.bearerTokenEncrypted);

            initTwitterConfig({
                tweetFetchURL: config.tweetFetchURL,
                headerName: config.headerName,
                bearerToken: bearerToken,
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
     */
    @query([], IDL.Text)
    async evmWalletAddress(): Promise<string> {
        try {
            return await getEthereumAddress();
        } catch (error: any) {
            console.error(`Error getting EVM wallet address: ${error}`);
            throw new Error(`Failed to get EVM wallet address: ${error.message || error}`);
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

    // ==================== Timelock Methods ====================

    /**
     * Schedule an upgrade proposal with timelock delay (default: 3 days)
     * Only canister controllers can schedule upgrades
     * @param proposalId Unique identifier for this upgrade proposal
     * @param moduleHash Hash of the new WASM module (should be computed from the WASM file)
     * @param description Optional description of what the upgrade does
     */
    @update([IDL.Text, IDL.Text, IDL.Opt(IDL.Text)], IDL.Null)
    scheduleUpgrade(proposalId: string, moduleHash: string, description?: string): null {
        try {
            const caller = ic.caller();
            const proposer = caller.toString();
            
            timelock.scheduleUpgrade(proposalId, moduleHash, proposer, description || undefined);
            console.log(`Upgrade scheduled by ${proposer}`);
            return null;
        } catch (error: any) {
            console.error(`Error scheduling upgrade: ${error}`);
            throw new Error(`Failed to schedule upgrade: ${error.message || error}`);
        }
    }

    /**
     * Check if an upgrade proposal is ready to be executed
     * @param proposalId The proposal ID to check
     * @returns true if ready, false otherwise
     */
    @query([IDL.Text], IDL.Bool)
    isUpgradeReady(proposalId: string): boolean {
        try {
            return timelock.isUpgradeReady(proposalId);
        } catch (error: any) {
            console.error(`Error checking upgrade readiness: ${error}`);
            return false;
        }
    }

    /**
     * Get upgrade proposal details
     * @param proposalId The proposal ID
     * @returns Upgrade proposal details or null if not found
     */
    @query([IDL.Text], IDL.Opt(IDL.Record({
        proposalId: IDL.Text,
        moduleHash: IDL.Text,
        scheduledTime: IDL.Nat64,
        delay: IDL.Nat64,
        proposer: IDL.Text,
        description: IDL.Opt(IDL.Text),
    })))
    getUpgradeProposal(proposalId: string): any {
        try {
            const proposal = timelock.getUpgradeProposal(proposalId);
            if (!proposal) {
                return [];
            }
            return [{
                proposalId: proposal.proposalId,
                moduleHash: proposal.moduleHash,
                scheduledTime: proposal.scheduledTime,
                delay: proposal.delay,
                proposer: proposal.proposer,
                description: proposal.description ? [proposal.description] : [],
            }];
        } catch (error: any) {
            console.error(`Error getting upgrade proposal: ${error}`);
            return [];
        }
    }

    /**
     * Get all upgrade proposals
     * @returns Array of all upgrade proposals
     */
    @query([], IDL.Vec(IDL.Record({
        proposalId: IDL.Text,
        moduleHash: IDL.Text,
        scheduledTime: IDL.Nat64,
        delay: IDL.Nat64,
        proposer: IDL.Text,
        description: IDL.Opt(IDL.Text),
    })))
    getAllUpgradeProposals(): any[] {
        try {
            const proposals = timelock.getAllUpgradeProposals();
            return proposals.map(p => ({
                proposalId: p.proposalId,
                moduleHash: p.moduleHash,
                scheduledTime: p.scheduledTime,
                delay: p.delay,
                proposer: p.proposer,
                description: p.description ? [p.description] : [],
            }));
        } catch (error: any) {
            console.error(`Error getting all upgrade proposals: ${error}`);
            return [];
        }
    }

    /**
     * Verify that an upgrade can be executed (checks proposal and time delay)
     * This should be called before executing the actual upgrade via dfx
     * @param proposalId The proposal ID
     * @param moduleHash The module hash to verify
     * @throws Error if upgrade cannot be executed
     */
    @query([IDL.Text, IDL.Text], IDL.Bool)
    verifyUpgrade(proposalId: string, moduleHash: string): boolean {
        try {
            timelock.checkTimeDelay(proposalId, moduleHash);
            return true;
        } catch (error: any) {
            console.error(`Upgrade verification failed: ${error.message || error}`);
            throw new Error(`Upgrade verification failed: ${error.message || error}`);
        }
    }

    /**
     * Clear an upgrade proposal after successful execution
     * Only canister controllers can clear proposals
     * @param proposalId The proposal ID to clear
     */
    @update([IDL.Text], IDL.Null)
    clearUpgradeProposal(proposalId: string): null {
        try {
            timelock.clearUpgradeProposal(proposalId);
            console.log(`Upgrade proposal ${proposalId} cleared`);
            return null;
        } catch (error: any) {
            console.error(`Error clearing upgrade proposal: ${error}`);
            throw new Error(`Failed to clear upgrade proposal: ${error.message || error}`);
        }
    }

    /**
     * Cancel an upgrade proposal (removes it without execution)
     * Only canister controllers can cancel proposals
     * @param proposalId The proposal ID to cancel
     */
    @update([IDL.Text], IDL.Null)
    cancelUpgradeProposal(proposalId: string): null {
        try {
            timelock.cancelUpgradeProposal(proposalId);
            console.log(`Upgrade proposal ${proposalId} cancelled`);
            return null;
        } catch (error: any) {
            console.error(`Error cancelling upgrade proposal: ${error}`);
            throw new Error(`Failed to cancel upgrade proposal: ${error.message || error}`);
        }
    }

    /**
     * Get time remaining until upgrade can be executed
     * @param proposalId The proposal ID
     * @returns Remaining time in nanoseconds, or 0 if ready/not found
     */
    @query([IDL.Text], IDL.Nat64)
    getUpgradeTimeRemaining(proposalId: string): bigint {
        try {
            return timelock.getTimeRemaining(proposalId);
        } catch (error: any) {
            console.error(`Error getting upgrade time remaining: ${error}`);
            return BigInt(0);
        }
    }

    /**
     * Get the configured timelock delay
     * @returns Delay in nanoseconds
     */
    @query([], IDL.Nat64)
    getTimelockDelay(): bigint {
        return timelock.getTimelockDelay();
    }

    /**
     * Set the timelock delay (minimum: 1 day)
     * Only canister controllers can change the delay
     * @param delayNs New delay in nanoseconds
     */
    @update([IDL.Nat64], IDL.Null)
    setTimelockDelay(delayNs: bigint): null {
        try {
            timelock.setTimelockDelay(delayNs);
            console.log(`Timelock delay updated to: ${delayNs}ns`);
            return null;
        } catch (error: any) {
            console.error(`Error setting timelock delay: ${error}`);
            throw new Error(`Failed to set timelock delay: ${error.message || error}`);
        }
    }
}

