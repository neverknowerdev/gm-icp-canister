import { StableBTreeMap } from 'azle';
import { User, UserStore, Wallet } from './userTypes';
import { Chain } from '../utils/types';

// Initialize stable storage
const usersStorage = new StableBTreeMap<bigint, User>(0);
const twitterToUserIdStorage = new StableBTreeMap<bigint, bigint>(1);
const farcasterToUserIdStorage = new StableBTreeMap<bigint, bigint>(2);
const walletToUserIdStorage = new StableBTreeMap<string, bigint>(3);
const nextUserIdStorage = new StableBTreeMap<string, bigint>(4);

// Initialize nextUserId if not exists
function getNextUserId(): bigint {
    const stored = nextUserIdStorage.get('counter');
    if (stored === undefined) {
        nextUserIdStorage.insert('counter', 1n);
        return 1n;
    }
    return stored;
}

function incrementNextUserId(): bigint {
    const current = getNextUserId();
    const next = current + 1n;
    nextUserIdStorage.insert('counter', next);
    return current; // Return the ID that was just assigned
}

/**
 * Get user by userId
 */
export function getUser(userId: bigint): User | null {
    const user = usersStorage.get(userId);
    return user !== undefined ? user : null;
}

/**
 * Get user by Twitter ID
 */
export function getUserByTwitterId(twitterId: bigint): User | null {
    const userIdOpt = twitterToUserIdStorage.get(twitterId);
    if (userIdOpt === undefined) {
        return null;
    }
    return getUser(userIdOpt);
}

/**
 * Get user by Farcaster ID
 */
export function getUserByFarcasterId(farcasterId: bigint): User | null {
    const userIdOpt = farcasterToUserIdStorage.get(farcasterId);
    if (userIdOpt === undefined) {
        return null;
    }
    return getUser(userIdOpt);
}

/**
 * Get user by wallet address and chain
 */
export function getUserByWallet(wallet: string, chain: Chain): User | null {
    const key = `${wallet.toLowerCase()}:${chain}`;
    const userIdOpt = walletToUserIdStorage.get(key);
    if (userIdOpt === undefined) {
        return null;
    }
    return getUser(userIdOpt);
}

/**
 * Create a new user with a globally unique userId
 */
export function createUser(
    wallet: string,
    chain: Chain,
    twitterId: bigint = 0n,
    farcasterId: bigint = 0n
): User {
    const userId = incrementNextUserId();

    const user: User = {
        userId,
        chains: [chain],
        twitterId,
        farcasterId,
        isVerified: false,
        verifications: [],
        primaryWallet: wallet.toLowerCase(),
        primaryChain: chain,
        wallets: [{
            wallet: wallet.toLowerCase(),
            chain,
        }],
    };

    usersStorage.insert(userId, user);

    if (twitterId > 0n) {
        twitterToUserIdStorage.insert(twitterId, userId);
    }

    if (farcasterId > 0n) {
        farcasterToUserIdStorage.insert(farcasterId, userId);
    }

    const walletKey = `${wallet.toLowerCase()}:${chain}`;
    walletToUserIdStorage.insert(walletKey, userId);

    return user;
}

/**
 * Create a user with a specific userId (used when syncing from contract events)
 * This is used when we receive a UserCreated event and need to create the user with the userId from the contract
 */
export function createUserWithId(
    userId: bigint,
    wallet: string,
    chain: Chain,
    twitterId: bigint = 0n,
    farcasterId: bigint = 0n
): User {
    const user: User = {
        userId,
        chains: [chain],
        twitterId,
        farcasterId,
        isVerified: false,
        verifications: [],
        primaryWallet: wallet.toLowerCase(),
        primaryChain: chain,
        wallets: [{
            wallet: wallet.toLowerCase(),
            chain,
        }],
    };

    usersStorage.insert(userId, user);

    if (twitterId > 0n) {
        twitterToUserIdStorage.insert(twitterId, userId);
    }

    if (farcasterId > 0n) {
        farcasterToUserIdStorage.insert(farcasterId, userId);
    }

    const walletKey = `${wallet.toLowerCase()}:${chain}`;
    walletToUserIdStorage.insert(walletKey, userId);

    return user;
}

/**
 * Add wallet to existing user
 */
export function addWalletToUser(userId: bigint, wallet: string, chain: Chain): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;
    const walletLower = wallet.toLowerCase();
    const walletKey = `${walletLower}:${chain}`;

    // Check if wallet already exists
    if (walletToUserIdStorage.get(walletKey) !== undefined) {
        return false; // Wallet already associated with a user
    }

    // Add chain if not present
    if (!user.chains.includes(chain)) {
        user.chains.push(chain);
    }

    // Add wallet if not present
    const walletExists = user.wallets.some(
        w => w.wallet === walletLower && w.chain === chain
    );
    if (!walletExists) {
        user.wallets.push({
            wallet: walletLower,
            chain,
        });
    }

    usersStorage.insert(userId, user);
    walletToUserIdStorage.insert(walletKey, userId);

    return true;
}

/**
 * Update user's Twitter ID
 */
export function updateUserTwitterId(userId: bigint, twitterId: bigint): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;

    // Remove old Twitter ID mapping if exists
    if (user.twitterId > 0n) {
        twitterToUserIdStorage.remove(user.twitterId);
    }

    user.twitterId = twitterId;

    if (twitterId > 0n) {
        twitterToUserIdStorage.insert(twitterId, userId);
    }

    usersStorage.insert(userId, user);
    return true;
}

