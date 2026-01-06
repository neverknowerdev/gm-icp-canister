// Block Tracker - tracks last processed block for each chain

const lastProcessedBlocks = new Map<string, number>(); // chain -> block number

/**
 * Get last processed block number for a chain
 */
export function getLastProcessedBlock(chain: string): number {
    return lastProcessedBlocks.get(chain) || 0;
}

/**
 * Update last processed block number for a chain
 */
export function updateLastProcessedBlock(chain: string, blockNumber: number): void {
    lastProcessedBlocks.set(chain, blockNumber);
    console.log(`Updated last processed block for ${chain}: ${blockNumber}`);
}

/**
 * Reset block tracking for a chain (useful for testing)
 */
export function resetBlockTracking(chain: string): void {
    lastProcessedBlocks.delete(chain);
}

/**
 * Get all tracked chains
 */
export function getTrackedChains(): string[] {
    return Array.from(lastProcessedBlocks.keys());
}

