// Worker Manager - manages Twitter and Farcaster workers

import { TwitterWorker } from './twitter/worker';
import { FarcasterWorker } from './farcaster/worker';
import { Batch, TwitterWorkerConfig } from './twitter/types';
import { FarcasterWorkerConfig } from './farcaster/types';

export interface TwitterWorkerSecrets {
    bearerToken: string;
    optimizedAPISecretKey: string;
    authHeaderName: string;
}

export interface FarcasterWorkerSecrets {
    apiKey: string;
    bearerToken?: string;
}

export class WorkerManager {
    private twitterWorker: TwitterWorker | null = null;
    private farcasterWorker: FarcasterWorker | null = null;

    initializeTwitterWorker(config: TwitterWorkerConfig, secrets: TwitterWorkerSecrets): void {
        this.twitterWorker = new TwitterWorker(config, secrets);
        console.log('Twitter worker initialized');
    }

    initializeFarcasterWorker(config: FarcasterWorkerConfig, secrets: FarcasterWorkerSecrets): void {
        this.farcasterWorker = new FarcasterWorker(config, secrets);
        console.log('Farcaster worker initialized');
    }

    async processTwitterMintingEvent(
        mintingDayTimestamp: number,
        batches: Batch[]
    ): Promise<{ canExec: boolean; transactions?: any[]; message?: string }> {
        if (!this.twitterWorker) {
            return { canExec: false, message: 'Twitter worker not initialized' };
        }

        return await this.twitterWorker.processMintingEvent(mintingDayTimestamp, batches);
    }

    async processFarcasterMintingEvent(
        mintingDayTimestamp: number,
        batches: Batch[]
    ): Promise<{ canExec: boolean; transactions?: any[]; message?: string }> {
        if (!this.farcasterWorker) {
            return { canExec: false, message: 'Farcaster worker not initialized' };
        }

        return await this.farcasterWorker.processMintingEvent(mintingDayTimestamp, batches);
    }

    isTwitterWorkerInitialized(): boolean {
        return this.twitterWorker !== null;
    }

    isFarcasterWorkerInitialized(): boolean {
        return this.farcasterWorker !== null;
    }
}

// Global worker manager instance
export const workerManager = new WorkerManager();

