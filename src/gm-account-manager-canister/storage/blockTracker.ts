// Block Tracker - tracks last processed block for each chain

import { StableBTreeMap } from 'azle';
import { Chain, chainName } from '../utils/types';

// Use StableBTreeMap for persistent storage
// Memory ID 6 for block tracking
const lastProcessedBlocks = new StableBTreeMap<number, number>(6);

/**
 * Get last processed block number for a chain
 */
export function getLastProcessedBlock(chain: Chain): number {
    const stored = lastProcessedBlocks.get(chain);
    if (stored.length === 0) {
        return 0;
    }
    return stored[0];
}

/**
 * Update last processed block number for a chain
 */
export function updateLastProcessedBlock(chain: Chain, blockNumber: number): void {
    lastProcessedBlocks.insert(chain, blockNumber);
    console.log(`Updated last processed block for ${chainName(chain)} (${chain}): ${blockNumber}`);
}

/**
 * Reset block tracking for a chain (useful for testing)
 */
export function resetBlockTracking(chain: Chain): void {
    lastProcessedBlocks.remove(chain);
}

/**
 * Get all tracked chains
 */
export function getTrackedChains(): Chain[] {
    const chains: Chain[] = [];
    for (const [chain] of lastProcessedBlocks.items()) {
        chains.push(chain);
    }
    return chains;
}

