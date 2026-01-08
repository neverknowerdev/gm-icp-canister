/**
 * EVM Transaction utilities for account manager canister
 * Handles transaction signing and sending
 */

import { call, IDL } from 'azle';
import { keccak256 } from './keccak256';
import { signWithThresholdEcdsa } from './thresholdSigning';
import { fetchTransactionReceipt } from './evmRpc';
import { Chain } from './types';
import { EVM_RPC_CANISTER_ID, getRpcServices, RpcServices, RpcConfig, createDefaultRpcConfig } from './evmRpc';

// Nonce cache for transactions
const nonceCache = new Map<number, number>();

/**
 * Get next nonce for a chain (simplified - in production, fetch from chain)
 */
async function getNextNonce(chainId: number, fromAddress: string): Promise<number> {
    // TODO: Fetch actual nonce from chain using eth_getTransactionCount
    // For now, use a simple cache
    if (nonceCache.has(chainId)) {
        const nonce = nonceCache.get(chainId)!;
        nonceCache.set(chainId, nonce + 1);
        return nonce;
    }
    nonceCache.set(chainId, 1);
    return 0;
}

/**
 * RLP encode a number
 */
function rlpEncodeNumber(value: number | bigint): Uint8Array {
    if (value === 0) {
        return new Uint8Array([0x80]);
    }

    const hex = value.toString(16);
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    if (bytes.length === 1 && bytes[0] < 0x80) {
        return bytes;
    }

    return new Uint8Array([0x80 + bytes.length, ...bytes]);
}

/**
 * RLP encode bytes
 */
