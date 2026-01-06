// Transaction Scanner - periodically scans for unprocessed transactions

import { call, IDL, Principal } from 'azle';
import { processEvent } from '../eventProcessor';
import { getLastProcessedBlock, updateLastProcessedBlock, getTrackedChains } from '../storage/blockTracker';
import { getContractAddresses } from '../utils/config';
import { isTransactionProcessed } from '../storage/transactionTracker';

const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

// IDL types for EVM RPC canister
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
 * Get current block number for a chain
 */
async function getCurrentBlockNumber(chain: string): Promise<number | null> {
    try {
        const rpcServices = getRpcServices(chain);
        const rpcConfig = {
            responseSizeEstimate: [1_000_000n],
            responseConsensus: [],
        };

        const result = await call(EVM_RPC_CANISTER_ID, 'eth_blockNumber', {
            args: [rpcServices, rpcConfig],
            paramIdlTypes: [RpcServices, RpcConfig],
            returnIdlType: IDL.Text, // Returns hex string
        });

        // Convert hex to number
        const blockNumber = parseInt(result, 16);
        return blockNumber;
    } catch (error: any) {
        console.error(`Error getting current block number for ${chain}: ${error}`);
        return null;
    }
}

/**
 * Get logs for a range of blocks using eth_getLogs
 * This is more efficient than scanning individual blocks
 */
async function getLogsForBlocks(
    chain: string,
    fromBlock: number,
    toBlock: number,
    contractAddresses: string[]
): Promise<Array<{ transactionHash: string }>> {
    try {
        const rpcServices = getRpcServices(chain);
        const rpcConfig = {
            responseSizeEstimate: [10_000_000n], // Increased for potentially many logs
            responseConsensus: [],
        };

        const fromBlockHex = '0x' + fromBlock.toString(16);
        const toBlockHex = '0x' + toBlock.toString(16);

        // Build filter
        const filter = {
            fromBlock: fromBlockHex,
            toBlock: toBlockHex,
            address: contractAddresses,
            topics: [], // Empty topics to get all events
        };

        const result = await call(EVM_RPC_CANISTER_ID, 'eth_getLogs', {
            args: [rpcServices, rpcConfig, filter],
            paramIdlTypes: [
                RpcServices,
                RpcConfig,
                IDL.Record({
                    fromBlock: IDL.Text,
                    toBlock: IDL.Text,
                    address: IDL.Vec(IDL.Text),
                    topics: IDL.Vec(IDL.Vec(IDL.Text)),
                }),
            ],
            returnIdlType: IDL.Vec(IDL.Record({
                transactionHash: IDL.Text,
                blockNumber: IDL.Text,
                address: IDL.Text,
                topics: IDL.Vec(IDL.Text),
                data: IDL.Text,
            })),
        });

        // Extract unique transaction hashes
        const txHashes = new Set<string>();
        for (const log of result) {
            if (log.transactionHash) {
                txHashes.add(log.transactionHash);
            }
        }

        return Array.from(txHashes).map(hash => ({ transactionHash: hash }));
    } catch (error: any) {
        console.error(`Error getting logs for blocks ${fromBlock}-${toBlock} on ${chain}: ${error}`);
        return [];
    }
}

/**
 * Scan chain for unprocessed transactions since last check
 */
async function scanChainForTransactions(chain: string): Promise<void> {
    console.log(`Scanning ${chain} for unprocessed transactions...`);

    const lastBlock = getLastProcessedBlock(chain);
    const currentBlock = await getCurrentBlockNumber(chain);

    if (!currentBlock) {
        console.error(`Failed to get current block number for ${chain}`);
        return;
    }

    if (currentBlock <= lastBlock) {
        console.log(`No new blocks on ${chain} (last: ${lastBlock}, current: ${currentBlock})`);
        updateLastProcessedBlock(chain, currentBlock);
        return;
    }

    console.log(`Scanning blocks ${lastBlock + 1} to ${currentBlock} on ${chain}`);

    // Get contract addresses for this chain
    const contractAddresses = getContractAddresses(chain);
    if (contractAddresses.length === 0) {
        console.log(`No contracts configured for ${chain}, skipping scan`);
        return;
    }

    // Limit the range to avoid too much processing at once
    const maxBlocksToScan = 1000;
    const endBlock = Math.min(currentBlock, lastBlock + maxBlocksToScan);

    // Use eth_getLogs to get all logs from our contracts in the block range
    const logs = await getLogsForBlocks(chain, lastBlock + 1, endBlock, contractAddresses);

    console.log(`Found ${logs.length} transactions from our contracts in blocks ${lastBlock + 1}-${endBlock}`);

    // Process each unique transaction
    let processedCount = 0;
    let skippedCount = 0;

    for (const log of logs) {
        const txHash = log.transactionHash;
        
        // Check if already processed
        if (isTransactionProcessed(txHash)) {
            skippedCount++;
            continue;
        }

        console.log(`Processing unprocessed transaction: ${txHash}`);
        try {
            await processEvent(chain, txHash);
            processedCount++;
        } catch (error: any) {
            console.error(`Error processing transaction ${txHash}: ${error}`);
        }
    }

    // Update last processed block
    updateLastProcessedBlock(chain, endBlock);
    console.log(`Completed scanning ${chain}: processed ${processedCount} transactions, skipped ${skippedCount} already processed, up to block ${endBlock}`);
}

/**
 * Scan all configured chains for unprocessed transactions
 */
export async function scanAllChains(): Promise<void> {
    console.log('Starting transaction scan for all chains...');

    // Get all chains from config
    const chains = getTrackedChains();
    
    // If no chains tracked yet, initialize from config
    const defaultChains = ['Base Mainnet', 'WorldChain', 'Monad'];
    const chainsToScan = chains.length > 0 ? chains : defaultChains;

    for (const chain of chainsToScan) {
        const contracts = getContractAddresses(chain);
        if (contracts.length > 0) {
            // Initialize block tracking if not exists
            if (getLastProcessedBlock(chain) === 0) {
                const currentBlock = await getCurrentBlockNumber(chain);
                if (currentBlock) {
                    updateLastProcessedBlock(chain, currentBlock);
                    console.log(`Initialized block tracking for ${chain} at block ${currentBlock}`);
                    continue; // Skip first scan, start from next block
                }
            }
            await scanChainForTransactions(chain);
        }
    }

    console.log('Transaction scan completed');
}
