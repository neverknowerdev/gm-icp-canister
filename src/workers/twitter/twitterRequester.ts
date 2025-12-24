// Twitter API requester for fetching tweets
// Similar to GMCoin's TwitterRequester but adapted for ICP canister

import { Batch, Tweet } from './types';
import { httpGet } from '../../utils/httpClient';

export interface TwitterSecrets {
    bearerToken: string;
    optimizedAPISecretKey: string;
    authHeaderName: string;
}

export interface TwitterURLs {
    tweetLookupURL: string;
    convertToUsernamesURL: string;
    twitterSearchByQueryURL: string;
}

export class TwitterRequester {
    private secrets: TwitterSecrets;
    private urls: TwitterURLs;

    constructor(secrets: TwitterSecrets, urls: TwitterURLs) {
        this.secrets = secrets;
        this.urls = urls;
    }

    async fetchTweetsBySearchQuery(
        query: string,
        cursor: string
    ): Promise<{ tweets: Tweet[]; nextCursor: string }> {
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
            };

            const response = await httpGet(url.toString(), headers);
            const data = JSON.parse(response.body);
            return this.parseTwitterResponse(data, cursor);
        } catch (error) {
            console.error('Error fetching tweets:', error);
            throw error;
        }
    }

    async fetchTweetsByIDs(tweets: Tweet[]): Promise<Tweet[]> {
        const batchSize = 100;
        const batches: Tweet[][] = [];

        for (let i = 0; i < tweets.length; i += batchSize) {
            batches.push(tweets.slice(i, i + batchSize));
        }

        const results: Tweet[] = [];

        for (const batch of batches) {
            const tweetIDs = batch.map((t) => t.tweetID).join(',');
            const url = `${this.urls.tweetLookupURL}?ids=${tweetIDs}&tweet.fields=public_metrics&expansions=author_id&user.fields=description`;

            try {
                const response = await httpGet(url, {
                    Authorization: `Bearer ${this.secrets.bearerToken}`,
                });

                const data = JSON.parse(response.body);
                if (data.data) {
                    for (const tweetData of data.data) {
                        const tweet = batch.find((t) => t.tweetID === tweetData.id);
                        if (tweet) {
                            tweet.likesCount = tweetData.public_metrics?.like_count || 0;
                            tweet.tweetContent = tweetData.text || '';
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
                const response = await httpGet(url, {
                    [this.secrets.authHeaderName]: this.secrets.optimizedAPISecretKey,
                });

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

    async fetchTweetsInBatches(
        batchesToProcess: Batch[],
        queryList: string[],
        userIndexByUsername: Map<string, number>
    ): Promise<{
        tweets: Tweet[];
        batches: Batch[];
        errorBatches: Batch[];
    }> {
        const allTweets: Tweet[] = [];
        const errorBatches: Batch[] = [];
        const finalSuccessBatches: Batch[] = [];

        for (let i = 0; i < batchesToProcess.length; i++) {
            const batch = batchesToProcess[i];
            try {
                const { tweets, nextCursor } = await this.fetchTweetsBySearchQuery(
                    queryList[i],
                    batch.nextCursor
                );

                for (const tweet of tweets) {
                    const userIndex = userIndexByUsername.get(tweet.username);
                    if (userIndex === undefined) {
                        console.error('Username not found:', tweet.username);
                        throw new Error(`Username not found: ${tweet.username}`);
                    }
                    tweet.userIndex = userIndex;
                }

                batch.nextCursor = tweets.length > 0 && nextCursor !== '' ? nextCursor : '';
                batch.errorCount = 0;
                finalSuccessBatches.push(batch);
                allTweets.push(...tweets);
            } catch (error) {
                batch.errorCount++;
                errorBatches.push(batch);
                console.error('Error fetching and processing tweets:', error);
            }
        }

        return {
            tweets: allTweets,
            batches: finalSuccessBatches,
            errorBatches,
        };
    }

    private parseTwitterResponse(data: any, cursor: string): { tweets: Tweet[]; nextCursor: string } {
        const tweets: Tweet[] = [];
        let nextCursor = '';

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
                        const tweetID = tweetData.rest_id ?? tweetData.tweet?.rest_id;

                        if (user && legacy && tweetID) {
                            tweets.push({
                                tweetID: tweetID,
                                userID: user.rest_id,
                                username: user.core?.screen_name || '',
                                tweetContent: legacy.full_text || '',
                                likesCount: legacy.favorite_count || 0,
                                userDescriptionText: user.profile_bio?.description || '',
                                userIndex: 0,
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

