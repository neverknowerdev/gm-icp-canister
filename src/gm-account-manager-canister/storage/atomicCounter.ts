// Atomic Counter for generating unique userId
// Uses StableBTreeMap for persistent storage and atomic operations

import { StableBTreeMap } from 'azle';

const nextUserIdStorage = new StableBTreeMap<string, bigint>(5);

/**
 * Generate next unique userId atomically
 * Uses StableBTreeMap for atomic read-modify-write operations
 */
export async function generateNextUserId(): Promise<bigint> {
    // Get current value
    const stored = nextUserIdStorage.get('counter');
    let current: bigint;
    
    if (stored.length === 0) {
        current = 1n;
    } else {
        current = stored[0];
    }
    
    // Increment and store atomically
    const next = current + 1n;
    nextUserIdStorage.insert('counter', next);
    
    // Return the ID that was just assigned
    return current;
}

/**
 * Get current next userId without incrementing
 */
export function getNextUserId(): bigint {
    const stored = nextUserIdStorage.get('counter');
    if (stored.length === 0) {
        return 1n;
    }
    return stored[0];
}

/**
 * Reset counter (useful for testing)
 */
export function resetUserIdCounter(): void {
    nextUserIdStorage.insert('counter', 1n);
}
