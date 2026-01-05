// Global Retry Worker - processes all error types together

import { 
    ErrorType, 
    ErrorData, 
    getErrors, 
    clearErrors, 
    hasErrors,
    addError,
    TwitterQueryError,
    TwitterReverifyError,
    FarcasterQueryError,
    MintingTxError,
} from '../storage/errorStorage';
import { processBatchesInParallel, QueryBatch, isTwitterConfigured, getTwitterConfig, calculateTokenAmount, GetUsersCallback } from '../workers/twitter/process';
import { processFarcasterBatchesInParallel, FarcasterQueryBatch, isFarcasterConfigured } from '../workers/farcaster/process';
import { TwitterRequester } from '../workers/twitter/twitterRequester';
import { mintForUsers, ChainContract } from '../chainContract';
import { getChainContracts } from '../minting';
import { getTwitterUsers, getFarcasterUsers } from '../utils/accountManagerClient';
import { getCurrentMintingDayTimestamp } from '../utils/dateUtils';
import { scheduleRetryWorker } from './retryScheduler';
import { getTweetInfo, storeTweetsBatch, TweetInfo } from '../storage';

/**
 * Process all errors using the global retry worker
 * This function processes all 4 error types together
 */
export async function processAllErrors(): Promise<boolean> {
    console.log('Global retry worker started - processing all error types...');
    
    if (!hasErrors()) {
        console.log('No errors to retry');
        return true; // No errors means success
    }
    
    let hasNewErrors = false;
    
    try {
        // Process Twitter query errors
        hasNewErrors = await processTwitterQueryErrors() || hasNewErrors;
        
        // Process Twitter reVerify errors
        hasNewErrors = await processTwitterReverifyErrors() || hasNewErrors;
        
        // Process Farcaster query errors
        hasNewErrors = await processFarcasterQueryErrors() || hasNewErrors;
        
        // Process minting transaction errors
        hasNewErrors = await processMintingTxErrors() || hasNewErrors;
        
        console.log('Global retry worker completed');
        return !hasNewErrors; // Success if no new errors occurred
    } catch (error: any) {
        console.error(`Error in global retry worker: ${error}`);
        return false;
    }
}

/**
 * Process Twitter query errors
 */
async function processTwitterQueryErrors(): Promise<boolean> {
    const errors = getErrors('twitter-query') as TwitterQueryError[];
    
    if (errors.length === 0) {
        return false;
    }
    
    console.log(`Processing ${errors.length} Twitter query errors...`);
    
    // Group errors by chainId
    const errorsByChain = new Map<number, TwitterQueryError[]>();
    for (const error of errors) {
        if (!errorsByChain.has(error.chainId)) {
            errorsByChain.set(error.chainId, []);
        }
        errorsByChain.get(error.chainId)!.push(error);
    }
    
    let hasNewErrors = false;
    
    // Process each chain's errors
    for (const [chainId, chainErrors] of errorsByChain.entries()) {
        const chainContract = getChainContracts().find(c => c.chainId === chainId);
        if (!chainContract) {
            console.error(`Chain contract not found for chainId ${chainId}`);
            hasNewErrors = true;
            continue;
        }
        
        // Group by minting day timestamp
        const errorsByDay = new Map<number, QueryBatch[]>();
        for (const error of chainErrors) {
            if (!errorsByDay.has(error.mintingDayTimestamp)) {
                errorsByDay.set(error.mintingDayTimestamp, []);
            }
            errorsByDay.get(error.mintingDayTimestamp)!.push(error.queryBatch);
        }
        
        for (const [mintingTimestamp, queryBatches] of errorsByDay.entries()) {
            try {
                // Check if Twitter is configured
                if (!isTwitterConfigured()) {
                    console.error('Twitter not configured, cannot retry queries');
                    hasNewErrors = true;
                    continue;
                }
                
                console.log(`Retrying ${queryBatches.length} Twitter query batches for chain ${chainId}, day ${mintingTimestamp}`);
                
                // Retry processing the errored query batches
                const { results: processingResults, erroredQueries: newErroredQueries } = await processBatchesInParallel(
                    queryBatches,
                    mintingTimestamp
                );
                
                // If there are still errors, re-add them to error storage
                if (newErroredQueries.length > 0) {
                    console.warn(`Retry still has ${newErroredQueries.length} failed batches for chain ${chainId}, day ${mintingTimestamp}`);
                    for (const erroredBatch of newErroredQueries) {
                        addError('twitter-query', {
                            mintingDayTimestamp: mintingTimestamp,
                            chainId,
                            queryBatch: erroredBatch,
                        });
                    }
                    hasNewErrors = true;
                } else {
                    console.log(`Successfully retried all ${queryBatches.length} Twitter query batches for chain ${chainId}, day ${mintingTimestamp}`);
                }
                
            } catch (error: any) {
                console.error(`Error retrying Twitter queries for chain ${chainId}, day ${mintingTimestamp}: ${error}`);
                // Re-add all batches that failed to retry
                for (const batch of queryBatches) {
                    addError('twitter-query', {
                        mintingDayTimestamp: mintingTimestamp,
                        chainId,
                        queryBatch: batch,
                    });
                }
                hasNewErrors = true;
            }
        }
    }
    
    // Clear processed errors (we'll clear on success, keep on failure)
    if (!hasNewErrors) {
        clearErrors('twitter-query');
        console.log('Successfully processed all Twitter query errors');
    }
    
    return hasNewErrors;
}

