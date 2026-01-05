// Twitter Processing Module
// Handles all Twitter-related minting operations

import { TwitterRequester, TwitterSecrets } from './twitterRequester';
import { storeTweetsBatch, TweetInfo } from '../../storage';

// Configuration for Twitter processing
let twitterConfig: {
    secrets: TwitterSecrets;
    urls: {
        tweetLookupURL: string;
        convertToUsernamesURL: string;
        twitterSearchByQueryURL: string;
    };
} | null = null;

const MAX_TWITTER_SEARCH_QUERY_LENGTH = 512;
const KEYWORD = 'gm';
const PARALLEL_BATCH_COUNT = 5; // Number of batches to process in parallel
const USER_FETCH_BATCH_SIZE = 1000n; // Fetch users in batches of 1000

/**
 * Query batch structure
 */
export interface QueryBatch {
    queryString: string;
    twitterIdToUserId: Map<string, string>;
    userIdToWallet: Map<string, string>;
}

/**
 * Initialize Twitter configuration
 */
export function initializeTwitter(
    secrets: TwitterSecrets,
    tweetLookupURL: string,
    twitterOptimizedServerHost: string
): void {
    twitterConfig = {
        secrets,
        urls: {
            tweetLookupURL,
            convertToUsernamesURL: `${twitterOptimizedServerHost}/UserResultsByRestIds`,
            twitterSearchByQueryURL: `${twitterOptimizedServerHost}/Search`,
        },
    };
}

/**
 * Check if Twitter is configured
 */
export function isTwitterConfigured(): boolean {
    return twitterConfig !== null;
}

/**
 * User batch callback type
 * Returns array of {userId, accountId, walletAddress} where accountId is Twitter ID
 */
export type GetUsersCallback = (startIndex: bigint, limit: bigint) => Promise<Array<{ userId: bigint; accountId: bigint; walletAddress: string }>>;

/**
 * Minting result structure
 */
export interface MintingResult {
    userWallet: string;
    tokenAmount: bigint;
}

/**
 * Start Twitter minting for a specific chain
 * Uses callback function to get users, removing dependency on smart contracts
 * Returns array of minting results with user wallets and token amounts
 * @param getUserCallback Callback to fetch users
 * @param mintingTimestamp Timestamp for the minting day (midnight UTC)
 */
export async function processTwitterMinting(
    getUserCallback: GetUsersCallback,
    mintingTimestamp: number
): Promise<{ mintingResults: MintingResult[]; erroredQueries: QueryBatch[] }> {
    if (!twitterConfig) {
        console.log('Twitter not configured, skipping Twitter minting');
        return { mintingResults: [], erroredQueries: [] };
    }

    try {
        // Prepare all query batches with user mappings encapsulated
        const queryBatches = await prepareQueryBatches(getUserCallback, mintingTimestamp);
        console.log(`Prepared ${queryBatches.length} query batches for processing`);

        // Process batches in parallel and collect results (userId => tokenAmount)
        const { results: processingResults, erroredQueries } = await processBatchesInParallel(queryBatches, mintingTimestamp);

        // Log error queries count
        if (erroredQueries.length > 0) {
            console.warn(`Processing completed with ${erroredQueries.length} failed query batches`);
        }

        // Convert userId results to wallet results using query batches
        const mintingResults = convertToMintingResults(queryBatches, processingResults);

        return { mintingResults, erroredQueries };
    } catch (error: any) {
        console.error(`Error processing Twitter: ${error}`);
        throw error;
    }
}


/**
 * Prepare all query batches for processing
 * Fetches users incrementally and composes queries on the fly
 * Returns query batches and user mappings (twitterIdToUserId and userIdToWallet)
 * @param getUserCallback Callback to fetch users
 * @param mintingTimestamp Timestamp for the minting day (midnight UTC)
 */
