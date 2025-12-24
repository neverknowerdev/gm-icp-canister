import { TransactionReceipt, ParsedEvent } from './utils/types';
import { fetchTransactionReceipt } from './utils/evmRpc';
import { extractEvents } from './utils/eventParser';
import { verifyTwitter } from './events/verifyTwitter';
import { verifyFarcaster } from './events/verifyFarcaster';
import { getContractAddresses } from './utils/config';
import { workerManager } from './workers/workerManager';
import { Batch } from './workers/twitter/types';

// Event handler registry
const EVENT_HANDLERS: Record<string, (event: ParsedEvent, chain: string, transactionFrom: string) => Promise<void>> = {
    'VerifyTwitterByAuthCodeRequested': verifyTwitter,
    'VerifyFarcasterRequested': verifyFarcaster,
    'twitterMintingProcessed': handleTwitterMintingProcessed,
    'farcasterMintingProcessed': handleFarcasterMintingProcessed,
};

/**
 * Handles twitterMintingProcessed event
 * Automatically triggers Twitter worker processing
 */
async function handleTwitterMintingProcessed(
    event: ParsedEvent,
    chain: string,
    transactionFrom: string
): Promise<void> {
    console.log('Processing twitterMintingProcessed event');
    
    if (!workerManager.isTwitterWorkerInitialized()) {
        console.warn('Twitter worker not initialized, skipping minting event');
        return;
    }

    try {
        // Parse event args
        // Expected: twitterMintingProcessed(uint32 indexed mintingDayTimestamp, Batch[] batches)
        const mintingDayTimestamp = event.args.topic1 ? Number(BigInt(event.args.topic1)) : 0;
        
        // Parse batches from event data
        // This is a simplified version - actual parsing would depend on event encoding
        const batches: Batch[] = [];
        if (event.args.data) {
            // Decode batches from event data
            // In production, you'd properly decode the ABI-encoded data
            try {
                const decoded = JSON.parse(event.args.data);
                if (Array.isArray(decoded)) {
                    batches.push(...decoded.map((b: any) => ({
                        startIndex: BigInt(b.startIndex || 0),
                        endIndex: BigInt(b.endIndex || 0),
                        nextCursor: b.nextCursor || '',
                        errorCount: b.errorCount || 0,
                    })));
                }
            } catch (e) {
                console.error('Error parsing batches from event:', e);
            }
        }

        if (mintingDayTimestamp === 0 || batches.length === 0) {
            console.error('Invalid twitterMintingProcessed event data');
            return;
        }

        // Process the minting event
        const result = await workerManager.processTwitterMintingEvent(mintingDayTimestamp, batches);
        
        if (result.canExec && result.transactions) {
            console.log(`Twitter worker generated ${result.transactions.length} transactions`);
            // In production, you would execute these transactions
            // For now, we just log them
        } else {
            console.log(`Twitter worker result: ${result.message || 'No transactions to execute'}`);
        }
    } catch (error: any) {
        console.error(`Error handling twitterMintingProcessed event: ${error}`);
    }
}

/**
 * Handles farcasterMintingProcessed event
 * Automatically triggers Farcaster worker processing
 */
async function handleFarcasterMintingProcessed(
    event: ParsedEvent,
    chain: string,
    transactionFrom: string
): Promise<void> {
    console.log('Processing farcasterMintingProcessed event');
    
    if (!workerManager.isFarcasterWorkerInitialized()) {
        console.warn('Farcaster worker not initialized, skipping minting event');
        return;
    }

    try {
        const mintingDayTimestamp = event.args.topic1 ? Number(BigInt(event.args.topic1)) : 0;
        
        const batches: Batch[] = [];
        if (event.args.data) {
            try {
                const decoded = JSON.parse(event.args.data);
                if (Array.isArray(decoded)) {
                    batches.push(...decoded.map((b: any) => ({
                        startIndex: BigInt(b.startIndex || 0),
                        endIndex: BigInt(b.endIndex || 0),
                        nextCursor: b.nextCursor || '',
                        errorCount: b.errorCount || 0,
                    })));
                }
            } catch (e) {
                console.error('Error parsing batches from event:', e);
            }
        }

        if (mintingDayTimestamp === 0 || batches.length === 0) {
            console.error('Invalid farcasterMintingProcessed event data');
            return;
        }

        const result = await workerManager.processFarcasterMintingEvent(mintingDayTimestamp, batches);
        
        if (result.canExec && result.transactions) {
            console.log(`Farcaster worker generated ${result.transactions.length} transactions`);
        } else {
            console.log(`Farcaster worker result: ${result.message || 'No transactions to execute'}`);
        }
    } catch (error: any) {
        console.error(`Error handling farcasterMintingProcessed event: ${error}`);
    }
}

/**
 * Main event processor entry point
 * 
 * Responsibilities:
 * 1. Validate input
 * 2. Fetch transaction receipt
 * 3. Verify contract address
 * 4. Extract events
 * 5. Route events to handlers
 */
export async function processEvent(
    chain: string,
    transactionId: string
): Promise<void> {
    console.log(`Processing event for chain: ${chain}, tx: ${transactionId}`);

    // 1. Validate chain and get allowed contracts
    const allowedContracts = getContractAddresses(chain);
    if (allowedContracts.length === 0) {
        console.error(`No contracts configured for chain: ${chain}`);
        return;
    }

    // 2. Fetch transaction receipt
    const receipt = await fetchTransactionReceipt(chain, transactionId);
    if (!receipt) {
        console.error(`Failed to fetch transaction receipt for ${transactionId}`);
        return;
    }

    // 3. Verify transaction status
    if (receipt.status !== undefined && receipt.status !== 1n) {
        console.error(`Transaction ${transactionId} failed (status: ${receipt.status})`);
        return;
    }

    // 4. Verify contract address (check if transaction is to one of our contracts)
    const toAddress = receipt.to?.toLowerCase();
    if (!toAddress) {
        console.error(`Transaction ${transactionId} is not a contract call (no 'to' address)`);
        return;
    }

    const isOurContract = allowedContracts.some(
        addr => addr.toLowerCase() === toAddress
    );

    if (!isOurContract) {
        console.log(`Transaction ${transactionId} is not to one of our contracts. Ignoring.`);
        return;
    }

    console.log(`Transaction ${transactionId} verified - from our contract ${toAddress}`);

    // 5. Extract events from logs
    const events = extractEvents(receipt.logs, allowedContracts);
    console.log(`Found ${events.length} events from our contracts`);

    if (events.length === 0) {
        console.log(`No relevant events found in transaction ${transactionId}`);
        return;
    }

    // 6. Route events to handlers
    for (const event of events) {
        const handler = EVENT_HANDLERS[event.eventName];
        if (handler) {
            console.log(`Dispatching event ${event.eventName} to handler`);
            try {
                await handler(event, chain, receipt.from);
            } catch (error: any) {
                console.error(`Error handling event ${event.eventName}: ${error}`);
            }
        } else {
            console.log(`No handler found for event ${event.eventName}. Ignoring.`);
        }
    }
}

