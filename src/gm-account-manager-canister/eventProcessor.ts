import { TransactionReceipt, ParsedEvent, Chain, chainName, BLOCKS_PER_DAY, TRANSACTION_MAX_AGE_DAYS } from './utils/types';
import { fetchTransactionReceipt } from './utils/evmRpc';
import { extractEvents } from './utils/eventParser';
import { verifyTwitter } from './events/verifyTwitter';
import { verifyFarcaster } from './events/verifyFarcaster';
import { getContractAddresses } from './utils/config';
import {
    isTransactionProcessed,
    markTransactionProcessed,
    isTransactionInProcessing,
    markTransactionInProcessing,
    removeTransactionFromProcessing
} from './storage/transactionTracker';
import { processUserEvent } from './events/userEvents';
import { getLastProcessedBlock, updateLastProcessedBlock } from './storage/blockTracker';

// Event handler registry for verification request events
const VERIFICATION_EVENT_HANDLERS: Record<string, (event: ParsedEvent, chain: Chain, transactionFrom: string) => Promise<void>> = {
    'VerifyTwitterByAuthCodeRequested': verifyTwitter,
    'VerifyFarcasterRequested': verifyFarcaster,
};

// Event handler registry for user events from smart contract
const USER_EVENT_NAMES = [
    'UserCreated',
    'UserRemoved',
    'SocialAccountLinked',
    'PrimaryWalletUpdated',
    'WalletLinked',
    'HumanVerificationUpdated',
];

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
    chain: Chain,
    transactionId: string
): Promise<void> {
    const chainNameStr = chainName(chain);
    console.log(`Processing event for chain: ${chainNameStr} (${chain}), tx: ${transactionId}`);

    // 0. Check if transaction already processed (prevent duplicates)
    if (isTransactionProcessed(chain, transactionId)) {
        console.log(`Transaction ${transactionId} already processed on ${chainNameStr}, skipping`);
        return;
    }

    // 0.5. Check if transaction is currently being processed (prevent concurrent processing)
    if (isTransactionInProcessing(chain, transactionId)) {
        console.log(`Transaction ${transactionId} is already being processed on ${chainNameStr}, skipping`);
        return;
    }

    // Mark transaction as in processing
    markTransactionInProcessing(chain, transactionId);

    try {
        // 1. Validate chain and get allowed contracts
        const allowedContracts = getContractAddresses(chain);
        if (allowedContracts.length === 0) {
            console.error(`No contracts configured for chain: ${chainNameStr} (${chain})`);
            return;
        }

        // 2. Fetch transaction receipt
        const receipt = await fetchTransactionReceipt(chain, transactionId);
        if (!receipt) {
            console.error(`Failed to fetch transaction receipt for ${transactionId}`);
            return;
        }

        // 2.5. Check if transaction is too old (older than 10 days by block number)
        const lastProcessedBlock = getLastProcessedBlock(chain);
        const transactionBlock = Number(receipt.blockNumber);
        const maxAgeInBlocks = BLOCKS_PER_DAY * TRANSACTION_MAX_AGE_DAYS;
        const blockAge = lastProcessedBlock - transactionBlock;

        if (blockAge > maxAgeInBlocks) {
            console.log(
                `Transaction ${transactionId} is too old (${blockAge} blocks, max: ${maxAgeInBlocks} blocks). ` +
                `Skipping processing. Block: ${transactionBlock}, Last processed: ${lastProcessedBlock}`
            );
            // Mark as processed to prevent re-checking
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
            // Mark as processed even if no events (prevents re-checking)
            markTransactionProcessed(chain, transactionId, Number(receipt.blockNumber));
            return;
        }

        // 6. Route events to handlers
        // Separate verification request events from user events
        for (const event of events) {
            if (VERIFICATION_EVENT_HANDLERS[event.eventName]) {
                // This is a verification request event (VerifyTwitterByAuthCodeRequested, VerifyFarcasterRequested)
                // These handlers will call createOrUpdateUser and process resulting events
                console.log(`Dispatching verification event ${event.eventName} to handler`);
                try {
                    await VERIFICATION_EVENT_HANDLERS[event.eventName](event, chain, receipt.from);
                } catch (error: any) {
                    console.error(`Error handling verification event ${event.eventName}: ${error}`);
                }
            } else if (USER_EVENT_NAMES.includes(event.eventName)) {
                // This is a user event (UserCreated, WalletLinked, etc.)
                // Process it directly to update memory
                console.log(`Processing user event ${event.eventName}`);
                try {
                    await processUserEvent(event, chain);
                } catch (error: any) {
                    console.error(`Error processing user event ${event.eventName}: ${error}`);
                }
            } else {
                console.log(`No handler found for event ${event.eventName}. Ignoring.`);
            }
        }

        // 7. Mark transaction as processed with block number
        const processedBlockNumber = Number(receipt.blockNumber);
        markTransactionProcessed(chain, transactionId, processedBlockNumber);

        // Update last processed block number (use the higher of current or transaction block)
        const currentLastBlock = getLastProcessedBlock(chain);
        if (processedBlockNumber > currentLastBlock) {
            updateLastProcessedBlock(chain, processedBlockNumber);
        }

        console.log(`Transaction ${transactionId} processing completed at block ${processedBlockNumber}`);
    } catch (error: any) {
        // Log error but don't re-throw (we want to clean up in-processing state)
        console.error(`Error processing transaction ${transactionId}: ${error}`);
        throw error;
    } finally {
        // Always remove from in-processing, even if there was an error or early return
        removeTransactionFromProcessing(chain, transactionId);
    }
}

