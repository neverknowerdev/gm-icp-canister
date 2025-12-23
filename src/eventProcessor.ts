import { TransactionReceipt, ParsedEvent } from './utils/types';
import { fetchTransactionReceipt } from './utils/evmRpc';
import { extractEvents } from './utils/eventParser';
import { verifyTwitter } from './events/verifyTwitter';
import { verifyFarcaster } from './events/verifyFarcaster';
import { getContractAddresses } from './utils/config';

// Event handler registry
const EVENT_HANDLERS: Record<string, (event: ParsedEvent, chain: string, transactionFrom: string) => Promise<void>> = {
    'VerifyTwitterByAuthCodeRequested': verifyTwitter,
    'VerifyFarcasterRequested': verifyFarcaster,
};

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

