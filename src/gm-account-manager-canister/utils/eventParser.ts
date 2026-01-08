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
    
    // Extract indexed parameters from topics
    if (log.topics.length > 1) {
        args['topic1'] = log.topics[1];
    }
    if (log.topics.length > 2) {
        args['topic2'] = log.topics[2];
    }
    if (log.topics.length > 3) {
        args['topic3'] = log.topics[3];
    }
    
    // Parse data field - handle both hex-encoded strings and other types
    if (log.data && log.data !== '0x') {
        args['data'] = log.data;
        
        // Try to extract string from data (ABI-encoded string)
        // String encoding: offset (32 bytes) + length (32 bytes) + data
        // For verification events, auth codes are likely in the data field
        try {
            const dataWithoutPrefix = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
            
            // If data starts with "0x" offset pointer, it might be a string
            // Check if first 64 chars (32 bytes) represent an offset of 0x20 (32)
            if (dataWithoutPrefix.length >= 128) {
                const offsetHex = dataWithoutPrefix.slice(0, 64);
                const offset = parseInt(offsetHex, 16);
                
                // If offset is 0x20 (32 bytes), next 64 chars are length
                if (offset === 32) {
                    const lengthHex = dataWithoutPrefix.slice(64, 128);
                    const length = parseInt(lengthHex, 16);
                    
                    if (length > 0 && length < 1000) { // Reasonable string length
                        const stringStart = 128; // Start after offset + length
                        const stringHex = dataWithoutPrefix.slice(stringStart, stringStart + length * 2);
                        const stringBytes = new Uint8Array(length);
                        for (let i = 0; i < length; i++) {
                            stringBytes[i] = parseInt(stringHex.slice(i * 2, i * 2 + 2), 16);
                        }
                        const decodedString = new TextDecoder().decode(stringBytes).replace(/\0/g, '');
                        if (decodedString.length > 0) {
                            args['authCode'] = decodedString;
                            args['authToken'] = decodedString; // Also available as authToken for Farcaster
                        }
                    }
                }
            }
        } catch (e) {
            // If string decoding fails, keep raw data
            console.log('Could not decode string from event data, using raw data');
        }
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

