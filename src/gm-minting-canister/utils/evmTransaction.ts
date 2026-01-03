import { call, IDL, Principal } from 'azle';
import { fetchTransactionReceipt } from '../../gm-account-manager-canister/utils/evmRpc';

const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

const nonceCache = new Map<number, number>();

async function getNextNonce(chainId: number, fromAddress: string): Promise<number> {
    if (nonceCache.has(chainId)) {
        const nonce = nonceCache.get(chainId)!;
        nonceCache.set(chainId, nonce + 1);
        return nonce;
    }
    
    nonceCache.set(chainId, 1);
    return 0;
}

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

function serializeTransaction(tx: {
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
    const toBytes = new Uint8Array(20);
    const toHex = tx.to.startsWith('0x') ? tx.to.slice(2) : tx.to;
    for (let i = 0; i < 20; i++) {
        toBytes[i] = parseInt(toHex.substring(i * 2, i * 2 + 2), 16);
    }
    
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
    const result = new Uint8Array(1 + totalLength);
    result[0] = 0xf8 + Math.min(totalLength, 255);
    let offset = 1;
    for (const item of txArray) {
        result.set(item, offset);
        offset += item.length;
    }
    
    return result;
}

export async function sendSignedTransaction(
    chain: string,
    chainId: number,
    to: string,
    data: Uint8Array,
    signature: Uint8Array,
    fromAddress: string,
    gasPrice: bigint = 20_000_000_000n,
    gasLimit: bigint = 500_000n
): Promise<string> {
    try {
        const nonce = await getNextNonce(chainId, fromAddress);
        
        const r = signature.slice(0, 32);
        const s = signature.slice(32, 64);
        let v = signature[64];
        
        if (v < 27) {
            v = 27 + (v % 2);
        }
        v += chainId * 2 + 35 - 27;
        
        const transaction = {
            nonce,
            gasPrice,
            gasLimit,
            to,
            value: 0n,
            data,
            v,
            r,
            s,
        };
        
        const serializedTx = serializeTransaction(transaction);
        const txHex = '0x' + Array.from(serializedTx).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const rpcServices = getRpcServices(chain);
        const rpcConfig = {
            responseSizeEstimate: [1_000_000n],
            responseConsensus: [],
        };
        
        const result = await call(EVM_RPC_CANISTER_ID, 'eth_sendRawTransaction', {
            args: [rpcServices, rpcConfig, txHex],
            paramIdlTypes: [
                IDL.Variant({
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
                }),
                IDL.Record({
                    responseSizeEstimate: IDL.Opt(IDL.Nat64),
                    responseConsensus: IDL.Opt(IDL.Variant({
                        Equality: IDL.Null,
                        Threshold: IDL.Record({
                            total: IDL.Opt(IDL.Nat8),
                            min: IDL.Nat8,
                        }),
                    })),
                }),
                IDL.Text,
            ],
            returnIdlType: IDL.Text, // Transaction hash
        });
        
        console.log(`Transaction sent successfully, hash: ${result}`);
        return result;
        
    } catch (error: any) {
        console.error(`Error sending transaction: ${error}`);
        throw error;
    }
}

export async function waitForTransaction(
    chain: string,
    txHash: string,
    maxWaitTime: number = 300_000
): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5_000;
    
    while (Date.now() - startTime < maxWaitTime) {
        const receipt = await fetchTransactionReceipt(chain, txHash);
        
        if (receipt) {
            if (receipt.status === 1) {
                return true;
            } else {
                console.error(`Transaction ${txHash} failed with status ${receipt.status}`);
                return false;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`Transaction ${txHash} not confirmed within ${maxWaitTime}ms`);
}

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

