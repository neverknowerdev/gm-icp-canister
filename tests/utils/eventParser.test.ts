import { parseEvent, extractEvents } from '../../src/utils/eventParser';
import { LogEntry } from '../../src/utils/types';
import { getAllEventSignatures } from '../../src/utils/config';

// Mock config
jest.mock('../../src/utils/config', () => ({
    getAllEventSignatures: jest.fn(() => ({
        'VerifyFarcasterRequested': '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'VerifyTwitterByAuthCodeRequested': '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })),
}));

describe('Event Parser', () => {
    describe('parseEvent', () => {
        it('should parse event with matching signature', () => {
            const log: LogEntry = {
                address: '0xContractAddress',
                topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // VerifyFarcasterRequested signature
                    '0x0000000000000000000000000000000000000000000000000000000000000064', // topic1 (100)
                ],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            };

            const event = parseEvent(log, '0xContractAddress');

            expect(event).not.toBeNull();
            expect(event?.eventName).toBe('VerifyFarcasterRequested');
            expect(event?.contractAddress).toBe('0xContractAddress');
            expect(event?.args.topic1).toBe('0x0000000000000000000000000000000000000000000000000000000000000064');
        });

        it('should return null for unknown event signature', () => {
            const log: LogEntry = {
                address: '0xContractAddress',
                topics: ['0xunknownsignature'],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            };

            const event = parseEvent(log, '0xContractAddress');
            expect(event).toBeNull();
        });

        it('should return null for log without topics', () => {
            const log: LogEntry = {
                address: '0xContractAddress',
                topics: [],
                data: '0x',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 0n,
                removed: false,
            };

            const event = parseEvent(log, '0xContractAddress');
            expect(event).toBeNull();
        });

        it('should extract all topics and data', () => {
            const log: LogEntry = {
                address: '0xContractAddress',
                topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    '0xtopic1',
                    '0xtopic2',
                    '0xtopic3',
                ],
                data: '0x1234',
                blockNumber: 1000n,
                transactionHash: '0xtxhash',
                logIndex: 5n,
                removed: false,
            };

            const event = parseEvent(log, '0xContractAddress');

            expect(event).not.toBeNull();
            expect(event?.args.topic1).toBe('0xtopic1');
            expect(event?.args.topic2).toBe('0xtopic2');
            expect(event?.args.topic3).toBe('0xtopic3');
            expect(event?.args.data).toBe('0x1234');
            expect(event?.logIndex).toBe(5n);
        });
    });

    describe('extractEvents', () => {
        it('should extract events from allowed contracts only', () => {
            const allowedContracts = ['0xContract1', '0xContract2'];

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

            expect(events).toHaveLength(1);
            expect(events[0].contractAddress.toLowerCase()).toBe('0xcontract1');
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

            const events = extractEvents(logs, allowedContracts);
            expect(events).toHaveLength(1);
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
    });
});



