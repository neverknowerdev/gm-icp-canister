// Client for querying the account manager canister
// This allows the minting canister to access user data from the account manager canister

import { call, IDL, Principal } from 'azle';

// User type matching the account manager canister's User type
export interface Wallet {
    wallet: string;
    chain: string;
}

export interface User {
    userId: bigint;
    chains: string[];
    twitterId: bigint;
    farcasterId: bigint;
    isVerified: boolean;
    verifications: string[];
    primaryWallet: string;
    primaryChain: string;
    wallets: Wallet[];
}

// Account Manager Canister Principal ID
// This will be set during deployment
let accountManagerCanisterId: Principal | null = null;

/**
 * Set the account manager canister ID
 * This should be called during canister initialization
 */
export function setAccountManagerCanisterId(principal: Principal | string): void {
    if (typeof principal === 'string') {
        accountManagerCanisterId = Principal.fromText(principal);
    } else {
        accountManagerCanisterId = principal;
    }
}

/**
 * Get user by userId from account manager canister
 */
export async function getUser(userId: bigint): Promise<User | null> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getUser', {
            args: [userId],
            paramIdlTypes: [IDL.Nat64],
            returnIdlType: IDL.Opt(IDL.Record({
                userId: IDL.Nat64,
                chains: IDL.Vec(IDL.Text),
                twitterId: IDL.Nat64,
                farcasterId: IDL.Nat64,
                isVerified: IDL.Bool,
                verifications: IDL.Vec(IDL.Text),
                primaryWallet: IDL.Text,
                primaryChain: IDL.Text,
                wallets: IDL.Vec(IDL.Record({
                    wallet: IDL.Text,
                    chain: IDL.Text,
                })),
            })),
        });

        if (result.length === 0) {
            return null;
        }

        const userData = result[0];
        return {
            userId: userData.userId,
            chains: userData.chains,
            twitterId: userData.twitterId,
            farcasterId: userData.farcasterId,
            isVerified: userData.isVerified,
            verifications: userData.verifications,
            primaryWallet: userData.primaryWallet,
            primaryChain: userData.primaryChain,
            wallets: userData.wallets,
        };
    } catch (error: any) {
        console.error(`Error getting user from account manager: ${error}`);
        return null;
    }
}

/**
 * Get user by Twitter ID from account manager canister
 */
export async function getUserByTwitterId(twitterId: bigint): Promise<User | null> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getUserByTwitterId', {
            args: [twitterId],
            paramIdlTypes: [IDL.Nat64],
            returnIdlType: IDL.Opt(IDL.Record({
                userId: IDL.Nat64,
                chains: IDL.Vec(IDL.Text),
                twitterId: IDL.Nat64,
                farcasterId: IDL.Nat64,
                isVerified: IDL.Bool,
                verifications: IDL.Vec(IDL.Text),
                primaryWallet: IDL.Text,
                primaryChain: IDL.Text,
                wallets: IDL.Vec(IDL.Record({
                    wallet: IDL.Text,
                    chain: IDL.Text,
                })),
            })),
        });

        if (result.length === 0) {
            return null;
        }

        const userData = result[0];
        return {
            userId: userData.userId,
            chains: userData.chains,
            twitterId: userData.twitterId,
            farcasterId: userData.farcasterId,
            isVerified: userData.isVerified,
            verifications: userData.verifications,
            primaryWallet: userData.primaryWallet,
            primaryChain: userData.primaryChain,
            wallets: userData.wallets,
        };
    } catch (error: any) {
        console.error(`Error getting user by Twitter ID from account manager: ${error}`);
        return null;
    }
}

/**
 * Get user by Farcaster ID from account manager canister
 */
