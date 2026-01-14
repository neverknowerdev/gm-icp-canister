// Scanner Scheduler - manages the periodic transaction scanner

const SCANNER_CALLBACK_METHOD = 'scannerCallback';
// NOTE: Keep this fairly large on mainnet to control cycle burn from EVM RPC calls.
const SCAN_INTERVAL_MINUTES = 60; // Scan every 60 minutes (configurable)

let isScheduled = false;

/**
 * Calculate absolute timestamp (nanoseconds since Unix epoch) for next scan run
 */
function getNextScanTimestamp(): bigint {
    const nowMs = Date.now();
    const delayMs = SCAN_INTERVAL_MINUTES * 60 * 1000;
    return BigInt((nowMs + delayMs) * 1_000_000);
}

/**
 * Schedule the next scanner run
 */
export function scheduleScanner(): void {
    try {
        const timestampNs = getNextScanTimestamp();

        // Use IC timer to invoke the canister method by name (same pattern as storageCleanerScheduler)
        if (typeof (globalThis as any).ic !== 'undefined' && (globalThis as any).ic.setTimer) {
            (globalThis as any).ic.setTimer(timestampNs, SCANNER_CALLBACK_METHOD);
            isScheduled = true;

            const delaySeconds = Number(timestampNs - BigInt(Date.now() * 1_000_000)) / 1_000_000_000;
            const delayMinutes = delaySeconds / 60;
            console.log(`Scanner scheduled for next run in ${delayMinutes.toFixed(2)} minutes`);
        } else {
            console.warn(`[NOTE] Call ic.setTimer(${timestampNs}) to call ${SCANNER_CALLBACK_METHOD} method`);
            console.warn(`Scanner will not run automatically - timer functionality not available`);
        }
    } catch (error: any) {
        console.error(`Error scheduling scanner: ${error}`);
    }
}

/**
 * Initialize the scanner scheduler
 */
export function initializeScanner(): void {
    if (isScheduled) {
        console.log('Scanner already initialized');
        return;
    }

    try {
        scheduleScanner();
        console.log('Scanner scheduler initialized');
    } catch (error: any) {
        console.error(`Error initializing scanner: ${error}`);
        throw error;
    }
}

/**
 * Check if scanner is scheduled
 */
export function isScannerScheduled(): boolean {
    return isScheduled;
}

