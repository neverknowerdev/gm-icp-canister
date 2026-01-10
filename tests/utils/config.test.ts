import {
    initContracts,
    getContractAddresses,
    getContracts,
    getEventSignature,
    getAllEventSignatures,
} from '../../src/gm-account-manager-canister/evmContracts/config';
import { CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';

// Mock eventDecoder to provide consistent signatures for testing
jest.mock('../../src/gm-account-manager-canister/evmContracts/eventDecoder', () => ({
    getEventSignature: jest.fn((eventName: string) => {
        const signatures: Record<string, string> = {
            'VerifyFarcasterRequested': '0xabc123',
            'VerifyTwitterByAuthCodeRequested': '0xdef456',
            'UserCreated': '0x111111',
            'UserRemoved': '0x222222',
            'SocialAccountLinked': '0x333333',
            'PrimaryWalletUpdated': '0x444444',
            'WalletLinked': '0x555555',
            'HumanVerificationUpdated': '0x666666',
        };
        return signatures[eventName] || null;
    }),
}));

describe('Config Utilities', () => {
    beforeEach(() => {
        // Reset config by reinitializing with empty contracts
        initContracts({
            contracts: {
                'Base Mainnet': { accountManager: '', GMCoin: '' },
                'WorldChain': { accountManager: '', GMCoin: '' },
            },
        });
    });

    describe('initContracts', () => {
        it('should initialize contract addresses', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '0xAccountManager1', GMCoin: '0xGMCoin1' },
                    'WorldChain': { accountManager: '0xAccountManager2', GMCoin: '0xGMCoin2' },
                },
            });

            expect(getContractAddresses(CHAIN_BASE_MAINNET)).toEqual(['0xAccountManager1', '0xGMCoin1']);
            expect(getContractAddresses(CHAIN_WORLDCHAIN)).toEqual(['0xAccountManager2', '0xGMCoin2']);
        });

        it('should auto-generate event signatures from ABI', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '', GMCoin: '' },
                },
            });

            // Signatures should come from mocked eventDecoder
            expect(getEventSignature('VerifyFarcasterRequested')).toBe('0xabc123');
            expect(getEventSignature('UserCreated')).toBe('0x111111');
        });
    });

    describe('getContracts', () => {
        it('should return contract struct for chain', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '0xAccountManager', GMCoin: '0xGMCoin' },
                    'WorldChain': { accountManager: '', GMCoin: '' },
                },
            });

            const contracts = getContracts(CHAIN_BASE_MAINNET);
            expect(contracts).toEqual({ accountManager: '0xAccountManager', GMCoin: '0xGMCoin' });
        });

        it('should return null for unconfigured chain', () => {
            const contracts = getContracts(9999); // Unknown chain ID
            expect(contracts).toBeNull();
        });
    });

    describe('getContractAddresses', () => {
        it('should return all contract addresses for chain as array', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '0xAccountManager', GMCoin: '0xGMCoin' },
                    'WorldChain': { accountManager: '', GMCoin: '' },
                },
            });

            const addresses = getContractAddresses(CHAIN_BASE_MAINNET);
            expect(addresses).toEqual(['0xAccountManager', '0xGMCoin']);
        });

        it('should filter out empty addresses', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '0xAccountManager', GMCoin: '' },
                    'WorldChain': { accountManager: '', GMCoin: '' },
                },
            });

            const addresses = getContractAddresses(CHAIN_BASE_MAINNET);
            expect(addresses).toEqual(['0xAccountManager']);
        });

        it('should return empty array for unconfigured chain', () => {
            const addresses = getContractAddresses(9999); // Unknown chain ID
            expect(addresses).toEqual([]);
        });
    });

    describe('getEventSignature', () => {
        it('should return auto-generated event signature from ABI', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '', GMCoin: '' },
                },
            });

            const signature = getEventSignature('VerifyFarcasterRequested');
            expect(signature).toBe('0xabc123');
        });

        it('should return null for unknown event', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '', GMCoin: '' },
                },
            });

            const signature = getEventSignature('UnknownEvent');
            expect(signature).toBeNull();
        });
    });

    describe('getAllEventSignatures', () => {
        it('should return all auto-generated event signatures', () => {
            initContracts({
                contracts: {
                    'Base Mainnet': { accountManager: '', GMCoin: '' },
                },
            });

            const all = getAllEventSignatures();
            expect(all['VerifyFarcasterRequested']).toBe('0xabc123');
            expect(all['UserCreated']).toBe('0x111111');
            expect(Object.keys(all).length).toBeGreaterThan(0);
        });
    });
});
