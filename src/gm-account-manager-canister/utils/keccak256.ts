/**
 * Keccak-256 hash function using @noble/hashes library
 * 
 * This library is:
 * - Well-tested and audited
 * - WASM/IC compatible (pure JavaScript, no native dependencies)
 * - Industry-standard for Ethereum and blockchain applications
 * - Much simpler and more maintainable than custom implementation
 * 
 * Compatible with Ethereum's keccak256 hash function.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Keccak-256 hash function
 * @param data - Input data as Uint8Array
 * @returns 32-byte hash as Uint8Array
 */
export function keccak256(data: Uint8Array): Uint8Array {
    return keccak_256(data);
}

/**
 * Hash a string and return hex string
 */
export function keccak256Hex(input: string): string {
    const data = new TextEncoder().encode(input);
    return bytesToHex(keccak256(data));
}

/**
 * Hash bytes and return hex string
 */
export function keccak256HexBytes(data: Uint8Array): string {
    return bytesToHex(keccak256(data));
}
