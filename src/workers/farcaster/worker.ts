// Main Farcaster Worker
// Processes Farcaster data similar to Twitter worker

import { Batch, Cast, CastProcessingType, UserFarcasterData, FarcasterWorkerConfig } from './types';
import { FarcasterWorkerStorage } from './storage';
import { FarcasterRequester, FarcasterSecrets, FarcasterURLs } from './farcasterRequester';
import { FarcasterBatchManager } from './batchManager';

const KEYWORD = 'gm';
const VERIFY_CAST_BATCH_SIZE = 300;

export class FarcasterWorker {
    private config: FarcasterWorkerConfig;
    private storage: FarcasterWorkerStorage;
    private requester: FarcasterRequester;
    private batchManager!: FarcasterBatchManager; // Initialized in processMintingEvent

    constructor(config: FarcasterWorkerConfig, secrets: FarcasterSecrets) {
        this.config = config;
        this.storage = new FarcasterWorkerStorage(0);
        this.requester = new FarcasterRequester(secrets, {
            castsAPIURL: `${config.farcasterAPIURL}/casts`,
            usersAPIURL: `${config.farcasterAPIURL}/users`,
            searchAPIURL: `${config.farcasterAPIURL}/search`,
        });
    }

    async processMintingEvent(
        mintingDayTimestamp: number,
        eventBatches: Batch[]
    ): Promise<{ canExec: boolean; transactions?: any[]; message?: string }> {
        this.storage = new FarcasterWorkerStorage(mintingDayTimestamp);
        this.batchManager = new FarcasterBatchManager(
            this.storage,
            mintingDayTimestamp,
            this.config.concurrencyLimit
        );

        try {
            const initBatches = eventBatches.map((item) => ({
                startIndex: BigInt(item.startIndex),
                endIndex: BigInt(item.endIndex),
                nextCursor: item.nextCursor,
                errorCount: item.errorCount,
            }));

            const { batchesToProcess, queryList, userIndexByUsername } =
                await this.batchManager.generateNewBatches(
                    this.requester,
                    initBatches,
                    async (startIndex: bigint, count: number) => {
                        return await this.getNextUsernamesFromContract(startIndex, count);
                    }
                );

            const userResults = await this.storage.loadUserResults();
            let castsToVerify = await this.storage.getCastsToVerify();

            if (batchesToProcess.length > 0) {
                const { casts, batches, errorBatches } = await this.requester.fetchCastsInBatches(
                    batchesToProcess,
                    queryList,
                    userIndexByUsername
                );

                let minLikesCount = castsToVerify.length > 0 ? castsToVerify[castsToVerify.length - 1].likesCount : 0;
                let isNewCastsToVerify = false;

                for (const cast of casts) {
                    const foundKeyword = this.findKeywordWithPrefix(cast.castContent);
                    if (foundKeyword === '') {
                        continue;
                    }

                    if (cast.likesCount > 100 && cast.likesCount > minLikesCount) {
                        castsToVerify.push(cast);
                        isNewCastsToVerify = true;
                        castsToVerify.sort((a, b) => b.likesCount - a.likesCount);
                        if (castsToVerify.length > VERIFY_CAST_BATCH_SIZE) {
                            castsToVerify = castsToVerify.slice(0, VERIFY_CAST_BATCH_SIZE);
                        }
                        minLikesCount = castsToVerify[castsToVerify.length - 1].likesCount;
                        continue;
                    }

                    const result = userResults.get(cast.userIndex) || this.getDefaultResult();
                    result.userIndex = BigInt(cast.userIndex);
                    const processingType = this.calculateCastByKeyword(
                        result,
                        cast.likesCount,
                        foundKeyword
                    );

                    if (processingType !== CastProcessingType.Skipped) {
                        userResults.set(cast.userIndex, result);
                    }
                }

                if (isNewCastsToVerify) {
                    await this.storage.saveCastsToVerify(castsToVerify);
                }

                const results: UserFarcasterData[] = [];
                const userIndexesUnderVerification = new Set(castsToVerify.map((c) => c.userIndex));

                for (const [userIndex, result] of userResults.entries()) {
                    if (userIndexesUnderVerification.has(userIndex)) {
                        continue;
                    }

                    const ongoingBatches = batches
                        .concat(errorBatches)
                        .filter((b) => b.nextCursor !== '');
                    let isOngoingBatch = false;
                    for (const batch of ongoingBatches) {
                        if (
                            Number(batch.startIndex) < userIndex &&
                            userIndex < Number(batch.endIndex)
                        ) {
                            isOngoingBatch = true;
                            break;
                        }
                    }

                    if (!isOngoingBatch && result.casts < 1000) {
                        results.push(result);
                        userResults.delete(userIndex);
                    }
                }

                await this.storage.saveUserResults(userResults);

                const batchesToRetry = errorBatches.filter((b) => b.errorCount < 3);
                const errorBatchesToLog = errorBatches.filter((b) => b.errorCount >= 3);

                const transactions: any[] = [];

                if (results.length > 0 || batchesToRetry.length > 0) {
                    transactions.push({
                        to: this.config.contractAddress,
                        function: 'mintCoinsForFarcasterUsers',
                        args: [results, BigInt(mintingDayTimestamp), batchesToRetry],
                    });
                }

                if (errorBatchesToLog.length > 0) {
                    transactions.push({
                        to: this.config.contractAddress,
                        function: 'logErrorBatches',
                        args: [BigInt(mintingDayTimestamp), errorBatchesToLog],
                    });
                }

                if (transactions.length > 0) {
                    return { canExec: true, transactions };
                }

                return { canExec: false, message: 'No transactions to execute' };
            }

            if (batchesToProcess.length === 0) {
                if (castsToVerify.length > 0) {
                    const verifiedCasts = await this.requester.fetchCastsByIDs(castsToVerify);
                    for (const cast of verifiedCasts) {
                        const result = userResults.get(cast.userIndex) || this.getDefaultResult();
                        const processingType = this.calculateCastByKeyword(
                            result,
                            cast.likesCount,
                            this.findKeywordWithPrefix(cast.castContent)
                        );

                        if (processingType !== CastProcessingType.Skipped) {
                            if (!result.userIndex) {
                                result.userIndex = BigInt(cast.userIndex);
                            }
                            userResults.set(cast.userIndex, result);
                        }
                    }
                }

                const finalResults = Array.from(userResults.values()).sort(
                    (a, b) => Number(a.userIndex - b.userIndex)
                );

                const transactions: any[] = [];

                if (finalResults.length > 0) {
                    transactions.push({
                        to: this.config.contractAddress,
                        function: 'mintCoinsForFarcasterUsers',
                        args: [finalResults, BigInt(mintingDayTimestamp), []],
                    });
                }

                transactions.push({
                    to: this.config.contractAddress,
                    function: 'finishMinting',
                    args: [BigInt(mintingDayTimestamp), ''],
                });

                await this.storage.clearAll();

                return { canExec: true, transactions };
            }

            return { canExec: false, message: 'No batches to process and minting not finished' };
        } catch (error: any) {
            console.error('Error in Farcaster worker:', error);
            return { canExec: false, message: `Error: ${error.message}` };
        }
    }