async function prepareQueryBatches(
    getUserCallback: GetUsersCallback,
    mintingTimestamp: number
): Promise<QueryBatch[]> {
    if (!twitterConfig) {
        throw new Error('Twitter not configured');
    }

    const requester = new TwitterRequester(twitterConfig.secrets, twitterConfig.urls);
    const queryBatches: QueryBatch[] = [];

    // Local mappings for this processing session
    const twitterIdToUserId = new Map<string, string>();
    const userIdToWallet = new Map<string, string>();

    // Queue of usernames waiting to be added to queries
    const usernameQueue: Array<{ username: string; userId: bigint }> = [];

    let userBatchIndex = 0n;
    let hasMoreUsers = true;

    // Process users incrementally
    while (hasMoreUsers || usernameQueue.length > 0) {
        // Fetch next batch of users if queue is getting low and more users available
        if (usernameQueue.length < 100 && hasMoreUsers) {
            const userBatch = await getUserCallback(userBatchIndex, USER_FETCH_BATCH_SIZE);

            if (userBatch.length === 0) {
                hasMoreUsers = false;
            } else {
                // Convert Twitter IDs to usernames
                const twitterIds: string[] = [];
                for (const user of userBatch) {
                    twitterIds.push(user.accountId.toString());
                }

                // Convert Twitter IDs to usernames
                const usernames = await requester.convertToUsernames(twitterIds);

                // Add to username queue and build mappings
                for (let i = 0; i < userBatch.length; i++) {
                    const user = userBatch[i];
                    const userIdStr = user.userId.toString();
                    const twitterIdStr = user.accountId.toString();

                    // Build mappings
                    twitterIdToUserId.set(twitterIdStr, userIdStr);
                    userIdToWallet.set(userIdStr, user.walletAddress);

                    const username = usernames[i];
                    if (username && username !== '') {
                        usernameQueue.push({
                            username,
                            userId: user.userId,
                        });
                    }
                }

                userBatchIndex += USER_FETCH_BATCH_SIZE;
                console.log(`Fetched ${userBatch.length} users, total queued: ${usernameQueue.length}`);
            }
        }

        // Compose queries from queued usernames
        while (usernameQueue.length > 0) {
            // Try to fill a query with as many usernames as possible
            const usernamesForQuery = usernameQueue.map(u => u.username);
            const { queryString, recordInsertedCount } = createUserQueryString(
                usernamesForQuery,
                mintingTimestamp,
                MAX_TWITTER_SEARCH_QUERY_LENGTH,
                KEYWORD
            );

            // Remove processed usernames from queue
            usernameQueue.splice(0, recordInsertedCount);

            // Add query batch with mappings (all batches share the same mappings)
            if (recordInsertedCount > 0) {
                queryBatches.push({
                    queryString,
                    twitterIdToUserId,
                    userIdToWallet,
                });
            }

            // If we couldn't fit all usernames in the query, we need more users or continue with remaining
            // Break to fetch more users if queue is low and more are available
            if (usernameQueue.length > 0 && usernameQueue.length < 100 && hasMoreUsers) {
                break; // Fetch more users
            }
        }
    }

    console.log(`Prepared ${queryBatches.length} query batches from ${userBatchIndex} users`);
    return queryBatches;
}

// Threshold for re-verification using official Twitter API
const REVERIFICATION_LIKES_THRESHOLD = 100;
const VERIFY_TWEET_BATCH_SIZE = 300;

/**
 * Process query batches with rate limiting (concurrency control)
 * Maintains a pool of PARALLEL_BATCH_COUNT concurrent processes
 * When one finishes, immediately starts the next one
 * Returns results map instead of updating state directly to avoid race conditions
 * Also collects and stores tweets in batches
 * Returns both results and error count
 * Implements re-verification for tweets with >100 likes using official Twitter API
 */
