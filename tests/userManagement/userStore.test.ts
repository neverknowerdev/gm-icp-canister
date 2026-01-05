import {
    createUser,
    getUser,
    getUserByTwitterId,
    getUserByFarcasterId,
    getUserByWallet,
    addWalletToUser,
    updateUserTwitterId,
    updateUserFarcasterId,
    isTwitterIdUnique,
    isFarcasterIdUnique,
} from '../../src/gm-account-manager-canister/userManagement/userStore';
import { clearMockStorage } from '../mocks/azle.mock';

// Reset storage before each test
beforeEach(() => {
    // Clear all mock storage to ensure test isolation
    clearMockStorage();
});

describe('User Store', () => {
    describe('createUser', () => {
        it('should create a new user with unique userId', () => {
            const user1 = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const user2 = createUser('0x456', 'Base Mainnet', 200n, 0n);

            expect(user1.userId).toBe(1n);
            expect(user2.userId).toBe(2n);
            expect(user1.userId).not.toBe(user2.userId);
        });

        it('should set Twitter ID when provided', () => {
            const user = createUser('0x123', 'Base Mainnet', 100n, 0n);
            expect(user.twitterId).toBe(100n);
        });

        it('should set Farcaster ID when provided', () => {
            const user = createUser('0x123', 'Base Mainnet', 0n, 200n);
            expect(user.farcasterId).toBe(200n);
        });

        it('should initialize with correct default values', () => {
            const user = createUser('0x123', 'Base Mainnet', 100n, 200n);

            expect(user.chains).toEqual(['Base Mainnet']);
            expect(user.isVerified).toBe(false);
            expect(user.verifications).toEqual([]);
            expect(user.primaryWallet).toBe('0x123');
            expect(user.wallets).toHaveLength(1);
            expect(user.wallets[0].wallet).toBe('0x123');
            expect(user.wallets[0].chain).toBe('Base Mainnet');
        });
    });

    describe('getUser', () => {
        it('should return user by userId', () => {
            const createdUser = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const retrievedUser = getUser(createdUser.userId);

            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser?.userId).toBe(createdUser.userId);
            expect(retrievedUser?.twitterId).toBe(100n);
        });

        it('should return null for non-existent userId', () => {
            const user = getUser(999n);
            expect(user).toBeNull();
        });
    });

    describe('getUserByTwitterId', () => {
        it('should return user by Twitter ID', () => {
            const createdUser = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const retrievedUser = getUserByTwitterId(100n);

            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser?.userId).toBe(createdUser.userId);
            expect(retrievedUser?.twitterId).toBe(100n);
        });

        it('should return null for non-existent Twitter ID', () => {
            const user = getUserByTwitterId(999n);
            expect(user).toBeNull();
        });
    });

    describe('getUserByFarcasterId', () => {
        it('should return user by Farcaster ID', () => {
            const createdUser = createUser('0x123', 'Base Mainnet', 0n, 200n);
            const retrievedUser = getUserByFarcasterId(200n);

            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser?.userId).toBe(createdUser.userId);
            expect(retrievedUser?.farcasterId).toBe(200n);
        });

        it('should return null for non-existent Farcaster ID', () => {
            const user = getUserByFarcasterId(999n);
            expect(user).toBeNull();
        });
    });

    describe('getUserByWallet', () => {
        it('should return user by wallet address and chain', () => {
            const createdUser = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const retrievedUser = getUserByWallet('0x123', 'Base Mainnet');

            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser?.userId).toBe(createdUser.userId);
        });

        it('should return null for non-existent wallet', () => {
            const user = getUserByWallet('0x999', 'Base Mainnet');
            expect(user).toBeNull();
        });

        it('should be case-insensitive for wallet addresses', () => {
            createUser('0xABC', 'Base Mainnet', 100n, 0n);
            const user = getUserByWallet('0xabc', 'Base Mainnet');
            expect(user).not.toBeNull();
        });
    });

    describe('addWalletToUser', () => {
        it('should add wallet to existing user', () => {
            const user = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const success = addWalletToUser(user.userId, '0x456', 'WorldChain');

            expect(success).toBe(true);
            const updatedUser = getUser(user.userId);
            expect(updatedUser?.wallets).toHaveLength(2);
            expect(updatedUser?.chains).toContain('WorldChain');
        });

        it('should not add duplicate wallet', () => {
            const user = createUser('0x123', 'Base Mainnet', 100n, 0n);
            addWalletToUser(user.userId, '0x456', 'WorldChain');
            const success2 = addWalletToUser(user.userId, '0x456', 'WorldChain');

            expect(success2).toBe(false);
        });

        it('should return false for non-existent userId', () => {
            const success = addWalletToUser(999n, '0x456', 'WorldChain');
            expect(success).toBe(false);
        });
    });

    describe('updateUserTwitterId', () => {
        it('should update Twitter ID for existing user', () => {
            const user = createUser('0x123', 'Base Mainnet', 100n, 0n);
            const success = updateUserTwitterId(user.userId, 200n);

            expect(success).toBe(true);
            const updatedUser = getUser(user.userId);
            expect(updatedUser?.twitterId).toBe(200n);
        });

        it('should return false for non-existent userId', () => {
            const success = updateUserTwitterId(999n, 200n);
            expect(success).toBe(false);
        });
    });

    describe('updateUserFarcasterId', () => {
        it('should update Farcaster ID for existing user', () => {
            const user = createUser('0x123', 'Base Mainnet', 0n, 100n);
            const success = updateUserFarcasterId(user.userId, 200n);

            expect(success).toBe(true);
            const updatedUser = getUser(user.userId);
            expect(updatedUser?.farcasterId).toBe(200n);
        });

        it('should return false for non-existent userId', () => {
            const success = updateUserFarcasterId(999n, 200n);
            expect(success).toBe(false);
        });
    });

    describe('isTwitterIdUnique', () => {
        it('should return true for unique Twitter ID', () => {
            expect(isTwitterIdUnique(100n)).toBe(true);
        });

        it('should return false for existing Twitter ID', () => {
            createUser('0x123', 'Base Mainnet', 100n, 0n);
            expect(isTwitterIdUnique(100n)).toBe(false);
        });
    });

    describe('isFarcasterIdUnique', () => {
        it('should return true for unique Farcaster ID', () => {
            expect(isFarcasterIdUnique(100n)).toBe(true);
        });

        it('should return false for existing Farcaster ID', () => {
            createUser('0x123', 'Base Mainnet', 0n, 100n);
            expect(isFarcasterIdUnique(100n)).toBe(false);
        });
    });

    describe('Global User ID Strategy', () => {
        it('should generate sequential userIds across different chains', () => {
            const user1 = createUser('0x111', 'Base Mainnet', 100n, 0n);
            const user2 = createUser('0x222', 'WorldChain', 200n, 0n);
            const user3 = createUser('0x333', 'Monad', 300n, 0n);

            expect(user1.userId).toBe(1n);
            expect(user2.userId).toBe(2n);
            expect(user3.userId).toBe(3n);
        });

        it('should maintain userId uniqueness across chains', () => {
            const user1 = createUser('0x111', 'Base Mainnet', 100n, 0n);
            const user2 = createUser('0x222', 'WorldChain', 200n, 0n);

            expect(user1.userId).not.toBe(user2.userId);
        });
    });
});

