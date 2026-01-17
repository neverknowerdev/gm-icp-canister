// Scanner Scheduler - manages the periodic transaction scanner
// NOTE: setTimer must be called from @init/@postUpgrade hooks, not from module initialization

// NOTE: Keep this fairly large on mainnet to control cycle burn from EVM RPC calls.
export const SCAN_INTERVAL_SECONDS = 60 * 60; // Scan every 60 minutes (configurable)

let isScheduled = false;

/**
 * Get delay in seconds until next scan
 */
export function getScanDelaySeconds(): number {
    return SCAN_INTERVAL_SECONDS;
}

/**
 * Mark scanner as scheduled (called after setTimer succeeds in index.ts)
 */
export function markScannerScheduled(): void {
    isScheduled = true;
}

/**
 * Check if scanner is scheduled
 */
export function isScannerScheduled(): boolean {
    return isScheduled;
}

