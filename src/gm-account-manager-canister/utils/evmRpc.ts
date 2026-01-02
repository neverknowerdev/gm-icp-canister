import { call, IDL, Principal } from 'azle';
import { TransactionReceipt, LogEntry } from './types';

// EVM RPC Canister Principal ID
const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

// Define IDL types for EVM RPC canister
const L2MainnetService = IDL.Variant({
    Alchemy: IDL.Null,
    Ankr: IDL.Null,
    BlockPi: IDL.Null,
    PublicNode: IDL.Null,
    Llama: IDL.Null,
});

const RpcServices = IDL.Variant({
    BaseMainnet: IDL.Opt(IDL.Vec(L2MainnetService)),
    WorldChain: IDL.Opt(IDL.Vec(L2MainnetService)),
    Monad: IDL.Opt(IDL.Vec(L2MainnetService)),
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
    Monad: L2MainnetService,
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
 * Maps chain name to RPC services variant
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
 * Fetches transaction receipt from EVM RPC canister
 */
export async function fetchTransactionReceipt(
    chain: string,
    transactionId: string
): Promise<TransactionReceipt | null> {
    const rpcServices = getRpcServices(chain);
    const rpcConfig = {
        responseSizeEstimate: [1_000_000n],
        responseConsensus: [],
    };

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
            console.error(`RPC Error: ${JSON.stringify(receiptResult.Err)}`);
            return null;
        }

        return null;
    } catch (error: any) {
        console.error(`Error fetching transaction receipt: ${error}`);
        return null;
    }
}

