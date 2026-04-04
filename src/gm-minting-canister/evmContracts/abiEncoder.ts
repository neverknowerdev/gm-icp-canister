/**
 * ABI Encoder for GMCoin contract calls
 * Uses micro-eth-signer for ABI encoding
 */

import { createContract } from 'micro-eth-signer/advanced/abi.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import GMCoinABI from './abi/gmCoin.json';

/**
 * Contract instance for encoding function calls
 */
const contract = createContract(GMCoinABI as any);

/**
 * Encode startMinting function call
 */
export function encodeStartMinting(): Uint8Array {
    return (contract as any).startMinting.encodeInput({});
}

/**
 * Encode mintForUsers function call
 * @param wallets - Array of wallet addresses
 * @param amounts - Array of amounts to mint
 */
export function encodeMintForUsers(wallets: string[], amounts: bigint[]): Uint8Array {
    return (contract as any).mintForUsers.encodeInput({ wallets, amounts });
}

/**
 * Encode finishMinting function call
 * @param mintingDayTimestamp - The minting day timestamp
 * @param runningHash - The running hash string
 */
export function encodeFinishMinting(mintingDayTimestamp: number, runningHash: string): Uint8Array {
    return (contract as any).finishMinting.encodeInput({
        mintingDayTimestamp: BigInt(mintingDayTimestamp),
        runningHash,
    });
}

/**
 * Get function selector from function signature (first 4 bytes of keccak256)
 */
export function getFunctionSelector(functionSignature: string): Uint8Array {
    const hash = keccak_256(new TextEncoder().encode(functionSignature));
    return hash.slice(0, 4);
}
