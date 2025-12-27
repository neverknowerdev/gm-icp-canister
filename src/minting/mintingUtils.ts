// Minting Utilities - helper functions for minting

/**
 * Get the current minting day timestamp
 * Minting day is typically calculated as the start of the day in UTC
 */
export function getCurrentMintingDayTimestamp(): number {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
    ));
    
    // Return timestamp in seconds (Unix timestamp)
    return Math.floor(startOfDay.getTime() / 1000);
}

/**
 * Get minting day timestamp for a specific date
 */
export function getMintingDayTimestampForDate(date: Date): number {
    const startOfDay = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0, 0, 0, 0
    ));
    
    return Math.floor(startOfDay.getTime() / 1000);
}

