import {
    initConfig,
    getContractAddresses,
    getContractAddress,
    getEventSignature,
    getAllEventSignatures,
} from '../../src/utils/config';

describe('Config Utilities', () => {
    beforeEach(() => {
        // Reset config cache by reinitializing
        initConfig({
            contracts: {
                'Base Mainnet': [],
                'WorldChain': [],
                'Monad': [],
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
                    'Monad': [],
                },
                eventSignatures: {
                    'VerifyFarcasterRequested': '0x123',
                    'VerifyTwitterByAuthCodeRequested': '0x456',
                },
            };

            initConfig(config);

            expect(getContractAddresses('Base Mainnet')).toEqual(['0xContract1']);
            expect(getEventSignature('VerifyFarcasterRequested')).toBe('0x123');
        });
    });

    describe('getContractAddresses', () => {
        it('should return contract addresses for chain', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': ['0xContract1', '0xContract2'],
                    'WorldChain': [],
                    'Monad': [],
                },
                eventSignatures: {},
            });

            const addresses = getContractAddresses('Base Mainnet');
            expect(addresses).toEqual(['0xContract1', '0xContract2']);
        });

        it('should return empty array for unconfigured chain', () => {
            const addresses = getContractAddresses('UnknownChain');
            expect(addresses).toEqual([]);
        });
    });

    describe('getContractAddress', () => {
        it('should return first contract address', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': ['0xContract1', '0xContract2'],
                    'WorldChain': [],
                    'Monad': [],
                },
                eventSignatures: {},
            });

            const address = getContractAddress('Base Mainnet');
            expect(address).toBe('0xContract1');
        });

        it('should return null if no contracts configured', () => {
            const address = getContractAddress('WorldChain');
            expect(address).toBeNull();
        });
    });

    describe('getEventSignature', () => {
        it('should return event signature hash', () => {
            initConfig({
                contracts: {
                    'Base Mainnet': [],
                    'WorldChain': [],
                    'Monad': [],
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
                    'Monad': [],
                },
                eventSignatures: signatures,
            });

            const all = getAllEventSignatures();
            expect(all).toEqual(signatures);
        });
    });
});

