// Transaction Tracker - prevents duplicate processing of transactions

import { Chain } from '../utils/types';

// Store processed transactions by chain: Map<Chain, Map<txHash, blockNumber>>
const processedTransactions = new Map<Chain, Map<string, number>>();

// Store transactions currently being processed by chain: Map<Chain, Set<txHash>>
const transactionsInProcessing = new Map<Chain, Set<string>>();

/**
 * Get or create the transaction map for a chain
 */
function getChainTransactions(chain: Chain): Map<string, number> {
    if (!processedTransactions.has(chain)) {
        processedTransactions.set(chain, new Map<string, number>());
    }
    return processedTransactions.get(chain)!;
}

/**
 * Get or create the in-processing set for a chain
 */
function getChainInProcessing(chain: Chain): Set<string> {
    if (!transactionsInProcessing.has(chain)) {
        transactionsInProcessing.set(chain, new Set<string>());
    }
    return transactionsInProcessing.get(chain)!;
}

/**
 * Check if a transaction has been processed on a specific chain
 */
export function isTransactionProcessed(chain: Chain, txHash: string): boolean {
    const chainTransactions = getChainTransactions(chain);
    return chainTransactions.has(txHash.toLowerCase());
}

/**
 * Mark a transaction as processed with its block number
 */
export function markTransactionProcessed(chain: Chain, txHash: string, blockNumber: number): void {
    const chainTransactions = getChainTransactions(chain);
    chainTransactions.set(txHash.toLowerCase(), blockNumber);
}

/**
 * Get the block number for a processed transaction
 * Returns null if transaction hasn't been processed
 */
export function getTransactionBlockNumber(chain: Chain, txHash: string): number | null {
    const chainTransactions = getChainTransactions(chain);
    const blockNumber = chainTransactions.get(txHash.toLowerCase());
    return blockNumber !== undefined ? blockNumber : null;
}

/**
 * Clear all processed transactions for a specific chain (useful for testing)
 */
export function clearProcessedTransactions(chain: Chain): void {
    processedTransactions.delete(chain);
}

/**
 * Clear all processed transactions for all chains (useful for testing)
 */
export function clearAllProcessedTransactions(): void {
    processedTransactions.clear();
}

/**
 * Get count of processed transactions for a specific chain
 */
export function getProcessedTransactionCount(chain: Chain): number {
    const chainTransactions = getChainTransactions(chain);
    return chainTransactions.size;
}

/**
 * Get count of processed transactions across all chains
 */
export function getTotalProcessedTransactionCount(): number {
    let total = 0;
    for (const chainTransactions of processedTransactions.values()) {
        total += chainTransactions.size;
    }
    return total;
}

/**
 * Check if a transaction is currently being processed on a specific chain
 */
export function isTransactionInProcessing(chain: Chain, txHash: string): boolean {
    const chainInProcessing = getChainInProcessing(chain);
    return chainInProcessing.has(txHash.toLowerCase());
}

/**
 * Mark a transaction as being processed
 */
export function markTransactionInProcessing(chain: Chain, txHash: string): void {
    const chainInProcessing = getChainInProcessing(chain);
    chainInProcessing.add(txHash.toLowerCase());
}

/**
 * Remove a transaction from in-processing (when processing is complete or failed)
 */
export function removeTransactionFromProcessing(chain: Chain, txHash: string): void {
    const chainInProcessing = getChainInProcessing(chain);
    chainInProcessing.delete(txHash.toLowerCase());
}

/**
 * Clear all in-processing transactions for a specific chain (useful for testing)
 */
export function clearInProcessingTransactions(chain: Chain): void {
    transactionsInProcessing.delete(chain);
}

/**
 * Clear all in-processing transactions for all chains (useful for testing)
 */
export function clearAllInProcessingTransactions(): void {
    transactionsInProcessing.clear();
}

/**
 * Get count of transactions in processing for a specific chain
 */
export function getInProcessingTransactionCount(chain: Chain): number {
    const chainInProcessing = getChainInProcessing(chain);
    return chainInProcessing.size;
}

/**
 * Get count of transactions in processing across all chains
 */
export function getTotalInProcessingTransactionCount(): number {
    let total = 0;
    for (const chainInProcessing of transactionsInProcessing.values()) {
        total += chainInProcessing.size;
    }
    return total;
}

/**
 * Get all processed transactions for a chain
 * Returns a copy of the map: Map<txHash, blockNumber>
 */
export function getAllProcessedTransactions(chain: Chain): Map<string, number> {
    const chainTransactions = getChainTransactions(chain);
    return new Map(chainTransactions);
}

/**
 * Remove a processed transaction
 */
export function removeProcessedTransaction(chain: Chain, txHash: string): boolean {
    const chainTransactions = getChainTransactions(chain);
    return chainTransactions.delete(txHash.toLowerCase());
}

