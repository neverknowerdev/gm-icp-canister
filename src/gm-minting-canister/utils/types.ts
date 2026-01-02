// Common types used across the canister

export type Chain = 'Base Mainnet' | 'WorldChain' | 'Monad';

export interface LogEntry {
    transactionHash?: string;
    blockNumber?: bigint;
    data: string;
    blockHash?: string;
    transactionIndex?: bigint;
    topics: string[];
    address: string;
    logIndex?: bigint;
    removed: boolean;
}

export interface TransactionReceipt {
    to?: string;
    status?: bigint;
    root?: string;
    transactionHash: string;
    blockNumber: bigint;
    from: string;
    logs: LogEntry[];
    blockHash: string;
    type: string;
    transactionIndex: bigint;
    effectiveGasPrice: bigint;
    logsBloom: string;
    contractAddress?: string;
    gasUsed: bigint;
    cumulativeGasUsed: bigint;
}

export interface ParsedEvent {
    eventName: string;
    contractAddress: string;
    args: Record<string, any>;
    logIndex: bigint;
    transactionHash: string;
    blockNumber: bigint;
}

