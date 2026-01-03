// Simplified Minting Processor
// Implements the new minting architecture with complexity management, retry logic, and locks

import { addTwitterErroredQuery, setMintingStatus, getMintingStatus, resetMintingStatus } from './storage';
import { ChainContract, startMinting as startChainMinting, mintForUsers, finishMinting as finishChainMinting } from './chainContract';
import { processTwitterMinting, MintingResult, GetUsersCallback } from './workers/twitter/process';
import { processFarcasterMinting, FarcasterMintingResult, GetFarcasterUsersCallback } from './workers/farcaster/process';
import { getTwitterUsers, getFarcasterUsers } from './utils/accountManagerClient';
import { getCurrentMintingDayTimestamp } from './utils/dateUtils';
import { shouldStartNewEpoch, startNewEpoch, addEpochPoints, getCoinsMultiplicator } from './minting/complexityManager';
import { addRetryTask } from './minting/retryManager';

// Chain contracts configuration
const chainContracts: ChainContract[] = [];

const BATCH_SIZE = 1000; // Process results in batches of 1000

// Lock to prevent concurrent minting
let mintingLock = false;

/**
 * Add a chain contract configuration
 */
export function addChainContract(contract: ChainContract): void {
    chainContracts.push(contract);
}

/**
 * Get all chain contracts
 */
export function getChainContracts(): ChainContract[] {
    return chainContracts;
}

/**
 * Start the minting process
 * Called daily at 2:00 AM
 * Includes complexity management, epoch handling, and retry logic
 */
export async function startMinting(): Promise<void> {
    // Check lock to prevent concurrent minting
    if (mintingLock) {
        console.warn('Minting already in progress, skipping...');
        return;
    }

    // Acquire lock
    mintingLock = true;
    setMintingStatus('in-progress');

    try {
        console.log('Starting minting process...');

        // Get current minting day timestamp (yesterday at midnight UTC)
        const mintingTimestamp = getCurrentMintingDayTimestamp();

        // Check if new epoch should start and adjust complexity
        if (shouldStartNewEpoch(mintingTimestamp)) {
            const newMultiplicator = startNewEpoch(mintingTimestamp);
            console.log(`New epoch started with multiplicator: ${newMultiplicator}`);
        }

        const allTwitterResults: Array<{ chainId: number; results: MintingResult[] }> = [];
        const allFarcasterResults: Array<{ chainId: number; results: FarcasterMintingResult[] }> = [];
        let totalPoints = 0n;

        // Process each chain separately
        for (const chainContract of chainContracts) {
            // Process Twitter for this chain
            const getUserCallback = createGetUsersCallback(chainContract);
            console.log(`Processing Twitter for chain ${chainContract.chain} (${chainContract.chainId})`);
            
            const { mintingResults: twitterResults, erroredQueries } = await processTwitterMinting(
                getUserCallback,
                mintingTimestamp
            );

            console.log(`Found ${twitterResults.length} Twitter users to mint for chain ${chainContract.chain} (${chainContract.chainId})`);

            // Save errored queries and add to retry queue
            for (const erroredQuery of erroredQueries) {
                addTwitterErroredQuery(mintingTimestamp, chainContract.chainId, erroredQuery);
                // Add to retry queue with exponential backoff
                const taskId = `twitter-${chainContract.chainId}-${mintingTimestamp}-${Date.now()}`;
                addRetryTask(taskId, 'twitter-query', {
                    chainId: chainContract.chainId,
                    mintingTimestamp,
                    queryBatch: erroredQuery,
                });
            }

            // Calculate total points for epoch tracking
            for (const result of twitterResults) {
                // Points = tokenAmount / multiplicator (simplified, actual calculation should use points system)
                totalPoints += result.tokenAmount / getCoinsMultiplicator();
            }

            allTwitterResults.push({
                chainId: chainContract.chainId,
                results: twitterResults,
            });

            // Process Farcaster for this chain
            const getFarcasterUserCallback = createGetFarcasterUsersCallback(chainContract);
            console.log(`Processing Farcaster for chain ${chainContract.chain} (${chainContract.chainId})`);
            
            const { mintingResults: farcasterResults, erroredQueries: farcasterErroredQueries } = await processFarcasterMinting(
                getFarcasterUserCallback,
                mintingTimestamp
            );

            console.log(`Found ${farcasterResults.length} Farcaster users to mint for chain ${chainContract.chain} (${chainContract.chainId})`);

            // Add Farcaster errored queries to retry queue
            for (const erroredQuery of farcasterErroredQueries) {
                const taskId = `farcaster-${chainContract.chainId}-${mintingTimestamp}-${Date.now()}`;
                addRetryTask(taskId, 'farcaster-query', {
                    chainId: chainContract.chainId,
                    mintingTimestamp,
                    queryBatch: erroredQuery,
                });
            }

            // Calculate total points for Farcaster
            for (const result of farcasterResults) {
                totalPoints += result.tokenAmount / getCoinsMultiplicator();
            }

            allFarcasterResults.push({
                chainId: chainContract.chainId,
                results: farcasterResults,
            });
        }

        // Add total points to current epoch
        addEpochPoints(totalPoints);
        console.log(`Added ${totalPoints} points to current epoch`);

        // Mint Twitter tokens to smart contracts for each chain
        for (const { chainId, results } of allTwitterResults) {
            if (results.length > 0) {
                await mintResultsToContracts(chainId, results, 'twitter');
            }
        }

        // Mint Farcaster tokens to smart contracts for each chain
        for (const { chainId, results } of allFarcasterResults) {
            if (results.length > 0) {
                await mintResultsToContracts(chainId, results, 'farcaster');
            }
        }

        // Reset minting status
        resetMintingStatus();
        console.log('Minting process completed successfully');
    } catch (error: any) {
        console.error(`Error in minting process: ${error}`);
        setMintingStatus('error');
        throw error;
    } finally {
        // Release lock
        mintingLock = false;
    }
}