async function processBatchesInParallel(
    queryBatches: QueryBatch[],
    mintingTimestamp: number
): Promise<{ results: Map<string, bigint>; erroredQueries: QueryBatch[] }> {
    if (!twitterConfig) {
        throw new Error('Twitter not configured');
    }

    const requester = new TwitterRequester(twitterConfig.secrets, twitterConfig.urls);
    const allResults = new Map<string, bigint>(); // Collect all results
    const allTweets: TweetInfo[] = []; // Collect all tweets for batch storage
    const erroredQueries: QueryBatch[] = []; // Collect failed query batches
    const tweetsToVerify: TweetInfo[] = []; // Tweets with >100 likes that need re-verification

    // Create a queue of batch indices
    let nextBatchIndex = 0;
    const maxConcurrent = Math.min(PARALLEL_BATCH_COUNT, queryBatches.length);

    console.log(`Starting ${maxConcurrent} concurrent processes for ${queryBatches.length} batches`);

    // Worker function that processes batches from the queue
    const worker = async (): Promise<void> => {
        while (true) {
            // Get next batch index atomically
            const batchIndex = nextBatchIndex++;

            // No more batches to process
            if (batchIndex >= queryBatches.length) {
                break;
            }

            const batch = queryBatches[batchIndex];
            try {
                const batchResult = await processSingleQueryBatch(batch, requester);

                // Separate tweets by likes count for re-verification
                const regularTweets: TweetInfo[] = [];
                const highLikesTweets: TweetInfo[] = [];

                for (const tweetInfo of batchResult.tweets) {
                    // Check if tweet needs re-verification (>100 likes)
                    if (tweetInfo.likesCount > REVERIFICATION_LIKES_THRESHOLD) {
                        highLikesTweets.push(tweetInfo);
                    } else {
                        regularTweets.push(tweetInfo);
                    }
                }

                // Merge token amounts from regular tweets
                for (const [userId, amount] of batchResult.results.entries()) {
                    const currentAmount = allResults.get(userId) || 0n;
                    allResults.set(userId, currentAmount + amount);
                }

                // Collect regular tweets
                allTweets.push(...regularTweets);

                // Add high-likes tweets to verification queue
                tweetsToVerify.push(...highLikesTweets);

                console.log(`Completed batch ${batchIndex + 1}/${queryBatches.length} (${highLikesTweets.length} tweets need re-verification)`);
            } catch (error: any) {
                console.error(`Error processing batch ${batchIndex + 1}: ${error}`);
                // Collect failed query batch to return later
                erroredQueries.push(batch);
                // Continue processing next batch even on error
            }
        }
    };

    // Start worker pool with staggered delays
    const workers = [];
    for (let i = 0; i < maxConcurrent; i++) {
        const delay = i * 100; // 100ms delay between start of each worker
        if (delay === 0) {
            // First worker starts immediately
            workers.push(worker());
        } else {
            // Subsequent workers start with delay
            workers.push(
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    await worker();
                })()
            );
        }
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    // Re-verify tweets with >100 likes using official Twitter API
    if (tweetsToVerify.length > 0) {
        console.log(`Re-verifying ${tweetsToVerify.length} tweets with >${REVERIFICATION_LIKES_THRESHOLD} likes using official Twitter API`);

        // Sort by likes count (descending) and take top VERIFY_TWEET_BATCH_SIZE
        tweetsToVerify.sort((a, b) => b.likesCount - a.likesCount);
        const tweetsToVerifyBatch = tweetsToVerify.slice(0, VERIFY_TWEET_BATCH_SIZE);

        try {
            // Fetch tweets by IDs using official Twitter API
            const verifiedTweets = await requester.reVerifyTweets(tweetsToVerifyBatch);

            // Process verified tweets and update results
            for (const verifiedTweet of verifiedTweets) {
                // Recalculate token amount with updated likes count
                const tokenAmount = calculateTokenAmount(verifiedTweet);
                if (tokenAmount > 0n) {
                    const currentAmount = allResults.get(verifiedTweet.userId) || 0n;
                    allResults.set(verifiedTweet.userId, currentAmount + tokenAmount);
                }

                // Update tweet info with verified data (use verified tweet directly)
                allTweets.push(verifiedTweet);
            }

            console.log(`Re-verified ${verifiedTweets.length} tweets, updated ${allResults.size} user results`);
        } catch (error: any) {
            console.error(`Error re-verifying tweets: ${error}`);
            // Add tweets to errored queries for retry
            // Note: We could add these to a separate retry queue
        }
    }

    // Store all tweets in batch
    if (allTweets.length > 0) {
        storeTweetsBatch(allTweets, mintingTimestamp);
        console.log(`Stored ${allTweets.length} tweets for minting day ${mintingTimestamp}`);
    }

    console.log(`Finished processing all ${queryBatches.length} query batches, collected results for ${allResults.size} users, ${erroredQueries.length} errored queries`);
    return { results: allResults, erroredQueries };
}

/**
 * Process a single query batch
 * Returns results map and tweets array
 */
async function processSingleQueryBatch(
    batch: QueryBatch,
    requester: TwitterRequester
): Promise<{ results: Map<string, bigint>; tweets: TweetInfo[] }> {
    const results = new Map<string, bigint>();
    const tweets: TweetInfo[] = [];
    const parsedAt = Math.floor(Date.now() / 1000); // Current timestamp when processing this batch

    try {
        console.log(`Processing query batch: ${batch.queryString.substring(0, 100)}...`);

        // Process tweets with pagination
        let cursor = '';
        let hasMore = true;
        let totalTweetsProcessed = 0;

        while (hasMore) {
            const { tweets: fetchedTweets, nextCursor } = await requester.fetchTweetsBySearchQuery(batch.queryString, cursor);

            // Process tweets and match to users
            for (let tweet of fetchedTweets) {
                // Get userId from batch's twitterIdToUserId mapping using tweet.twitterUserId (Twitter ID)
                const userIdStr = batch.twitterIdToUserId.get(tweet.twitterUserId);
                if (!userIdStr) {
                    console.warn(`No userId found for tweet ${tweet.tweetId} with twitterUserId ${tweet.twitterUserId}`);
                    continue;
                }

                // Store tweet info (store all parsed tweets, even if userId not found)
                // Update parsed_at timestamp and set userId
                tweet.parsed_at = parsedAt;
                tweet.userId = userIdStr;
                tweets.push(tweet);

                const tokenAmount = calculateTokenAmount(tweet);
                if (tokenAmount > 0n) {
                    const currentAmount = results.get(userIdStr) || 0n;
                    results.set(userIdStr, currentAmount + tokenAmount);
                }
            }

            totalTweetsProcessed += fetchedTweets.length;
            cursor = nextCursor;
            hasMore = nextCursor !== '';

            // Limit to prevent infinite loops
            if (fetchedTweets.length === 0) {
                hasMore = false;
            }
        }

        console.log(`Processed ${totalTweetsProcessed} tweets for query batch, found ${results.size} users with tokens`);
        return { results, tweets };
    } catch (error: any) {
        console.error(`Error processing query batch: ${error}`);
        throw error;
    }
}

