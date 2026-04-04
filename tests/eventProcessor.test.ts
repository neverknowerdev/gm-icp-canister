import { processEvent } from '../src/gm-account-manager-canister/eventProcessor';
import * as evmRpc from '../src/gm-account-manager-canister/evmContracts/evmRpc';
import * as eventDecoder from '../src/gm-account-manager-canister/evmContracts/eventDecoder';
import * as config from '../src/gm-account-manager-canister/evmContracts/config';
import { TransactionReceipt, ParsedEvent, CHAIN_BASE_MAINNET } from '../src/gm-account-manager-canister/utils/types';
import * as verifyTwitter from '../src/gm-account-manager-canister/verification/verifyTwitter';
import * as verifyFarcaster from '../src/gm-account-manager-canister/verification/verifyFarcaster';
import * as transactionTracker from '../src/gm-account-manager-canister/storage/transactionTracker';
import * as userEvents from '../src/gm-account-manager-canister/userEvents';

// Mock dependencies
jest.mock('../src/gm-account-manager-canister/evmContracts/evmRpc');
jest.mock('../src/gm-account-manager-canister/evmContracts/eventDecoder');
jest.mock('../src/gm-account-manager-canister/evmContracts/config');
jest.mock('../src/gm-account-manager-canister/verification/verifyTwitter');
jest.mock('../src/gm-account-manager-canister/verification/verifyFarcaster');
jest.mock('../src/gm-account-manager-canister/storage/transactionTracker');
jest.mock('../src/gm-account-manager-canister/userEvents');

describe('Event Processor', () => {
    const mockReceipt: TransactionReceipt = {
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
        blockHash: '0xblockhash',
        from: '0xfrom',
        to: '0xContract',
        status: 1n,
        logs: [],
        type: '0x2',
        transactionIndex: 0n,
        effectiveGasPrice: 1000000000n,
        logsBloom: '0x',
        gasUsed: 100000n,
        cumulativeGasUsed: 100000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock transaction tracker - transactions are not processed by default
        (transactionTracker.isTransactionProcessed as jest.Mock).mockReturnValue(false);
        (transactionTracker.markTransactionProcessed as jest.Mock).mockImplementation(() => { });
    });

    it('should process event successfully', async () => {
        const mockEvents: ParsedEvent[] = [
            {
                eventName: 'VerifyTwitterByAuthCodeRequested',
                contractAddress: '0xContract',
                args: { topic1: '0x64' },
                logIndex: 0n,
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
            },
        ];

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash');
        expect(eventDecoder.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
        expect(transactionTracker.markTransactionProcessed).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash', 1000);
    });

    it('should return early if no contracts configured', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue([]);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should return early if transaction receipt not found', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(null);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).not.toHaveBeenCalled();
    });

    it('should return early if transaction failed', async () => {
        const failedReceipt = { ...mockReceipt, status: 0n };

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(failedReceipt);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).not.toHaveBeenCalled();
    });

    it('should ignore transactions not to our contracts', async () => {
        const receipt = { ...mockReceipt, to: '0xOtherContract' };

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receipt);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive contract address matching', async () => {
        const receipt = { ...mockReceipt, to: '0xCONTRACT' }; // Different case

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
    });

    it('should return early if no events found', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
        expect(transactionTracker.markTransactionProcessed).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash', 1000);
    });

    it('should ignore events without handlers', async () => {
        const mockEvents: ParsedEvent[] = [
            {
                eventName: 'UnknownEvent',
                contractAddress: '0xContract',
                args: {},
                logIndex: 0n,
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
            },
        ];

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        // Should complete without errors
        expect(eventDecoder.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
    });

    it('should handle handler errors gracefully', async () => {
        const mockEvents: ParsedEvent[] = [
            {
                eventName: 'VerifyTwitterByAuthCodeRequested',
                contractAddress: '0xContract',
                args: { topic1: '0x64' },
                logIndex: 0n,
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
            },
        ];

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        // Mock handler to throw error
        jest.spyOn(require('../src/gm-account-manager-canister/verification/verifyTwitter'), 'verifyTwitter').mockRejectedValue(
            new Error('Handler error')
        );

        // Should not throw, just log error
        await expect(processEvent(CHAIN_BASE_MAINNET, '0xtxhash')).resolves.not.toThrow();
    });

    it('should handle transaction with undefined status', async () => {
        const receiptWithoutStatus: TransactionReceipt = {
            ...mockReceipt,
            status: undefined as any
        };

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receiptWithoutStatus);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
    });

    it('should handle multiple events in one transaction', async () => {
        const mockEvents: ParsedEvent[] = [
            {
                eventName: 'VerifyTwitterByAuthCodeRequested',
                contractAddress: '0xContract',
                args: { topic1: '0x64' },
                logIndex: 0n,
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
            },
            {
                eventName: 'VerifyFarcasterRequested',
                contractAddress: '0xContract',
                args: { topic1: '0xc8' },
                logIndex: 1n,
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
            },
        ];

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue(mockEvents);
        (verifyTwitter.verifyTwitter as jest.Mock).mockResolvedValue(undefined);
        (verifyFarcaster.verifyFarcaster as jest.Mock).mockResolvedValue(undefined);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(verifyTwitter.verifyTwitter).toHaveBeenCalledWith(
            mockEvents[0],
            CHAIN_BASE_MAINNET,
            '0xfrom'
        );
        expect(verifyFarcaster.verifyFarcaster).toHaveBeenCalledWith(
            mockEvents[1],
            CHAIN_BASE_MAINNET,
            '0xfrom'
        );
    });

    it('should handle transaction with missing to address', async () => {
        const receiptWithoutTo = { ...mockReceipt };
        delete receiptWithoutTo.to;

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receiptWithoutTo);

        await processEvent(CHAIN_BASE_MAINNET, '0xtxhash');

        expect(eventDecoder.extractEvents).not.toHaveBeenCalled();
    });
});

