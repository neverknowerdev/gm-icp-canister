// Farcaster Processing Module
// Handles all Farcaster-related minting operations

import { FarcasterRequester, FarcasterSecrets } from './farcasterRequester';
import { Cast } from './types';
import { storeCastsBatch, CastInfo } from '../../storage';

// Configuration for Farcaster processing
let farcasterConfig: {
    secrets: FarcasterSecrets;
    urls: {
        farcasterAPIURL: string;
    };
} | null = null;

const MAX_FARCASTER_SEARCH_QUERY_LENGTH = 512;
const KEYWORD = 'gm';
const PARALLEL_BATCH_COUNT = 5; // Number of batches to process in parallel
const USER_FETCH_BATCH_SIZE = 1000n; // Fetch users in batches of 1000

/**
 * Query batch structure for Farcaster
 */
export interface FarcasterQueryBatch {
    queryString: string;
    fidToUserId: Map<string, string>;
    userIdToWallet: Map<string, string>;
}

/**
 * Initialize Farcaster configuration
 */
export function initializeFarcaster(
    secrets: FarcasterSecrets,
    farcasterAPIURL: string
): void {
    farcasterConfig = {
        secrets,
        urls: {
            farcasterAPIURL,
        },
    };
}

/**
 * Check if Farcaster is configured
 */
export function isFarcasterConfigured(): boolean {
    return farcasterConfig !== null;
}

/**
 * User batch callback type
 * Returns array of {userId, accountId, walletAddress} where accountId is Farcaster FID
 */
export type GetFarcasterUsersCallback = (startIndex: bigint, limit: bigint) => Promise<Array<{ userId: bigint; accountId: bigint; walletAddress: string }>>;

/**
 * Minting result structure
 */
export interface FarcasterMintingResult {
    userWallet: string;
    tokenAmount: bigint;
}

/**
 * Start Farcaster minting for a specific chain
 * Uses callback function to get users, removing dependency on smart contracts
 * Returns array of minting results with user wallets and token amounts
 * @param getUserCallback Callback to fetch users
 * @param mintingTimestamp Timestamp for the minting day (midnight UTC)
 */
export async function processFarcasterMinting(
    getUserCallback: GetFarcasterUsersCallback,
    mintingTimestamp: number
): Promise<{ mintingResults: FarcasterMintingResult[]; erroredQueries: FarcasterQueryBatch[] }> {
    if (!farcasterConfig) {
        console.log('Farcaster not configured, skipping Farcaster minting');
        return { mintingResults: [], erroredQueries: [] };
    }

    try {
        // Prepare all query batches with user mappings encapsulated
        const queryBatches = await prepareFarcasterQueryBatches(getUserCallback, mintingTimestamp);
        console.log(`Prepared ${queryBatches.length} Farcaster query batches for processing`);

        // Process batches in parallel and collect results (userId => tokenAmount)
        const { results: processingResults, erroredQueries } = await processFarcasterBatchesInParallel(queryBatches, mintingTimestamp);

        // Log error queries count
        if (erroredQueries.length > 0) {
            console.warn(`Farcaster processing completed with ${erroredQueries.length} failed query batches`);
        }

        // Convert userId results to wallet results using query batches
        const mintingResults = convertToFarcasterMintingResults(queryBatches, processingResults);

        return { mintingResults, erroredQueries };
    } catch (error: any) {
        console.error(`Error processing Farcaster: ${error}`);
        throw error;
    }
}

/**
 * Prepare all Farcaster query batches for processing
 */