/**
 * Calculate token amount based on tweet
 */
function calculateTokenAmount(tweet: TweetInfo): bigint {
    const text = tweet.text.toLowerCase();
    const words = text.split(/\s+/);

    let amount = 0n;

    for (const word of words) {
        const cleanedWord = word.replace(/[.,!?;:()]/g, '');

        if (cleanedWord === `$${KEYWORD}`) {
            amount += 10n; // Cashtag gives 10 tokens
        } else if (cleanedWord === `#${KEYWORD}`) {
            amount += 5n; // Hashtag gives 5 tokens
        } else if (cleanedWord === KEYWORD) {
            amount += 1n; // Simple gm gives 1 token
        }
    }

    // Add bonus for likes (1 token per 10 likes, max 10 tokens)
    const likesBonus = BigInt(Math.min(Math.floor(tweet.likesCount / 10), 10));
    amount += likesBonus;

    return amount;
}

/**
 * Convert userId results to minting results with user wallets
 * Uses userIdToWallet mapping from query batches
 */
function convertToMintingResults(
    queryBatches: QueryBatch[],
    processingResults: Map<string, bigint>
): MintingResult[] {
    const mintingResults: MintingResult[] = [];

    if (processingResults.size === 0) {
        return mintingResults;
    }

    // Build userIdToWallet mapping by iterating through all query batches
    const userIdToWallet = new Map<string, string>();
    for (const batch of queryBatches) {
        // Merge mappings from each batch (all batches share the same mappings, but we iterate to be explicit)
        for (const [userId, walletAddress] of batch.userIdToWallet.entries()) {
            userIdToWallet.set(userId, walletAddress);
        }
    }

    // Convert userId results to minting results using wallet address mapping from batches
    for (const [userId, tokenAmount] of processingResults.entries()) {
        if (tokenAmount <= 0n) {
            continue;
        }

        const walletAddress = userIdToWallet.get(userId);
        if (!walletAddress) {
            console.warn(`No wallet address found for user ${userId}, skipping`);
            continue;
        }

        mintingResults.push({
            userWallet: walletAddress,
            tokenAmount,
        });
    }

    return mintingResults;
}

/**
 * Create user query string for Twitter search
 */
function createUserQueryString(accountUsernames: string[], mintingDayTimestamp: number, maxLength: number, queryPrefix: string): {
    queryString: string;
    recordInsertedCount: number
} {
    const untilDayStr = formatDay(mintingDayTimestamp, 1);
    const sinceDayStr = formatDay(mintingDayTimestamp, 0);
    let queryString = `${queryPrefix} since:${sinceDayStr} until:${untilDayStr} AND (`;
    let ri = 0; // record inserted count

    let usernameAdded = 0;
    for (; ri < accountUsernames.length; ri++) {
        const username = accountUsernames[ri];
        if (username == '' || !username) {
            continue;
        }

        const nextPart = `from:${username}`;

        if (queryString.length + nextPart.length + 1 + 4 > maxLength) {
            break;
        }

        if (usernameAdded > 0) {
            queryString += ` OR `;
        }

        queryString += nextPart;
        usernameAdded++;
    }

    queryString += ')';

    return { queryString, recordInsertedCount: ri };
}

/**
 * Format day timestamp to YYYY-MM-DD string
 */
function formatDay(timestamp: number, addDays: number): string {
    // Create a Date object from the timestamp
    const date = new Date(timestamp * 1000);
    if (addDays != 0) {
        date.setDate(date.getDate() + addDays);
    }

    // Use Intl.DateTimeFormat to format the date as "YYYY-MM-DD"
    const formatter = new Intl.DateTimeFormat('en-CA'); // 'en-CA' ensures "YYYY-MM-DD" format
    return formatter.format(date);
}

