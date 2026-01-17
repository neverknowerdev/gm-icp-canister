// Storage Cleaner Scheduler - manages the daily storage cleanup
// NOTE: setTimer must be called from @init/@postUpgrade hooks, not from module initialization

const CLEANUP_HOUR_UTC = 1; // 1:00 AM UTC

let isScheduled = false;

/**
 * Calculate delay in seconds until next 1:00 AM UTC
 */
export function getCleanupDelaySeconds(): number {
    const now = Date.now();
    const nowDate = new Date(now);

    // Get next 1:00 AM UTC
    const next1AM = new Date(nowDate);
    next1AM.setUTCHours(CLEANUP_HOUR_UTC, 0, 0, 0);

    // If it's already past 1:00 AM today, schedule for tomorrow
    if (nowDate.getUTCHours() >= CLEANUP_HOUR_UTC) {
        next1AM.setUTCDate(next1AM.getUTCDate() + 1);
    }

    // Convert to seconds
    const delayMs = next1AM.getTime() - now;
    return Math.ceil(delayMs / 1000);
}

/**
 * Mark cleanup as scheduled (called after setTimer succeeds in index.ts)
 */
export function markCleanupScheduled(): void {
    isScheduled = true;
}

/**
 * Check if cleanup is scheduled
 */
export function isCleanupScheduled(): boolean {
    return isScheduled;
}
