/**
 * Event Decoder for AccountManager contract events
 * Uses micro-eth-signer for ABI-based event decoding
 */

import { events } from 'micro-eth-signer/advanced/abi.js';
import AccountManagerABI from './abi/accountManagement.json';
import { ParsedEvent, LogEntry } from '../utils/types';

/**
 * Event decoders created from ABI
 */
const eventDecoders = events(AccountManagerABI as any);

/**
 * Build signature → event name map from ABI
 */
function buildSignatureMap(): Map<string, string> {
    const map = new Map<string, string>();
    const decoders = eventDecoders as Record<string, { signature?: string }>;
    for (const [name, decoder] of Object.entries(decoders)) {
        if (decoder?.signature) {
            map.set(decoder.signature.toLowerCase(), name);
        }
    }
    return map;
}

const signatureToName = buildSignatureMap();

/**
 * Decoded event result
 */
export interface DecodedEvent {
    name: string;
    args: Record<string, any>;
}

/**
 * Decode an event log using the contract ABI
 */
export function decodeEvent(
    eventName: string,
    topics: string[],
    data: string
): DecodedEvent | null {
    try {
        const decoder = (eventDecoders as any)[eventName];
        if (!decoder) {
            return null;
        }
        const decoded = decoder.decode(topics, data);
        return { name: eventName, args: decoded };
    } catch (error: any) {
        console.error(`Error decoding event ${eventName}: ${error.message}`);
        return null;
    }
}

/**
 * Get event signature hash for a given event name
 */
export function getEventSignature(eventName: string): string | null {
    const decoder = (eventDecoders as any)[eventName];
    return decoder?.signature || null;
}

/**
 * Get event name from signature hash
 */
export function getEventName(signatureHash: string): string | null {
    return signatureToName.get(signatureHash.toLowerCase()) || null;
}

/**
 * Extract and decode events from transaction logs
 * Filters by contract address and decodes using ABI
 */
export function extractEvents(
    logs: LogEntry[],
    allowedContracts: string[]
): ParsedEvent[] {
    const events: ParsedEvent[] = [];
    const normalizedContracts = allowedContracts.map(a => a.toLowerCase());

    for (const log of logs) {
        // Filter by contract address
        const contractAddress = log.address.toLowerCase();
        if (!normalizedContracts.includes(contractAddress)) {
            continue;
        }

        // Need at least one topic (event signature)
        if (log.topics.length === 0) {
            continue;
        }

        // Look up event name by signature
        const eventName = getEventName(log.topics[0]);
        if (!eventName) {
            continue;
        }

        // Decode event using ABI
        const data = log.data || '0x';
        const decoded = decodeEvent(eventName, log.topics, data);

        // Build args with decoded values + raw topics for compatibility
        const args: Record<string, any> = decoded?.args || {};
        args.topic0 = log.topics[0];
        if (log.topics.length > 1) args.topic1 = log.topics[1];
        if (log.topics.length > 2) args.topic2 = log.topics[2];
        if (log.topics.length > 3) args.topic3 = log.topics[3];
        args.data = data;

        // Alias authToken as authCode for compatibility
        if (args.authToken && !args.authCode) {
            args.authCode = args.authToken;
        }

        events.push({
            eventName,
            contractAddress,
            args,
            logIndex: log.logIndex || 0n,
            transactionHash: log.transactionHash || '',
            blockNumber: log.blockNumber || 0n,
        });
    }

    return events;
}
