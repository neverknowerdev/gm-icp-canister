// Storage Cleaner Scheduler - manages the daily storage cleanup

const CLEANUP_CALLBACK_METHOD = 'cleanupCallback';
const CLEANUP_HOUR_UTC = 1; // 1:00 AM UTC

let isScheduled = false;

/**
 * Calculate absolute timestamp (nanoseconds since Unix epoch) for next 1:00 AM UTC
 */
function getNext1AMTimestamp(): bigint {
    const now = Date.now();
    const nowDate = new Date(now);

    // Get next 1:00 AM UTC
    const next1AM = new Date(nowDate);
    next1AM.setUTCHours(CLEANUP_HOUR_UTC, 0, 0, 0);

    // If it's already past 1:00 AM today, schedule for tomorrow
    if (nowDate.getUTCHours() >= CLEANUP_HOUR_UTC) {
        next1AM.setUTCDate(next1AM.getUTCDate() + 1);
    }

    // Convert to nanoseconds since Unix epoch
    const timestampNs = BigInt(next1AM.getTime() * 1_000_000);
    return timestampNs;
}

/**
 * Schedule the next cleanup run
 */
export function scheduleCleanup(): void {
    try {
        const timestampNs = getNext1AMTimestamp();

        // Use ic.setTimer to schedule cleanup callback
        if (typeof (globalThis as any).ic !== 'undefined' && (globalThis as any).ic.setTimer) {
            (globalThis as any).ic.setTimer(timestampNs, CLEANUP_CALLBACK_METHOD);
            isScheduled = true;

            const delaySeconds = Number(timestampNs - BigInt(Date.now() * 1_000_000)) / 1_000_000_000;
            const delayHours = delaySeconds / 3600;
            console.log(`Storage cleanup scheduled for next 1:00 AM UTC (in ${delayHours.toFixed(2)} hours)`);
        } else {
            console.warn(`[NOTE] Call ic.setTimer(${timestampNs}) to call ${CLEANUP_CALLBACK_METHOD} method`);
            console.warn(`Storage cleanup will not run automatically - timer functionality not available`);
        }
    } catch (error: any) {
        console.error(`Error scheduling storage cleanup: ${error}`);
    }
}

/**
 * Initialize the storage cleanup scheduler
 */
export function initializeCleanupScheduler(): void {
    if (isScheduled) {
        console.log('Storage cleanup scheduler already initialized');
        return;
    }

    try {
        scheduleCleanup();
        console.log('Storage cleanup scheduler initialized');
    } catch (error: any) {
        console.error(`Error initializing storage cleanup scheduler: ${error}`);
        throw error;
    }
}

/**
 * Check if cleanup is scheduled
 */
export function isCleanupScheduled(): boolean {
    return isScheduled;
}