/**
 * Process Twitter reVerify errors
 */
async function processTwitterReverifyErrors(): Promise<boolean> {
    const errors = getErrors('twitter-reverify') as TwitterReverifyError[];
    
    if (errors.length === 0) {
        return false;
    }
    
    console.log(`Processing ${errors.length} Twitter reVerify errors...`);
    
    // Check if Twitter is configured
    if (!isTwitterConfigured()) {
        console.error('Twitter not configured, cannot retry reVerify');
        return true; // Keep errors for next retry
    }
    
    const twitterConfig = getTwitterConfig();
    if (!twitterConfig) {
        console.error('Twitter config not available');
        return true;
    }
    
    const requester = new TwitterRequester(twitterConfig.secrets, twitterConfig.urls);
    let hasNewErrors = false;
    const retryErrors: TwitterReverifyError[] = [];
    
    // Group errors by chainId and minting day
    const errorsByChainAndDay = new Map<string, TwitterReverifyError[]>();
    for (const error of errors) {
        const key = `${error.chainId}-${error.mintingDayTimestamp}`;
        if (!errorsByChainAndDay.has(key)) {
            errorsByChainAndDay.set(key, []);
        }
        errorsByChainAndDay.get(key)!.push(error);
    }
    
    // Process each chain/day combination
    for (const [key, chainErrors] of errorsByChainAndDay.entries()) {
        const [chainIdStr, mintingTimestampStr] = key.split('-');
        const chainId = parseInt(chainIdStr);
        const mintingTimestamp = parseInt(mintingTimestampStr);
        
        // Collect all tweet IDs to retry
        const allTweetIds: string[] = [];
        for (const error of chainErrors) {
            allTweetIds.push(...error.tweetIds);
        }
        
        if (allTweetIds.length === 0) {
            continue;
        }
        
        try {
            console.log(`Retrying reVerify for ${allTweetIds.length} tweets (chain ${chainId}, day ${mintingTimestamp})`);
            
            // Convert tweet IDs to TweetInfo objects for reVerifyTweets
            const tweetsToVerify: TweetInfo[] = allTweetIds.map(tweetId => {
                // Get existing tweet info if available
                const existingTweet = getTweetInfo(tweetId);
                return {
                    tweetId: tweetId,
                    twitterUserId: existingTweet?.twitterUserId || existingTweet?.userId || '',
                    userId: existingTweet?.userId || '',
                    username: existingTweet?.username || '',
                    likesCount: existingTweet?.likesCount || 0,
                    text: existingTweet?.text || '',
                    parsed_at: existingTweet?.parsed_at || Math.floor(Date.now() / 1000),
                };
            });
            
            // Fetch tweets by IDs using official Twitter API
            const verifiedTweets = await requester.reVerifyTweets(tweetsToVerify);
            
            // Store verified tweets (already in TweetInfo format)
            if (verifiedTweets.length > 0) {
                storeTweetsBatch(verifiedTweets, mintingTimestamp);
                console.log(`Re-verified ${verifiedTweets.length} tweets for chain ${chainId}, day ${mintingTimestamp}`);
            }
            
            // Check which tweets failed (not in verifiedTweets)
            const verifiedTweetIds = new Set(verifiedTweets.map((t: TweetInfo) => t.tweetId));
            const failedTweetIds = allTweetIds.filter(id => !verifiedTweetIds.has(id));
            
            if (failedTweetIds.length > 0) {
                console.warn(`ReVerify still has ${failedTweetIds.length} failed tweets for chain ${chainId}, day ${mintingTimestamp}`);
                // Re-add failed tweets to error storage
                retryErrors.push({
                    mintingDayTimestamp: mintingTimestamp,
                    chainId,
                    tweetIds: failedTweetIds,
                });
                hasNewErrors = true;
            }
            
        } catch (error: any) {
            console.error(`Error retrying Twitter reVerify for chain ${chainId}, day ${mintingTimestamp}: ${error}`);
            // Re-add all errors for this chain/day
            for (const error of chainErrors) {
                retryErrors.push(error);
            }
            hasNewErrors = true;
        }
    }
    
    // Clear all errors
    clearErrors('twitter-reverify');
    
    // Re-add errors that still failed
    if (retryErrors.length > 0) {
        for (const error of retryErrors) {
            addError('twitter-reverify', error);
        }
    }
    
    return hasNewErrors;
}