// Helper functions

/**
 * Mint results to smart contracts for a specific chain
 * Mints results in batches of 1000
 * Supports both Twitter and Farcaster results
 */
async function mintResultsToContracts(
    chainId: number,
    results: MintingResult[] | FarcasterMintingResult[],
    source: 'twitter' | 'farcaster'
): Promise<void> {
    if (results.length === 0) {
        console.log(`No results to mint for chain ${chainId}`);
        return;
    }

    const chainContract = chainContracts.find(c => c.chainId === chainId);
    if (!chainContract) {
        console.error(`Chain contract not found for chainId ${chainId}`);
        return;
    }

    try {
        // Start minting on the chain contract
        await startChainMinting(chainContract);

        // Divide results into batches of 1000
        const batches = divideIntoBatches(results, BATCH_SIZE);

        // Mint each batch
        for (const batch of batches) {
            const userAmounts = new Map<string, bigint>();
            for (const result of batch) {
                userAmounts.set(result.userWallet, result.tokenAmount);
            }
            
            try {
                await mintForUsers(chainContract, userAmounts);
            } catch (error: any) {
                // Add failed minting call to retry queue
                console.error(`Error minting batch to chain ${chainId}: ${error}`);
                const taskId = `minting-${source}-${chainId}-${Date.now()}`;
                addRetryTask(taskId, 'minting-call', {
                    chainId,
                    source,
                    userAmounts: Array.from(userAmounts.entries()),
                });
                throw error;
            }
        }

        // Finish minting on the chain contract
        // Note: finishMinting now requires mintingDayTimestamp and runningHash
        // For now, we'll use placeholder values - these should come from the minting process
        const mintingTimestamp = getCurrentMintingDayTimestamp();
        const runningHash = ''; // TODO: Calculate actual running hash from tweets/casts
        await finishChainMinting(chainContract, mintingTimestamp, runningHash);

        console.log(`Finished minting ${results.length} ${source} results for chain ${chainContract.chain} (${chainId})`);
    } catch (error: any) {
        console.error(`Error minting ${source} to chain ${chainId}: ${error}`);
        throw error;
    }
}

/**
 * Create a callback function to get users for a specific chain
 * The callback fetches users directly from account manager canister
 */
function createGetUsersCallback(chainContract: ChainContract): GetUsersCallback {
    return async (startIndex: bigint, limit: bigint) => {
        try {
            // Fetch users directly from account manager canister
            const canisterUsers = await getTwitterUsers(chainContract.chainId, startIndex, limit);
            return canisterUsers.map(u => ({
                userId: u.userId,
                accountId: u.accountId,
                walletAddress: u.walletAddress,
            }));
        } catch (error: any) {
            console.error(`Error getting users from account manager canister: ${error}`);
            return [];
        }
    };
}

/**
 * Create a callback function to get Farcaster users for a specific chain
 */
function createGetFarcasterUsersCallback(chainContract: ChainContract): GetFarcasterUsersCallback {
    return async (startIndex: bigint, limit: bigint) => {
        try {
            // Fetch Farcaster users directly from account manager canister
            const canisterUsers = await getFarcasterUsers(chainContract.chainId, startIndex, limit);
            return canisterUsers.map(u => ({
                userId: u.userId,
                accountId: u.accountId, // FID is the accountId
                walletAddress: u.walletAddress,
            }));
        } catch (error: any) {
            console.error(`Error getting Farcaster users from account manager canister: ${error}`);
            return [];
        }
    };
}

/**
 * Check if minting is in progress (lock status)
 */
export function isMintingInProgress(): boolean {
    return mintingLock;
}

/**
 * Divide results into batches
 */
function divideIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}