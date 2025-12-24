// Types for Farcaster Worker

export interface Batch {
    startIndex: bigint;
    endIndex: bigint;
    nextCursor: string;
    errorCount: number;
}

export interface Cast {
    userIndex: number;
    userID: string;
    username: string;
    castID: string;
    castContent: string;
    likesCount: number;
    recastsCount: number;
    userDescriptionText: string;
}

export enum CastProcessingType {
    Skipped = 0,
    Simple = 1,
    Hashtag = 2,
    Cashtag = 3,
}

export interface UserFarcasterData {
    userIndex: bigint;
    casts: number;
    hashtagCasts: number;
    cashtagCasts: number;
    simpleCasts: number;
    likes: number;
    recasts: number;
}

export interface FarcasterWorkerConfig {
    contractAddress: string;
    chain: string;
    farcasterAPIURL: string;
    serverURLPrefix: string;
    concurrencyLimit: number;
}