/**
 * Process Farcaster query errors
 */
async function processFarcasterQueryErrors(): Promise<boolean> {
    const errors = getErrors('farcaster-query') as FarcasterQueryError[];
    
    if (errors.length === 0) {
        return false;
    }
    
    console.log(`Processing ${errors.length} Farcaster query errors...`);
    
    // Group errors by chainId
    const errorsByChain = new Map<number, FarcasterQueryError[]>();
    for (const error of errors) {
        if (!errorsByChain.has(error.chainId)) {
            errorsByChain.set(error.chainId, []);
        }
        errorsByChain.get(error.chainId)!.push(error);
    }
    
    let hasNewErrors = false;
    
    // Process each chain's errors
    for (const [chainId, chainErrors] of errorsByChain.entries()) {
        const chainContract = getChainContracts().find(c => c.chainId === chainId);
        if (!chainContract) {
            console.error(`Chain contract not found for chainId ${chainId}`);
            hasNewErrors = true;
            continue;
        }
        
        // Group by minting day timestamp
        const errorsByDay = new Map<number, FarcasterQueryBatch[]>();
        for (const error of chainErrors) {
            if (!errorsByDay.has(error.mintingDayTimestamp)) {
                errorsByDay.set(error.mintingDayTimestamp, []);
            }
            errorsByDay.get(error.mintingDayTimestamp)!.push(error.queryBatch);
        }
        
        for (const [mintingTimestamp, queryBatches] of errorsByDay.entries()) {
            try {
                // Check if Farcaster is configured
                if (!isFarcasterConfigured()) {
                    console.error('Farcaster not configured, cannot retry queries');
                    hasNewErrors = true;
                    continue;
                }
                
                console.log(`Retrying ${queryBatches.length} Farcaster query batches for chain ${chainId}, day ${mintingTimestamp}`);
                
                // Retry processing the errored query batches
                const { results: processingResults, erroredQueries: newErroredQueries } = await processFarcasterBatchesInParallel(
                    queryBatches,
                    mintingTimestamp
                );
                
                // If there are still errors, re-add them to error storage
                if (newErroredQueries.length > 0) {
                    console.warn(`Retry still has ${newErroredQueries.length} failed batches for chain ${chainId}, day ${mintingTimestamp}`);
                    for (const erroredBatch of newErroredQueries) {
                        addError('farcaster-query', {
                            mintingDayTimestamp: mintingTimestamp,
                            chainId,
                            queryBatch: erroredBatch,
                        });
                    }
                    hasNewErrors = true;
                } else {
                    console.log(`Successfully retried all ${queryBatches.length} Farcaster query batches for chain ${chainId}, day ${mintingTimestamp}`);
                }
                
            } catch (error: any) {
                console.error(`Error retrying Farcaster queries for chain ${chainId}, day ${mintingTimestamp}: ${error}`);
                // Re-add all batches that failed to retry
                for (const batch of queryBatches) {
                    addError('farcaster-query', {
                        mintingDayTimestamp: mintingTimestamp,
                        chainId,
                        queryBatch: batch,
                    });
                }
                hasNewErrors = true;
            }
        }
    }
    
    // Clear processed errors (we'll clear on success, keep on failure)
    if (!hasNewErrors) {
        clearErrors('farcaster-query');
        console.log('Successfully processed all Farcaster query errors');
    }
    
    return hasNewErrors;
}

