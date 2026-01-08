// User data model

import { Chain } from '../utils/types';

export interface Wallet {
    wallet: string; // Address
    chain: Chain;
}

export interface User {
    userId: bigint;
    chains: Chain[];
    twitterId: bigint;
    farcasterId: bigint;
    isVerified: boolean;
    verifications: string[];
    primaryWallet: string;
    primaryChain: Chain;
    wallets: Wallet[];
}

export interface UserStore {
    // userId -> User
    users: Map<bigint, User>;
    // twitterId -> userId
    twitterToUserId: Map<bigint, bigint>;
    // farcasterId -> userId
    farcasterToUserId: Map<bigint, bigint>;
    // wallet:chain -> userId
    walletToUserId: Map<string, bigint>;
    // Monotonic counter for global userId
    nextUserId: bigint;
}

