import { verifyTwitter } from '../../src/gm-account-manager-canister/verification/verifyTwitter';
import { ParsedEvent, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';
import * as smartContract from '../../src/gm-account-manager-canister/evmContracts/smartContract';
import * as config from '../../src/gm-account-manager-canister/evmContracts/config';
import * as evmRpc from '../../src/gm-account-manager-canister/evmContracts/evmRpc';
import * as twitterVerification from '../../src/gm-account-manager-canister/verification/twitterVerification';
import * as userStore from '../../src/gm-account-manager-canister/userManagement/userStore';
import * as atomicCounter from '../../src/gm-account-manager-canister/storage/atomicCounter';
import * as eventDecoder from '../../src/gm-account-manager-canister/evmContracts/eventDecoder';
import * as userEvents from '../../src/gm-account-manager-canister/userEvents';

jest.mock('../../src/gm-account-manager-canister/evmContracts/smartContract');
jest.mock('../../src/gm-account-manager-canister/evmContracts/config');
jest.mock('../../src/gm-account-manager-canister/evmContracts/evmRpc');
jest.mock('../../src/gm-account-manager-canister/verification/twitterVerification');
jest.mock('../../src/gm-account-manager-canister/userManagement/userStore');
jest.mock('../../src/gm-account-manager-canister/storage/atomicCounter');
jest.mock('../../src/gm-account-manager-canister/evmContracts/eventDecoder');
jest.mock('../../src/gm-account-manager-canister/userEvents');

describe('verifyTwitter Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyTwitterByAuthCodeRequested',
        contractAddress: '0xContract',
        args: {
            authCode: 'GM001234567890ab12',
            tweetID: '1234567890',
            userID: '100',
        },
        logIndex: 0n,
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (config.getContracts as jest.Mock).mockReturnValue({ accountManager: '0xContract', GMCoin: '' });
        (config.getContractAddresses as jest.Mock).mockReturnValue(['0xContract']);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue('0xtxhash123');
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue({
            status: 1n,
            logs: [],
        });
        (twitterVerification.verifyTwitterAuthCode as jest.Mock).mockResolvedValue('100');
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (atomicCounter.generateNextUserId as jest.Mock).mockResolvedValue(1n);
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([]);
        (userEvents.processUserEvent as jest.Mock).mockResolvedValue(undefined);
    });

    it('should verify Twitter and call createOrUpdateUser for new user', async () => {
        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalledWith(
            'GM001234567890ab12',
            '1234567890',
            '100',
            '0xwallet'
        );
        expect(userStore.getUserByTwitterId).toHaveBeenCalledWith(100n);
        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            1n, // generated userId
            '0xwallet',
            100n, // twitterId
            0n, // farcasterId
            [{ wallet: '0xwallet', chain: CHAIN_BASE_MAINNET }]
        );
        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash123');
    });

    it('should use existing userId for existing Twitter user', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue({
            userId: 42n,
            twitterId: 100n,
            farcasterId: 200n,
            wallets: [{ wallet: '0xoldwallet', chain: CHAIN_BASE_MAINNET }],
        });

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            42n, // existing userId
            '0xwallet',
            100n, // twitterId
            200n, // farcasterId from existing user
            [{ wallet: '0xoldwallet', chain: CHAIN_BASE_MAINNET }]
        );
    });

    it('should throw error on missing auth code', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                tweetID: '1234567890',
                userID: '100',
            },
        };

        await expect(verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No auth code found in event');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error on missing tweet ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                authCode: 'GM001234567890ab12',
                userID: '100',
            },
        };

        await expect(verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No tweet ID found in event');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error on missing user ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                authCode: 'GM001234567890ab12',
                tweetID: '1234567890',
            },
        };

        await expect(verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No user ID found in event');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error on missing contract address', async () => {
        (config.getContracts as jest.Mock).mockReturnValue(null);

        await expect(verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('No contract address configured for chain');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should propagate verification failure error', async () => {
        (twitterVerification.verifyTwitterAuthCode as jest.Mock).mockRejectedValue(
            new Error('Auth code not found in tweet')
        );

        await expect(verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('Auth code not found in tweet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error on failed transaction', async () => {
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue(null);

        await expect(verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet'))
            .rejects.toThrow('Failed to call createOrUpdateUser');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalled();
        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWALLET');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalledWith(
            'GM001234567890ab12',
            '1234567890',
            '100',
            '0xwallet'
        );
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            1n,
            '0xwallet',
            100n,
            0n,
            [{ wallet: '0xwallet', chain: CHAIN_BASE_MAINNET }]
        );
    });

    it('should work with different chains', async () => {
        await verifyTwitter(mockEvent, CHAIN_WORLDCHAIN, '0xWallet');

        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_WORLDCHAIN,
            1n,
            '0xwallet',
            100n,
            0n,
            [{ wallet: '0xwallet', chain: CHAIN_WORLDCHAIN }]
        );
    });

    it('should process events from transaction receipt', async () => {
        const mockUserEvent: ParsedEvent = {
            eventName: 'UserCreated',
            contractAddress: '0xContract',
            args: { userId: 1n },
            logIndex: 0n,
            transactionHash: '0xtxhash123',
            blockNumber: 1000n,
        };
        (eventDecoder.extractEvents as jest.Mock).mockReturnValue([mockUserEvent]);

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(eventDecoder.extractEvents).toHaveBeenCalled();
        expect(userEvents.processUserEvent).toHaveBeenCalledWith(mockUserEvent, CHAIN_BASE_MAINNET);
    });

    it('should add new wallet if existing user has no wallets on current chain', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue({
            userId: 42n,
            twitterId: 100n,
            farcasterId: 200n,
            wallets: [{ wallet: '0xotherwallet', chain: CHAIN_WORLDCHAIN }], // Different chain
        });

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            42n,
            '0xwallet',
            100n,
            200n,
            [{ wallet: '0xwallet', chain: CHAIN_BASE_MAINNET }] // New wallet for this chain
        );
    });
});
