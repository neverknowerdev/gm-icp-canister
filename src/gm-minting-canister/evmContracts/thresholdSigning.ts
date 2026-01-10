/**
 * Threshold ECDSA signing for minting canister
 * Uses ICP's threshold signature service
 */

import { call, IDL, Principal } from 'azle';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const MANAGEMENT_CANISTER = Principal.fromText('aaaaa-aa');
const KEY_NAME = 'gm_minting_wallet';

let keyId: {
    curve: { secp256k1: null } | { secp256r1: null };
    name: string;
} = {
    curve: { secp256k1: null },
    name: KEY_NAME,
};

let derivationPath: Uint8Array[] = [
    new TextEncoder().encode('minting_canister'),
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

/**
 * Sign data with ICP threshold ECDSA
 * Data is hashed with keccak256 before signing
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

        // Ensure we have a full 65-byte signature with recovery id
        if (signatureBytes.length === 64) {
            const fullSignature = new Uint8Array(65);
            fullSignature.set(signatureBytes, 0);
            fullSignature[64] = 27;
            return fullSignature;
        }

        return signatureBytes;

    } catch (error: any) {
        console.error(`Error signing with threshold ECDSA: ${error}`);
        throw new Error(`Threshold ECDSA signing failed: ${error.message || error}`);
    }
}

/**
 * Get the threshold ECDSA public key
 */
export async function getPublicKey(): Promise<Uint8Array> {
    try {
        const derivationPathBytes = derivationPath.map(p => Array.from(p));

        const result = await call(MANAGEMENT_CANISTER, 'ecdsa_public_key', {
            args: [{
                canister_id: [],
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
        throw error;
    }
}

/**
 * Derives Ethereum address from ECDSA public key
 * The address is the last 20 bytes of keccak256 hash of the public key
 */
export function deriveEthereumAddress(publicKey: Uint8Array): string {
    let keyBytes: Uint8Array;
    if (publicKey.length === 65 && publicKey[0] === 0x04) {
        keyBytes = publicKey.slice(1);
    } else if (publicKey.length === 64) {
        keyBytes = publicKey;
    } else if (publicKey.length === 33) {
        throw new Error('Compressed public keys not supported. Expected 64 or 65 bytes.');
    } else {
        throw new Error(`Invalid public key length: ${publicKey.length} (expected 64 or 65 bytes)`);
    }

    const hash = keccak_256(keyBytes);
    const addressBytes = hash.slice(-20);
    
    return '0x' + bytesToHex(addressBytes);
}

/**
 * Gets the Ethereum wallet address derived from the threshold key's public key
 */
export async function getEthereumAddress(): Promise<string> {
    const publicKey = await getPublicKey();
    return deriveEthereumAddress(publicKey);
}
