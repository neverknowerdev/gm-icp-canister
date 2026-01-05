import { processEvent } from '../src/gm-account-manager-canister/eventProcessor';
import * as evmRpc from '../src/gm-account-manager-canister/utils/evmRpc';
import * as eventParser from '../src/gm-account-manager-canister/utils/eventParser';
import * as config from '../src/gm-account-manager-canister/utils/config';
import { TransactionReceipt, ParsedEvent } from '../src/gm-account-manager-canister/utils/types';
import * as verifyTwitter from '../src/gm-account-manager-canister/events/verifyTwitter';
import * as verifyFarcaster from '../src/gm-account-manager-canister/events/verifyFarcaster';

// Mock dependencies
jest.mock('../src/gm-account-manager-canister/utils/evmRpc');
jest.mock('../src/gm-account-manager-canister/utils/eventParser');
jest.mock('../src/gm-account-manager-canister/utils/config');
jest.mock('../src/gm-account-manager-canister/events/verifyTwitter');
jest.mock('../src/gm-account-manager-canister/events/verifyFarcaster');

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
        (eventParser.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith('Base Mainnet', '0xtxhash');
        expect(eventParser.extractEvents).toHaveBeenCalledWith([], ['0xContract']);
    });

    it('should return early if no contracts configured', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue([]);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should return early if transaction receipt not found', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(null);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).not.toHaveBeenCalled();
    });

    it('should return early if transaction failed', async () => {
        const failedReceipt = { ...mockReceipt, status: 0n };

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(failedReceipt);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).not.toHaveBeenCalled();
    });

    it('should ignore transactions not to our contracts', async () => {
        const receipt = { ...mockReceipt, to: '0xOtherContract' };

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receipt);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive contract address matching', async () => {
        const receipt = { ...mockReceipt, to: '0xCONTRACT' }; // Different case

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receipt);
        (eventParser.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).toHaveBeenCalled();
    });

    it('should return early if no events found', async () => {
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(mockReceipt);
        (eventParser.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).toHaveBeenCalled();
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
        (eventParser.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        await processEvent('Base Mainnet', '0xtxhash');

        // Should complete without errors
        expect(eventParser.extractEvents).toHaveBeenCalled();
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
        (eventParser.extractEvents as jest.Mock).mockReturnValue(mockEvents);

        // Mock handler to throw error
        jest.spyOn(require('../src/gm-account-manager-canister/events/verifyTwitter'), 'verifyTwitter').mockRejectedValue(
            new Error('Handler error')
        );

        // Should not throw, just log error
        await expect(processEvent('Base Mainnet', '0xtxhash')).resolves.not.toThrow();
    });

    it('should handle transaction with undefined status', async () => {
        const receiptWithoutStatus = { ...mockReceipt };
        delete receiptWithoutStatus.status;

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receiptWithoutStatus);
        (eventParser.extractEvents as jest.Mock).mockReturnValue([]);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).toHaveBeenCalled();
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
        (eventParser.extractEvents as jest.Mock).mockReturnValue(mockEvents);
        (verifyTwitter.verifyTwitter as jest.Mock).mockResolvedValue(undefined);
        (verifyFarcaster.verifyFarcaster as jest.Mock).mockResolvedValue(undefined);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(verifyTwitter.verifyTwitter).toHaveBeenCalled();
        expect(verifyFarcaster.verifyFarcaster).toHaveBeenCalled();
    });

    it('should handle transaction with missing to address', async () => {
        const receiptWithoutTo = { ...mockReceipt };
        delete receiptWithoutTo.to;

        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue(receiptWithoutTo);

        await processEvent('Base Mainnet', '0xtxhash');

        expect(eventParser.extractEvents).not.toHaveBeenCalled();
    });
});

