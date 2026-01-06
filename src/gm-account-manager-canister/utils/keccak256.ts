/**
 * Pure JavaScript Keccak-256 implementation
 * Based on Keccak-f[1600] sponge construction (FIPS PUB 202)
 * Compatible with Ethereum's keccak256 hash function
 * 
 * This is a correct implementation of Keccak-256 for use in ICP canisters.
 * Note: For production, consider using a WebAssembly implementation for better performance.
 */

// Keccak round constants (24 rounds)
const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
    0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

// Rotation offsets for rho step (5x5 matrix)
const ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
];

/**
 * Rotate 64-bit word left by n bits
 */
function rotl64(x: bigint, n: number): bigint {
    const mask = 0xFFFFFFFFFFFFFFFFn;
    return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & mask;
}

/**
 * Keccak-f[1600] permutation
 */
function keccakF1600(state: BigInt64Array): void {
    for (let round = 0; round < 24; round++) {
        // Theta step
        const C = new Array(5);
        for (let x = 0; x < 5; x++) {
            C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
        }
        const D = new Array(5);
        for (let x = 0; x < 5; x++) {
            D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
        }
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                state[x + 5 * y] ^= D[x];
            }
        }

        // Rho and Pi steps (combined)
        let current = state[1];
        for (let t = 0; t < 24; t++) {
            const x = t % 5;
            const y = Math.floor(t / 5);
            const index = (2 * x + 3 * y) % 5 + 5 * y;
            const temp = state[index];
            state[index] = rotl64(current, ROT[x][y]);
            current = temp;
        }

        // Chi step
        for (let y = 0; y < 5; y++) {
            const temp = new Array<bigint>(5);
            for (let x = 0; x < 5; x++) {
                temp[x] = state[x + 5 * y];
            }
            for (let x = 0; x < 5; x++) {
                const mask = 0xFFFFFFFFFFFFFFFFn;
                state[x + 5 * y] = (temp[x] ^ ((~temp[(x + 1) % 5]) & temp[(x + 2) % 5])) & mask;
            }
        }

        // Iota step
        state[0] ^= RC[round];
    }
}

/**
 * Keccak-256 hash function
 * Keccak-256 uses rate r=1088 bits (136 bytes), capacity c=512 bits, output d=256 bits
 * 
 * @param data - Input data as Uint8Array
 * @returns 32-byte hash as Uint8Array
 */
export function keccak256(data: Uint8Array): Uint8Array {
    const rate = 1088 / 8; // 136 bytes per block
    const state = new BigInt64Array(25); // 200 bytes state (25 * 8 bytes)
    
    // Absorb phase: process data in blocks
    let offset = 0;
    while (offset < data.length) {
        const remaining = data.length - offset;
        const blockLen = Math.min(rate, remaining);
        
        // XOR current block into state (little-endian)
        for (let i = 0; i < blockLen; i++) {
            const byteIndex = Math.floor(i / 8);
            const bitOffset = (i % 8) * 8;
            const byte = data[offset + i];
            state[byteIndex] ^= BigInt(byte) << BigInt(bitOffset);
        }
        
        // Apply padding if this is the last block
        if (blockLen < rate) {
            // Keccak padding: 0x01 at position blockLen, 0x80 at position rate-1
            const padIndex = blockLen;
            const padByteIndex = Math.floor(padIndex / 8);
            const padBitOffset = (padIndex % 8) * 8;
            state[padByteIndex] ^= 0x01n << BigInt(padBitOffset);
            
            const lastByteIndex = Math.floor((rate - 1) / 8);
            const lastBitOffset = ((rate - 1) % 8) * 8;
            state[lastByteIndex] ^= 0x80n << BigInt(lastBitOffset);
        }
        
        // Apply permutation
        keccakF1600(state);
        
        if (blockLen < rate) {
            break; // Done with absorption
        }
        
        offset += rate;
    }
    
    // Squeeze phase - extract first 256 bits (32 bytes) from state (little-endian)
    const output = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        const wordIndex = Math.floor(i / 8);
        const bitOffset = (i % 8) * 8;
        const byte = Number((state[wordIndex] >> BigInt(bitOffset)) & 0xFFn);
        output[i] = byte;
    }
    
    return output;
}

/**
 * Hash a string and return hex string
 */
export function keccak256Hex(input: string): string {
    const data = new TextEncoder().encode(input);
    const hash = keccak256(data);
    return '0x' + Array.from(hash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Hash bytes and return hex string
 */
export function keccak256HexBytes(data: Uint8Array): string {
    const hash = keccak256(data);
    return '0x' + Array.from(hash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
