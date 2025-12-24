import { query, update, IDL } from 'azle';
import { processEvent } from './eventProcessor';
import { initConfig } from './utils/config';
import { workerManager, TwitterWorkerSecrets, FarcasterWorkerSecrets } from './workers/workerManager';
import { TwitterWorkerConfig } from './workers/twitter/types';
import { FarcasterWorkerConfig } from './workers/farcaster/types';
import { Batch } from './workers/twitter/types';

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

export default class {
    @query([IDL.Text], IDL.Text)
    greet(name: string): string {
        return `Hello, ${name}!`;
    }

    @update([IDL.Text, IDL.Text], IDL.Null)
    async handleEvent(chain: string, transactionId: string): Promise<null> {
        try {
            await processEvent(chain, transactionId);
        } catch (error: any) {
            console.error(`Error processing event: ${error}`);
            if (error.message) {
                console.error(`Error message: ${error.message}`);
            }
        }
        return null;
    }

    @update([IDL.Record({
        contracts: IDL.Record({
            'Base Mainnet': IDL.Vec(IDL.Text),
            'WorldChain': IDL.Vec(IDL.Text),
            'Monad': IDL.Vec(IDL.Text),
        }),
        eventSignatures: IDL.Record({
            'VerifyFarcasterRequested': IDL.Text,
            'VerifyTwitterByAuthCodeRequested': IDL.Text,
        }),
    })], IDL.Null)
    setConfig(config: Config): null {
        initConfig(config);
        console.log('Configuration updated successfully');
        return null;
    }

    /**
     * Initialize Twitter Worker
     * Sets up the Twitter worker with configuration and secrets
     */
    @update([IDL.Record({
        contractAddress: IDL.Text,
        chain: IDL.Text,
        tweetLookupURL: IDL.Text,
        serverURLPrefix: IDL.Text,
        concurrencyLimit: IDL.Nat32,
        twitterOptimizedServerHost: IDL.Text,
    }), IDL.Record({
        bearerToken: IDL.Text,
        optimizedAPISecretKey: IDL.Text,
        authHeaderName: IDL.Text,
    })], IDL.Null)
    initializeTwitterWorker(config: TwitterWorkerConfig, secrets: TwitterWorkerSecrets): null {
        workerManager.initializeTwitterWorker(config, secrets);
        console.log('Twitter worker initialized successfully');
        return null;
    }

    /**
     * Initialize Farcaster Worker
     * Sets up the Farcaster worker with configuration and secrets
     */
    @update([IDL.Record({
        contractAddress: IDL.Text,
        chain: IDL.Text,
        farcasterAPIURL: IDL.Text,
        serverURLPrefix: IDL.Text,
        concurrencyLimit: IDL.Nat32,
    }), IDL.Record({
        apiKey: IDL.Text,
        bearerToken: IDL.Opt(IDL.Text),
    })], IDL.Null)
    initializeFarcasterWorker(config: FarcasterWorkerConfig, secrets: FarcasterWorkerSecrets): null {
        workerManager.initializeFarcasterWorker(config, secrets);
        console.log('Farcaster worker initialized successfully');
        return null;
    }

    /**
     * Process Twitter Minting Event
     * Called when a twitterMintingProcessed event is detected
     */
    @update([IDL.Nat32, IDL.Vec(IDL.Record({
        startIndex: IDL.Nat64,
        endIndex: IDL.Nat64,
        nextCursor: IDL.Text,
        errorCount: IDL.Nat8,
    }))], IDL.Record({
        canExec: IDL.Bool,
        message: IDL.Opt(IDL.Text),
    }))
    async processTwitterMintingEvent(
        mintingDayTimestamp: number,
        batches: Batch[]
    ): Promise<{ canExec: boolean; message?: string }> {
        try {
            const result = await workerManager.processTwitterMintingEvent(
                mintingDayTimestamp,
                batches
            );
            return {
                canExec: result.canExec,
                message: result.message,
            };
        } catch (error: any) {
            console.error(`Error processing Twitter minting event: ${error}`);
            return {
                canExec: false,
                message: `Error: ${error.message || error}`,
            };
        }
    }

    /**
     * Process Farcaster Minting Event
     * Called when a farcasterMintingProcessed event is detected
     */
    @update([IDL.Nat32, IDL.Vec(IDL.Record({
        startIndex: IDL.Nat64,
        endIndex: IDL.Nat64,
        nextCursor: IDL.Text,
        errorCount: IDL.Nat8,
    }))], IDL.Record({
        canExec: IDL.Bool,
        message: IDL.Opt(IDL.Text),
    }))
    async processFarcasterMintingEvent(
        mintingDayTimestamp: number,
        batches: Batch[]
    ): Promise<{ canExec: boolean; message?: string }> {
        try {
            const result = await workerManager.processFarcasterMintingEvent(
                mintingDayTimestamp,
                batches
            );
            return {
                canExec: result.canExec,
                message: result.message,
            };
        } catch (error: any) {
            console.error(`Error processing Farcaster minting event: ${error}`);
            return {
                canExec: false,
                message: `Error: ${error.message || error}`,
            };
        }
    }

    /**
     * Check if Twitter worker is initialized
     */
    @query([], IDL.Bool)
    isTwitterWorkerInitialized(): boolean {
        return workerManager.isTwitterWorkerInitialized();
    }

    /**
     * Check if Farcaster worker is initialized
     */
    @query([], IDL.Bool)
    isFarcasterWorkerInitialized(): boolean {
        return workerManager.isFarcasterWorkerInitialized();
    }
}
