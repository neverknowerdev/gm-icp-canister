// Twitter API requester for fetching tweets
// Similar to GMCoin's TwitterRequester but adapted for ICP canister

import { TweetInfo } from '../../storage';
import { httpGetWithRetries } from '../../utils/httpClient';

export interface TwitterSecrets {
    bearerToken: string;
    optimizedAPISecretKey: string;
    authHeaderName: string;
}

export interface TwitterURLs {
    convertToUsernamesURL: string;
    twitterSearchByQueryURL: string;
}

export class TwitterRequester {
    private secrets: TwitterSecrets;
    private urls: TwitterURLs;
    private requestCounter: number = 0;

    constructor(secrets: TwitterSecrets, urls: TwitterURLs) {
        this.secrets = secrets;
        this.urls = urls;
    }

    /**
     * Generate a unique idempotency key for HTTP requests
     */
    private generateIdempotencyKey(): string {
        this.requestCounter++;
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        return `${timestamp}-${this.requestCounter}-${random}`;
    }

    /**
     * Fetch tweets by search query
     * Here we use optimized server to perform API calls, to minize queries produced by ICP canisters by idempotency key
     * @param query - The search query
     * @param cursor - The cursor to use for pagination
     * @returns The tweets and the next cursor
     */
    async fetchTweetsBySearchQuery(
        query: string,
        cursor: string
    ): Promise<{ tweets: TweetInfo[]; nextCursor: string }> {
        try {
            // Make HTTP request to Twitter API using ICP HTTP outcalls
            const url = new URL(this.urls.twitterSearchByQueryURL);
            url.searchParams.set('q', query);
            url.searchParams.set('type', 'Latest');
            url.searchParams.set('count', '20');
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }
            url.searchParams.set('safe_search', 'false');

            const headers: Record<string, string> = {
                [this.secrets.authHeaderName]: this.secrets.optimizedAPISecretKey,
                'Idempotency-Key': this.generateIdempotencyKey(),
            };

            // Use httpGetWithRetries with 1 retry (2 total attempts)
            const response = await httpGetWithRetries(url.toString(), headers, 1);
            const data = JSON.parse(response.body);
            return this.parseTwitterResponse(data, cursor);
        } catch (error) {
            console.error('Error fetching tweets:', error);
            throw error;
        }
    }

    /**
     * Re-verify tweets by IDs using official Twitter API
     * @param tweets - The tweets to re-verify
     * @returns The re-verified tweets
     */
    async reVerifyTweets(tweets: TweetInfo[]): Promise<TweetInfo[]> {
        const batchSize = 100; // max limit by X API
        const batches: TweetInfo[][] = [];

        for (let i = 0; i < tweets.length; i += batchSize) {
            batches.push(tweets.slice(i, i + batchSize));
        }

        const results: TweetInfo[] = [];

        for (const batch of batches) {
            const tweetIDs = batch.map((t) => t.tweetId).join(',');
            const url = `https://api.x.com/2/tweets?ids=${tweetIDs}&tweet.fields=public_metrics&expansions=author_id&user.fields=description`;

            try {
                const response = await httpGetWithRetries(url, {
                    Authorization: `Bearer ${this.secrets.bearerToken}`,
                    'Idempotency-Key': this.generateIdempotencyKey(),
                }, 1);

                const data = JSON.parse(response.body);
                if (data.data) {
                    for (const tweetData of data.data) {
                        let tweet = batch.find((t) => t.tweetId === tweetData.id);
                        if (tweet) {
                            tweet.likesCount = tweetData.public_metrics?.like_count || 0;
                            tweet.text = tweetData.text || '';
                            results.push(tweet);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching batch:', error);
            }
        }

        return results;
    }

    async convertToUsernames(userIDs: string[]): Promise<string[]> {
        const batchSize = 100;
        const batches: string[][] = [];

        for (let i = 0; i < userIDs.length; i += batchSize) {
            batches.push(userIDs.slice(i, i + batchSize));
        }

        const userIDtoUsername = new Map<string, string>();

        for (const batch of batches) {
            const url = `${this.urls.convertToUsernamesURL}?user_ids=${batch.join(',')}`;

            try {
                const response = await httpGetWithRetries(url, {
                    [this.secrets.authHeaderName]: this.secrets.optimizedAPISecretKey,
                    'Idempotency-Key': this.generateIdempotencyKey(),
                }, 1);

                const data = JSON.parse(response.body);
                if (data.data?.users) {
                    for (const user of data.data.users) {
                        if (user.result?.core?.screen_name) {
                            userIDtoUsername.set(user.rest_id, user.result.core.screen_name);
                        }
                    }
                }
            } catch (error) {
                console.error('Error converting user IDs:', error);
            }
        }

        return userIDs.map((id) => userIDtoUsername.get(id) || '');
    }

    private parseTwitterResponse(data: any, cursor: string): { tweets: TweetInfo[]; nextCursor: string } {
        const tweets: TweetInfo[] = [];
        let nextCursor = '';
        const parsedAt = Math.floor(Date.now() / 1000);

        try {
            const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];

            for (const instruction of instructions) {
                if (instruction.entry?.content?.cursor_type === 'Bottom') {
                    nextCursor = instruction.entry.content.value || '';
                    continue;
                }

                if (!instruction.entries) {
                    continue;
                }

                for (const entry of instruction.entries) {
                    if (entry.content?.cursor_type === 'Bottom') {
                        nextCursor = entry.content.value || '';
                        continue;
                    }

                    const tweetData = entry.content?.content?.tweet_results?.result;
                    if (tweetData) {
                        const user = tweetData.core?.user_results?.result ?? tweetData.tweet?.core?.user_results?.result;
                        const legacy = tweetData.legacy ?? tweetData.tweet?.legacy;
                        const tweetId = tweetData.rest_id ?? tweetData.tweet?.rest_id;

                        if (user && legacy && tweetId) {
                            tweets.push({
                                tweetId: tweetId,
                                twitterUserId: user.rest_id,
                                userId: '', // Will be filled in processSingleQueryBatch
                                username: user.core?.screen_name || '',
                                text: legacy.full_text || '',
                                likesCount: legacy.favorite_count || 0,
                                parsed_at: parsedAt,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing Twitter response:', error);
        }

        return { tweets, nextCursor };
    }
}

