// Scanner Scheduler - manages the periodic transaction scanner

import { ic } from 'azle';

const SCANNER_CALLBACK_METHOD = 'scannerCallback';
const SCAN_INTERVAL_MINUTES = 60; // Scan every 5 minutes (configurable)
const SCAN_INTERVAL_NS = BigInt(SCAN_INTERVAL_MINUTES * 60 * 1_000_000_000); // Convert to nanoseconds

let isScheduled = false;

/**
 * Schedule the next scanner run
 */
export function scheduleScanner(): void {
    try {
        // Use Date.now() for now - in production, use ic.time() if available
        const now = BigInt(Date.now() * 1_000_000); // Convert to nanoseconds
        const nextRun = now + SCAN_INTERVAL_NS;

        // Use ic.setTimer to schedule scanner callback
        if (typeof (globalThis as any).ic !== 'undefined' && (globalThis as any).ic.setTimer) {
            (globalThis as any).ic.setTimer(nextRun, SCANNER_CALLBACK_METHOD);
            isScheduled = true;
            console.log(`Scanner scheduled for next run in ${SCAN_INTERVAL_MINUTES} minutes`);
        } else {
            console.warn(`[NOTE] Call ic.setTimer(${nextRun}) to call ${SCANNER_CALLBACK_METHOD} method`);
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

