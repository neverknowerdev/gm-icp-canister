// Farcaster API requester for fetching casts
// Similar to TwitterRequester but for Farcaster

import { Cast } from './types';
import { httpGetWithRetries } from '../../utils/httpClient';

export interface FarcasterSecrets {
    apiKey: string;
    bearerToken?: string;
}

export interface FarcasterURLs {
    farcasterAPIURL: string;
}

export class FarcasterRequester {
    private secrets: FarcasterSecrets;
    private urls: FarcasterURLs;
    private requestCounter: number = 0;

    constructor(secrets: FarcasterSecrets, urls: FarcasterURLs) {
        this.secrets = secrets;
        this.urls = urls;
    }

    /**
     * Generate a unique idempotency key for HTTP requests
     * Uses timestamp and counter for uniqueness (no randomness needed for idempotency keys)
     */
    private generateIdempotencyKey(): string {
        this.requestCounter++;
        const timestamp = Date.now();
        // Using counter provides sufficient uniqueness within a session
        // Combined with timestamp, this ensures uniqueness across restarts
        return `fc-${timestamp}-${this.requestCounter}`;
    }

    /**
     * Fetch casts by query string
     */
    async fetchCastsByQuery(query: string): Promise<Cast[]> {
        try {
            const url = new URL(this.urls.farcasterAPIURL);
            url.searchParams.set('q', query);
            url.searchParams.set('limit', '100');

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${this.secrets.bearerToken || this.secrets.apiKey}`,
                'Idempotency-Key': this.generateIdempotencyKey(),
            };

            const response = await httpGetWithRetries(url.toString(), headers, 1);
            const data = JSON.parse(response.body);
            return this.parseFarcasterResponse(data);
        } catch (error) {
            console.error('Error fetching Farcaster casts:', error);
            throw error;
        }
    }

    /**
     * Fetch casts by FIDs
     */
    async fetchCastsByFIDs(fids: string[]): Promise<Cast[]> {
        const batchSize = 100;
        const batches: string[][] = [];

        for (let i = 0; i < fids.length; i += batchSize) {
            batches.push(fids.slice(i, i + batchSize));
        }

        const results: Cast[] = [];

        for (const batch of batches) {
            const fidsParam = batch.join(',');
            const url = `${this.urls.farcasterAPIURL}/casts?fids=${fidsParam}`;

            try {
                const response = await httpGetWithRetries(url, {
                    'Authorization': `Bearer ${this.secrets.bearerToken || this.secrets.apiKey}`,
                    'Idempotency-Key': this.generateIdempotencyKey(),
                }, 1);

                const data = JSON.parse(response.body);
                results.push(...this.parseFarcasterResponse(data));
            } catch (error) {
                console.error('Error fetching Farcaster batch:', error);
            }
        }

        return results;
    }

    /**
     * Parse Farcaster API response
     */
    private parseFarcasterResponse(data: any): Cast[] {
        const casts: Cast[] = [];

        try {
            if (data.result?.casts) {
                for (const castData of data.result.casts) {
                    casts.push({
                        castId: castData.hash || castData.merkleRoot || '',
                        fid: castData.author?.fid?.toString() || '',
                        text: castData.text || '',
                        likesCount: castData.reactions?.likes?.length || 0,
                    });
                }
            }
        } catch (error) {
            console.error('Error parsing Farcaster response:', error);
        }

        return casts;
    }
}
