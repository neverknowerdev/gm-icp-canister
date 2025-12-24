// Main Twitter Worker
// Processes Twitter data similar to GMCoin's twitter-worker

import { Batch, Tweet, TweetProcessingType, UserTwitterData, TwitterWorkerConfig } from './types';
import { TwitterWorkerStorage } from './storage';
import { TwitterRequester, TwitterSecrets, TwitterURLs } from './twitterRequester';
import { TwitterBatchManager } from './batchManager';

const KEYWORD = 'gm';
const VERIFY_TWEET_BATCH_SIZE = 300;

export class TwitterWorker {
    private config: TwitterWorkerConfig;
    private storage: TwitterWorkerStorage;
    private requester: TwitterRequester;
    private batchManager!: TwitterBatchManager; // Initialized in processMintingEvent

    constructor(config: TwitterWorkerConfig, secrets: TwitterSecrets) {
        this.config = config;
        this.storage = new TwitterWorkerStorage(0); // Will be set per minting day
        this.requester = new TwitterRequester(secrets, {
            tweetLookupURL: config.tweetLookupURL,
            convertToUsernamesURL: `${config.twitterOptimizedServerHost}/UserResultsByRestIds`,
            twitterSearchByQueryURL: `${config.twitterOptimizedServerHost}/Search`,
        });
    }

    async processMintingEvent(
        mintingDayTimestamp: number,
        eventBatches: Batch[]
    ): Promise<{ canExec: boolean; transactions?: any[]; message?: string }> {
        this.storage = new TwitterWorkerStorage(mintingDayTimestamp);
        this.batchManager = new TwitterBatchManager(
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
                        // Get next usernames from smart contract
                        return await this.getNextUsernamesFromContract(startIndex, count);
                    }
                );

            const userResults = await this.storage.loadUserResults();
            let tweetsToVerify = await this.storage.getTweetsToVerify();

            if (batchesToProcess.length > 0) {
                // Process batches
                const { tweets, batches, errorBatches } = await this.requester.fetchTweetsInBatches(
                    batchesToProcess,
                    queryList,
                    userIndexByUsername
                );

                let minLikesCount = tweetsToVerify.length > 0 ? tweetsToVerify[tweetsToVerify.length - 1].likesCount : 0;
                let isNewTweetsToVerify = false;

                for (const tweet of tweets) {
                    const foundKeyword = this.findKeywordWithPrefix(tweet.tweetContent);
                    if (foundKeyword === '') {
                        continue;
                    }

                    // Add high-liked tweets to verification queue
                    if (tweet.likesCount > 100 && tweet.likesCount > minLikesCount) {
                        tweetsToVerify.push(tweet);
                        isNewTweetsToVerify = true;
                        tweetsToVerify.sort((a, b) => b.likesCount - a.likesCount);
                        if (tweetsToVerify.length > VERIFY_TWEET_BATCH_SIZE) {
                            tweetsToVerify = tweetsToVerify.slice(0, VERIFY_TWEET_BATCH_SIZE);
                        }
                        minLikesCount = tweetsToVerify[tweetsToVerify.length - 1].likesCount;
                        continue;
                    }

                    // Process tweet
                    const result = userResults.get(tweet.userIndex) || this.getDefaultResult();
                    result.userIndex = BigInt(tweet.userIndex);
                    const processingType = this.calculateTweetByKeyword(
                        result,
                        tweet.likesCount,
                        foundKeyword
                    );

                    if (processingType !== TweetProcessingType.Skipped) {
                        userResults.set(tweet.userIndex, result);
                    }
                }

                if (isNewTweetsToVerify) {
                    await this.storage.saveTweetsToVerify(tweetsToVerify);
                }

                // Prepare results for minting
                const results: UserTwitterData[] = [];
                const userIndexesUnderVerification = new Set(
                    tweetsToVerify.map((t) => t.userIndex)
                );

                for (const [userIndex, result] of userResults.entries()) {
                    if (userIndexesUnderVerification.has(userIndex)) {
                        continue;
                    }

                    // Check if user is in ongoing batch
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

                    if (!isOngoingBatch && result.tweets < 1000) {
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
                        function: 'mintCoinsForTwitterUsers',
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

            // Minting finished
            if (batchesToProcess.length === 0) {
                if (tweetsToVerify.length > 0) {
                    const verifiedTweets = await this.requester.fetchTweetsByIDs(tweetsToVerify);
                    for (const tweet of verifiedTweets) {
                        const result = userResults.get(tweet.userIndex) || this.getDefaultResult();
                        const processingType = this.calculateTweetByKeyword(
                            result,
                            tweet.likesCount,
                            this.findKeywordWithPrefix(tweet.tweetContent)
                        );

                        if (processingType !== TweetProcessingType.Skipped) {
                            if (!result.userIndex) {
                                result.userIndex = BigInt(tweet.userIndex);
                            }
                            userResults.set(tweet.userIndex, result);
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
                        function: 'mintCoinsForTwitterUsers',
                        args: [finalResults, BigInt(mintingDayTimestamp), []],
                    });
                }

                transactions.push({
                    to: this.config.contractAddress,
                    function: 'finishMinting',
                    args: [BigInt(mintingDayTimestamp), ''], // finalHash would be calculated
                });

                await this.storage.clearAll();

                return { canExec: true, transactions };
            }

            return { canExec: false, message: 'No batches to process and minting not finished' };
        } catch (error: any) {
            console.error('Error in Twitter worker:', error);
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

    private calculateTweetByKeyword(
        result: UserTwitterData,
        likesCount: number,
        keyword: string
    ): TweetProcessingType {
        if (keyword === '') {
            return TweetProcessingType.Skipped;
        }

        let processingType = TweetProcessingType.Skipped;

        if (keyword === `$${KEYWORD}` && result.cashtagTweets < 10) {
            processingType = TweetProcessingType.Cashtag;
            result.cashtagTweets++;
        } else if (keyword === `#${KEYWORD}` && result.hashtagTweets < 10) {
            processingType = TweetProcessingType.Hashtag;
            result.hashtagTweets++;
        } else if (keyword === KEYWORD) {
            processingType = TweetProcessingType.Simple;
            result.simpleTweets++;
        }

        if (processingType !== TweetProcessingType.Skipped) {
            result.tweets++;
            result.likes += likesCount;
        }

        return processingType;
    }

    private getDefaultResult(): UserTwitterData {
        return {
            userIndex: 0n,
            tweets: 0,
            hashtagTweets: 0,
            cashtagTweets: 0,
            simpleTweets: 0,
            likes: 0,
        };
    }

    private async getNextUsernamesFromContract(
        startIndex: bigint,
        count: number
    ): Promise<string[]> {
        // Call smart contract to get next usernames
        const { getNextUsernames } = await import('../smartContractCalls');
        return await getNextUsernames(
            this.config.contractAddress,
            this.config.chain,
            startIndex,
            count
        );
    }
}

