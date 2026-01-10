/**
 * Farcaster Verification Utility
 * Verifies Farcaster credentials and extracts Farcaster user IDs (FIDs)
 */

import { httpGet, httpPost } from '../utils/httpClient';

export interface FarcasterApiConfig {
    apiKey?: string; // Optional API key for Farcaster API
    apiUrl?: string; // Base URL for Farcaster API (default: https://api.warpcast.com)
}

let farcasterConfig: FarcasterApiConfig | null = null;

/**
 * Initialize Farcaster API configuration
 */
export function initFarcasterConfig(config: FarcasterApiConfig): void {
    farcasterConfig = config || {};
    if (!farcasterConfig.apiUrl) {
        farcasterConfig.apiUrl = 'https://api.warpcast.com';
    }
    console.log('Farcaster API configuration initialized');
}

/**
 * Verify Farcaster credentials and get Farcaster user ID (FID)
 * 
 * Flow:
 * 1. Verify the provided token/credentials with Farcaster API
 * 2. Get user information
 * 3. Extract Farcaster ID (FID) from user info
 * 
 * @param authToken - Authentication token from the event (could be a Farcaster auth token)
 * @returns Farcaster user ID (FID) as string, to be converted to bigint
 */
export async function verifyFarcasterAuth(authToken: string): Promise<string> {
    if (!farcasterConfig) {
        throw new Error('Farcaster API configuration not initialized. Call initFarcasterConfig first.');
    }

    try {
        const apiUrl = farcasterConfig.apiUrl || 'https://api.warpcast.com';
        
        // Step 1: Verify token and get user info
        // Farcaster API endpoint to get current user info
        const userInfoUrl = `${apiUrl}/v2/me`;
        
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${authToken}`,
        };
        
        if (farcasterConfig.apiKey) {
            headers['X-Api-Key'] = farcasterConfig.apiKey;
        }

        const userInfoResponse = await httpGet(userInfoUrl, headers);
        const userData = JSON.parse(userInfoResponse.body);
        
        if (!userData.result || !userData.result.user || !userData.result.user.fid) {
            throw new Error(`Failed to get Farcaster user info: ${userInfoResponse.body}`);
        }

        // Step 2: Extract Farcaster ID (FID)
        const farcasterId = userData.result.user.fid.toString();
        console.log(`Successfully verified Farcaster auth token, Farcaster ID (FID): ${farcasterId}`);
        
        return farcasterId;
    } catch (error: any) {
        console.error(`Error verifying Farcaster auth token: ${error.message}`);
        throw new Error(`Farcaster verification failed: ${error.message}`);
    }
}

/**
 * Alternative: Verify using Farcaster message signature
 * This is a more common pattern for Farcaster - verifying signed messages
 * 
 * @param message - The message that was signed
 * @param signature - The signature to verify
 * @param fid - The Farcaster ID claiming the signature
 * @returns true if signature is valid, false otherwise
 */
export async function verifyFarcasterSignature(
    message: string,
    signature: string,
    fid: string
): Promise<boolean> {
    if (!farcasterConfig) {
        throw new Error('Farcaster API configuration not initialized. Call initFarcasterConfig first.');
    }

    try {
        const apiUrl = farcasterConfig.apiUrl || 'https://api.warpcast.com';
        
        // Verify message signature with Farcaster API
        const verifyUrl = `${apiUrl}/v2/verify-message`;
        
        const requestBody = JSON.stringify({
            message,
            signature,
            fid: parseInt(fid),
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        
        if (farcasterConfig.apiKey) {
            headers['X-Api-Key'] = farcasterConfig.apiKey;
        }

        const response = await httpPost(verifyUrl, requestBody, headers);
        const result = JSON.parse(response.body);
        
        return result.valid === true;
    } catch (error: any) {
        console.error(`Error verifying Farcaster signature: ${error.message}`);
        return false;
    }
}

/**
 * Verify Farcaster auth token and return as bigint
 */
export async function verifyFarcasterAuthBigInt(authToken: string): Promise<bigint> {
    const farcasterIdStr = await verifyFarcasterAuth(authToken);
    return BigInt(farcasterIdStr);
}

