import { verifyTwitter } from '../../src/events/verifyTwitter';
import { ParsedEvent } from '../../src/utils/types';
import * as userStore from '../../src/userManagement/userStore';
import * as smartContract from '../../src/utils/smartContract';
import * as config from '../../src/utils/config';

// Mock dependencies
jest.mock('../../src/userManagement/userStore');
jest.mock('../../src/utils/smartContract');
jest.mock('../../src/utils/config');

describe('verifyTwitter Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyTwitterByAuthCodeRequested',
        contractAddress: '0xContract',
        args: {
            topic1: '0x0000000000000000000000000000000000000000000000000000000000000064', // 100
        },
        logIndex: 0n,
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (config.getContractAddress as jest.Mock).mockReturnValue('0xContract');
    });

    it('should create new user when Twitter ID is unique', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 100n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });
        (smartContract.callCreateUser as jest.Mock).mockResolvedValue(true);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).toHaveBeenCalledWith('0xwallet', 'Base Mainnet', 100n, 0n);
        expect(smartContract.callCreateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet',
            100n,
            0n
        );
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
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(existingUser);
        (userStore.addWalletToUser as jest.Mock).mockReturnValue(true);
        (userStore.getUser as jest.Mock).mockReturnValue({
            ...existingUser,
            chains: ['Base Mainnet', 'WorldChain'],
            wallets: [
                { wallet: '0xoldwallet', chain: 'Base Mainnet' },
                { wallet: '0xwallet', chain: 'WorldChain' },
            ],
        });
        (smartContract.callAddUser as jest.Mock).mockResolvedValue(true);

        await verifyTwitter(mockEvent, 'WorldChain', '0xWallet');

        expect(userStore.addWalletToUser).toHaveBeenCalledWith(1n, '0xwallet', 'WorldChain');
        expect(smartContract.callAddUser).toHaveBeenCalled();
    });

    it('should update Twitter ID when wallet exists but no Twitter ID', async () => {
        const existingUser = {
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(existingUser);
        (userStore.updateUserTwitterId as jest.Mock).mockReturnValue(true);
        (userStore.getUser as jest.Mock).mockReturnValue({
            ...existingUser,
            twitterId: 100n,
        });
        (smartContract.callAddUser as jest.Mock).mockResolvedValue(true);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.updateUserTwitterId).toHaveBeenCalledWith(1n, 100n);
        expect(smartContract.callAddUser).toHaveBeenCalled();
    });

    it('should handle invalid Twitter ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: { topic1: '0x0000000000000000000000000000000000000000000000000000000000000000' }, // 0
        };

        await verifyTwitter(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).not.toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled();
    });

    it('should handle missing contract address gracefully', async () => {
        (config.getContractAddress as jest.Mock).mockReturnValue(null);
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 100n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled(); // Should not call if no contract
    });

    it('should handle missing topic1 in event args', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {},
        };

        await verifyTwitter(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).not.toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled();
    });

    it('should handle failed wallet addition gracefully', async () => {
        const existingUser = {
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 100n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xoldwallet',
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(existingUser);
        (userStore.addWalletToUser as jest.Mock).mockReturnValue(false); // Wallet addition fails

        await verifyTwitter(mockEvent, 'WorldChain', '0xWallet');

        expect(userStore.addWalletToUser).toHaveBeenCalledWith(1n, '0xwallet', 'WorldChain');
        expect(smartContract.callAddUser).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        (userStore.getUserByTwitterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 100n,
            farcasterId: 0n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });
        (smartContract.callCreateUser as jest.Mock).mockResolvedValue(true);

        await verifyTwitter(mockEvent, 'Base Mainnet', '0xWALLET'); // Different case

        expect(userStore.createUser).toHaveBeenCalledWith('0xwallet', 'Base Mainnet', 100n, 0n);
        expect(smartContract.callCreateUser).toHaveBeenCalled();
    });
});

