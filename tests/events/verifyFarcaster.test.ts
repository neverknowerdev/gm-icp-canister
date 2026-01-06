import { verifyFarcaster } from '../../src/gm-account-manager-canister/events/verifyFarcaster';
import { ParsedEvent } from '../../src/gm-account-manager-canister/utils/types';
import * as userStore from '../../src/gm-account-manager-canister/userManagement/userStore';
import * as smartContract from '../../src/gm-account-manager-canister/utils/smartContract';
import * as config from '../../src/gm-account-manager-canister/utils/config';
import * as atomicCounter from '../../src/gm-account-manager-canister/storage/atomicCounter';
import * as evmRpc from '../../src/gm-account-manager-canister/utils/evmRpc';
import * as eventParser from '../../src/gm-account-manager-canister/utils/eventParser';
import * as userEvents from '../../src/gm-account-manager-canister/events/userEvents';

// Mock dependencies
jest.mock('../../src/gm-account-manager-canister/userManagement/userStore');
jest.mock('../../src/gm-account-manager-canister/utils/smartContract');
jest.mock('../../src/gm-account-manager-canister/utils/config');
jest.mock('../../src/gm-account-manager-canister/storage/atomicCounter');
jest.mock('../../src/gm-account-manager-canister/utils/evmRpc');
jest.mock('../../src/gm-account-manager-canister/utils/eventParser');
jest.mock('../../src/gm-account-manager-canister/events/userEvents');

describe('verifyFarcaster Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyFarcasterRequested',
        contractAddress: '0xContract',
        args: {
            topic1: '0x00000000000000000000000000000000000000000000000000000000000000c8', // 200
        },
        logIndex: 0n,
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (config.getContractAddress as jest.Mock).mockReturnValue('0xContract');
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (atomicCounter.generateNextUserId as jest.Mock).mockResolvedValue(1n);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue('0xtxhash123');
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue({
            status: 1n,
            logs: [],
        });
        (eventParser.extractEvents as jest.Mock).mockReturnValue([]);
    });

    it('should create new user when Farcaster ID is unique', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet',
            0n,
            200n,
            [{ wallet: '0xwallet', chain: 'Base Mainnet' }]
        );
        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith('Base Mainnet', '0xtxhash123');
        expect(eventParser.extractEvents).toHaveBeenCalled();
    });

    it('should add wallet to existing user when Farcaster ID exists', async () => {
        const existingUser = {
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xoldwallet',
            primaryChain: 'Base Mainnet',
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(existingUser);

        await verifyFarcaster(mockEvent, 'WorldChain', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'WorldChain',
            1n,
            '0xwallet',
            0n,
            200n,
            [{ wallet: '0xwallet', chain: 'WorldChain' }]
        );
    });

    it('should update Farcaster ID when wallet exists but no Farcaster ID', async () => {
        // In new architecture, we check Farcaster ID first, then wallet
        // If Farcaster ID doesn't exist, we generate new userId
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalled();
    });

    it('should handle invalid Farcaster ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: { topic1: '0x0000000000000000000000000000000000000000000000000000000000000000' }, // 0
        };

        await verifyFarcaster(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle missing topic1 in event args', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {},
        };

        await verifyFarcaster(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle failed wallet addition gracefully', async () => {
        // In new architecture, wallet addition happens via events from contract
        // This test checks that transaction failure is handled
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue(null);

        await verifyFarcaster(mockEvent, 'WorldChain', '0xWallet');

        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWALLET'); // Different case

        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet', // Should be lowercase
            0n,
            200n,
            [{ wallet: '0xwallet', chain: 'Base Mainnet' }]
        );
    });

    it('should handle missing contract address gracefully', async () => {
        (config.getContractAddress as jest.Mock).mockReturnValue(null);
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });
});
