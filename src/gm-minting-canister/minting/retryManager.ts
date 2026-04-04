// Retry Manager
// Handles error retry logic with exponential backoff using ICP timers

import { ic } from 'azle';

export interface RetryTask {
    id: string;
    taskType: 'twitter-query' | 'farcaster-query' | 'minting-call';
    data: any;
    retryCount: number;
    nextRetryAt: bigint; // nanoseconds timestamp
    maxRetries: number;
}

// Storage for retry tasks
const retryTasks = new Map<string, RetryTask>();

// Configuration
const DEFAULT_MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_NS = BigInt(60 * 1_000_000_000); // 60 seconds in nanoseconds
const MAX_RETRY_DELAY_NS = BigInt(3600 * 1_000_000_000); // 1 hour in nanoseconds

/**
 * Add a task to retry queue
 */
export function addRetryTask(
    taskId: string,
    taskType: RetryTask['taskType'],
    data: any,
    maxRetries: number = DEFAULT_MAX_RETRIES
): void {
    const nextRetryAt = calculateNextRetryTime(0);
    
    const task: RetryTask = {
        id: taskId,
        taskType,
        data,
        retryCount: 0,
        nextRetryAt,
        maxRetries,
    };

    retryTasks.set(taskId, task);
    scheduleRetry(task);
    
    console.log(`Added retry task ${taskId} (type: ${taskType}), will retry at ${nextRetryAt}`);
}

/**
 * Calculate next retry time using exponential backoff
 */
function calculateNextRetryTime(retryCount: number): bigint {
    // Exponential backoff: delay = initial_delay * 2^retryCount
    const exponentialDelay = INITIAL_RETRY_DELAY_NS * (2n ** BigInt(retryCount));
    
    // Cap at maximum delay
    const delay = exponentialDelay > MAX_RETRY_DELAY_NS ? MAX_RETRY_DELAY_NS : exponentialDelay;
    
    // Calculate absolute timestamp
    const nowNs = BigInt(Date.now() * 1_000_000);
    return nowNs + delay;
}

/**
 * Schedule a retry using ICP timer
 */
function scheduleRetry(task: RetryTask): void {
    try {
        // Use ic.setTimer to schedule retry
        if (typeof ic !== 'undefined' && (ic as any).setTimer) {
            (ic as any).setTimer(task.nextRetryAt);
            console.log(`Scheduled retry for task ${task.id} at ${task.nextRetryAt}`);
        } else {
            console.warn(`[NOTE] Timer should be set for task ${task.id} at ${task.nextRetryAt}`);
        }
    } catch (error: any) {
        console.error(`Error scheduling retry for task ${task.id}: ${error}`);
    }
}

/**
 * Process retry tasks that are due
 * Called by timer callback
 */
export async function processRetryTasks(): Promise<void> {
    const nowNs = BigInt(Date.now() * 1_000_000);
    const tasksToRetry: RetryTask[] = [];

    // Find all tasks that are due for retry
    for (const task of retryTasks.values()) {
        if (task.nextRetryAt <= nowNs && task.retryCount < task.maxRetries) {
            tasksToRetry.push(task);
        }
    }

    console.log(`Processing ${tasksToRetry.length} retry tasks`);

    // Process each task
    for (const task of tasksToRetry) {
        try {
            const success = await executeRetryTask(task);
            
            if (success) {
                // Task succeeded, remove from retry queue
                retryTasks.delete(task.id);
                console.log(`Retry task ${task.id} succeeded after ${task.retryCount} retries`);
            } else {
                // Task failed, schedule next retry
                task.retryCount++;
                if (task.retryCount < task.maxRetries) {
                    task.nextRetryAt = calculateNextRetryTime(task.retryCount);
                    scheduleRetry(task);
                    console.log(`Retry task ${task.id} failed, scheduled retry ${task.retryCount + 1}/${task.maxRetries} at ${task.nextRetryAt}`);
                } else {
                    // Max retries reached, remove from queue
                    retryTasks.delete(task.id);
                    console.error(`Retry task ${task.id} failed after ${task.maxRetries} retries, giving up`);
                }
            }
        } catch (error: any) {
            console.error(`Error processing retry task ${task.id}: ${error}`);
            // Schedule next retry or remove if max retries reached
            task.retryCount++;
            if (task.retryCount < task.maxRetries) {
                task.nextRetryAt = calculateNextRetryTime(task.retryCount);
                scheduleRetry(task);
            } else {
                retryTasks.delete(task.id);
                console.error(`Retry task ${task.id} exceeded max retries, removing`);
            }
        }
    }
}

/**
 * Execute a retry task based on its type
 */
async function executeRetryTask(task: RetryTask): Promise<boolean> {
    switch (task.taskType) {
        case 'twitter-query':
            return await retryTwitterQuery(task.data);
        case 'farcaster-query':
            return await retryFarcasterQuery(task.data);
        case 'minting-call':
            return await retryMintingCall(task.data);
        default:
            console.error(`Unknown retry task type: ${task.taskType}`);
            return false;
    }
}

/**
 * Retry a Twitter query batch
 */
async function retryTwitterQuery(data: any): Promise<boolean> {
    // Import here to avoid circular dependencies
    const { processSingleQueryBatch } = await import('../workers/twitter/process');
    const { TwitterRequester } = await import('../workers/twitter/twitterRequester');
    
    try {
        // Reconstruct TwitterRequester from data
        // This would need to be stored in the retry task data
        // For now, return false as placeholder
        console.log(`Retrying Twitter query: ${JSON.stringify(data)}`);
        return false; // TODO: Implement actual retry logic
    } catch (error: any) {
        console.error(`Error retrying Twitter query: ${error}`);
        return false;
    }
}

/**
 * Retry a Farcaster query
 */
async function retryFarcasterQuery(data: any): Promise<boolean> {
    console.log(`Retrying Farcaster query: ${JSON.stringify(data)}`);
    // TODO: Implement Farcaster retry logic
    return false;
}

/**
 * Retry a minting call to smart contract
 */
async function retryMintingCall(data: any): Promise<boolean> {
    console.log(`Retrying minting call: ${JSON.stringify(data)}`);
    // TODO: Implement minting call retry logic
    return false;
}

/**
 * Remove a retry task
 */
export function removeRetryTask(taskId: string): void {
    retryTasks.delete(taskId);
    console.log(`Removed retry task ${taskId}`);
}

/**
 * Get all retry tasks
 */
export function getRetryTasks(): RetryTask[] {
    return Array.from(retryTasks.values());
}

/**
 * Get retry task by ID
 */
export function getRetryTask(taskId: string): RetryTask | undefined {
    return retryTasks.get(taskId);
}

