// Retry Scheduler - schedules the global retry worker

let retryCount = 0;
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 60_000; // 1 minute
const MAX_RETRY_DELAY_MS = 3_600_000; // 1 hour

// Timer callback method name for retry worker
const RETRY_WORKER_CALLBACK_METHOD = 'retryWorkerCallback';

/**
 * Calculate delay for next retry using exponential backoff
 */
function calculateRetryDelay(retryCount: number): number {
    // Exponential backoff: delay = initial_delay * 2^retryCount
    const exponentialDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
    
    // Cap at maximum delay
    const delay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
    
    return delay;
}

/**
 * Schedule the retry worker using ICP timer
 * Uses exponential backoff for delay
 */
export function scheduleRetryWorker(): void {
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
        console.error(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached, not scheduling retry`);
        return;
    }
    
    const delayMs = calculateRetryDelay(retryCount);
    const delayNs = BigInt(delayMs * 1_000_000); // Convert to nanoseconds
    const timestampNs = BigInt(Date.now() * 1_000_000) + delayNs;
    
    retryCount++;
    
    try {
        // Use ic.setTimer to schedule retry worker callback
        // The timer will call the 'retryWorkerCallback' method on this canister
        if (typeof (globalThis as any).ic !== 'undefined' && (globalThis as any).ic.setTimer) {
            (globalThis as any).ic.setTimer(timestampNs);
            console.log(`Scheduled retry worker #${retryCount} in ${delayMs / 1000}s (at timestamp ${timestampNs})`);
            console.log(`Retry worker will call ${RETRY_WORKER_CALLBACK_METHOD} method`);
        } else {
            console.warn(`[NOTE] Retry worker should be scheduled in ${delayMs / 1000}s (timestamp: ${timestampNs})`);
            console.warn(`[NOTE] Call ic.setTimer(${timestampNs}) to call ${RETRY_WORKER_CALLBACK_METHOD} method`);
        }
    } catch (error: any) {
        console.error(`Error scheduling retry worker: ${error}`);
    }
}

/**
 * Reset retry count (called after successful retry or when starting new minting)
 */
export function resetRetryCount(): void {
    retryCount = 0;
    console.log('Retry count reset');
}

/**
 * Get current retry count
 */
export function getRetryCount(): number {
    return retryCount;
}

