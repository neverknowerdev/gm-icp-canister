/**
 * Twitter Verification Utility
 * Verifies Twitter auth codes by fetching tweets and validating authCode in tweet content
 */

import { httpGet } from './httpClient';

export interface TwitterApiConfig {
    tweetFetchURL: string;
    headerName: string;
    bearerToken: string;
}

let twitterConfig: TwitterApiConfig | null = null;

/**
 * Initialize Twitter API configuration
 */
export function initTwitterConfig(config: TwitterApiConfig): void {
    twitterConfig = config;
    console.log('Twitter API configuration initialized');
}

interface TwitterResponseV1 {
    data?: {
        tweet_results?: {
            result?: {
                legacy?: {
                    full_text: string;
                    user_id_str: string;
                };
            };
        };
    };
}

interface TwitterResponseV2 {
    text?: string;
    author_id?: string;
}

/**
 * Get tweet content and author ID from Twitter API response
 */
function getTweetContentAndAuthorId(response: any): { tweetContent: string; authorId: string } | null {
    if (response.data?.tweet_results?.result?.legacy) {
        return {
            tweetContent: response.data.tweet_results.result.legacy.full_text,
            authorId: response.data.tweet_results.result.legacy.user_id_str
        };
    }

    if (response.text && response.author_id) {
        return {
            tweetContent: response.text,
            authorId: response.author_id
        };
    }

    return null;
}

/**
 * Validate auth code format
 * Auth code format: GM${walletStartingLetterNumberStr}${wallet10Letters}${random2}
 */
export function validateAuthCode(authCode: string, walletAddress: string): { isValid: boolean; error?: string } {
    if (!authCode.startsWith('GM')) {
        return { isValid: false, error: "Auth code must start with 'GM'" };
    }

    const walletStartingLetterNumberStr = authCode.substring(2, 4);
    if (!/^\d{2}$/.test(walletStartingLetterNumberStr)) {
        return { isValid: false, error: "Invalid wallet starting letter number format" };
    }

    const wallet10Letters = authCode.substring(4, 14);
    if (!/^[a-fA-F0-9]{10}$/.test(wallet10Letters)) {
        return { isValid: false, error: "Invalid wallet letters format" };
    }

    const walletStartingLetterNumber = parseInt(walletStartingLetterNumberStr);
    const actualWalletLetters = walletAddress.substring(walletStartingLetterNumber, walletStartingLetterNumber + 10);

    if (wallet10Letters.toLowerCase() !== actualWalletLetters.toLowerCase()) {
        return { isValid: false, error: "Wallet letters in auth code do not match the wallet address" };
    }

    return { isValid: true };
}

/**
 * Verify Twitter auth code by fetching tweet and validating
 * 
 * Flow:
 * 1. Validate auth code format
 * 2. Fetch tweet using Twitter API with tweetID
 * 3. Check if auth code exists in tweet content
 * 4. Verify user ID matches tweet author
 * 
 * @param authCode - Auth code from the event (format: GM${walletStartingLetterNumberStr}${wallet10Letters}${random2})
 * @param tweetID - Tweet ID to fetch
 * @param userID - Expected Twitter user ID
 * @param walletAddress - Wallet address for auth code validation
 * @returns Twitter user ID if verification succeeds
 */
export async function verifyTwitterAuthCode(
    authCode: string,
    tweetID: string,
    userID: string,
    walletAddress: string
): Promise<string> {
    if (!twitterConfig) {
        throw new Error('Twitter API configuration not initialized. Call initTwitterConfig first.');
    }

    const authCodeValidation = validateAuthCode(authCode, walletAddress);
    if (!authCodeValidation.isValid) {
        throw new Error(authCodeValidation.error || "Invalid auth code");
    }

    try {
        const response = await httpGet(
            `${twitterConfig.tweetFetchURL}?tweet_id=${tweetID}`,
            {
                [twitterConfig.headerName]: twitterConfig.bearerToken,
            }
        );

        const responseData = JSON.parse(response.body);
        const tweetData = getTweetContentAndAuthorId(responseData);

        if (!tweetData) {
            throw new Error("Failed to parse tweet data");
        }

        const { tweetContent, authorId } = tweetData;

        if (!tweetContent.includes(authCode)) {
            throw new Error("Auth code not found in tweet");
        }

        if (authorId !== userID) {
            throw new Error("User ID mismatch");
        }

        console.log(`Successfully verified Twitter auth code, Twitter ID: ${authorId}`);
        return authorId;
    } catch (error: any) {
        console.error(`Error verifying Twitter auth code: ${error.message}`);
        throw new Error(`Twitter verification failed: ${error.message}`);
    }
}

