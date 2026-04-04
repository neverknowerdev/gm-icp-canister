import { fetchTransactionReceipt } from '../../src/gm-account-manager-canister/evmContracts/evmRpc';
import { CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';
import * as azle from 'azle';

// Mock azle
jest.mock('azle', () => ({
    call: jest.fn(),
    Principal: {
        fromText: jest.fn((text: string) => ({ _azlePrincipal: text })),
    },
    IDL: {
        Text: 'IDL.Text',
        Nat: 'IDL.Nat',
        Variant: jest.fn((fields: any) => fields),
        Record: jest.fn((fields: any) => fields),
        Opt: jest.fn((t: any) => t),
        Vec: jest.fn((t: any) => t),
    },
}));

describe('EVM RPC Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchTransactionReceipt', () => {
        const mockReceipt = {
            to: ['0xContract'],
            status: [1n],
            root: [],
            transactionHash: '0xtxhash',
            blockNumber: 1000n,
            from: '0xfrom',
            logs: [],
            blockHash: '0xblockhash',
            type: '0x2',
            transactionIndex: 0n,
            effectiveGasPrice: 1000000000n,
            logsBloom: '0x',
            contractAddress: [],
            gasUsed: 100000n,
            cumulativeGasUsed: 100000n,
        };

        it('should fetch transaction receipt successfully for Base Mainnet', async () => {
            const mockResult = {
                Consistent: {
                    Ok: [mockReceipt],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).not.toBeNull();
            expect(result?.transactionHash).toBe('0xtxhash');
            expect(result?.from).toBe('0xfrom');
            expect(azle.call).toHaveBeenCalled();
        });

        it('should fetch transaction receipt successfully for WorldChain', async () => {
            const mockResult = {
                Consistent: {
                    Ok: [mockReceipt],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_WORLDCHAIN, '0xtxhash');

            expect(result).not.toBeNull();
            expect(result?.transactionHash).toBe('0xtxhash');
        });

        it('should return null when transaction receipt not found', async () => {
            const mockResult = {
                Consistent: {
                    Ok: [null],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).toBeNull();
        });

        it('should return null when transaction receipt is empty', async () => {
            const mockResult = {
                Consistent: {
                    Ok: [],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).toBeNull();
        });

        it('should handle RPC errors', async () => {
            const mockResult = {
                Consistent: {
                    Err: {
                        JsonRpcError: {
                            code: -32000n,
                            message: 'Transaction not found',
                        },
                    },
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).toBeNull();
        });

        it('should handle inconsistent responses', async () => {
            const mockResult = {
                Inconsistent: [
                    {
                        '_0_': { BaseMainnet: null },
                        '_1_': {
                            Ok: [mockReceipt],
                        },
                    },
                ],
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).not.toBeNull();
            expect(result?.transactionHash).toBe('0xtxhash');
        });

        it('should return null when no inconsistent responses available', async () => {
            const mockResult = {
                Inconsistent: [],
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).toBeNull();
        });

        it('should handle call errors', async () => {
            (azle.call as jest.Mock).mockRejectedValue(new Error('Network error'));

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).toBeNull();
        });

        it('should throw error for unsupported chain', async () => {
            await expect(
                fetchTransactionReceipt('UnsupportedChain' as any, '0xtxhash')
            ).rejects.toThrow('Unsupported chain ID: UnsupportedChain');
        });

        it('should parse logs correctly', async () => {
            const receiptWithLogs = {
                ...mockReceipt,
                logs: [
                    {
                        transactionHash: ['0xtxhash'],
                        blockNumber: [1000n],
                        data: '0xdata',
                        blockHash: ['0xblockhash'],
                        transactionIndex: [0n],
                        topics: ['0xtopic1', '0xtopic2'],
                        address: '0xContract',
                        logIndex: [0n],
                        removed: false,
                    },
                ],
            };

            const mockResult = {
                Consistent: {
                    Ok: [receiptWithLogs],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).not.toBeNull();
            expect(result?.logs).toHaveLength(1);
            expect(result?.logs[0].address).toBe('0xContract');
            expect(result?.logs[0].topics).toEqual(['0xtopic1', '0xtopic2']);
            expect(result?.logs[0].data).toBe('0xdata');
        });

        it('should handle optional fields correctly', async () => {
            const receiptMinimal = {
                to: [],
                status: [],
                root: [],
                transactionHash: '0xtxhash',
                blockNumber: 1000n,
                from: '0xfrom',
                logs: [],
                blockHash: '0xblockhash',
                type: '0x2',
                transactionIndex: 0n,
                effectiveGasPrice: 1000000000n,
                logsBloom: '0x',
                contractAddress: [],
                gasUsed: 100000n,
                cumulativeGasUsed: 100000n,
            };

            const mockResult = {
                Consistent: {
                    Ok: [receiptMinimal],
                },
            };

            (azle.call as jest.Mock).mockResolvedValue(mockResult);

            const result = await fetchTransactionReceipt(CHAIN_BASE_MAINNET, '0xtxhash');

            expect(result).not.toBeNull();
            expect(result?.to).toBeUndefined();
            expect(result?.status).toBeUndefined();
            expect(result?.contractAddress).toBeUndefined();
        });
    });
});

