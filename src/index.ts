import { query, update, IDL, ic } from 'azle';
import { processEvent } from './eventProcessor';
import { initConfig } from './utils/config';
import { workerManager, TwitterWorkerSecrets, FarcasterWorkerSecrets } from './workers/workerManager';
import { TwitterWorkerConfig } from './workers/twitter/types';
import { FarcasterWorkerConfig } from './workers/farcaster/types';
import { initializeMintingScheduler } from './minting/mintingScheduler';
import { startMinting } from './minting/mintingProcessor';

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

export default class {
    constructor() {
        // Initialize minting scheduler on canister creation
        // This will set up the timer to run daily at 2:00 AM
        try {
            initializeMintingScheduler();
        } catch (error: any) {
            console.error(`Error initializing minting scheduler: ${error}`);
        }
    }

    @query([IDL.Text], IDL.Text)
    greet(name: string): string {
        return `Hello, ${name}!`;
    }

    /**
     * Timer callback - called by ICP timer system
     * This is an internal method called automatically at the scheduled time (2:00 AM daily)
     */
    @update([], IDL.Null)
    async timerCallback(): Promise<null> {
        console.log('Timer callback fired - starting minting process');
        try {
            await startMinting();
        } catch (error: any) {
            console.error(`Error in timer callback: ${error}`);
        }
        return null;
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

    // NOTE: processTwitterMintingEvent and processFarcasterMintingEvent have been removed
    // Minting now happens internally via timer-based scheduling (daily at 2:00 AM)
    // The minting process is no longer exposed externally

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