async function prepareFarcasterQueryBatches(
    getUserCallback: GetFarcasterUsersCallback,
    mintingTimestamp: number
): Promise<FarcasterQueryBatch[]> {
    if (!farcasterConfig) {
        throw new Error('Farcaster not configured');
    }

    const requester = new FarcasterRequester(farcasterConfig.secrets, farcasterConfig.urls);
    const queryBatches: FarcasterQueryBatch[] = [];

    // Local mappings for this processing session
    const fidToUserId = new Map<string, string>();
    const userIdToWallet = new Map<string, string>();

    // Queue of FIDs waiting to be added to queries
    const fidQueue: Array<{ fid: string; userId: bigint }> = [];

    let userBatchIndex = 0n;
    let hasMoreUsers = true;

    // Process users incrementally
    while (hasMoreUsers || fidQueue.length > 0) {
        // Fetch next batch of users if queue is getting low and more users available
        if (fidQueue.length < 100 && hasMoreUsers) {
            const userBatch = await getUserCallback(userBatchIndex, USER_FETCH_BATCH_SIZE);

            if (userBatch.length === 0) {
                hasMoreUsers = false;
            } else {
                // Add to FID queue and build mappings
                for (const user of userBatch) {
                    const userIdStr = user.userId.toString();
                    const fidStr = user.accountId.toString(); // FID is the accountId

                    // Build mappings
                    fidToUserId.set(fidStr, userIdStr);
                    userIdToWallet.set(userIdStr, user.walletAddress);

                    fidQueue.push({
                        fid: fidStr,
                        userId: user.userId,
                    });
                }

                userBatchIndex += USER_FETCH_BATCH_SIZE;
                console.log(`Fetched ${userBatch.length} Farcaster users, total queued: ${fidQueue.length}`);
            }
        }

        // Compose queries from queued FIDs
        while (fidQueue.length > 0) {
            // For Farcaster, we query by FIDs
            // Create query string with FIDs
            const fidsForQuery = fidQueue.map(u => u.fid);
            const { queryString, recordInsertedCount } = createFarcasterQueryString(
                fidsForQuery,
                mintingTimestamp,
                MAX_FARCASTER_SEARCH_QUERY_LENGTH,
                KEYWORD
            );

            // Remove processed FIDs from queue
            fidQueue.splice(0, recordInsertedCount);

            // Add query batch with mappings
            if (recordInsertedCount > 0) {
                queryBatches.push({
                    queryString,
                    fidToUserId,
                    userIdToWallet,
                });
            }

            // If we couldn't fit all FIDs in the query, we need more users or continue with remaining
            if (fidQueue.length > 0 && fidQueue.length < 100 && hasMoreUsers) {
                break; // Fetch more users
            }
        }
    }

    console.log(`Prepared ${queryBatches.length} Farcaster query batches from ${userBatchIndex} users`);
    return queryBatches;
}

/**
 * Process Farcaster query batches with rate limiting
 */
async function processFarcasterBatchesInParallel(
    queryBatches: FarcasterQueryBatch[],
    mintingTimestamp: number
): Promise<{ results: Map<string, bigint>; erroredQueries: FarcasterQueryBatch[] }> {
    if (!farcasterConfig) {
        throw new Error('Farcaster not configured');
    }

    const requester = new FarcasterRequester(farcasterConfig.secrets, farcasterConfig.urls);
    const allResults = new Map<string, bigint>();
    const allCasts: CastInfo[] = [];
    const erroredQueries: FarcasterQueryBatch[] = [];

    let nextBatchIndex = 0;
    const maxConcurrent = Math.min(PARALLEL_BATCH_COUNT, queryBatches.length);

    console.log(`Starting ${maxConcurrent} concurrent processes for ${queryBatches.length} Farcaster batches`);

    const worker = async (): Promise<void> => {
        while (true) {
            const batchIndex = nextBatchIndex++;
            if (batchIndex >= queryBatches.length) {
                break;
            }

            const batch = queryBatches[batchIndex];
            try {
                const batchResult = await processSingleFarcasterBatch(batch, requester);

                // Merge token amounts
                for (const [userId, amount] of batchResult.results.entries()) {
                    const currentAmount = allResults.get(userId) || 0n;
                    allResults.set(userId, currentAmount + amount);
                }

                // Collect casts
                allCasts.push(...batchResult.casts);

                console.log(`Completed Farcaster batch ${batchIndex + 1}/${queryBatches.length}`);
            } catch (error: any) {
                console.error(`Error processing Farcaster batch ${batchIndex + 1}: ${error}`);
                erroredQueries.push(batch);
            }
        }
    };

    // Start worker pool
    const workers = [];
    for (let i = 0; i < maxConcurrent; i++) {
        const delay = i * 100;
        if (delay === 0) {
            workers.push(worker());
        } else {
            workers.push(
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    await worker();
                })()
            );
        }
    }

    await Promise.all(workers);

    // Store all casts in batch
    if (allCasts.length > 0) {
        storeCastsBatch(allCasts, mintingTimestamp);
        console.log(`Stored ${allCasts.length} casts for minting day ${mintingTimestamp}`);
    }

    console.log(`Finished processing all ${queryBatches.length} Farcaster query batches, collected results for ${allResults.size} users, ${erroredQueries.length} errored queries`);
    return { results: allResults, erroredQueries };
}

