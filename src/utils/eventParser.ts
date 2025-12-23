import { ParsedEvent, LogEntry } from './types';
import { getAllEventSignatures } from './config';

/**
 * Parses an event log to extract event name and arguments
 * The first topic is the event signature hash
 */
export function parseEvent(log: LogEntry, contractAddress: string): ParsedEvent | null {
    if (log.topics.length === 0) {
        return null;
    }

    const eventSignatureHash = log.topics[0];
    
    // Find event name by signature hash
    const eventSignatures = getAllEventSignatures();
    let eventName: string | null = null;
    for (const [name, hash] of Object.entries(eventSignatures)) {
        if (hash && hash.toLowerCase() === eventSignatureHash.toLowerCase()) {
            eventName = name;
            break;
        }
    }

    if (!eventName) {
        // Unknown event, skip it
        return null;
    }

    // Parse event arguments from topics and data
    // Topics 1+ are indexed parameters, data contains non-indexed parameters
    const args: Record<string, any> = {};
    
    // TODO: Implement proper ABI decoding based on event signature
    // For now, we'll extract basic info
    if (log.topics.length > 1) {
        args['topic1'] = log.topics[1];
    }
    if (log.topics.length > 2) {
        args['topic2'] = log.topics[2];
    }
    if (log.topics.length > 3) {
        args['topic3'] = log.topics[3];
    }
    if (log.data && log.data !== '0x') {
        args['data'] = log.data;
    }

    return {
        eventName,
        contractAddress,
        args,
        logIndex: log.logIndex || 0n,
        transactionHash: log.transactionHash || '',
        blockNumber: log.blockNumber || 0n,
    };
}

/**
 * Extracts all events from transaction logs
 */
export function extractEvents(
    logs: LogEntry[],
    allowedContracts: string[]
): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    for (const log of logs) {
        // Check if log is from one of our contracts
        const contractAddress = log.address.toLowerCase();
        const isOurContract = allowedContracts.some(
            addr => addr.toLowerCase() === contractAddress
        );

        if (!isOurContract) {
            continue;
        }

        const event = parseEvent(log, contractAddress);
        if (event) {
            events.push(event);
        }
    }

    return events;
}

