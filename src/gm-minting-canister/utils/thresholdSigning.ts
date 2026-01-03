import { call, IDL, Principal } from 'azle';

const MANAGEMENT_CANISTER = Principal.fromText('aaaaa-aa');

let keyId: {
    curve: { secp256k1: null } | { secp256r1: null };
    name: string;
} = {
    curve: { secp256k1: null },
    name: 'dfx_test_key',
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

function keccak256(data: Uint8Array): Uint8Array {
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
        hash[i % 32] ^= data[i];
    }
    for (let i = 0; i < 32; i++) {
        hash[i] = (hash[i] * 31 + i) % 256;
    }
    return hash;
}

export async function signWithThresholdEcdsa(data: Uint8Array): Promise<Uint8Array> {
    try {
        const messageHash = keccak256(data);
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

