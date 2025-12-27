// Minting Processor - handles the internal minting process

import { workerManager } from '../workers/workerManager';
import { getCurrentMintingDayTimestamp } from './mintingUtils';
import { rescheduleMinting } from './mintingScheduler';
import { Batch } from '../workers/twitter/types';

/**
 * Start the minting process
 * This is called internally by the timer callback method, not exposed externally
 * Processes tweets and casts in batches internally
 */
export async function startMinting(): Promise<void> {
    console.log('Starting internal minting process...');
    
    try {
        const mintingDayTimestamp = getCurrentMintingDayTimestamp();
        console.log(`Processing minting for day: ${mintingDayTimestamp}`);
        
        // Process Twitter minting
        if (workerManager.isTwitterWorkerInitialized()) {
            await processTwitterMinting(mintingDayTimestamp);
        } else {
            console.log('Twitter worker not initialized, skipping Twitter minting');
        }
        
        // Process Farcaster minting
        if (workerManager.isFarcasterWorkerInitialized()) {
            await processFarcasterMinting(mintingDayTimestamp);
        } else {
            console.log('Farcaster worker not initialized, skipping Farcaster minting');
        }
        
        console.log('Minting process completed successfully');
        
        // Reschedule for next day
        rescheduleMinting();
    } catch (error: any) {
        console.error(`Error in minting process: ${error}`);
        // Still reschedule even if there's an error
        rescheduleMinting();
        throw error;
    }
}

/**
 * Process Twitter minting internally
 * Generates batches and processes them without external exposure
 */
async function processTwitterMinting(mintingDayTimestamp: number): Promise<void> {
    console.log('Processing Twitter minting internally...');
    
    try {
        // Start with empty batches - the worker will generate them internally
        // The batchManager.generateNewBatches will create initial batches based on users
        const initialBatches: Batch[] = [];
        
        // Process minting event internally
        const result = await workerManager.processTwitterMintingEvent(
            mintingDayTimestamp,
            initialBatches
        );
        
        if (!result.canExec) {
            console.error(`Twitter minting failed: ${result.message || 'Unknown error'}`);
            return;
        }
        
        console.log('Twitter minting completed successfully');
    } catch (error: any) {
        console.error(`Error processing Twitter minting: ${error}`);
        throw error;
    }
}

/**
 * Process Farcaster minting internally
 * Generates batches and processes them without external exposure
 */
async function processFarcasterMinting(mintingDayTimestamp: number): Promise<void> {
    console.log('Processing Farcaster minting internally...');
    
    try {
        // Start with empty batches - the worker will generate them internally
        const initialBatches: Batch[] = [];
        
        // Process minting event internally
        const result = await workerManager.processFarcasterMintingEvent(
            mintingDayTimestamp,
            initialBatches
        );
        
        if (!result.canExec) {
            console.error(`Farcaster minting failed: ${result.message || 'Unknown error'}`);
            return;
        }
        
        console.log('Farcaster minting completed successfully');
    } catch (error: any) {
        console.error(`Error processing Farcaster minting: ${error}`);
        throw error;
    }
}

