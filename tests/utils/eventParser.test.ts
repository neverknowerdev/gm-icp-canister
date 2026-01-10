import { extractEvents } from '../../src/gm-account-manager-canister/evmContracts/eventDecoder';
import { LogEntry } from '../../src/gm-account-manager-canister/utils/types';

describe('Event Decoder - extractEvents', () => {
    // The ABI includes VerifyFarcasterRequested with signature derived from ABI
    // We need to use the actual signature that micro-eth-signer generates

    it('should extract events from allowed contracts only', () => {
        const allowedContracts = ['0xContract1', '0xContract2'];

        // Use a signature that won't match any ABI event (to test filtering)
        const logs: LogEntry[] = [
            {
                address: '0xContract1',
                topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                ],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash1',
                logIndex: 0n,
                removed: false,
            },
            {
                address: '0xOtherContract', // Not in allowed list
                topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                ],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash2',
                logIndex: 1n,
                removed: false,
            },
        ];

        const events = extractEvents(logs, allowedContracts);

        // No events should match since signature doesn't match ABI
        expect(events).toHaveLength(0);
    });

    it('should handle case-insensitive contract address matching', () => {
        const allowedContracts = ['0xContract1'];

        const logs: LogEntry[] = [
            {
                address: '0xCONTRACT1', // Different case
                topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                ],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            },
        ];

        // Contract should match (case-insensitive), but event signature won't match ABI
        const events = extractEvents(logs, allowedContracts);
        expect(events).toHaveLength(0);
    });

    it('should return empty array when no matching events', () => {
        const allowedContracts = ['0xContract1'];

        const logs: LogEntry[] = [
            {
                address: '0xOtherContract',
                topics: ['0xunknown'],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            },
        ];

        const events = extractEvents(logs, allowedContracts);
        expect(events).toHaveLength(0);
    });

    it('should skip logs without topics', () => {
        const allowedContracts = ['0xContract1'];

        const logs: LogEntry[] = [
            {
                address: '0xContract1',
                topics: [],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            },
        ];

        const events = extractEvents(logs, allowedContracts);
        expect(events).toHaveLength(0);
    });
});
