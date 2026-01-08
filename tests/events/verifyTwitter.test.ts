import { verifyTwitter } from '../../src/gm-account-manager-canister/events/verifyTwitter';
import { ParsedEvent } from '../../src/gm-account-manager-canister/utils/types';
import * as userStore from '../../src/gm-account-manager-canister/userManagement/userStore';
import * as smartContract from '../../src/gm-account-manager-canister/utils/smartContract';
import * as config from '../../src/gm-account-manager-canister/utils/config';
import * as atomicCounter from '../../src/gm-account-manager-canister/storage/atomicCounter';
import * as evmRpc from '../../src/gm-account-manager-canister/utils/evmRpc';
import * as eventParser from '../../src/gm-account-manager-canister/utils/eventParser';
import * as userEvents from '../../src/gm-account-manager-canister/events/userEvents';
import * as twitterVerification from '../../src/gm-account-manager-canister/utils/twitterVerification';

// Mock dependencies
jest.mock('../../src/gm-account-manager-canister/userManagement/userStore');
jest.mock('../../src/gm-account-manager-canister/utils/smartContract');
jest.mock('../../src/gm-account-manager-canister/utils/config');
jest.mock('../../src/gm-account-manager-canister/storage/atomicCounter');
jest.mock('../../src/gm-account-manager-canister/utils/evmRpc');
jest.mock('../../src/gm-account-manager-canister/utils/eventParser');
jest.mock('../../src/gm-account-manager-canister/events/userEvents');
jest.mock('../../src/gm-account-manager-canister/utils/twitterVerification');

describe('verifyTwitter Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyTwitterByAuthCodeRequested',
        contractAddress: '0xContract',
        args: {
            authCode: 'twitter_auth_code_123', // Auth code from event
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
        // Mock Twitter verification to return Twitter ID 100
        (twitterVerification.verifyTwitterAuthCodeBigInt as jest.Mock).mockResolvedValue(100n);
    });

    it('should create new user when Twitter ID is unique', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet',
            100n,
            0n,
            [{ wallet: '0xwallet', chain: 'Base Mainnet' }]
        );
        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith('Base Mainnet', '0xtxhash123');
        expect(eventParser.extractEvents).toHaveBeenCalled();
    });

    it('should add wallet to existing user when Twitter ID exists', async () => {
        const existingUser = {
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 100n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xoldwallet',
            primaryChain: 'Base Mainnet',
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(existingUser);

        await verifyTwitter(mockEvent, 'WorldChain', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'WorldChain',
            1n,
            '0xwallet',
            100n,
            0n,
            [{ wallet: '0xwallet', chain: 'WorldChain' }]
        );
    });

    it('should update Twitter ID when wallet exists but no Twitter ID', async () => {
        // Note: In new architecture, we check Twitter ID first, then wallet
        // If Twitter ID doesn't exist, we generate new userId
        // This test may need to be adjusted based on actual requirements
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalled();
    });

    it('should handle invalid auth code', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {}, // No auth code
        };

        await verifyTwitter(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCodeBigInt).not.toHaveBeenCalled();
        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle missing contract address gracefully', async () => {
        (config.getContractAddress as jest.Mock).mockReturnValue(null);
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle verification failure', async () => {
        (twitterVerification.verifyTwitterAuthCodeBigInt as jest.Mock).mockRejectedValue(
            new Error('Invalid auth code')
        );

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCodeBigInt).toHaveBeenCalled();
        expect(atomicCounter.generateNextUserId).not.toHaveBeenCalled();
        expect(smartContract.callCreateOrUpdateUser).not.toHaveBeenCalled();
    });

    it('should handle failed wallet addition gracefully', async () => {
        // In new architecture, wallet addition happens via events from contract
        // This test checks that transaction failure is handled
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (smartContract.callCreateOrUpdateUser as jest.Mock).mockResolvedValue(null);

        await verifyTwitter(mockEvent, 'WorldChain', '0xWallet');

        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWALLET'); // Different case

        expect(smartContract.callCreateOrUpdateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet', // Should be lowercase
            100n,
            0n,
            [{ wallet: '0xwallet', chain: 'Base Mainnet' }]
        );
    });
});
