// Common types used across the canister

// Chain type is now a number (chain ID)
export type Chain = number;

// Chain ID constants
export const CHAIN_BASE_MAINNET: Chain = 8453;
export const CHAIN_WORLDCHAIN: Chain = 480;

export const CHAINS = {
    BASE_MAINNET: CHAIN_BASE_MAINNET,
    WORLDCHAIN: CHAIN_WORLDCHAIN,
} as const;

// Chain ID to name mapping
const CHAIN_NAMES: Record<Chain, string> = {
    [CHAIN_BASE_MAINNET]: 'Base Mainnet',
    [CHAIN_WORLDCHAIN]: 'WorldChain',
};

// Name to chain ID mapping
const CHAIN_IDS_BY_NAME: Record<string, Chain> = {
    'Base Mainnet': CHAIN_BASE_MAINNET,
    'WorldChain': CHAIN_WORLDCHAIN,
};

/**
 * Get human-readable chain name from chain ID
 */
export function chainName(chain: Chain): string {
    const name = CHAIN_NAMES[chain];
    if (!name) {
        throw new Error(`Unknown chain ID: ${chain}`);
    }
    return name;
}

/**
 * Get chain ID from human-readable name
 */
export function chainIdFromName(name: string): Chain | null {
    return CHAIN_IDS_BY_NAME[name] || null;
}

/**
 * Check if a chain ID is valid
 */
export function isValidChain(chain: Chain): boolean {
    return chain in CHAIN_NAMES;
}

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

// Block time constants
// Base Mainnet: ~2 seconds per block = 43,200 blocks/day
// WorldChain: Similar L2 block times, using same estimate
export const BLOCKS_PER_DAY = 43_200;

// Maximum age for transactions (in days)
// Used for both processing (don't process old transactions) and cleanup (remove old transactions)
export const TRANSACTION_MAX_AGE_DAYS = 10;

