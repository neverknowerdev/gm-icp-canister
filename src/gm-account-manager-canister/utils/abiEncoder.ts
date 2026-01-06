/**
 * ABI Encoder for smart contract calls
 * Implements Ethereum ABI encoding specification
 */

import { keccak256 } from './keccak256';

/**
 * Get function selector (first 4 bytes of keccak256(functionSignature))
 */
export function getFunctionSelector(functionSignature: string): Uint8Array {
    const hash = keccak256(new TextEncoder().encode(functionSignature));
    return hash.slice(0, 4);
}

/**
 * Pad a uint256 value to 32 bytes
 */
function padUint256(value: bigint): Uint8Array {
    const result = new Uint8Array(32);
    const hex = value.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
}

/**
 * Pad an address to 32 bytes (left-padded with zeros)
 */
function padAddress(address: string): Uint8Array {
    const addr = address.startsWith('0x') ? address.slice(2) : address;
    const result = new Uint8Array(32);
    const hex = addr.padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
}

/**
 * Encode uint256
 */
function encodeUint256(value: bigint): Uint8Array {
    return padUint256(value);
}

/**
 * Encode address
 */
function encodeAddress(address: string): Uint8Array {
    return padAddress(address);
}

/**
 * Encode address array
 * Returns the encoded data and the offset where data starts
 */
function encodeAddressArray(addresses: string[]): { data: Uint8Array; offset: number } {
    const length = addresses.length;
    const lengthPad = padUint256(BigInt(length));
    
    const encodedAddresses = new Uint8Array(length * 32);
    for (let i = 0; i < length; i++) {
        encodedAddresses.set(padAddress(addresses[i]), i * 32);
    }
    
    const result = new Uint8Array(32 + encodedAddresses.length);
    result.set(lengthPad, 0);
    result.set(encodedAddresses, 32);
    
    return { data: result, offset: 32 };
}

/**
 * Encode createOrUpdateUser function call
 * Function signature: createOrUpdateUser(uint256,address,uint256,uint256,address[])
 * Parameters: userId, wallet, twitterId, farcasterId, wallets[]
 */
export function encodeCreateOrUpdateUser(
    userId: bigint,
    wallet: string,
    twitterId: bigint,
    farcasterId: bigint,
    wallets: string[]
): Uint8Array {
    const selector = getFunctionSelector('createOrUpdateUser(uint256,address,uint256,uint256,address[])');
    
    // Encode parameters
    const userIdEncoded = encodeUint256(userId);
    const walletEncoded = encodeAddress(wallet);
    const twitterIdEncoded = encodeUint256(twitterId);
    const farcasterIdEncoded = encodeUint256(farcasterId);
    const walletsEncoded = encodeAddressArray(wallets);
    
    // Calculate offsets
    // Function selector (4) + fixed params (4 * 32 = 128) + dynamic param offset (32) = 164
    // wallets offset = 4 + 4*32 = 164 (0xa4)
    const walletsOffset = 164;
    
    // Build result: selector + fixed params + offset + dynamic data
    const result = new Uint8Array(
        4 +           // selector
        32 +          // userId
        32 +          // wallet
        32 +          // twitterId
        32 +          // farcasterId
        32 +          // wallets offset
        walletsEncoded.data.length  // wallets data
    );
    
    let offset = 0;
    
    // Function selector
    result.set(selector, offset);
    offset += 4;
    
    // Fixed parameters
    result.set(userIdEncoded, offset);
    offset += 32;
    result.set(walletEncoded, offset);
    offset += 32;
    result.set(twitterIdEncoded, offset);
    offset += 32;
    result.set(farcasterIdEncoded, offset);
    offset += 32;
    
    // Dynamic parameter offset
    result.set(padUint256(BigInt(walletsOffset)), offset);
    offset += 32;
    
    // Dynamic parameter data
    result.set(walletsEncoded.data, offset);
    
    return result;
}

