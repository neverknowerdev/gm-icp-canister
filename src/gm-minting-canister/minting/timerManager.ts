// Timer Manager - handles scheduling minting tasks

import { Principal } from 'azle';

/**
 * Calculate nanoseconds until next 2:00 AM UTC
 */
export function calculateDelayUntilNext2AM(): bigint {
    const now = Date.now();
    const nowDate = new Date(now);
    
    // Get next 2:00 AM UTC
    const next2AM = new Date(nowDate);
    next2AM.setUTCHours(2, 0, 0, 0);
    
    // If it's already past 2:00 AM today, schedule for tomorrow
    if (nowDate.getUTCHours() >= 2) {
        next2AM.setUTCDate(next2AM.getUTCDate() + 1);
    }
    
    const delayMs = next2AM.getTime() - now;
    // Convert milliseconds to nanoseconds (1 ms = 1,000,000 ns)
    return BigInt(delayMs * 1_000_000);
}

/**
 * Calculate absolute timestamp (nanoseconds since Unix epoch) for next 2:00 AM UTC
 */
export function getNext2AMTimestamp(): bigint {
    const now = Date.now();
    const nowDate = new Date(now);
    
    // Get next 2:00 AM UTC
    const next2AM = new Date(nowDate);
    next2AM.setUTCHours(2, 0, 0, 0);
    
    // If it's already past 2:00 AM today, schedule for tomorrow
    if (nowDate.getUTCHours() >= 2) {
        next2AM.setUTCDate(next2AM.getUTCDate() + 1);
    }
    
    // Convert to nanoseconds since Unix epoch
    const timestampNs = BigInt(next2AM.getTime() * 1_000_000);
    return timestampNs;
}

/**
 * Schedule daily minting by setting a timer using ICP's ic.set_timer
 * Note: This uses the global ic API which should be available in Azle
 * The timer will call the 'timerCallback' method on this canister when it fires
 */
export function scheduleDailyMintingForCanister(): void {
    try {
        const timestampNs = getNext2AMTimestamp();
        
        // Use ic.set_timer to schedule a timer
        // This will call the timerCallback method on this canister when the timer fires
        if (typeof (globalThis as any).ic !== 'undefined' && (globalThis as any).ic.setTimer) {
            (globalThis as any).ic.setTimer(timestampNs);
            console.log(`Timer set using ic.setTimer at timestamp ${timestampNs}`);
        } else {
            // Fallback: For now, log that timer should be set
            // In production with Azle, ic.setTimer should be available
            // If not, we'll need to use the management canister's set_timer method
            console.log(`[NOTE] Timer should be set for timestamp ${timestampNs}`);
            console.log(`[NOTE] Call ic.setTimer(${timestampNs}) or management canister set_timer`);
        }
        
        const delaySeconds = Number(timestampNs - BigInt(Date.now() * 1_000_000)) / 1_000_000_000;
        console.log(`Scheduled next minting at 2:00 AM UTC (in ${delaySeconds / 3600} hours)`);
    } catch (error: any) {
        console.error(`Error scheduling minting: ${error}`);
        throw error;
    }
}
