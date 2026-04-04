/**
 * EVM Transaction utilities for account manager canister
 * Uses micro-eth-signer for transaction serialization
 * 
 * This library is:
 * - Pure JavaScript, WASM/ICP compatible
 * - Well-tested and from the same author as @noble/* libraries
 */

import { Transaction } from 'micro-eth-signer';
import { call, IDL } from 'azle';
import { bytesToHex as nobleToHex, hexToBytes as nobleFromHex } from '@noble/hashes/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { signWithThresholdEcdsa } from './thresholdSigning';
import { fetchTransactionReceipt } from './evmRpc';
import { Chain } from '../utils/types';
import { EVM_RPC_CANISTER_ID, getRpcServices, RpcServices, RpcConfig, createDefaultRpcConfig } from './evmRpc';

// Nonce cache for transactions
const nonceCache = new Map<number, bigint>();

/**
 * Get next nonce for a chain (simplified - in production, fetch from chain)
 */
async function getNextNonce(chainId: number, fromAddress: string): Promise<bigint> {
    // TODO: Fetch actual nonce from chain using eth_getTransactionCount
    // For now, use a simple cache
    if (nonceCache.has(chainId)) {
        const nonce = nonceCache.get(chainId)!;
        nonceCache.set(chainId, nonce + 1n);
        return nonce;
    }
    nonceCache.set(chainId, 1n);
    return 0n;
}

/**
 * Convert hex string to bytes (handles 0x prefix)
 */
function hexToBytes(hex: string): Uint8Array {
    const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
    return nobleFromHex(cleaned);
}

/**
 * Convert bytes to hex string (with 0x prefix)
 */
function bytesToHex(bytes: Uint8Array): string {
    return '0x' + nobleToHex(bytes);
}

/**
 * Send a signed transaction via EVM RPC canister
 * Uses micro-eth-signer for transaction creation and serialization
 * Uses ICP threshold ECDSA for signing
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

        // Create unsigned transaction using micro-eth-signer (legacy type)
        const unsignedTx = Transaction.prepare({
            type: 'legacy',
            to: contractAddress,
            value: 0n,
            nonce,
            gasPrice,
            gasLimit,
            data: bytesToHex(data),
            chainId: BigInt(chain),
        });

        // Get unsigned transaction bytes and hash for signing
        const unsignedBytes = unsignedTx.toBytes(false);
        const txHash = keccak_256(unsignedBytes);

        // Sign with ICP threshold ECDSA
        const signature = await signWithThresholdEcdsa(txHash);

        // Extract r, s from signature (each 32 bytes)
        const r = BigInt(bytesToHex(signature.slice(0, 32)));
        const s = BigInt(bytesToHex(signature.slice(32, 64)));

        // Get recovery bit (yParity) - ICP returns 0/1 or 27/28
        let yParity = signature.length > 64 ? signature[64] : 0;
        if (yParity >= 27) {
            yParity = yParity - 27;
        }

        // Create signed transaction by adding signature to raw data
        const signedRaw = {
            ...unsignedTx.raw,
            r,
            s,
            yParity,
        };

        // Create new Transaction with signature
        const signedTx = new Transaction('legacy', signedRaw as any, false);

        // Get serialized signed transaction
        const txHex = signedTx.toHex(true);

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