/**
 * Update user's Farcaster ID
 */
export function updateUserFarcasterId(userId: bigint, farcasterId: bigint): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;

    // Remove old Farcaster ID mapping if exists
    if (user.farcasterId > 0n) {
        farcasterToUserIdStorage.remove(user.farcasterId);
    }

    user.farcasterId = farcasterId;

    if (farcasterId > 0n) {
        farcasterToUserIdStorage.insert(farcasterId, userId);
    }

    usersStorage.insert(userId, user);
    return true;
}

/**
 * Check if Twitter ID is globally unique
 */
export function isTwitterIdUnique(twitterId: bigint): boolean {
    return twitterToUserIdStorage.get(twitterId) === undefined;
}

/**
 * Check if Farcaster ID is globally unique
 */
export function isFarcasterIdUnique(farcasterId: bigint): boolean {
    return farcasterToUserIdStorage.get(farcasterId) === undefined;
}

/**
 * Get Twitter users with pagination
 * Returns array of {userId, accountId, walletAddress} where accountId is Twitter ID
 * @param chainId The chain ID to get wallet address for
 * @param startIndex Starting index for pagination
 * @param limit Number of users to fetch
 */
export function getTwitterUsers(chainId: Chain, startIndex: bigint, limit: bigint): Array<{ userId: bigint, accountId: bigint, walletAddress: string }> {
    const result: Array<{ userId: bigint, accountId: bigint, walletAddress: string }> = [];
    const maxUserId = getNextUserId();
    let currentIndex = 0n;

    // Iterate through all user IDs starting from 1
    for (let userId = 1n; userId < maxUserId; userId++) {
        const userOpt = usersStorage.get(userId);
        if (userOpt !== undefined) {
            const user = userOpt;
            // Only include users with Twitter ID and matching primaryChain
            if (user.twitterId > 0n && user.primaryChain === chainId) {
                if (currentIndex >= startIndex && result.length < Number(limit)) {
                    // Use primaryWallet for users with matching primaryChain
                    if (user.primaryWallet) {
                        result.push({
                            userId: user.userId,
                            accountId: user.twitterId,
                            walletAddress: user.primaryWallet,
                        });
                    }
                }
                currentIndex++;
                // Stop if we've collected enough results
                if (result.length >= Number(limit)) {
                    break;
                }
            }
        }
    }

    return result;
}

/**
 * Get Farcaster users with pagination
 * Returns array of {userId, accountId, walletAddress} where accountId is Farcaster ID
 * @param chainId The chain ID to get wallet address for
 * @param startIndex Starting index for pagination
 * @param limit Number of users to fetch
 */
export function getFarcasterUsers(chainId: Chain, startIndex: bigint, limit: bigint): Array<{ userId: bigint, accountId: bigint, walletAddress: string }> {
    const result: Array<{ userId: bigint, accountId: bigint, walletAddress: string }> = [];
    const maxUserId = getNextUserId();
    let currentIndex = 0n;

    // Iterate through all user IDs starting from 1
    for (let userId = 1n; userId < maxUserId; userId++) {
        const userOpt = usersStorage.get(userId);
        if (userOpt !== undefined) {
            const user = userOpt;
            // Only include users with Farcaster ID and matching primaryChain
            if (user.farcasterId > 0n && user.primaryChain === chainId) {
                if (currentIndex >= startIndex && result.length < Number(limit)) {
                    // Use primaryWallet for users with matching primaryChain
                    if (user.primaryWallet) {
                        result.push({
                            userId: user.userId,
                            accountId: user.farcasterId,
                            walletAddress: user.primaryWallet,
                        });
                    }
                }
                currentIndex++;
                // Stop if we've collected enough results
                if (result.length >= Number(limit)) {
                    break;
                }
            }
        }
    }

    return result;
}

/**
 * Remove a user (called when UserRemoved event is received)
 */
export function removeUser(userId: bigint): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;

    // Remove Twitter ID mapping if exists
    if (user.twitterId > 0n) {
        twitterToUserIdStorage.remove(user.twitterId);
    }

    // Remove Farcaster ID mapping if exists
    if (user.farcasterId > 0n) {
        farcasterToUserIdStorage.remove(user.farcasterId);
    }

    // Remove all wallet mappings
    for (const wallet of user.wallets) {
        const walletKey = `${wallet.wallet}:${wallet.chain}`;
        walletToUserIdStorage.remove(walletKey);
    }

    // Remove user from storage
    usersStorage.remove(userId);

    return true;
}

/**
 * Update user's primary wallet (called when PrimaryWalletUpdated event is received)
 */
export function updateUserPrimaryWallet(userId: bigint, wallet: string): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;
    user.primaryWallet = wallet.toLowerCase();
    usersStorage.insert(userId, user);

    return true;
}

/**
 * Mark user as verified (called when HumanVerificationUpdated event is received)
 */
export function markUserAsVerified(userId: bigint): boolean {
    const userOpt = usersStorage.get(userId);
    if (userOpt === undefined) {
        return false;
    }

    const user = userOpt;
    user.isVerified = true;
    usersStorage.insert(userId, user);

    return true;
}
