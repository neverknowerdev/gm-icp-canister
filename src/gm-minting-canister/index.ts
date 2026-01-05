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

export default class {
    constructor() {
        // Initialize minting scheduler on canister creation
        // This will set up the timer to run daily at 2:00 AM
        try {
            initializeMintingScheduler();
        } catch (error: any) {
            console.error(`Error initializing minting scheduler: ${error}`);
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
     */
    @update([IDL.Record({
        bearerToken: IDL.Text,
        optimizedAPISecretKey: IDL.Text,
        authHeaderName: IDL.Text,
    }), IDL.Text, IDL.Text], IDL.Null)
    initializeTwitter(
        secrets: TwitterSecrets,
        tweetLookupURL: string,
        twitterOptimizedServerHost: string
    ): null {
        initializeTwitter(secrets, tweetLookupURL, twitterOptimizedServerHost);
        console.log('Twitter initialized successfully');
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
}
