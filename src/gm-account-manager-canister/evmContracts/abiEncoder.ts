/**
 * ABI Encoder for smart contract calls
 * Uses micro-eth-signer for ABI encoding
 * 
 * This library is:
 * - Pure JavaScript, WASM/ICP compatible
 * - Well-tested and from the same author as @noble/* libraries
 */

import { createContract } from 'micro-eth-signer/advanced/abi.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import AccountManagerABI from './abi/accountManagement.json';

/**
 * Contract instance for encoding function calls
 * ABI is loaded from JSON file for easy updates from Solidity compiler output
 */
const contract = createContract(AccountManagerABI as any);

/**
 * Encode verifyTwitter function call
 * @param userID - Twitter user ID (string)
 * @param wallet - Wallet address
 * @returns Encoded function call data
 */
export function encodeVerifyTwitter(
    userID: string,
    wallet: string
): Uint8Array {
    return (contract as any).verifyTwitter.encodeInput({ userID, wallet });
}

/**
 * Encode createOrUpdateUser function call
 * @param userId - User ID
 * @param wallet - Primary wallet address
 * @param twitterId - Twitter ID (0 if none)
 * @param farcasterId - Farcaster ID (0 if none)
 * @param wallets - Array of wallet addresses
 * @returns Encoded function call data
 */
export function encodeCreateOrUpdateUser(
    userId: bigint,
    wallet: string,
    twitterId: bigint,
    farcasterId: bigint,
    wallets: string[]
): Uint8Array {
    return (contract as any).createOrUpdateUser.encodeInput({
        userId,
        wallet,
        twitterId,
        farcasterId,
        wallets,
    });
}

/**
 * Get function selector from function signature (first 4 bytes of keccak256)
 * @param functionSignature - Solidity function signature
 * @returns 4-byte selector
 */
export function getFunctionSelector(functionSignature: string): Uint8Array {
    const hash = keccak_256(new TextEncoder().encode(functionSignature));
    return hash.slice(0, 4);
}