    private findKeywordWithPrefix(text: string): string {
        const words = text.split(/\s+/);
        let foundWord = '';

        for (const word of words) {
            const cleanedWord = word.replace(/[.,!?;:()]/g, '').toLowerCase();

            if (cleanedWord === `$${KEYWORD}`) {
                return `$${KEYWORD}`;
            } else if (cleanedWord === `#${KEYWORD}` && foundWord === '') {
                foundWord = `#${KEYWORD}`;
            } else if (cleanedWord === KEYWORD && foundWord === '') {
                foundWord = cleanedWord;
            }
        }

        return foundWord;
    }

    private calculateCastByKeyword(
        result: UserFarcasterData,
        likesCount: number,
        keyword: string
    ): CastProcessingType {
        if (keyword === '') {
            return CastProcessingType.Skipped;
        }

        let processingType = CastProcessingType.Skipped;

        if (keyword === `$${KEYWORD}` && result.cashtagCasts < 10) {
            processingType = CastProcessingType.Cashtag;
            result.cashtagCasts++;
        } else if (keyword === `#${KEYWORD}` && result.hashtagCasts < 10) {
            processingType = CastProcessingType.Hashtag;
            result.hashtagCasts++;
        } else if (keyword === KEYWORD) {
            processingType = CastProcessingType.Simple;
            result.simpleCasts++;
        }

        if (processingType !== CastProcessingType.Skipped) {
            result.casts++;
            result.likes += likesCount;
        }

        return processingType;
    }

    private getDefaultResult(): UserFarcasterData {
        return {
            userIndex: 0n,
            casts: 0,
            hashtagCasts: 0,
            cashtagCasts: 0,
            simpleCasts: 0,
            likes: 0,
            recasts: 0,
        };
    }

    private async getNextUsernamesFromContract(
        startIndex: bigint,
        count: number
    ): Promise<string[]> {
        const { getNextUsernames } = await import('../smartContractCalls');
        return await getNextUsernames(
            this.config.contractAddress,
            this.config.chain,
            startIndex,
            count
        );
    }
}

