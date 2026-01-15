/**
 * Event Decoder for AccountManager contract events
 * Uses micro-eth-signer for ABI-based event decoding
 */

import { events } from 'micro-eth-signer/advanced/abi.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import AccountManagerABI from './abi/accountManagement.json';
import { ParsedEvent, LogEntry } from '../utils/types';

/**
 * Event decoders created from ABI
 */
const eventDecoders = events(AccountManagerABI as any);

/**
 * Compute event signature hash from ABI
 */
function computeEventSignature(eventAbi: any): string {
    const params = eventAbi.inputs.map((input: any) => input.type).join(',');
    const signature = `${eventAbi.name}(${params})`;
    const hash = keccak_256(new TextEncoder().encode(signature));
    return '0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build signature → event name map from ABI
 */
function buildSignatureMap(): Map<string, string> {
    const map = new Map<string, string>();
    const abi = AccountManagerABI as any[];
    
    for (const item of abi) {
        if (item.type === 'event') {
            const signature = computeEventSignature(item);
            const sigLower = signature.toLowerCase();
            map.set(sigLower, item.name);
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
        return null;
    }
}

/**
 * Get event signature hash for a given event name
 */
export function getEventSignature(eventName: string): string | null {
    const abi = AccountManagerABI as any[];
    const eventAbi = abi.find(item => item.type === 'event' && item.name === eventName);
    if (!eventAbi) {
        return null;
    }
    return computeEventSignature(eventAbi);
}

/**
 * Get event name from signature hash
 */
export function getEventName(signatureHash: string): string | null {
    const sigLower = signatureHash.toLowerCase();
    const name = signatureToName.get(sigLower);
    if (!name) {
        // Debug: log what we're looking for and what's in the map
        console.log(`getEventName: Looking for signature ${sigLower}`);
        console.log(`getEventName: Map has ${signatureToName.size} entries`);
        for (const [sig, eventName] of signatureToName.entries()) {
            if (sig === sigLower) {
                return eventName;
            }
        }
    }
    return name || null;
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
    
    if (!Array.isArray(logs) || !Array.isArray(allowedContracts)) {
        return events;
    }
    
    const normalizedContracts = allowedContracts
        .filter(a => a && typeof a === 'string' && a.trim() !== '')
        .map(a => a.toLowerCase());

    for (const log of logs) {
        if (!log || typeof log !== 'object') {
            continue;
        }
        
        if (!log.address || typeof log.address !== 'string') {
            continue;
        }
        
        const contractAddress = log.address.toLowerCase();
        if (!normalizedContracts.includes(contractAddress)) {
            continue;
        }

        if (!log.topics || !Array.isArray(log.topics) || log.topics.length === 0) {
            continue;
        }

        const eventName = getEventName(log.topics[0]);
        if (!eventName) {
            continue;
        }

        const data = log.data || '0x';
        const decoded = decodeEvent(eventName, log.topics, data);
        if (!decoded) {
            continue;
        }

        const args: Record<string, any> = decoded.args || {};
        args.topic0 = log.topics[0];
        if (log.topics.length > 1) args.topic1 = log.topics[1];
        if (log.topics.length > 2) args.topic2 = log.topics[2];
        if (log.topics.length > 3) args.topic3 = log.topics[3];
        args.data = data;

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
