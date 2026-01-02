/**
 * Date and time utility functions
 */

/**
 * Get current minting day timestamp (current day at midnight UTC)
 * Returns timestamp in seconds
 */
export function getCurrentMintingDayTimestamp(): number {
    const now = new Date();
    const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
    ));
    return Math.floor(today.getTime() / 1000);
}

/**
 * Convert date string to minting day timestamp
 * Accepts various date formats (YYYY-MM-DD, ISO string, timestamp string, etc.)
 * Returns timestamp in seconds (midnight UTC of that day)
 */
export function dateStringToMintingTimestamp(dateString: string): number {
    // Try parsing as ISO date string or YYYY-MM-DD
    let date: Date;

    // Try parsing as timestamp (number string)
    if (/^\d+$/.test(dateString.trim())) {
        const timestamp = parseInt(dateString.trim(), 10);
        // If it's in milliseconds, convert to seconds
        if (timestamp > 1000000000000) {
            date = new Date(timestamp);
        } else {
            date = new Date(timestamp * 1000);
        }
    } else {
        // Try parsing as date string
        date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateString}`);
    }

    // Convert to midnight UTC of that day
    const mintingDay = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0, 0, 0, 0
    ));

    return Math.floor(mintingDay.getTime() / 1000);
}

