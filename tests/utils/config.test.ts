import {
    initConfig,
    getContractAddresses,
    getContractAddress,
    getEventSignature,
    getAllEventSignatures,
} from '../../src/gm-account-manager-canister/utils/config';
import { CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';

describe('Config Utilities', () => {
    beforeEach(() => {
        // Reset config cache by reinitializing
        initConfig({
            contracts: {
                'Base Mainnet': [],
                'WorldChain': [],
            },
            eventSignatures: {},
        });
    });

    describe('initConfig', () => {
        it('should initialize configuration', () => {
            const config = {
                contracts: {
                    'Base Mainnet': ['0xContract1'],
                    'WorldChain': ['0xContract2'],
                },
                eventSignatures: {
                    'VerifyFarcasterRequested': '0x123',
                    'VerifyTwitterByAuthCodeRequested': '0x456',
                },
            };

            initConfig(config);

            expect(getContractAddresses(CHAIN_BASE_MAINNET)).toEqual(['0xContract1']);
            expect(getEventSignature('VerifyFarcasterRequested')).toBe('0x123');
        });
    });

    describe('getContractAddresses', () => {
        it('should return contract addresses for chain', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': ['0xContract1', '0xContract2'],
                    'WorldChain': [],
                },
                eventSignatures: {},
            });

            const addresses = getContractAddresses(CHAIN_BASE_MAINNET);
            expect(addresses).toEqual(['0xContract1', '0xContract2']);
        });

        it('should return empty array for unconfigured chain', () => {
            const addresses = getContractAddresses(9999); // Unknown chain ID
            expect(addresses).toEqual([]);
        });
    });

    describe('getContractAddress', () => {
        it('should return first contract address', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': ['0xContract1', '0xContract2'],
                    'WorldChain': [],
                },
                eventSignatures: {},
            });

            const address = getContractAddress(CHAIN_BASE_MAINNET);
            expect(address).toBe('0xContract1');
        });

        it('should return null if no contracts configured', () => {
            const address = getContractAddress(CHAIN_WORLDCHAIN);
            expect(address).toBeNull();
        });
    });

    describe('getEventSignature', () => {
        it('should return event signature hash', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': [],
                    'WorldChain': [],
                },
                eventSignatures: {
                    'VerifyFarcasterRequested': '0x123456',
                },
            });

            const signature = getEventSignature('VerifyFarcasterRequested');
            expect(signature).toBe('0x123456');
        });

        it('should return null for unknown event', () => {
            const signature = getEventSignature('UnknownEvent');
            expect(signature).toBeNull();
        });
    });

    describe('getAllEventSignatures', () => {
        it('should return all event signatures', () => {
            const signatures = {
                'VerifyFarcasterRequested': '0x123',
                'VerifyTwitterByAuthCodeRequested': '0x456',
            };

            initConfig({
                contracts: {
                    'Base Mainnet': [],
                    'WorldChain': [],
                },
                eventSignatures: signatures,
            });

            const all = getAllEventSignatures();
            expect(all).toEqual(signatures);
        });
    });
});




