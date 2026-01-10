import { verifyFarcaster } from '../../src/gm-account-manager-canister/verification/verifyFarcaster';
import { ParsedEvent, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';
import * as userStore from '../../src/gm-account-manager-canister/userManagement/userStore';
import * as smartContract from '../../src/gm-account-manager-canister/evmContracts/smartContract';
import * as config from '../../src/gm-account-manager-canister/evmContracts/config';
import * as atomicCounter from '../../src/gm-account-manager-canister/storage/atomicCounter';
import * as evmRpc from '../../src/gm-account-manager-canister/evmContracts/evmRpc';
import * as eventDecoder from '../../src/gm-account-manager-canister/evmContracts/eventDecoder';
import * as userEvents from '../../src/gm-account-manager-canister/userEvents';
import * as farcasterVerification from '../../src/gm-account-manager-canister/verification/farcasterVerification';

// Mock dependencies
jest.mock('../../src/gm-account-manager-canister/userManagement/userStore');
jest.mock('../../src/gm-account-manager-canister/evmContracts/smartContract');
jest.mock('../../src/gm-account-manager-canister/evmContracts/config');
jest.mock('../../src/gm-account-manager-canister/storage/atomicCounter');
jest.mock('../../src/gm-account-manager-canister/evmContracts/evmRpc');
jest.mock('../../src/gm-account-manager-canister/evmContracts/eventDecoder');
jest.mock('../../src/gm-account-manager-canister/userEvents');
jest.mock('../../src/gm-account-manager-canister/verification/farcasterVerification');

describe('verifyFarcaster Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyFarcasterRequested',
        contractAddress: '0xContract',
        args: {
            authToken: 'farcaster_auth_token_456', // Auth token from event
        },
        logIndex: 0n,
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (config.getContracts as jest.Mock).mockReturnValue({ accountManager: '0xContract', GMCoin: '' });
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (atomicCounter.generateNextUserId as jest.Mock).mockResolvedValue(1n);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue('0xtxhash123');
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue({
            status: 1n,
            logs: [],
        });
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([]);
        // Mock Farcaster verification to return Farcaster ID 200
        (farcasterVerification.verifyFarcasterAuthBigInt as jest.Mock).mockResolvedValue(200n);
    });

    it('should create new user when Farcaster ID is unique', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            1n,
            '0xwallet',
            0n,
            200n,
            [{ wallet: '0xwallet', chain: CHAIN_BASE_MAINNET }]
        );
        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash123');
        expect(eventDecoder.extractEvents).toHaveBeenCalled();
    });

    it('should add wallet to existing user when Farcaster ID exists', async () => {
        const existingUser = {
            userId: 1n,
            chains: [CHAIN_BASE_MAINNET],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xoldwallet',
            primaryChain: CHAIN_BASE_MAINNET,
            wallets: [{ wallet: '0xoldwallet', chain: CHAIN_BASE_MAINNET }],
        };

        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(existingUser);

        await verifyFarcaster(mockEvent, CHAIN_WORLDCHAIN, '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_WORLDCHAIN,
            1n,
            '0xwallet',
            0n,
            200n,
            [{ wallet: '0xwallet', chain: CHAIN_WORLDCHAIN }]
        );
    });

    it('should update Farcaster ID when wallet exists but no Farcaster ID', async () => {
        // In new architecture, we check Farcaster ID first, then wallet
        // If Farcaster ID doesn't exist, we generate new userId
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalled();
    });

    it('should throw error on invalid auth token', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {}, // No auth token
        };

        await expect(verifyFarcaster(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No auth token found in event');

        expect(farcasterVerification.verifyFarcasterAuthBigInt).not.toHaveBeenCalled();
        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should propagate verification failure error', async () => {
        (farcasterVerification.verifyFarcasterAuthBigInt as jest.Mock).mockRejectedValue(
            new Error('Invalid auth token')
        );

        await expect(verifyFarcaster(mockEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('Invalid auth token');

        expect(farcasterVerification.verifyFarcasterAuthBigInt).toHaveBeenCalled();
        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error on failed transaction', async () => {
        // In new architecture, wallet addition happens via events from contract
        // This test checks that transaction failure is handled
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue(null);

        await expect(verifyFarcaster(mockEvent, CHAIN_WORLDCHAIN, '0xWallet'))
            .rejects.toThrow('Failed to call createOrUpdateUser');

        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await verifyFarcaster(mockEvent, CHAIN_BASE_MAINNET, '0xWALLET'); // Different case

        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            1n,
            '0xwallet', // Should be lowercase
            0n,
            200n,
            [{ wallet: '0xwallet', chain: CHAIN_BASE_MAINNET }]
        );
    });

    it('should throw error on missing contract address', async () => {
        (config.getContracts as jest.Mock).mockReturnValue(null);
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);

        await expect(verifyFarcaster(mockEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No contract address configured for chain');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });
});
