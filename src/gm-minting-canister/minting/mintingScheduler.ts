// Minting Scheduler - coordinates the daily minting process

import { scheduleDailyMintingForCanister } from './timerManager';

let isScheduled = false;

/**
 * Initialize the minting scheduler
 * Sets up the timer to run startMinting every day at 2:00 AM
 * The timer will call the 'timerCallback' method on this canister
 */
export function initializeMintingScheduler(): void {
    if (isScheduled) {
        console.log('Minting scheduler already initialized');
        return;
    }

    try {
        // Schedule timer to call 'timerCallback' method
        scheduleDailyMintingForCanister();
        
        isScheduled = true;
        console.log('Minting scheduler initialized successfully');
    } catch (error: any) {
        console.error(`Error initializing minting scheduler: ${error}`);
        throw error;
    }
}

/**
 * Reschedule the next minting timer
 * Called after minting completes to schedule the next day
 */
export function rescheduleMinting(): void {
    try {
        scheduleDailyMintingForCanister();
        console.log('Minting rescheduled for next day');
    } catch (error: any) {
        console.error(`Error rescheduling minting: ${error}`);
    }
}

/**
 * Check if scheduler is initialized
 */
export function isSchedulerInitialized(): boolean {
    return isScheduled;
}

