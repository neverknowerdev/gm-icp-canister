import { verifyFarcaster } from '../../src/gm-account-manager-canister/events/verifyFarcaster';
import { ParsedEvent } from '../../src/gm-account-manager-canister/utils/types';
import * as userStore from '../../src/gm-account-manager-canister/userManagement/userStore';
import * as smartContract from '../../src/gm-account-manager-canister/utils/smartContract';
import * as config from '../../src/gm-account-manager-canister/utils/config';

// Mock dependencies
jest.mock('../../src/gm-account-manager-canister/userManagement/userStore');
jest.mock('../../src/gm-account-manager-canister/utils/smartContract');
jest.mock('../../src/gm-account-manager-canister/utils/config');

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
    });

    it('should create new user when Farcaster ID is unique', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });
        (smartContract.callCreateUser as jest.Mock).mockResolvedValue(true);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).toHaveBeenCalledWith('0xwallet', 'Base Mainnet', 0n, 200n);
        expect(smartContract.callCreateUser).toHaveBeenCalledWith(
            '0xContract',
            'Base Mainnet',
            1n,
            '0xwallet',
            0n,
            200n
        );
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
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(existingUser);
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

        await verifyFarcaster(mockEvent, 'WorldChain', '0xWallet');

        expect(userStore.addWalletToUser).toHaveBeenCalledWith(1n, '0xwallet', 'WorldChain');
        expect(smartContract.callAddUser).toHaveBeenCalled();
    });

    it('should update Farcaster ID when wallet exists but no Farcaster ID', async () => {
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

        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(existingUser);
        (userStore.updateUserFarcasterId as jest.Mock).mockReturnValue(true);
        (userStore.getUser as jest.Mock).mockReturnValue({
            ...existingUser,
            farcasterId: 200n,
        });
        (smartContract.callAddUser as jest.Mock).mockResolvedValue(true);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.updateUserFarcasterId).toHaveBeenCalledWith(1n, 200n);
        expect(smartContract.callAddUser).toHaveBeenCalled();
    });

    it('should handle invalid Farcaster ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: { topic1: '0x0000000000000000000000000000000000000000000000000000000000000000' }, // 0
        };

        await verifyFarcaster(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).not.toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled();
    });

    it('should handle missing topic1 in event args', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {},
        };

        await verifyFarcaster(invalidEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).not.toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled();
    });

    it('should handle failed wallet addition gracefully', async () => {
        const existingUser = {
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xoldwallet',
            wallets: [{ wallet: '0xoldwallet', chain: 'Base Mainnet' }],
        };

        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(existingUser);
        (userStore.addWalletToUser as jest.Mock).mockReturnValue(false); // Wallet addition fails

        await verifyFarcaster(mockEvent, 'WorldChain', '0xWallet');

        expect(userStore.addWalletToUser).toHaveBeenCalledWith(1n, '0xwallet', 'WorldChain');
        expect(smartContract.callAddUser).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });
        (smartContract.callCreateUser as jest.Mock).mockResolvedValue(true);

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWALLET'); // Different case

        expect(userStore.createUser).toHaveBeenCalledWith('0xwallet', 'Base Mainnet', 0n, 200n);
        expect(smartContract.callCreateUser).toHaveBeenCalled();
    });

    it('should handle missing contract address gracefully', async () => {
        (config.getContractAddress as jest.Mock).mockReturnValue(null);
        (userStore.getUserByFarcasterId as jest.Mock).mockReturnValue(null);
        (userStore.getUserByWallet as jest.Mock).mockReturnValue(null);
        (userStore.createUser as jest.Mock).mockReturnValue({
            userId: 1n,
            chains: ['Base Mainnet'],
            twitterId: 0n,
            farcasterId: 200n,
            isVerified: false,
            verifications: [],
            primaryWallet: '0xwallet',
            wallets: [{ wallet: '0xwallet', chain: 'Base Mainnet' }],
        });

        await verifyFarcaster(mockEvent, 'Base Mainnet', '0xWallet');

        expect(userStore.createUser).toHaveBeenCalled();
        expect(smartContract.callCreateUser).not.toHaveBeenCalled(); // Should not call if no contract
    });
});

