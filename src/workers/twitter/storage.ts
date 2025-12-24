// Storage management for Twitter Worker
// Uses stable memory for persistence

import { Batch, Tweet, UserTwitterData } from './types';
import { StableMemoryStorage } from '../storage/stableMemory';

export class TwitterWorkerStorage {
    private mintingDayTimestamp: number;
    private stableStorage: StableMemoryStorage;

    constructor(mintingDayTimestamp: number) {
        this.mintingDayTimestamp = mintingDayTimestamp;
        this.stableStorage = new StableMemoryStorage(mintingDayTimestamp);
    }

    // Store user results
    async saveUserResults(userResults: Map<number, UserTwitterData>): Promise<void> {
        this.stableStorage.saveUserResults(userResults);
    }

    async loadUserResults(): Promise<Map<number, UserTwitterData>> {
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

    // Store tweets to verify
    async saveTweetsToVerify(tweets: Tweet[]): Promise<void> {
        this.stableStorage.saveTweetsToVerify(tweets);
    }

    async getTweetsToVerify(): Promise<Tweet[]> {
        return this.stableStorage.getTweetsToVerify();
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

