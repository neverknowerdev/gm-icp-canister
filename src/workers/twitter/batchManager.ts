// Batch manager for processing Twitter data in batches
// Similar to GMCoin's BatchManager

import { Batch, Tweet, UserTwitterData } from './types';
import { TwitterWorkerStorage } from './storage';
import { TwitterRequester } from './twitterRequester';

const KEYWORD = 'gm';
const MAX_TWITTER_SEARCH_QUERY_LENGTH = 512;

export class TwitterBatchManager {
    private storage: TwitterWorkerStorage;
    private mintingDayTimestamp: number;
    private concurrencyLimit: number;

    constructor(
        storage: TwitterWorkerStorage,
        mintingDayTimestamp: number,
        concurrencyLimit: number
    ) {
        this.storage = storage;
        this.mintingDayTimestamp = mintingDayTimestamp;
        this.concurrencyLimit = concurrencyLimit;
    }

    async generateNewBatches(
        requester: TwitterRequester,
        batches: Batch[],
        getNextUsernames: (startIndex: bigint, count: number) => Promise<string[]>
    ): Promise<{
        batchesToProcess: Batch[];
        queryList: string[];
        userIndexByUsername: Map<string, number>;
    }> {
        // Filter out completed batches
        batches = batches
            .filter((batch) => !(batch.nextCursor === '' && batch.errorCount === 0))
            .sort((a, b) => Number(a.startIndex - b.startIndex));

        const queryList: string[] = [];
        const userIndexByUsername = new Map<string, number>();

        // Restore existing batches
        for (const batch of batches) {
            const usernames = await this.storage.getUsernamesForBatch(
                batch.startIndex,
                batch.endIndex
            );
            const query = this.createUserQueryStringStatic(usernames, this.mintingDayTimestamp);
            queryList.push(query);
            this.fillUserIndexByUsernames(userIndexByUsername, usernames, batch.startIndex);
        }

        // Generate new batches if needed
        if (batches.length < this.concurrencyLimit) {
            const newCursorsCount = this.concurrencyLimit - batches.length;
            const maxEndIndex = await this.getMaxEndIndex();
            let startIndex = maxEndIndex;

            const remainingUsernames = await getNextUsernames(BigInt(startIndex), newCursorsCount * 50);

            for (let i = 0; i < newCursorsCount && remainingUsernames.length > 0; i++) {
                const { queryString, recordInsertedCount } = this.createUserQueryString(
                    remainingUsernames,
                    this.mintingDayTimestamp
                );

                if (recordInsertedCount === 0) {
                    break;
                }

                queryList.push(queryString);

                const newBatch: Batch = {
                    startIndex: BigInt(startIndex),
                    endIndex: BigInt(startIndex + recordInsertedCount),
                    nextCursor: '',
                    errorCount: 0,
                };

                if (Number(newBatch.endIndex) > maxEndIndex) {
                    await this.saveMaxEndIndex(Number(newBatch.endIndex));
                }

                const batchUsernames = remainingUsernames.slice(0, recordInsertedCount);
                this.fillUserIndexByUsernames(userIndexByUsername, batchUsernames, newBatch.startIndex);
                await this.storage.setUsernamesForBatch(newBatch.startIndex, newBatch.endIndex, batchUsernames);

                batches.push(newBatch);
                startIndex += recordInsertedCount;
            }
        }

        return {
            batchesToProcess: batches,
            queryList,
            userIndexByUsername,
        };
    }

    private createUserQueryString(
        usernames: string[],
        mintingDayTimestamp: number
    ): { queryString: string; recordInsertedCount: number } {
        const untilDayStr = this.formatDay(mintingDayTimestamp, 1);
        const sinceDayStr = this.formatDay(mintingDayTimestamp, 0);
        let queryString = `${KEYWORD} since:${sinceDayStr} until:${untilDayStr} AND (`;
        let recordInsertedCount = 0;
        let usernameAdded = 0;

        for (let i = 0; i < usernames.length; i++) {
            const username = usernames[i];
            if (username === '') {
                continue;
            }

            const nextPart = `from:${username}`;
            if (queryString.length + nextPart.length + 1 + 4 > MAX_TWITTER_SEARCH_QUERY_LENGTH) {
                break;
            }

            if (usernameAdded > 0) {
                queryString += ' OR ';
            }

            queryString += nextPart;
            usernameAdded++;
            recordInsertedCount++;
        }

        queryString += ')';
        return { queryString, recordInsertedCount };
    }

    private createUserQueryStringStatic(usernames: string[], mintingDayTimestamp: number): string {
        const untilDayStr = this.formatDay(mintingDayTimestamp, 1);
        const sinceDayStr = this.formatDay(mintingDayTimestamp, 0);
        let queryString = `${KEYWORD} since:${sinceDayStr} until:${untilDayStr} AND (`;

        for (let i = 0; i < usernames.length; i++) {
            if (usernames[i] === '') {
                continue;
            }

            if (i > 0) {
                queryString += ' OR ';
            }
            queryString += `from:${usernames[i]}`;
        }

        queryString += ')';
        return queryString;
    }

    private formatDay(timestamp: number, addDays: number): string {
        const date = new Date(timestamp * 1000);
        if (addDays !== 0) {
            date.setDate(date.getDate() + addDays);
        }
        const formatter = new Intl.DateTimeFormat('en-CA');
        return formatter.format(date);
    }

    private fillUserIndexByUsernames(
        userIndexByUsernames: Map<string, number>,
        usernames: string[],
        startIndex: bigint
    ): void {
        for (let i = 0; i < usernames.length; i++) {
            if (usernames[i] === '') {
                continue;
            }
            userIndexByUsernames.set(usernames[i], Number(startIndex) + i);
        }
    }

    private async getMaxEndIndex(): Promise<number> {
        return await this.storage.getMaxEndIndex();
    }

    private async saveMaxEndIndex(index: number): Promise<void> {
        await this.storage.saveMaxEndIndex(index);
    }
}

