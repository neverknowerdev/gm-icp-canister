// Storage Cleaner - cleans up old/stale data from storage

import { Chain, chainName, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN, BLOCKS_PER_DAY, TRANSACTION_MAX_AGE_DAYS } from '../utils/types';
import {
    clearAllInProcessingTransactions,
    getTotalInProcessingTransactionCount,
    getAllProcessedTransactions,
    removeProcessedTransaction,
    getProcessedTransactionCount
} from './transactionTracker';
import { getLastProcessedBlock } from './blockTracker';

/**
 * Clean up storage - removes stale data
 * Currently cleans:
 * - Old processed transactions (older than 10 days based on block numbers)
 * - Stuck in-processing transactions (transactions that have been in processing for too long)
 * 
 * This should be called periodically (e.g., daily) to prevent storage bloat
 */
export async function cleanStorage(): Promise<void> {
    console.log('Starting storage cleanup...');

    // 1. Clean up old processed transactions
    // Iterate over all known chains
    const chains: Chain[] = [CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN];
    let totalRemoved = 0;
    let totalRemaining = 0;

    for (const chain of chains) {
        // Skip chains with no processed transactions
        if (getProcessedTransactionCount(chain) === 0) {
            continue;
        }

        // Get last processed block number for this chain
        const lastProcessedBlock = getLastProcessedBlock(chain);
        if (lastProcessedBlock === 0) {
            console.log(`No blocks processed yet for ${chainName(chain)} (${chain}), skipping cleanup for this chain`);
            continue;
        }

        // Calculate how many blocks to keep based on days
        const keepTransactionsForPeriodInBlocks = BLOCKS_PER_DAY * TRANSACTION_MAX_AGE_DAYS;
        const minBlockNumber = lastProcessedBlock - keepTransactionsForPeriodInBlocks;
        const allTransactions = getAllProcessedTransactions(chain);

        let removedForChain = 0;
        for (const [txHash, blockNumber] of allTransactions.entries()) {
            if (blockNumber < minBlockNumber) {
                removeProcessedTransaction(chain, txHash);
                removedForChain++;
            }
        }

        const remainingForChain = getAllProcessedTransactions(chain).size;
        totalRemoved += removedForChain;
        totalRemaining += remainingForChain;

        if (removedForChain > 0) {
            console.log(
                `Chain ${chainName(chain)} (${chain}): removed ${removedForChain} old transactions ` +
                `(older than block ${minBlockNumber}), ${remainingForChain} remaining`
            );
        }
    }

    // 2. Clean up all in-processing transactions
    // These are transactions that should have been removed but weren't (e.g., due to errors)
    // Since we can't track timestamps easily, we'll clear all in-processing transactions
    // The worst case is that a transaction that's actually being processed gets cleared,
    // but it will just be reprocessed, which is acceptable
    const beforeInProcessingCount = getTotalInProcessingTransactionCount();
    clearAllInProcessingTransactions();
    const afterInProcessingCount = getTotalInProcessingTransactionCount();
    const cleanedInProcessing = beforeInProcessingCount - afterInProcessingCount;

    console.log(`Storage cleanup completed:`);
    console.log(`  - Removed ${totalRemoved} old processed transactions`);
    console.log(`  - Remaining processed transactions: ${totalRemaining}`);
    console.log(`  - Removed ${cleanedInProcessing} stuck in-processing transactions`);
    console.log(`  - Remaining in-processing transactions: ${afterInProcessingCount}`);
}