function rlpEncodeBytes(data: Uint8Array): Uint8Array {
    if (data.length === 1 && data[0] < 0x80) {
        return data;
    }

    if (data.length < 56) {
        return new Uint8Array([0x80 + data.length, ...data]);
    }

    const lengthBytes = rlpEncodeNumber(data.length);
    return new Uint8Array([0xb7 + lengthBytes.length, ...lengthBytes, ...data]);
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
    const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialize unsigned transaction for EIP-155 signing
 */
function serializeUnsignedTransaction(tx: {
    nonce: number;
    gasPrice: bigint;
    gasLimit: bigint;
    to: string;
    value: bigint;
    data: Uint8Array;
    chainId: number;
}): Uint8Array {
    const toBytes = hexToBytes(tx.to);

    const txArray = [
        rlpEncodeNumber(tx.nonce),
        rlpEncodeNumber(tx.gasPrice),
        rlpEncodeNumber(tx.gasLimit),
        rlpEncodeBytes(toBytes),
        rlpEncodeNumber(tx.value),
        rlpEncodeBytes(tx.data),
        rlpEncodeNumber(tx.chainId),
        new Uint8Array([0x80]), // r (empty)
        new Uint8Array([0x80]), // s (empty)
    ];

    const totalLength = txArray.reduce((sum, item) => sum + item.length, 0);
    const prefix = totalLength < 56
        ? new Uint8Array([0xf8 + totalLength])
        : (() => {
            const lengthBytes = rlpEncodeNumber(totalLength);
            return new Uint8Array([0xf7 + lengthBytes.length, ...lengthBytes]);
        })();

    const result = new Uint8Array(prefix.length + totalLength);
    let offset = 0;
    result.set(prefix, offset);
    offset += prefix.length;
    for (const item of txArray) {
        result.set(item, offset);
        offset += item.length;
    }

    return result;
}

/**
 * Serialize signed transaction for RLP encoding (EIP-155)
 */
function serializeSignedTransaction(tx: {
    nonce: number;
    gasPrice: bigint;
    gasLimit: bigint;
    to: string;
    value: bigint;
    data: Uint8Array;
    v: number;
    r: Uint8Array;
    s: Uint8Array;
}): Uint8Array {
    const toBytes = hexToBytes(tx.to);

    const txArray = [
        rlpEncodeNumber(tx.nonce),
        rlpEncodeNumber(tx.gasPrice),
        rlpEncodeNumber(tx.gasLimit),
        rlpEncodeBytes(toBytes),
        rlpEncodeNumber(tx.value),
        rlpEncodeBytes(tx.data),
        rlpEncodeNumber(tx.v),
        rlpEncodeBytes(tx.r),
        rlpEncodeBytes(tx.s),
    ];

    const totalLength = txArray.reduce((sum, item) => sum + item.length, 0);
    const prefix = totalLength < 56
        ? new Uint8Array([0xf8 + totalLength])
        : (() => {
            const lengthBytes = rlpEncodeNumber(totalLength);
            return new Uint8Array([0xf7 + lengthBytes.length, ...lengthBytes]);
        })();

    const result = new Uint8Array(prefix.length + totalLength);
    let offset = 0;
    result.set(prefix, offset);
    offset += prefix.length;
    for (const item of txArray) {
        result.set(item, offset);
        offset += item.length;
    }

    return result;
}

/**
 * Send a signed transaction via EVM RPC canister
 * This function handles transaction serialization and signing internally
 */
export async function sendSignedTransaction(
    chain: Chain,
    contractAddress: string,
    data: Uint8Array,
    fromAddress: string,
    gasPrice: bigint = 20_000_000_000n,
    gasLimit: bigint = 500_000n
): Promise<string> {
    try {
        const nonce = await getNextNonce(chain, fromAddress);

        // Build unsigned transaction for signing
        const unsignedTx = {
            nonce,
            gasPrice,
            gasLimit,
            to: contractAddress,
            value: 0n,
            data,
            chainId: chain,
        };

        // Serialize unsigned transaction (for EIP-155 signing)
        const txForSigning = serializeUnsignedTransaction(unsignedTx);

        // Hash transaction for signing
        const txHash = keccak256(txForSigning);

        // Sign transaction hash with threshold ECDSA
        const signature = await signWithThresholdEcdsa(txHash);

        // Extract r, s, v from signature
        const r = signature.slice(0, 32);
        const s = signature.slice(32, 64);
        let v = signature.length > 64 ? signature[64] : 27;

        // EIP-155: v = chainId * 2 + 35 + (v - 27)
        if (v < 27) {
            v = 27 + (v % 2);
        }
        v = v - 27 + chain * 2 + 35;

        // Build signed transaction
        const signedTx = {
            nonce,
            gasPrice,
            gasLimit,
            to: contractAddress,
            value: 0n,
            data,
            v,
            r,
            s,
        };

        // Serialize signed transaction
        const serializedTx = serializeSignedTransaction(signedTx);
        const txHex = bytesToHex(serializedTx);

        // Send via EVM RPC canister
        const rpcServices = getRpcServices(chain);
        const rpcConfig = createDefaultRpcConfig(1_000_000n);

        const result = await call(EVM_RPC_CANISTER_ID, 'eth_sendRawTransaction', {
            args: [rpcServices, rpcConfig, txHex],
            paramIdlTypes: [RpcServices, RpcConfig, IDL.Text],
            returnIdlType: IDL.Text, // Transaction hash
        });

        console.log(`Transaction sent successfully, hash: ${result}`);
        return result;
    } catch (error: any) {
        console.error(`Error sending transaction: ${error}`);
        throw error;
    }
}

/**
 * Wait for transaction receipt
 */
export async function waitForTransaction(
    chain: Chain,
    txHash: string,
    maxWaitTime: number = 300_000
): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - startTime < maxWaitTime) {
        const receipt = await fetchTransactionReceipt(chain, txHash);

        if (receipt) {
            if (receipt.status === 1n || receipt.status === undefined) {
                return true;
            } else {
                console.error(`Transaction ${txHash} failed with status ${receipt.status}`);
                return false;
            }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Transaction ${txHash} not confirmed within ${maxWaitTime}ms`);
}
