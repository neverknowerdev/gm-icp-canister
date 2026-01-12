import { call, IDL, Principal } from 'azle';
import { keccak_256 } from '@noble/hashes/sha3.js';

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
 * Derives Ethereum address from ECDSA public key
 * The address is the last 20 bytes of keccak_256 hash of the public key
 * @param publicKey - The public key bytes (typically 65 bytes with 0x04 prefix, or 64 bytes without)
 * @returns Ethereum address as hex string with 0x prefix
 */
export function deriveEthereumAddress(publicKey: Uint8Array): string {
    // Remove 0x04 prefix if present (first byte)
    let keyBytes: Uint8Array;
    if (publicKey.length === 65 && publicKey[0] === 0x04) {
        keyBytes = publicKey.slice(1); // Remove prefix, keep 64 bytes
    } else if (publicKey.length === 64) {
        keyBytes = publicKey; // Already 64 bytes
    } else if (publicKey.length === 33) {
        // Compressed key - would need to decompress, but for now assume it's already uncompressed
        throw new Error('Compressed public keys not supported. Expected 64 or 65 bytes.');
    } else {
        throw new Error(`Invalid public key length: ${publicKey.length} (expected 64 or 65 bytes)`);
    }

    // Hash with keccak_256
    const hash = keccak_256(keyBytes);

    // Take last 20 bytes (Ethereum address)
    const addressBytes = hash.slice(-20);

    // Convert to hex string with 0x prefix
    let address = '0x';
    for (let i = 0; i < addressBytes.length; i++) {
        address += addressBytes[i].toString(16).padStart(2, '0');
    }

    return address;
}

// Cache for EVM wallet address (computed once during canister initialization)
let cachedEvmWalletAddress: string | null = null;

/**
 * Gets the Ethereum wallet address derived from the threshold key's public key
 * Uses cached value if available, otherwise computes it
 * @returns Ethereum address as hex string with 0x prefix
 */
export async function getEthereumAddress(): Promise<string> {
    // Return cached value if available
    if (cachedEvmWalletAddress !== null) {
        return cachedEvmWalletAddress;
    }

    // Compute and cache the address
    const publicKey = await getPublicKey();
    cachedEvmWalletAddress = deriveEthereumAddress(publicKey);
    return cachedEvmWalletAddress;
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

