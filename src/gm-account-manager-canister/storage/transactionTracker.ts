// Transaction Tracker - prevents duplicate processing of transactions

import { StableBTreeMap } from 'azle';
import { Chain } from '../utils/types';

// Store processed transactions using composite key: `${chain}:${txHash}` -> blockNumber
// Use StableBTreeMap for persistent storage
// Memory ID 7 for processed transactions
const processedTransactions = new StableBTreeMap<string, number>(7);

// Store transactions currently being processed by chain: Map<Chain, Set<txHash>>
// This is temporary state, so we keep it as Map (not persisted)
const transactionsInProcessing = new Map<Chain, Set<string>>();

// Store transaction errors by chain: Map<Chain, Map<txHash, errorString>>
// This is temporary state, so we keep it as Map (not persisted)
const transactionErrors = new Map<Chain, Map<string, string>>();

/**
 * Create composite key for transaction: `${chain}:${txHash}`
 */
function getTransactionKey(chain: Chain, txHash: string): string {
    return `${chain}:${txHash.toLowerCase()}`;
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
 * Get or create the error map for a chain
 */
function getChainErrors(chain: Chain): Map<string, string> {
    if (!transactionErrors.has(chain)) {
        transactionErrors.set(chain, new Map<string, string>());
    }
    return transactionErrors.get(chain)!;
}

/**
 * Check if a transaction has been processed on a specific chain
 */
export function isTransactionProcessed(chain: Chain, txHash: string): boolean {
    const key = getTransactionKey(chain, txHash);
    const stored = processedTransactions.get(key);
    return stored !== undefined;
}

/**
 * Mark a transaction as processed with its block number
 * Also removes the transaction from error map if it exists
 */
export function markTransactionProcessed(chain: Chain, txHash: string, blockNumber: number): void {
    const key = getTransactionKey(chain, txHash);
    processedTransactions.insert(key, blockNumber);
    // Remove from error map if it exists
    removeTransactionError(chain, txHash);
}

/**
 * Get the block number for a processed transaction
 * Returns null if transaction hasn't been processed
 */
export function getTransactionBlockNumber(chain: Chain, txHash: string): number | null {
    const key = getTransactionKey(chain, txHash);
    const stored = processedTransactions.get(key);
    if (stored === undefined) {
        return null;
    }
    return stored;
}

/**
 * Clear all processed transactions for a specific chain (useful for testing)
 */
export function clearProcessedTransactions(chain: Chain): void {
    const prefix = `${chain}:`;
    const keysToRemove: string[] = [];
    for (const [key] of processedTransactions.items()) {
        if (key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    for (const key of keysToRemove) {
        processedTransactions.remove(key);
    }
}

/**
 * Clear all processed transactions for all chains (useful for testing)
 */
export function clearAllProcessedTransactions(): void {
    const keysToRemove: string[] = [];
    for (const [key] of processedTransactions.items()) {
        keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
        processedTransactions.remove(key);
    }
}

/**
 * Get count of processed transactions for a specific chain
 */
export function getProcessedTransactionCount(chain: Chain): number {
    const prefix = `${chain}:`;
    let count = 0;
    for (const [key] of processedTransactions.items()) {
        if (key.startsWith(prefix)) {
            count++;
        }
    }
    return count;
}

/**
 * Get count of processed transactions across all chains
 */
export function getTotalProcessedTransactionCount(): number {
    let count = 0;
    for (const [] of processedTransactions.items()) {
        count++;
    }
    return count;
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
    const prefix = `${chain}:`;
    const result = new Map<string, number>();
    for (const [key, blockNumber] of processedTransactions.items()) {
        if (key.startsWith(prefix)) {
            // Extract txHash from composite key (remove `${chain}:` prefix)
            const txHash = key.substring(prefix.length);
            result.set(txHash, blockNumber);
        }
    }
    return result;
}

/**
 * Remove a processed transaction
 */
export function removeProcessedTransaction(chain: Chain, txHash: string): boolean {
    const key = getTransactionKey(chain, txHash);
    const stored = processedTransactions.get(key);
    if (stored === undefined) {
        return false;
    }
    processedTransactions.remove(key);
    return true;
}

/**
 * Transaction status type
 */
export type TransactionStatus = 'processed' | 'in_progress' | 'error' | 'unprocessed';

/**
 * Transaction status result with optional error message
 */
export type TransactionStatusResult = {
    status: TransactionStatus;
    error?: string;
};

/**
 * Get the status of a transaction on a specific chain
 * Returns:
 * - 'processed' if the transaction has been fully processed
 * - 'in_progress' if the transaction is currently being processed
 * - 'error' if the transaction encountered an error during processing
 * - 'unprocessed' if the transaction has not been processed yet
 */
export function getTransactionStatus(chain: Chain, txHash: string): TransactionStatusResult {
    if (isTransactionProcessed(chain, txHash)) {
        return { status: 'processed' };
    }
    if (isTransactionInProcessing(chain, txHash)) {
        return { status: 'in_progress' };
    }
    const error = getTransactionError(chain, txHash);
    if (error !== null) {
        return { status: 'error', error };
    }
    return { status: 'unprocessed' };
}

/**
 * Mark a transaction error
 */
export function markTransactionError(chain: Chain, txHash: string, error: string): void {
    const chainErrors = getChainErrors(chain);
    chainErrors.set(txHash.toLowerCase(), error);
}

/**
 * Get transaction error if it exists
 * Returns null if no error
 */
export function getTransactionError(chain: Chain, txHash: string): string | null {
    const chainErrors = getChainErrors(chain);
    const error = chainErrors.get(txHash.toLowerCase());
    return error !== undefined ? error : null;
}

/**
 * Remove a transaction from error map
 */
export function removeTransactionError(chain: Chain, txHash: string): void {
    const chainErrors = getChainErrors(chain);
    chainErrors.delete(txHash.toLowerCase());
}

/**
 * Clear all transaction errors for a specific chain (useful for testing)
 */
export function clearTransactionErrors(chain: Chain): void {
    transactionErrors.delete(chain);
}

/**
 * Clear all transaction errors for all chains (useful for testing)
 */
export function clearAllTransactionErrors(): void {
    transactionErrors.clear();
}

/**
 * Get count of transactions with errors for a specific chain
 */
export function getErrorTransactionCount(chain: Chain): number {
    const chainErrors = getChainErrors(chain);
    return chainErrors.size;
}

/**
 * Get count of transactions with errors across all chains
 */
export function getTotalErrorTransactionCount(): number {
    let total = 0;
    for (const chainErrors of transactionErrors.values()) {
        total += chainErrors.size;
    }
    return total;
}