export async function getUserByFarcasterId(farcasterId: bigint): Promise<User | null> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getUserByFarcasterId', {
            args: [farcasterId],
            paramIdlTypes: [IDL.Nat64],
            returnIdlType: IDL.Opt(IDL.Record({
                userId: IDL.Nat64,
                chains: IDL.Vec(IDL.Text),
                twitterId: IDL.Nat64,
                farcasterId: IDL.Nat64,
                isVerified: IDL.Bool,
                verifications: IDL.Vec(IDL.Text),
                primaryWallet: IDL.Text,
                primaryChain: IDL.Text,
                wallets: IDL.Vec(IDL.Record({
                    wallet: IDL.Text,
                    chain: IDL.Text,
                })),
            })),
        });

        if (result.length === 0) {
            return null;
        }

        const userData = result[0];
        return {
            userId: userData.userId,
            chains: userData.chains,
            twitterId: userData.twitterId,
            farcasterId: userData.farcasterId,
            isVerified: userData.isVerified,
            verifications: userData.verifications,
            primaryWallet: userData.primaryWallet,
            primaryChain: userData.primaryChain,
            wallets: userData.wallets,
        };
    } catch (error: any) {
        console.error(`Error getting user by Farcaster ID from account manager: ${error}`);
        return null;
    }
}

/**
 * Get multiple users by userIds from account manager canister
 */
export async function getUsers(userIds: bigint[]): Promise<User[]> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getUsers', {
            args: [userIds],
            paramIdlTypes: [IDL.Vec(IDL.Nat64)],
            returnIdlType: IDL.Vec(IDL.Record({
                userId: IDL.Nat64,
                chains: IDL.Vec(IDL.Text),
                twitterId: IDL.Nat64,
                farcasterId: IDL.Nat64,
                isVerified: IDL.Bool,
                verifications: IDL.Vec(IDL.Text),
                primaryWallet: IDL.Text,
                primaryChain: IDL.Text,
                wallets: IDL.Vec(IDL.Record({
                    wallet: IDL.Text,
                    chain: IDL.Text,
                })),
            })),
        });

        return result.map((userData: any) => ({
            userId: userData.userId,
            chains: userData.chains,
            twitterId: userData.twitterId,
            farcasterId: userData.farcasterId,
            isVerified: userData.isVerified,
            verifications: userData.verifications,
            primaryWallet: userData.primaryWallet,
            primaryChain: userData.primaryChain,
            wallets: userData.wallets,
        }));
    } catch (error: any) {
        console.error(`Error getting users from account manager: ${error}`);
        return [];
    }
}

/**
 * Get Twitter users with pagination from account manager canister
 * @param chainId The chain ID to get wallet addresses for
 * @param startIndex Starting index for pagination
 * @param limit Number of users to fetch
 */
export async function getTwitterUsers(chainId: number, startIndex: bigint, limit: bigint): Promise<Array<{ userId: bigint; accountId: bigint; walletAddress: string }>> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getTwitterUsers', {
            args: [chainId, startIndex, limit],
            paramIdlTypes: [IDL.Nat32, IDL.Nat64, IDL.Nat64],
            returnIdlType: IDL.Vec(IDL.Record({
                userId: IDL.Nat64,
                accountId: IDL.Nat64,
                walletAddress: IDL.Text,
            })),
        });

        return result.map((item: any) => ({
            userId: item.userId,
            accountId: item.accountId,
            walletAddress: item.walletAddress,
        }));
    } catch (error: any) {
        console.error(`Error getting Twitter users from account manager: ${error}`);
        return [];
    }
}

/**
 * Get Farcaster users with pagination from account manager canister
 * @param chainId The chain ID to get wallet addresses for
 * @param startIndex Starting index for pagination
 * @param limit Number of users to fetch
 */
export async function getFarcasterUsers(chainId: number, startIndex: bigint, limit: bigint): Promise<Array<{ userId: bigint; accountId: bigint; walletAddress: string }>> {
    if (!accountManagerCanisterId) {
        throw new Error('Account manager canister ID not set');
    }

    try {
        const result = await call(accountManagerCanisterId, 'getFarcasterUsers', {
            args: [chainId, startIndex, limit],
            paramIdlTypes: [IDL.Nat32, IDL.Nat64, IDL.Nat64],
            returnIdlType: IDL.Vec(IDL.Record({
                userId: IDL.Nat64,
                accountId: IDL.Nat64,
                walletAddress: IDL.Text,
            })),
        });

        return result.map((item: any) => ({
            userId: item.userId,
            accountId: item.accountId,
            walletAddress: item.walletAddress,
        }));
    } catch (error: any) {
        console.error(`Error getting Farcaster users from account manager: ${error}`);
        return [];
    }
}
