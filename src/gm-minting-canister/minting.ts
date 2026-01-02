// Simplified Minting Processor
// Implements the new minting architecture

import { addTwitterErroredQuery } from './storage';
import { ChainContract, startMinting as startChainMinting, mintForUsers, finishMinting as finishChainMinting } from './chainContract';
import { processTwitterMinting, MintingResult, GetUsersCallback } from './workers/twitter/process';
import { getTwitterUsers } from './utils/accountManagerClient';
import { getCurrentMintingDayTimestamp } from './utils/dateUtils';

// Chain contracts configuration
const chainContracts: ChainContract[] = [];

const BATCH_SIZE = 1000; // Process results in batches of 1000

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
 */
export async function startMinting(): Promise<void> {
    console.log('Starting minting process...');

    try {
        // Get current minting day timestamp (current day at midnight UTC)
        const mintingTimestamp = getCurrentMintingDayTimestamp();

        const allResults: Array<{ chainId: number; results: MintingResult[] }> = [];

        // Process each chain separately
        for (const chainContract of chainContracts) {
            // Create callback function for this chain
            const getUserCallback = createGetUsersCallback(chainContract);

            console.log(`Processing Twitter for chain ${chainContract.chain} (${chainContract.chainId})`);
            // Process Twitter for this chain
            const { mintingResults, erroredQueries } = await processTwitterMinting(
                getUserCallback,
                mintingTimestamp
            );

            console.log(`Found ${mintingResults.length} users to mint for chain ${chainContract.chain} (${chainContract.chainId})`);

            // Save errored queries to global state
            for (const erroredQuery of erroredQueries) {
                addTwitterErroredQuery(mintingTimestamp, chainContract.chainId, erroredQuery);
            }

            allResults.push({
                chainId: chainContract.chainId,
                results: mintingResults,
            });
        }

        // Mint tokens to smart contracts for each chain
        for (const { chainId, results } of allResults) {
            if (results.length > 0) {
                await mintResultsToContracts(chainId, results);
            }
        }

        // TODO: Process Farcaster and mint
        // const farcasterResults = await startFarcasterMinting(chainContracts);
        // for (const { chainId, results } of farcasterResults) {
        //     if (results.length > 0) {
        //         await mintResultsToContracts(chainId, results);
        //     }
        // }

        console.log('Minting process completed successfully');
    } catch (error: any) {
        console.error(`Error in minting process: ${error}`);
        throw error;
    }
}

// Helper functions

/**
 * Mint results to smart contracts for a specific chain
 * Mints results in batches of 1000
 */
async function mintResultsToContracts(
    chainId: number,
    results: MintingResult[]
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
            await mintForUsers(chainContract, userAmounts);
        }

        // Finish minting on the chain contract
        await finishChainMinting(chainContract);

        console.log(`Finished minting ${results.length} results for chain ${chainContract.chain} (${chainId})`);
    } catch (error: any) {
        console.error(`Error minting to chain ${chainId}: ${error}`);
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
 * Divide results into batches
 */
function divideIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}