/**
 * Process minting transaction errors
 */
async function processMintingTxErrors(): Promise<boolean> {
    const errors = getErrors('minting-tx') as MintingTxError[];
    
    if (errors.length === 0) {
        return false;
    }
    
    console.log(`Processing ${errors.length} minting transaction errors...`);
    
    // Group errors by chainId
    const errorsByChain = new Map<number, MintingTxError[]>();
    for (const error of errors) {
        if (!errorsByChain.has(error.chainId)) {
            errorsByChain.set(error.chainId, []);
        }
        errorsByChain.get(error.chainId)!.push(error);
    }
    
    let hasNewErrors = false;
    
    // Process each chain's errors
    for (const [chainId, chainErrors] of errorsByChain.entries()) {
        const chainContract = getChainContracts().find(c => c.chainId === chainId);
        if (!chainContract) {
            console.error(`Chain contract not found for chainId ${chainId}`);
            hasNewErrors = true;
            continue;
        }
        
        for (const error of chainErrors) {
            try {
                // Convert array of [wallet, amount] pairs to Map
                const userAmounts = new Map<string, bigint>(error.userAmounts);
                
                console.log(`Retrying minting transaction for chain ${chainId}, ${userAmounts.size} users`);
                
                // Retry the minting transaction
                await mintForUsers(chainContract, userAmounts);
                
                console.log(`Successfully retried minting transaction for chain ${chainId}`);
            } catch (error: any) {
                console.error(`Error retrying minting transaction for chain ${chainId}: ${error}`);
                hasNewErrors = true;
            }
        }
    }
    
    // Clear processed errors on success
    if (!hasNewErrors) {
        clearErrors('minting-tx');
        console.log('Successfully processed all minting transaction errors');
    }
    
    return hasNewErrors;
}

/**
 * Helper function to create getUserCallback
 */
function createGetUsersCallback(chainContract: ChainContract): GetUsersCallback {
    // Import here to avoid circular dependencies
    const { getTwitterUsers } = require('../utils/accountManagerClient');
    
    return async (startIndex: bigint, limit: bigint) => {
        try {
            const canisterUsers = await getTwitterUsers(chainContract.chainId, startIndex, limit);
            return canisterUsers.map((u: any) => ({
                userId: u.userId,
                accountId: u.accountId,
                walletAddress: u.walletAddress,
            }));
        } catch (error: any) {
            console.error(`Error getting users: ${error}`);
            return [];
        }
    };
}

/**
 * Schedule the next retry if there are still errors
 */
export function scheduleNextRetryIfNeeded(): void {
    if (hasErrors()) {
        console.log('Errors still exist, scheduling next retry...');
        scheduleRetryWorker();
    } else {
        console.log('All errors processed, no need to schedule retry');
    }
}

