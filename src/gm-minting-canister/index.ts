import { update, query, IDL, Principal } from 'azle';
import { initializeMintingScheduler, rescheduleMinting } from './minting/mintingScheduler';
import { startMinting, addChainContract } from './minting';
import { ChainContract } from './chainContract';
import { setAccountManagerCanisterId } from './utils/accountManagerClient';
import { TwitterSecrets } from './workers/twitter/twitterRequester';
import { initializeTwitter } from './workers/twitter/process';
import { getTweetIdsByMintingDay, getTweetInfo, isTweetProcessed, TweetInfo } from './storage';
import { dateStringToMintingTimestamp } from './utils/dateUtils';
import { getEthereumAddress } from './utils/thresholdSigning';
import { processAllErrors } from './minting/globalRetryWorker';
import { scheduleRetryWorker, resetRetryCount } from './minting/retryScheduler';
import { initializeEncryption, getPublicKey, decryptSecret } from './encryption';
import { initializeFarcaster } from './workers/farcaster/process';
import { FarcasterSecrets } from './workers/farcaster/farcasterRequester';
import * as timelock from './utils/timelock';
import { Principal, ic } from 'azle';

export default class {
    constructor() {
        // Initialize minting scheduler on canister creation
        // This will set up the timer to run daily at 2:00 AM
        try {
            initializeMintingScheduler();
        } catch (error: any) {
            console.error(`Error initializing minting scheduler: ${error}`);
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
     * Timer callback - called by ICP timer system
     * This is an internal method called automatically at the scheduled time (2:00 AM daily)
     */
    @update([], IDL.Null)
    async timerCallback(): Promise<null> {
        console.log('Timer callback fired - starting minting process');
        try {
            await startMinting();
            // Reschedule for next day
            rescheduleMinting();
        } catch (error: any) {
            console.error(`Error in timer callback: ${error}`);
            // Still reschedule even if there's an error
            rescheduleMinting();
        }
        return null;
    }

    /**
     * Retry worker callback - called by ICP timer system for retrying errors
     * This processes all error types using the global retry worker
     */
    @update([], IDL.Null)
    async retryWorkerCallback(): Promise<null> {
        console.log('Retry worker callback fired - processing errors...');
        try {
            const success = await processAllErrors();

            if (!success) {
                // Errors still exist, schedule next retry
                console.log('Errors still exist, scheduling next retry...');
                scheduleRetryWorker();
            } else {
                // All errors resolved
                console.log('All errors resolved, retry worker complete');
                resetRetryCount();
            }
        } catch (error: any) {
            console.error(`Error in retry worker callback: ${error}`);
            // Try to schedule next retry even on error
            scheduleRetryWorker();
        }
        return null;
    }

    /**
     * Initialize Twitter configuration
     * Sets up Twitter API secrets and URLs
     * bearerTokenEncrypted and optimizedAPISecretKeyEncrypted should be encrypted using the canister's public key (from encryptionPublicKey())
     */
    @update([IDL.Record({
        bearerTokenEncrypted: IDL.Text,
        optimizedAPISecretKeyEncrypted: IDL.Text,
        authHeaderName: IDL.Text,
    }), IDL.Text, IDL.Text], IDL.Null)
    initializeTwitter(
        secrets: { bearerTokenEncrypted: string; optimizedAPISecretKeyEncrypted: string; authHeaderName: string },
        tweetLookupURL: string,
        twitterOptimizedServerHost: string
    ): null {
        try {
            // Decrypt the secrets
            const bearerToken = decryptSecret(secrets.bearerTokenEncrypted);
            const optimizedAPISecretKey = decryptSecret(secrets.optimizedAPISecretKeyEncrypted);

            // Pass decrypted values to init function
            initializeTwitter(
                {
                    bearerToken,
                    optimizedAPISecretKey,
                    authHeaderName: secrets.authHeaderName,
                },
                tweetLookupURL,
                twitterOptimizedServerHost
            );
            console.log('Twitter initialized successfully');
        } catch (error: any) {
            console.error(`Error initializing Twitter: ${error}`);
            throw new Error(`Failed to initialize Twitter: ${error.message || error}`);
        }
        return null;
    }

    /**
     * Add a chain contract configuration
     * Each chain contract represents smart contracts on a specific chain
     * accountManagement: contract for fetching users
     * gmCoin: contract for minting tokens
     */
    @update([IDL.Record({
        chain: IDL.Text,
        chainId: IDL.Nat32,
        accountManagement: IDL.Record({
            contractAddress: IDL.Text,
        }),
        gmCoin: IDL.Record({
            contractAddress: IDL.Text,
        }),
    })], IDL.Null)
    addChainContract(config: {
        chain: string;
        chainId: number;
        accountManagement: {
            contractAddress: string;
        };
        gmCoin: {
            contractAddress: string;
        };
    }): null {
        const chainContract: ChainContract = {
            chain: config.chain,
            chainId: config.chainId,
            accountManagement: {
                contractAddress: config.accountManagement.contractAddress,
            },
            gmCoin: {
                contractAddress: config.gmCoin.contractAddress,
            },
        };
        addChainContract(chainContract);
        console.log(`Chain contract added: ${config.chain} (${config.chainId})`);
        console.log(`  AccountManagement: ${config.accountManagement.contractAddress}`);
        console.log(`  GMCoin: ${config.gmCoin.contractAddress}`);
        return null;
    }

    /**
     * Set the account manager canister ID
     * This allows the minting canister to query user data from the account manager canister
     */
    @update([IDL.Principal], IDL.Null)
    setAccountManagerCanisterId(principal: any): null {
        setAccountManagerCanisterId(principal);
        console.log(`Account manager canister ID set to: ${principal.toText()}`);
        return null;
    }

    /**
     * Manually trigger minting process (for testing)
     */
    @update([], IDL.Null)
    async manualStartMinting(): Promise<null> {
        console.log('Manual minting triggered');
        try {
            await startMinting();
        } catch (error: any) {
            console.error(`Error in manual minting: ${error}`);
            throw error;
        }
        return null;
    }

    /**
     * Get all tweets for a minting day
     * Accepts date in various formats (YYYY-MM-DD, ISO string, timestamp)
     * Returns array of tweet info with all fields
     */
    @query([IDL.Text], IDL.Vec(IDL.Record({
        tweetId: IDL.Text,
        twitterUserId: IDL.Text,
        userId: IDL.Text,
        username: IDL.Text,
        likesCount: IDL.Nat32,
        text: IDL.Text,
        parsed_at: IDL.Nat64,
    })))
    getTweetsByMintingDay(dateString: string): TweetInfo[] {
        try {
            const mintingTimestamp = dateStringToMintingTimestamp(dateString);
            const tweetIds = getTweetIdsByMintingDay(mintingTimestamp);

            const tweets: TweetInfo[] = [];
            for (const tweetId of tweetIds) {
                const tweetInfo = getTweetInfo(tweetId);
                if (tweetInfo) {
                    tweets.push(tweetInfo);
                }
            }

            return tweets;
        } catch (error: any) {
            console.error(`Error getting tweets by minting day: ${error}`);
            return [];
        }
    }

    /**
     * Get tweet info by tweetId
     * Returns tweet info with status field ('processed' or 'not-processed')
     */
    @query([IDL.Text], IDL.Opt(IDL.Record({
        tweetId: IDL.Text,
        twitterUserId: IDL.Text,
        userId: IDL.Text,
        username: IDL.Text,
        likesCount: IDL.Nat32,
        text: IDL.Text,
        parsed_at: IDL.Nat64,
        status: IDL.Text,
    })))
    getTweetById(tweetId: string): any {
        const tweetInfo = getTweetInfo(tweetId);

        if (!tweetInfo) {
            return [{
                tweetId: tweetId,
                status: 'not-processed',
            }]
        }

        return [{
            tweetId: tweetInfo.tweetId,
            twitterUserId: tweetInfo.twitterUserId,
            userId: tweetInfo.userId,
            username: tweetInfo.username,
            likesCount: tweetInfo.likesCount,
            text: tweetInfo.text,
            parsed_at: tweetInfo.parsed_at,
            status: 'processed',
        }];
    }

    /**
     * Get the canister's EVM wallet address
     * This is derived from the threshold key's public key
     * The address is the last 20 bytes of keccak256 hash of the public key
     * @returns Ethereum address as hex string with 0x prefix
     */
    @query([], IDL.Text)
    async canisterEvmWalletAddress(): Promise<string> {
        try {
            return await getEthereumAddress();
        } catch (error: any) {
            console.error(`Error getting canister EVM wallet address: ${error}`);
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

    /**
     * Initialize Farcaster configuration
     * Sets up Farcaster API secrets and URLs
     * apiKeyEncrypted and bearerTokenEncrypted (if provided) should be encrypted using the canister's public key (from encryptionPublicKey())
     */
    @update([IDL.Record({
        apiKeyEncrypted: IDL.Text,
        bearerTokenEncrypted: IDL.Opt(IDL.Text),
    }), IDL.Text], IDL.Null)
    initializeFarcaster(
        secrets: { apiKeyEncrypted: string; bearerTokenEncrypted?: string },
        farcasterAPIURL: string
    ): null {
        try {
            // Decrypt the secrets
            const apiKey = decryptSecret(secrets.apiKeyEncrypted);
            let bearerToken: string | undefined = undefined;
            if (secrets.bearerTokenEncrypted) {
                bearerToken = decryptSecret(secrets.bearerTokenEncrypted);
            }

            // Pass decrypted values to init function
            initializeFarcaster(
                {
                    apiKey,
                    bearerToken,
                },
                farcasterAPIURL
            );
            console.log('Farcaster initialized successfully');
        } catch (error: any) {
            console.error(`Error initializing Farcaster: ${error}`);
            throw new Error(`Failed to initialize Farcaster: ${error.message || error}`);
        }
        return null;
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
