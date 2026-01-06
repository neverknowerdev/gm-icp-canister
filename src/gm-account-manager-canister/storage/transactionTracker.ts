// Transaction Tracker - prevents duplicate processing of transactions

// Store processed transaction hashes
const processedTransactions = new Set<string>();

/**
 * Check if a transaction has been processed
 */
export function isTransactionProcessed(txHash: string): boolean {
    return processedTransactions.has(txHash.toLowerCase());
}

/**
 * Mark a transaction as processed
 */
export function markTransactionProcessed(txHash: string): void {
    processedTransactions.add(txHash.toLowerCase());
}

/**
 * Clear all processed transactions (useful for testing)
 */
export function clearProcessedTransactions(): void {
    processedTransactions.clear();
}

/**
 * Get count of processed transactions
 */
export function getProcessedTransactionCount(): number {
    return processedTransactions.size;
}

