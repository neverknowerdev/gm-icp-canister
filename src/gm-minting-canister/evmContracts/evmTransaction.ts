/**
 * EVM Transaction utilities for minting canister
 * Uses micro-eth-signer for transaction serialization
 */

import { Transaction } from 'micro-eth-signer';
import { call, IDL, Principal } from 'azle';
import { bytesToHex as nobleToHex, hexToBytes as nobleFromHex } from '@noble/hashes/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { signWithThresholdEcdsa } from './thresholdSigning';

const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

// Nonce cache for transactions
const nonceCache = new Map<number, bigint>();

/**
 * Get next nonce for a chain
 */
async function getNextNonce(chainId: number, fromAddress: string): Promise<bigint> {
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
 * Get RPC services config for a chain
 */
function getRpcServices(chain: string): any {
    switch (chain) {
        case 'Base Mainnet':
            return { BaseMainnet: null };
        case 'WorldChain':
            return { WorldChain: null };
        case 'Monad':
            return { Monad: null };
        default:
            throw new Error(`Unsupported chain: ${chain}`);
    }
}

/**
 * Send a signed transaction via EVM RPC canister
 * Uses micro-eth-signer for transaction creation and serialization
 */
export async function sendSignedTransaction(
    chain: string,
    chainId: number,
    contractAddress: string,
    data: Uint8Array,
    fromAddress: string,
    gasPrice: bigint = 20_000_000_000n,
    gasLimit: bigint = 500_000n
): Promise<string> {
    try {
        const nonce = await getNextNonce(chainId, fromAddress);

        // Create unsigned transaction using micro-eth-signer
        const unsignedTx = Transaction.prepare({
            type: 'legacy',
            to: contractAddress,
            value: 0n,
            nonce,
            gasPrice,
            gasLimit,
            data: bytesToHex(data),
            chainId: BigInt(chainId),
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
        const txHex = signedTx.toHex(true);

        // Send via EVM RPC canister
        const rpcServices = getRpcServices(chain);
        const rpcConfig = {
            responseSizeEstimate: [1_000_000n],
            responseConsensus: [],
        };

        const RpcServices = IDL.Variant({
            BaseMainnet: IDL.Opt(IDL.Vec(IDL.Variant({
                Alchemy: IDL.Null,
                Ankr: IDL.Null,
                BlockPi: IDL.Null,
                PublicNode: IDL.Null,
                Llama: IDL.Null,
            }))),
            WorldChain: IDL.Opt(IDL.Vec(IDL.Variant({
                Alchemy: IDL.Null,
                Ankr: IDL.Null,
                BlockPi: IDL.Null,
                PublicNode: IDL.Null,
                Llama: IDL.Null,
            }))),
            Monad: IDL.Opt(IDL.Vec(IDL.Variant({
                Alchemy: IDL.Null,
                Ankr: IDL.Null,
                BlockPi: IDL.Null,
                PublicNode: IDL.Null,
                Llama: IDL.Null,
            }))),
        });

        const RpcConfig = IDL.Record({
            responseSizeEstimate: IDL.Opt(IDL.Nat64),
            responseConsensus: IDL.Opt(IDL.Variant({
                Equality: IDL.Null,
                Threshold: IDL.Record({
                    total: IDL.Opt(IDL.Nat8),
                    min: IDL.Nat8,
                }),
            })),
        });

        const result = await call(EVM_RPC_CANISTER_ID, 'eth_sendRawTransaction', {
            args: [rpcServices, rpcConfig, txHex],
            paramIdlTypes: [RpcServices, RpcConfig, IDL.Text],
            returnIdlType: IDL.Text,
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
    chain: string,
    txHash: string,
    maxWaitTime: number = 300_000
): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - startTime < maxWaitTime) {
        // TODO: Implement fetchTransactionReceipt for minting canister
        // For now, just wait
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Transaction ${txHash} not confirmed within ${maxWaitTime}ms`);
}
