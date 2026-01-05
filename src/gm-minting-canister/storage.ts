// Storage for minting canister

// Minting status tracking
export type MintingStatus = 'done' | 'in-progress' | 'error';

export interface MintingStatusInfo {
    status: MintingStatus;
    twitterQueryErrors: number;
    twitterRefereficationErrors: number;
    farcasterQueryErrors: number;
}

const mintingStatus: MintingStatusInfo = {
    status: 'done',
    twitterQueryErrors: 0,
    twitterRefereficationErrors: 0,
    farcasterQueryErrors: 0,
};

// Tweet storage
export interface TweetInfo {
    tweetId: string;
    twitterUserId: string;
    userId: string; // Internal user ID from account manager canister
    username: string;
    likesCount: number;
    text: string;
    parsed_at: number; // timestamp when tweet was parsed
}

// tweetInfo: map[string]TweetInfo // tweetId => TweetInfo
const tweetInfo = new Map<string, TweetInfo>();

// mintingDayTweets: map[number]string[] // mintingDayTimestamp => array of tweetIds
const mintingDayTweets = new Map<number, string[]>();

// Cast storage (for Farcaster)
export interface CastInfo {
    castId: string;
    fid: string;
    likesCount: number;
    text: string;
    parsed_at: number; // timestamp when cast was parsed
}

// castInfo: map[string]CastInfo // castId => CastInfo
const castInfo = new Map<string, CastInfo>();

// mintingDayCasts: map[number]string[] // mintingDayTimestamp => array of castIds
const mintingDayCasts = new Map<number, string[]>();

// twitterErroredQueries: map[number]map[number]QueryBatch[] // mintingDayTimestamp => chainId => array of failed query batches
// QueryBatch type is imported from workers/twitter/process
import type { QueryBatch } from './workers/twitter/process';

const twitterErroredQueries = new Map<number, Map<number, QueryBatch[]>>();

// Twitter user storage (for type definitions only, no global caching)
export interface TwitterUser {
    userId: bigint;
    accountId: bigint; // Twitter ID
    walletAddress: string;
}

/**
 * Store tweets in batch
 * @param tweets Array of tweet info to store
 * @param mintingDayTimestamp The minting day timestamp
 */
export function storeTweetsBatch(tweets: TweetInfo[], mintingDayTimestamp: number): void {
    const tweetIds: string[] = [];
    const seenTweetIds = new Set<string>();

    // Get existing tweets for this minting day to avoid duplicates
    const existingTweets = mintingDayTweets.get(mintingDayTimestamp) || [];
    for (const existingId of existingTweets) {
        seenTweetIds.add(existingId);
    }

    for (const tweet of tweets) {
        // Skip if already stored
        if (seenTweetIds.has(tweet.tweetId)) {
            continue;
        }

        tweetInfo.set(tweet.tweetId, tweet);
        tweetIds.push(tweet.tweetId);
        seenTweetIds.add(tweet.tweetId);
    }

    // Add new tweetIds to minting day mapping
    if (tweetIds.length > 0) {
        mintingDayTweets.set(mintingDayTimestamp, [...existingTweets, ...tweetIds]);
    }
}

/**
 * Get all tweet IDs for a minting day
 */
export function getTweetIdsByMintingDay(mintingDayTimestamp: number): string[] {
    return mintingDayTweets.get(mintingDayTimestamp) || [];
}

/**
 * Get tweet info by tweetId
 */
export function getTweetInfo(tweetId: string): TweetInfo | undefined {
    return tweetInfo.get(tweetId);
}

/**
 * Check if tweet is processed (exists in storage)
 */
export function isTweetProcessed(tweetId: string): boolean {
    return tweetInfo.has(tweetId);
}

/**
 * Add a failed query batch to Twitter errored queries for a specific minting day and chain
 */
export function addTwitterErroredQuery(mintingDayTimestamp: number, chainId: number, queryBatch: QueryBatch): void {
    let chainMap = twitterErroredQueries.get(mintingDayTimestamp);
    if (!chainMap) {
        chainMap = new Map<number, QueryBatch[]>();
        twitterErroredQueries.set(mintingDayTimestamp, chainMap);
    }

    const queries = chainMap.get(chainId) || [];
    queries.push(queryBatch);
    chainMap.set(chainId, queries);
}

