/**
 * Twitter Verification Utility
 * Verifies Twitter OAuth auth codes and extracts Twitter user IDs
 */

import { httpPost, httpGet } from './httpClient';

/**
 * Convert bytes to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = bytes[i + 1] || 0;
        const c = bytes[i + 2] || 0;
        const bitmap = (a << 16) | (b << 8) | c;
        result += chars.charAt((bitmap >> 18) & 63);
        result += chars.charAt((bitmap >> 12) & 63);
        result += (i + 1 < bytes.length ? chars.charAt((bitmap >> 6) & 63) : '=');
        result += (i + 2 < bytes.length ? chars.charAt(bitmap & 63) : '=');
    }
    return result;
}

export interface TwitterApiConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

let twitterConfig: TwitterApiConfig | null = null;

/**
 * Initialize Twitter API configuration
 */
export function initTwitterConfig(config: TwitterApiConfig): void {
    twitterConfig = config;
    console.log('Twitter API configuration initialized');
}

/**
 * Verify Twitter auth code and get Twitter user ID
 * 
 * Flow:
 * 1. Exchange auth code for access token using Twitter OAuth 2.0 API
 * 2. Use access token to get user information
 * 3. Extract Twitter ID from user info
 * 
 * @param authCode - OAuth authorization code from the event
 * @returns Twitter user ID (as string, to be converted to bigint)
 */
export async function verifyTwitterAuthCode(authCode: string): Promise<string> {
    if (!twitterConfig) {
        throw new Error('Twitter API configuration not initialized. Call initTwitterConfig first.');
    }

    try {
        // Step 1: Exchange auth code for access token
        const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
        const tokenRequestBody = new URLSearchParams({
            code: authCode,
            grant_type: 'authorization_code',
            client_id: twitterConfig.clientId,
            redirect_uri: twitterConfig.redirectUri,
        }).toString();

        // Basic auth header: base64(clientId:clientSecret)
        const credentials = `${twitterConfig.clientId}:${twitterConfig.clientSecret}`;
        // Encode to base64 - using TextEncoder/TextDecoder approach for compatibility
        const credentialsBytes = new TextEncoder().encode(credentials);
        // Convert bytes to base64 manually (simpler than using btoa which may not be available)
        const basicAuth = bytesToBase64(credentialsBytes);

        const tokenResponse = await httpPost(tokenUrl, tokenRequestBody, {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
        });

        const tokenData = JSON.parse(tokenResponse.body);
        if (!tokenData.access_token) {
            throw new Error(`Failed to get access token: ${tokenResponse.body}`);
        }

        const accessToken = tokenData.access_token;

        // Step 2: Get user information using access token
        const userInfoUrl = 'https://api.twitter.com/2/users/me?user.fields=id,username';
        const userInfoResponse = await httpGet(userInfoUrl, {
            'Authorization': `Bearer ${accessToken}`,
        });

        const userData = JSON.parse(userInfoResponse.body);
        if (!userData.data || !userData.data.id) {
            throw new Error(`Failed to get user info: ${userInfoResponse.body}`);
        }

        // Step 3: Extract Twitter ID
        const twitterId = userData.data.id;
        console.log(`Successfully verified Twitter auth code, Twitter ID: ${twitterId}`);
        
        return twitterId;
    } catch (error: any) {
        console.error(`Error verifying Twitter auth code: ${error.message}`);
        throw new Error(`Twitter verification failed: ${error.message}`);
    }
}

/**
 * Verify Twitter auth code and return as bigint
 */
export async function verifyTwitterAuthCodeBigInt(authCode: string): Promise<bigint> {
    const twitterIdStr = await verifyTwitterAuthCode(authCode);
    return BigInt(twitterIdStr);
}

