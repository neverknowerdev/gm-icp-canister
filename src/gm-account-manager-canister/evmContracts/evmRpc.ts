import { call, IDL, Principal } from 'azle';
import { TransactionReceipt, LogEntry, Chain, chainName, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../utils/types';

// EVM RPC Canister Principal ID
export const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

// Define IDL types for EVM RPC canister
export const L2MainnetService = IDL.Variant({
    Alchemy: IDL.Null,
    Ankr: IDL.Null,
    BlockPi: IDL.Null,
    PublicNode: IDL.Null,
    Llama: IDL.Null,
});

export const RpcServices = IDL.Variant({
    BaseMainnet: IDL.Opt(IDL.Vec(L2MainnetService)),
    WorldChain: IDL.Opt(IDL.Vec(L2MainnetService)),
});

export const RpcConfig = IDL.Record({
    responseSizeEstimate: IDL.Opt(IDL.Nat64),
    responseConsensus: IDL.Opt(IDL.Variant({
        Equality: IDL.Null,
        Threshold: IDL.Record({
            total: IDL.Opt(IDL.Nat8),
            min: IDL.Nat8,
        }),
    })),
});

/**
 * Maps chain ID to RPC services variant
 * Note: Opt<Vec<L2MainnetService>> is represented as [] (empty array = None) or [services] (array with elements = Some)
 */
export function getRpcServices(chain: Chain): any {
    switch (chain) {
        case CHAIN_BASE_MAINNET:
            return { BaseMainnet: [] }; // Empty array represents Opt::None
        case CHAIN_WORLDCHAIN:
            return { WorldChain: [] }; // Empty array represents Opt::None
        default:
            throw new Error(`Unsupported chain ID: ${chain}`);
    }
}

/**
 * Create a default RPC config
 */
export function createDefaultRpcConfig(responseSizeEstimate: bigint = 1_000_000n): any {
    return {
        responseSizeEstimate: [responseSizeEstimate],
        responseConsensus: [],
    };
}

const LogEntryIDL = IDL.Record({
    transactionHash: IDL.Opt(IDL.Text),
    blockNumber: IDL.Opt(IDL.Nat),
    data: IDL.Text,
    blockHash: IDL.Opt(IDL.Text),
    transactionIndex: IDL.Opt(IDL.Nat),
    topics: IDL.Vec(IDL.Text),
    address: IDL.Text,
    logIndex: IDL.Opt(IDL.Nat),
    removed: IDL.Bool,
});

const TransactionReceiptIDL = IDL.Record({
    to: IDL.Opt(IDL.Text),
    status: IDL.Opt(IDL.Nat),
    root: IDL.Opt(IDL.Text),
    transactionHash: IDL.Text,
    blockNumber: IDL.Nat,
    from: IDL.Text,
    logs: IDL.Vec(LogEntryIDL),
    blockHash: IDL.Text,
    type: IDL.Text,
    transactionIndex: IDL.Nat,
    effectiveGasPrice: IDL.Nat,
    logsBloom: IDL.Text,
    contractAddress: IDL.Opt(IDL.Text),
    gasUsed: IDL.Nat,
    cumulativeGasUsed: IDL.Nat,
});

const JsonRpcError = IDL.Record({
    code: IDL.Int64,
    message: IDL.Text,
});

const ProviderError = IDL.Variant({
    TooFewCycles: IDL.Record({
        expected: IDL.Nat,
        received: IDL.Nat,
    }),
    MissingRequiredProvider: IDL.Null,
    ProviderNotFound: IDL.Null,
    NoPermission: IDL.Null,
    InvalidRpcConfig: IDL.Text,
});

const RejectionCode = IDL.Variant({
    NoError: IDL.Null,
    CanisterError: IDL.Null,
    SysTransient: IDL.Null,
    DestinationInvalid: IDL.Null,
    Unknown: IDL.Null,
    SysFatal: IDL.Null,
    CanisterReject: IDL.Null,
});

const HttpOutcallError = IDL.Variant({
    IcError: IDL.Record({
        code: RejectionCode,
        message: IDL.Text,
    }),
    InvalidHttpJsonRpcResponse: IDL.Record({
        status: IDL.Nat16,
        body: IDL.Text,
        parsingError: IDL.Opt(IDL.Text),
    }),
});

const ValidationError = IDL.Variant({
    Custom: IDL.Text,
    InvalidHex: IDL.Text,
});

const RpcError = IDL.Variant({
    JsonRpcError: JsonRpcError,
    ProviderError: ProviderError,
    ValidationError: ValidationError,
    HttpOutcallError: HttpOutcallError,
});

const GetTransactionReceiptResult = IDL.Variant({
    Ok: IDL.Opt(TransactionReceiptIDL),
    Err: RpcError,
});

const RpcService = IDL.Variant({
    Provider: IDL.Nat64,
    Custom: IDL.Record({
        url: IDL.Text,
        headers: IDL.Opt(IDL.Vec(IDL.Record({
            name: IDL.Text,
            value: IDL.Text,
        }))),
    }),
    BaseMainnet: L2MainnetService,
    WorldChain: L2MainnetService,
});

const InconsistentEntry = IDL.Record({
    '_0_': RpcService,
    '_1_': GetTransactionReceiptResult,
});

const MultiGetTransactionReceiptResult = IDL.Variant({
    Consistent: GetTransactionReceiptResult,
    Inconsistent: IDL.Vec(InconsistentEntry),
});

/**
 * Fetches transaction receipt from EVM RPC canister
 */
export async function fetchTransactionReceipt(
    chain: Chain,
    transactionId: string
): Promise<TransactionReceipt | null> {
    const rpcServices = getRpcServices(chain);
    const rpcConfig = createDefaultRpcConfig(1_000_000n);

    try {
        const result = await call(EVM_RPC_CANISTER_ID, 'eth_getTransactionReceipt', {
            args: [rpcServices, rpcConfig, transactionId],
            paramIdlTypes: [RpcServices, RpcConfig, IDL.Text],
            returnIdlType: MultiGetTransactionReceiptResult,
        });

        let receiptResult: any = null;

        if ('Consistent' in result) {
            receiptResult = result.Consistent;
        } else if ('Inconsistent' in result && result.Inconsistent.length > 0) {
            receiptResult = result.Inconsistent[0]['_1_'];
        } else {
            console.error(`No transaction receipt found for ${transactionId}`);
            return null;
        }

        if ('Ok' in receiptResult) {
            const receiptOpt = receiptResult.Ok;
            if (receiptOpt.length === 0 || receiptOpt[0] === null) {
                console.error(`Transaction ${transactionId} not found (receipt is null)`);
                return null;
            }

            const receipt = receiptOpt[0];
            return {
                to: receipt.to.length > 0 ? receipt.to[0] : undefined,
                status: receipt.status.length > 0 ? receipt.status[0] : undefined,
                root: receipt.root.length > 0 ? receipt.root[0] : undefined,
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                from: receipt.from,
                logs: receipt.logs.map((log: any) => ({
                    transactionHash: log.transactionHash.length > 0 ? log.transactionHash[0] : undefined,
                    blockNumber: log.blockNumber.length > 0 ? log.blockNumber[0] : undefined,
                    data: log.data,
                    blockHash: log.blockHash.length > 0 ? log.blockHash[0] : undefined,
                    transactionIndex: log.transactionIndex.length > 0 ? log.transactionIndex[0] : undefined,
                    topics: log.topics,
                    address: log.address,
                    logIndex: log.logIndex.length > 0 ? log.logIndex[0] : undefined,
                    removed: log.removed,
                })),
                blockHash: receipt.blockHash,
                type: receipt.type,
                transactionIndex: receipt.transactionIndex,
                effectiveGasPrice: receipt.effectiveGasPrice,
                logsBloom: receipt.logsBloom,
                contractAddress: receipt.contractAddress.length > 0 ? receipt.contractAddress[0] : undefined,
                gasUsed: receipt.gasUsed,
                cumulativeGasUsed: receipt.cumulativeGasUsed,
            };
        } else if ('Err' in receiptResult) {
            // Log error details without JSON.stringify (to avoid BigInt issues)
            const err = receiptResult.Err;
            let errMsg = 'RPC Error: ';
            if (err && typeof err === 'object') {
                // Try to extract meaningful error information
                if ('JsonRpcError' in err) {
                    const jrpcErr = err.JsonRpcError;
                    errMsg += `JsonRpcError(code: ${jrpcErr?.code || '?'}, message: ${jrpcErr?.message || 'Unknown'})`;
                } else if ('ProviderError' in err) {
                    const provErr = err.ProviderError;
                    if (provErr && typeof provErr === 'object') {
                        if ('TooFewCycles' in provErr) {
                            errMsg += `ProviderError: TooFewCycles(expected: ${provErr.TooFewCycles?.expected || '?'}, received: ${provErr.TooFewCycles?.received || '?'})`;
                        } else if ('MissingRequiredProvider' in provErr) {
                            errMsg += `ProviderError: MissingRequiredProvider`;
                        } else if ('ProviderNotFound' in provErr) {
                            errMsg += `ProviderError: ProviderNotFound`;
                        } else if ('NoPermission' in provErr) {
                            errMsg += `ProviderError: NoPermission`;
                        } else if ('InvalidRpcConfig' in provErr) {
                            errMsg += `ProviderError: InvalidRpcConfig(${provErr.InvalidRpcConfig || '?'})`;
                        } else {
                            errMsg += `ProviderError: ${String(provErr)}`;
                        }
                    } else {
                        errMsg += `ProviderError: ${String(provErr)}`;
                    }
                } else if ('ValidationError' in err) {
                    const valErr = err.ValidationError;
                    if (valErr && typeof valErr === 'object') {
                        if ('Custom' in valErr) {
                            errMsg += `ValidationError: Custom(${valErr.Custom || '?'})`;
                        } else if ('InvalidHex' in valErr) {
                            errMsg += `ValidationError: InvalidHex(${valErr.InvalidHex || '?'})`;
                        } else {
                            errMsg += `ValidationError: ${String(valErr)}`;
                        }
                    } else {
                        errMsg += `ValidationError: ${String(valErr)}`;
                    }
                } else if ('HttpOutcallError' in err) {
                    errMsg += `HttpOutcallError: ${String(err.HttpOutcallError)}`;
                } else {
                    errMsg += String(err);
                }
            } else {
                errMsg += String(err);
            }
            console.error(errMsg);
            return null;
        }

        return null;
    } catch (error: any) {
        // Convert error to string to avoid BigInt serialization issues
        const errorStr = error?.toString() || String(error);
        console.error(`Error fetching transaction receipt: ${errorStr}`);
        return null;
    }
}

