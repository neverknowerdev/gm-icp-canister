// Error Storage - stores errors for all 4 error types

import { QueryBatch } from '../workers/twitter/process';
import { FarcasterQueryBatch } from '../workers/farcaster/process';

/**
 * Error types
 */
export type ErrorType = 'twitter-query' | 'twitter-reverify' | 'farcaster-query' | 'minting-tx';

/**
 * Twitter query error data
 */
export interface TwitterQueryError {
    mintingDayTimestamp: number;
    chainId: number;
    queryBatch: QueryBatch;
}

/**
 * Twitter reVerify error data
 */
export interface TwitterReverifyError {
    mintingDayTimestamp: number;
    chainId: number;
    tweetIds: string[]; // Array of tweet IDs that failed to re-verify
}

/**
 * Farcaster query error data
 */
export interface FarcasterQueryError {
    mintingDayTimestamp: number;
    chainId: number;
    queryBatch: FarcasterQueryBatch;
}

/**
 * Minting transaction error data
 */
export interface MintingTxError {
    mintingDayTimestamp: number;
    chainId: number;
    source: 'twitter' | 'farcaster';
    userAmounts: Array<[string, bigint]>; // Array of [wallet, amount] pairs
}

/**
 * Union type for all error data
 */
export type ErrorData = TwitterQueryError | TwitterReverifyError | FarcasterQueryError | MintingTxError;

// Storage: Map<ErrorType, ErrorData[]>
// Each error type has an array of errors to retry
const errorStorage = new Map<ErrorType, ErrorData[]>();

/**
 * Add an error to storage
 */
export function addError(errorType: ErrorType, errorData: ErrorData): void {
    if (!errorStorage.has(errorType)) {
        errorStorage.set(errorType, []);
    }
    
    const errors = errorStorage.get(errorType)!;
    errors.push(errorData);
    
    console.log(`Added ${errorType} error to storage (total: ${errors.length})`);
}

/**
 * Get all errors of a specific type
 */
export function getErrors(errorType: ErrorType): ErrorData[] {
    return errorStorage.get(errorType) || [];
}

/**
 * Clear errors of a specific type
 */
export function clearErrors(errorType: ErrorType): void {
    errorStorage.delete(errorType);
    console.log(`Cleared all ${errorType} errors`);
}

/**
 * Clear all errors
 */
export function clearAllErrors(): void {
    errorStorage.clear();
    console.log('Cleared all errors');
}

/**
 * Check if there are any errors
 */
export function hasErrors(): boolean {
    for (const errors of errorStorage.values()) {
        if (errors.length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Get error count for a specific type
 */
export function getErrorCount(errorType: ErrorType): number {
    return errorStorage.get(errorType)?.length || 0;
}

/**
 * Get total error count across all types
 */
export function getTotalErrorCount(): number {
    let total = 0;
    for (const errors of errorStorage.values()) {
        total += errors.length;
    }
    return total;
}

/**
 * Get all error types that have errors
 */
export function getErrorTypesWithErrors(): ErrorType[] {
    const types: ErrorType[] = [];
    for (const [type, errors] of errorStorage.entries()) {
        if (errors.length > 0) {
            types.push(type);
        }
    }
    return types;
}

