// Stable Memory Storage for Workers
// Uses ICP's stable memory API for persistent storage

import { StableBTreeMap } from 'azle';

// Stable memory maps for different data types
const userResultsStorage = new StableBTreeMap<string, string>(0);
const batchesStorage = new StableBTreeMap<string, string>(1);
const usernamesStorage = new StableBTreeMap<string, string>(2);
const tweetsToVerifyStorage = new StableBTreeMap<string, string>(3);
const castsToVerifyStorage = new StableBTreeMap<string, string>(4);
const maxEndIndexStorage = new StableBTreeMap<string, string>(5);
const remainingUsernamesStorage = new StableBTreeMap<string, string>(6);

/**
 * Generic storage operations for worker data
 */
export class StableMemoryStorage {
    private prefix: string;

    constructor(mintingDayTimestamp: number) {
        this.prefix = `${mintingDayTimestamp}_`;
    }

    private getKey(key: string): string {
        return `${this.prefix}${key}`;
    }

    // User Results Storage
    saveUserResults(userResults: Map<number, any>): void {
        const key = this.getKey('userResults');
        const data = Array.from(userResults.entries());
        userResultsStorage.insert(key, JSON.stringify(data));
    }

    loadUserResults(): Map<number, any> {
        const key = this.getKey('userResults');
        const stored = userResultsStorage.get(key);
        if (stored === null || stored.length === 0) {
            return new Map();
        }
        const storedValue = stored[0];
        const array = JSON.parse(storedValue);
        return new Map(array);
    }

    // Batches Storage
    saveBatches(batches: any[]): void {
        const key = this.getKey('batches');
        batchesStorage.insert(key, JSON.stringify(batches));
    }

    loadBatches(): any[] {
        const key = this.getKey('batches');
        const stored = batchesStorage.get(key);
        if (stored === null || stored.length === 0) {
            return [];
        }
        return JSON.parse(stored[0]);
    }

    // Usernames for Batch
    setUsernamesForBatch(startIndex: bigint, endIndex: bigint, usernames: string[]): void {
        const key = this.getKey(`usernames_${startIndex}_${endIndex}`);
        usernamesStorage.insert(key, JSON.stringify(usernames));
    }

    getUsernamesForBatch(startIndex: bigint, endIndex: bigint): string[] {
        const key = this.getKey(`usernames_${startIndex}_${endIndex}`);
        const stored = usernamesStorage.get(key);
        if (stored === null || stored.length === 0) {
            return [];
        }
        return JSON.parse(stored[0]);
    }

    // Tweets to Verify (Twitter)
    saveTweetsToVerify(tweets: any[]): void {
        const key = this.getKey('tweetsToVerify');
        tweetsToVerifyStorage.insert(key, JSON.stringify(tweets));
    }

    getTweetsToVerify(): any[] {
        const key = this.getKey('tweetsToVerify');
        const stored = tweetsToVerifyStorage.get(key);
        if (stored === null || stored.length === 0) {
            return [];
        }
        return JSON.parse(stored[0]);
    }

    // Casts to Verify (Farcaster)
    saveCastsToVerify(casts: any[]): void {
        const key = this.getKey('castsToVerify');
        castsToVerifyStorage.insert(key, JSON.stringify(casts));
    }

    getCastsToVerify(): any[] {
        const key = this.getKey('castsToVerify');
        const stored = castsToVerifyStorage.get(key);
        if (stored === null || stored.length === 0) {
            return [];
        }
        return JSON.parse(stored[0]);
    }

    // Max End Index
    saveMaxEndIndex(index: number): void {
        const key = this.getKey('maxEndIndex');
        maxEndIndexStorage.insert(key, index.toString());
    }

    getMaxEndIndex(): number {
        const key = this.getKey('maxEndIndex');
        const stored = maxEndIndexStorage.get(key);
        if (stored === null || stored.length === 0) {
            return 0;
        }
        return parseInt(stored[0]);
    }

    // Remaining Usernames
    saveRemainingUsernames(usernames: string[]): void {
        const key = this.getKey('nextUsernames');
        remainingUsernamesStorage.insert(key, JSON.stringify(usernames));
    }

    getRemainingUsernames(): string[] {
        const key = this.getKey('nextUsernames');
        const stored = remainingUsernamesStorage.get(key);
        if (stored === null || stored.length === 0) {
            return [];
        }
        return JSON.parse(stored[0]);
    }

    // Clear all data for this minting day
    clearAll(): void {
        // Note: StableBTreeMap doesn't have a clear method, so we need to iterate and remove
        // For now, we'll mark items for deletion by prefix
        // In production, you might want to implement a more efficient clearing mechanism
        const prefix = this.prefix;
        
        // Clear user results
        const userResultsKey = this.getKey('userResults');
        if (userResultsStorage.get(userResultsKey) !== null) {
            userResultsStorage.remove(userResultsKey);
        }

        // Clear batches
        const batchesKey = this.getKey('batches');
        if (batchesStorage.get(batchesKey) !== null) {
            batchesStorage.remove(batchesKey);
        }

        // Clear tweets/casts to verify
        const tweetsKey = this.getKey('tweetsToVerify');
        if (tweetsToVerifyStorage.get(tweetsKey) !== null) {
            tweetsToVerifyStorage.remove(tweetsKey);
        }

        const castsKey = this.getKey('castsToVerify');
        if (castsToVerifyStorage.get(castsKey) !== null) {
            castsToVerifyStorage.remove(castsKey);
        }

        // Note: For usernames and other keys, you'd need to track all keys
        // or implement a more sophisticated clearing mechanism
    }

    // Clear batch data
    clearBatchData(startIndex: bigint, endIndex: bigint): void {
        const key = this.getKey(`usernames_${startIndex}_${endIndex}`);
        if (usernamesStorage.get(key) !== null) {
            usernamesStorage.remove(key);
        }
    }
}

