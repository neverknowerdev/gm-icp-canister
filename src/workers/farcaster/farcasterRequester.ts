// Farcaster API requester for fetching casts
// Similar to TwitterRequester but for Farcaster

import { Batch, Cast } from './types';
import { httpGet } from '../../utils/httpClient';

export interface FarcasterSecrets {
    apiKey: string;
    bearerToken?: string;
}

export interface FarcasterURLs {
    castsAPIURL: string;
    usersAPIURL: string;
    searchAPIURL: string;
}

export class FarcasterRequester {
    private secrets: FarcasterSecrets;
    private urls: FarcasterURLs;

    constructor(secrets: FarcasterSecrets, urls: FarcasterURLs) {
        this.secrets = secrets;
        this.urls = urls;
    }

    async fetchCastsBySearchQuery(
        query: string,
        cursor: string
    ): Promise<{ casts: Cast[]; nextCursor: string }> {
        try {
            const url = new URL(this.urls.searchAPIURL);
            url.searchParams.set('q', query);
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }

            const headers: Record<string, string> = {
                'Authorization': this.secrets.bearerToken || `Bearer ${this.secrets.apiKey}`,
            };

            const response = await httpGet(url.toString(), headers);
            const data = JSON.parse(response.body);
            return this.parseFarcasterResponse(data, cursor);
        } catch (error) {
            console.error('Error fetching casts:', error);
            throw error;
        }
    }

    async fetchCastsByIDs(casts: Cast[]): Promise<Cast[]> {
        const batchSize = 100;
        const batches: Cast[][] = [];

        for (let i = 0; i < casts.length; i += batchSize) {
            batches.push(casts.slice(i, i + batchSize));
        }

        const results: Cast[] = [];

        for (const batch of batches) {
            const castIDs = batch.map((c) => c.castID).join(',');
            const url = `${this.urls.castsAPIURL}?ids=${castIDs}`;

            try {
                const response = await httpGet(url, {
                    'Authorization': this.secrets.bearerToken || `Bearer ${this.secrets.apiKey}`,
                });

                const data = JSON.parse(response.body);
                if (data.result?.casts) {
                    for (const castData of data.result.casts) {
                        const cast = batch.find((c) => c.castID === castData.hash);
                        if (cast) {
                            cast.likesCount = castData.reactions?.likes?.length || 0;
                            cast.recastsCount = castData.reactions?.recasts?.length || 0;
                            cast.castContent = castData.text || '';
                            results.push(cast);
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
            const url = `${this.urls.usersAPIURL}?fids=${batch.join(',')}`;

            try {
                const response = await httpGet(url, {
                    'Authorization': this.secrets.bearerToken || `Bearer ${this.secrets.apiKey}`,
                });

                const data = JSON.parse(response.body);
                if (data.result?.users) {
                    for (const user of data.result.users) {
                        if (user.username) {
                            userIDtoUsername.set(user.fid.toString(), user.username);
                        }
                    }
                }
            } catch (error) {
                console.error('Error converting user IDs:', error);
            }
        }

        return userIDs.map((id) => userIDtoUsername.get(id) || '');
    }

    async fetchCastsInBatches(
        batchesToProcess: Batch[],
        queryList: string[],
        userIndexByUsername: Map<string, number>
    ): Promise<{
        casts: Cast[];
        batches: Batch[];
        errorBatches: Batch[];
    }> {
        const allCasts: Cast[] = [];
        const errorBatches: Batch[] = [];
        const finalSuccessBatches: Batch[] = [];

        for (let i = 0; i < batchesToProcess.length; i++) {
            const batch = batchesToProcess[i];
            try {
                const { casts, nextCursor } = await this.fetchCastsBySearchQuery(
                    queryList[i],
                    batch.nextCursor
                );

                for (const cast of casts) {
                    const userIndex = userIndexByUsername.get(cast.username);
                    if (userIndex === undefined) {
                        console.error('Username not found:', cast.username);
                        throw new Error(`Username not found: ${cast.username}`);
                    }
                    cast.userIndex = userIndex;
                }

                batch.nextCursor = casts.length > 0 && nextCursor !== '' ? nextCursor : '';
                batch.errorCount = 0;
                finalSuccessBatches.push(batch);
                allCasts.push(...casts);
            } catch (error) {
                batch.errorCount++;
                errorBatches.push(batch);
                console.error('Error fetching and processing casts:', error);
            }
        }

        return {
            casts: allCasts,
            batches: finalSuccessBatches,
            errorBatches,
        };
    }

    private parseFarcasterResponse(data: any, cursor: string): { casts: Cast[]; nextCursor: string } {
        const casts: Cast[] = [];
        let nextCursor = '';

        try {
            if (data.result?.casts) {
                for (const castData of data.result.casts) {
                    casts.push({
                        castID: castData.hash || '',
                        userID: castData.author?.fid?.toString() || '',
                        username: castData.author?.username || '',
                        castContent: castData.text || '',
                        likesCount: castData.reactions?.likes?.length || 0,
                        recastsCount: castData.reactions?.recasts?.length || 0,
                        userDescriptionText: castData.author?.profile?.bio?.text || '',
                        userIndex: 0,
                    });
                }
            }

            if (data.next?.cursor) {
                nextCursor = data.next.cursor;
            }
        } catch (error) {
            console.error('Error parsing Farcaster response:', error);
        }

        return { casts, nextCursor };
    }
}