/**
 * Get all Twitter errored query batches for a specific minting day and chain
 */
export function getTwitterErroredQueries(mintingDayTimestamp: number, chainId: number): QueryBatch[] {
    const chainMap = twitterErroredQueries.get(mintingDayTimestamp);
    if (!chainMap) {
        return [];
    }
    const queries = chainMap.get(chainId) || [];
    return [...queries]; // Return a copy to prevent external modification
}

/**
 * Get count of Twitter errored queries for a specific minting day and chain
 */
export function getTwitterErroredQueriesCount(mintingDayTimestamp: number, chainId: number): number {
    const chainMap = twitterErroredQueries.get(mintingDayTimestamp);
    if (!chainMap) {
        return 0;
    }
    const queries = chainMap.get(chainId) || [];
    return queries.length;
}

/**
 * Clear Twitter errored queries for a specific minting day and chain, or all if no parameters provided
 */
export function clearTwitterErroredQueries(mintingDayTimestamp?: number, chainId?: number): void {
    if (mintingDayTimestamp !== undefined && chainId !== undefined) {
        // Clear for specific minting day and chain
        const chainMap = twitterErroredQueries.get(mintingDayTimestamp);
        if (chainMap) {
            chainMap.delete(chainId);
            if (chainMap.size === 0) {
                twitterErroredQueries.delete(mintingDayTimestamp);
            }
        }
    } else if (mintingDayTimestamp !== undefined) {
        // Clear for specific minting day (all chains)
        twitterErroredQueries.delete(mintingDayTimestamp);
    } else {
        // Clear all
        twitterErroredQueries.clear();
    }
}

/**
 * Get current minting status
 */
export function getMintingStatus(): MintingStatusInfo {
    return { ...mintingStatus }; // Return a copy to prevent external modification
}

/**
 * Set minting status
 */
export function setMintingStatus(status: MintingStatus): void {
    mintingStatus.status = status;
}

/**
 * Set Twitter query errors count
 */
export function setTwitterQueryErrors(count: number): void {
    mintingStatus.twitterQueryErrors = count;
}

/**
 * Set Farcaster query errors count
 */
export function setFarcasterQueryErrors(count: number): void {
    mintingStatus.farcasterQueryErrors = count;
}

/**
 * Reset minting status to initial state
 */
export function resetMintingStatus(): void {
    mintingStatus.status = 'done';
    mintingStatus.twitterQueryErrors = 0;
    mintingStatus.farcasterQueryErrors = 0;
}

/**
 * Store casts in batch
 * @param casts Array of cast info to store
 * @param mintingDayTimestamp The minting day timestamp
 */
export function storeCastsBatch(casts: CastInfo[], mintingDayTimestamp: number): void {
    const castIds: string[] = [];
    const seenCastIds = new Set<string>();

    // Get existing casts for this minting day to avoid duplicates
    const existingCasts = mintingDayCasts.get(mintingDayTimestamp) || [];
    for (const existingId of existingCasts) {
        seenCastIds.add(existingId);
    }

    for (const cast of casts) {
        // Skip if already stored
        if (seenCastIds.has(cast.castId)) {
            continue;
        }

        castInfo.set(cast.castId, cast);
        castIds.push(cast.castId);
        seenCastIds.add(cast.castId);
    }

    // Add new castIds to minting day mapping
    if (castIds.length > 0) {
        mintingDayCasts.set(mintingDayTimestamp, [...existingCasts, ...castIds]);
    }
}

/**
 * Get all cast IDs for a minting day
 */
export function getCastIdsByMintingDay(mintingDayTimestamp: number): string[] {
    return mintingDayCasts.get(mintingDayTimestamp) || [];
}

/**
 * Get cast info by castId
 */
export function getCastInfo(castId: string): CastInfo | undefined {
    return castInfo.get(castId);
}

/**
 * Check if cast is processed (exists in storage)
 */
export function isCastProcessed(castId: string): boolean {
    return castInfo.has(castId);
}


