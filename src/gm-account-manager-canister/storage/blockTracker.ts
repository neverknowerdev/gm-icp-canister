// Block Tracker - tracks last processed block for each chain

import { Chain, chainName } from '../utils/types';

const lastProcessedBlocks = new Map<Chain, number>(); // chain ID -> block number

/**
 * Get last processed block number for a chain
 */
export function getLastProcessedBlock(chain: Chain): number {
    return lastProcessedBlocks.get(chain) || 0;
}

/**
 * Update last processed block number for a chain
 */
export function updateLastProcessedBlock(chain: Chain, blockNumber: number): void {
    lastProcessedBlocks.set(chain, blockNumber);
    console.log(`Updated last processed block for ${chainName(chain)} (${chain}): ${blockNumber}`);
}

/**
 * Reset block tracking for a chain (useful for testing)
 */
export function resetBlockTracking(chain: Chain): void {
    lastProcessedBlocks.delete(chain);
}

/**
 * Get all tracked chains
 */
export function getTrackedChains(): Chain[] {
    return Array.from(lastProcessedBlocks.keys());
}

