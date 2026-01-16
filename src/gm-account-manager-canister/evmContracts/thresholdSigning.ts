import { call, IDL, Principal } from 'azle';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Access ic from global scope (available in ICP canister runtime)
declare const ic: any;

const MANAGEMENT_CANISTER = Principal.fromText('aaaaa-aa');
// Using 'key_1' which is available on IC mainnet
// For production, you may want to create a custom key via NNS proposal
const KEY_NAME = 'key_1';

let keyId: {
    curve: { secp256k1: null } | { secp256r1: null };
    name: string;
} = {
    curve: { secp256k1: null },
    name: KEY_NAME,
};

let derivationPath: Uint8Array[] = [
    new TextEncoder().encode('account_manager_canister'),
];

export function setKeyId(name: string, useSecp256k1: boolean = true): void {
    keyId = {
        curve: useSecp256k1 ? { secp256k1: null } : { secp256r1: null },
        name,
    };
}

export function setDerivationPath(path: Uint8Array[]): void {
    derivationPath = path;
}

export async function getPublicKey(): Promise<Uint8Array> {
    try {
        const derivationPathBytes = derivationPath.map(p => Array.from(p));

        // Get the canister's own principal
        // If ic is not available (e.g., in tests), use empty array (None)
        // In Candid, Opt(Principal) is represented as Principal[] (Some) or [] (None)
        let canisterIdOpt: any[] = [];
        try {
            if (typeof ic !== 'undefined' && ic.id) {
                const selfPrincipal = ic.id();
                canisterIdOpt = [selfPrincipal];
            }
        } catch (e) {
            // If we can't get the canister ID, use empty array (None)
            console.warn('Could not get canister ID, using None for canister_id');
            canisterIdOpt = [];
        }

        const result = await call(MANAGEMENT_CANISTER, 'ecdsa_public_key', {
            args: [{
                canister_id: canisterIdOpt,
                derivation_path: derivationPathBytes,
                key_id: keyId,
            }],
            paramIdlTypes: [IDL.Record({
                canister_id: IDL.Opt(IDL.Principal),
                derivation_path: IDL.Vec(IDL.Vec(IDL.Nat8)),
                key_id: IDL.Record({
                    curve: IDL.Variant({
                        secp256k1: IDL.Null,
                        secp256r1: IDL.Null,
                    }),
                    name: IDL.Text,
                }),
            })],
            returnIdlType: IDL.Record({
                public_key: IDL.Vec(IDL.Nat8),
                chain_code: IDL.Vec(IDL.Nat8),
            }),
        });

        return new Uint8Array(result.public_key);
    } catch (error: any) {
        console.error(`Error getting public key: ${error}`);
        console.error(`Error details: ${error.message || error.toString()}`);
        if (error.stack) {
            console.error(`Error stack: ${error.stack}`);
        }
        throw error;
    }
}

/**
 * Sign data using threshold ECDSA
 * @param data - Data to sign (typically a transaction hash)
 * @returns Signature as Uint8Array (r, s, v format)
 */
export async function signWithThresholdEcdsa(data: Uint8Array): Promise<Uint8Array> {
    try {
        const messageHash = keccak_256(data);
        const derivationPathBytes = derivationPath.map(p => Array.from(p));

        const result = await call(MANAGEMENT_CANISTER, 'sign_with_ecdsa', {
            args: [{
                message_hash: Array.from(messageHash),
                derivation_path: derivationPathBytes,
                key_id: keyId,
            }],
            paramIdlTypes: [IDL.Record({
                message_hash: IDL.Vec(IDL.Nat8),
                derivation_path: IDL.Vec(IDL.Vec(IDL.Nat8)),
                key_id: IDL.Record({
                    curve: IDL.Variant({
                        secp256k1: IDL.Null,
                        secp256r1: IDL.Null,
                    }),
                    name: IDL.Text,
                }),
            })],
            returnIdlType: IDL.Record({
                signature: IDL.Vec(IDL.Nat8),
            }),
        });

        const signatureBytes = new Uint8Array(result.signature);

        if (signatureBytes.length !== 64 && signatureBytes.length !== 65) {
            throw new Error(`Invalid signature length: ${signatureBytes.length} (expected 64 or 65 bytes)`);
        }

        // If signature is 64 bytes, add default v value (27)
        if (signatureBytes.length === 64) {
            const fullSignature = new Uint8Array(65);
            fullSignature.set(signatureBytes, 0);
            fullSignature[64] = 27; // Default 'v' value for secp256k1
            return fullSignature;
        }

        return signatureBytes;
    } catch (error: any) {
        console.error(`Error signing with threshold ECDSA: ${error}`);
        console.error(`Error details: ${error.message || error.toString()}`);
        if (error.stack) {
            console.error(`Error stack: ${error.stack}`);
        }
        throw new Error(`Threshold ECDSA signing failed: ${error.message || error}`);
    }
}

/**
 * Derives Ethereum address from public key (handles compressed/uncompressed keys)
 * @param publicKey - The public key bytes (compressed 33 bytes, or uncompressed 64/65 bytes)
 * @returns Ethereum address as hex string with 0x prefix (checksummed)
 */
function deriveEthereumAddress(publicKey: Uint8Array): string {
    // Decompress if needed and get uncompressed 65-byte key (0x04 + x + y)
    // @ts-ignore - Point exists at runtime on the ECDSA wrapper
    const pub65b = secp256k1.Point.fromBytes(publicKey).toBytes(false); // false = uncompressed

    // Hash the 64 bytes (x + y, without 0x04 prefix)
    const hashed = keccak_256(pub65b.subarray(1, 65));

    // Take last 20 bytes and convert to hex
    const addressBytes = hashed.slice(-20);
    const addrHex = '0x' + bytesToHex(addressBytes);

    // Add checksum (EIP-55)
    return addChecksum(addrHex);
}

/**
 * Adds EIP-55 checksum to an Ethereum address
 */
function addChecksum(addr: string): string {
    const addrLower = addr.toLowerCase().replace('0x', '');
    const hash = bytesToHex(keccak_256(new TextEncoder().encode(addrLower)));
    let checksummed = '0x';
    for (let i = 0; i < addrLower.length; i++) {
        const hi = parseInt(hash[i], 16);
        checksummed += hi > 7 ? addrLower[i].toUpperCase() : addrLower[i];
    }
    return checksummed;
}

// Cache for EVM wallet address (computed once during canister initialization)
let cachedEvmWalletAddress: string | null = null;

/**
 * Gets the Ethereum wallet address derived from the threshold key's public key
 * Uses cached value if available, otherwise computes it
 * @returns Ethereum address as hex string with 0x prefix (checksummed)
 */
export async function getEthereumAddress(): Promise<string> {
    // Return cached value if available
    if (cachedEvmWalletAddress !== null) {
        return cachedEvmWalletAddress;
    }

    // Compute and cache the address
    const publicKey = await getPublicKey();
    const derivedAddress = deriveEthereumAddress(publicKey);
    cachedEvmWalletAddress = derivedAddress;
    return derivedAddress;
}

/**
 * Get the cached EVM wallet address (synchronous, for query methods)
 * @returns Cached Ethereum address, or null if not yet computed
 */
export function getCachedEthereumAddress(): string | null {
    return cachedEvmWalletAddress;
}

/**
 * Set the cached EVM wallet address (used during initialization)
 * @param address - The Ethereum address to cache
 */
export function setCachedEthereumAddress(address: string): void {
    cachedEvmWalletAddress = address;
}

