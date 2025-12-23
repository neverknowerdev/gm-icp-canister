// User data model

export interface Wallet {
    wallet: string; // Address
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