/**
 * Process a single Farcaster query batch
 */
async function processSingleFarcasterBatch(
    batch: FarcasterQueryBatch,
    requester: FarcasterRequester
): Promise<{ results: Map<string, bigint>; casts: CastInfo[] }> {
    const results = new Map<string, bigint>();
    const casts: CastInfo[] = [];
    const parsedAt = Math.floor(Date.now() / 1000);

    try {
        console.log(`Processing Farcaster query batch: ${batch.queryString.substring(0, 100)}...`);

        // Fetch casts using Farcaster API
        const fetchedCasts = await requester.fetchCastsByQuery(batch.queryString);

        // Process casts and match to users
        for (const cast of fetchedCasts) {
            const userIdStr = batch.fidToUserId.get(cast.fid) || '';

            const castInfo: CastInfo = {
                castId: cast.castId,
                fid: cast.fid,
                likesCount: cast.likesCount,
                text: cast.text,
                parsed_at: parsedAt,
            };
            casts.push(castInfo);

            if (userIdStr) {
                const tokenAmount = calculateFarcasterTokenAmount(cast);
                if (tokenAmount > 0n) {
                    const currentAmount = results.get(userIdStr) || 0n;
                    results.set(userIdStr, currentAmount + tokenAmount);
                }
            }
        }

        console.log(`Processed ${fetchedCasts.length} casts for Farcaster query batch, found ${results.size} users with tokens`);
        return { results, casts };
    } catch (error: any) {
        console.error(`Error processing Farcaster query batch: ${error}`);
        throw error;
    }
}

/**
 * Calculate token amount based on Farcaster cast
 */
function calculateFarcasterTokenAmount(cast: Cast): bigint {
    const text = cast.text.toLowerCase();
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
    const likesBonus = BigInt(Math.min(Math.floor(cast.likesCount / 10), 10));
    amount += likesBonus;

    return amount;
}

/**
 * Convert userId results to minting results with user wallets
 */
function convertToFarcasterMintingResults(
    queryBatches: FarcasterQueryBatch[],
    processingResults: Map<string, bigint>
): FarcasterMintingResult[] {
    const mintingResults: FarcasterMintingResult[] = [];

    if (processingResults.size === 0) {
        return mintingResults;
    }

    // Build userIdToWallet mapping
    const userIdToWallet = new Map<string, string>();
    for (const batch of queryBatches) {
        for (const [userId, walletAddress] of batch.userIdToWallet.entries()) {
            userIdToWallet.set(userId, walletAddress);
        }
    }

    // Convert userId results to minting results
    for (const [userId, tokenAmount] of processingResults.entries()) {
        if (tokenAmount <= 0n) {
            continue;
        }

        const walletAddress = userIdToWallet.get(userId);
        if (!walletAddress) {
            console.warn(`No wallet address found for Farcaster user ${userId}, skipping`);
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
 * Create Farcaster query string
 */
function createFarcasterQueryString(
    fids: string[],
    mintingDayTimestamp: number,
    maxLength: number,
    queryPrefix: string
): {
    queryString: string;
    recordInsertedCount: number;
} {
    // Farcaster query format: "gm" with FID filters
    // Format: "gm" AND (fid:123 OR fid:456 ...)
    const untilDayStr = formatDay(mintingDayTimestamp, 1);
    const sinceDayStr = formatDay(mintingDayTimestamp, 0);
    let queryString = `${queryPrefix} since:${sinceDayStr} until:${untilDayStr} AND (`;
    let ri = 0;

    let fidAdded = 0;
    for (; ri < fids.length; ri++) {
        const fid = fids[ri];
        if (!fid || fid === '') {
            continue;
        }

        const nextPart = `fid:${fid}`;

        if (queryString.length + nextPart.length + 1 + 4 > maxLength) {
            break;
        }

        if (fidAdded > 0) {
            queryString += ` OR `;
        }

        queryString += nextPart;
        fidAdded++;
    }

    queryString += ')';

    return { queryString, recordInsertedCount: ri };
}

/**
 * Format day timestamp to YYYY-MM-DD string
 */
function formatDay(timestamp: number, addDays: number): string {
    const date = new Date(timestamp * 1000);
    if (addDays != 0) {
        date.setDate(date.getDate() + addDays);
    }

    const formatter = new Intl.DateTimeFormat('en-CA');
    return formatter.format(date);
}

