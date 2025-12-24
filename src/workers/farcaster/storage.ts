// Storage management for Farcaster Worker
// Uses stable memory for persistence

import { Batch, Cast, UserFarcasterData } from './types';
import { StableMemoryStorage } from '../storage/stableMemory';

export class FarcasterWorkerStorage {
    private mintingDayTimestamp: number;
    private stableStorage: StableMemoryStorage;

    constructor(mintingDayTimestamp: number) {
        this.mintingDayTimestamp = mintingDayTimestamp;
        this.stableStorage = new StableMemoryStorage(mintingDayTimestamp);
    }

    // Store user results
    async saveUserResults(userResults: Map<number, UserFarcasterData>): Promise<void> {
        this.stableStorage.saveUserResults(userResults);
    }

    async loadUserResults(): Promise<Map<number, UserFarcasterData>> {
        return this.stableStorage.loadUserResults();
    }

    // Store batches
    async saveBatches(batches: Batch[]): Promise<void> {
        this.stableStorage.saveBatches(batches);
    }

    async loadBatches(): Promise<Batch[]> {
        return this.stableStorage.loadBatches();
    }

    // Store usernames for batch
    async setUsernamesForBatch(startIndex: bigint, endIndex: bigint, usernames: string[]): Promise<void> {
        this.stableStorage.setUsernamesForBatch(startIndex, endIndex, usernames);
    }

    async getUsernamesForBatch(startIndex: bigint, endIndex: bigint): Promise<string[]> {
        return this.stableStorage.getUsernamesForBatch(startIndex, endIndex);
    }

    // Store casts to verify
    async saveCastsToVerify(casts: Cast[]): Promise<void> {
        this.stableStorage.saveCastsToVerify(casts);
    }

    async getCastsToVerify(): Promise<Cast[]> {
        return this.stableStorage.getCastsToVerify();
    }

    // Get max end index
    async getMaxEndIndex(): Promise<number> {
        return this.stableStorage.getMaxEndIndex();
    }

    async saveMaxEndIndex(index: number): Promise<void> {
        this.stableStorage.saveMaxEndIndex(index);
    }

    // Get remaining usernames
    async getRemainingUsernames(): Promise<string[]> {
        return this.stableStorage.getRemainingUsernames();
    }

    async saveRemainingUsernames(usernames: string[]): Promise<void> {
        this.stableStorage.saveRemainingUsernames(usernames);
    }

    // Clear batch data
    async clearBatchData(batch: Batch): Promise<void> {
        this.stableStorage.clearBatchData(batch.startIndex, batch.endIndex);
    }

    // Clear all data for this minting day
    async clearAll(): Promise<void> {
        this.stableStorage.clearAll();
    }
}

