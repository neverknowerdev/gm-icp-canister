// Types for Twitter Worker

export interface Batch {
    startIndex: bigint;
    endIndex: bigint;
    nextCursor: string;
    errorCount: number;
}

export interface Tweet {
    userIndex: number;
    userID: string;
    username: string;
    tweetID: string;
    tweetContent: string;
    likesCount: number;
    userDescriptionText: string;
}

export enum TweetProcessingType {
    Skipped = 0,
    Simple = 1,
    Hashtag = 2,
    Cashtag = 3,
}

export interface UserTwitterData {
    userIndex: bigint;
    tweets: number;
    hashtagTweets: number;
    cashtagTweets: number;
    simpleTweets: number;
    likes: number;
}

export interface TwitterWorkerConfig {
    contractAddress: string;
    chain: string;
    tweetLookupURL: string;
    serverURLPrefix: string;
    concurrencyLimit: number;
    twitterOptimizedServerHost: string;
}

