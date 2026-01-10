// Transaction Scanner - periodically scans for unprocessed transactions

import { call, IDL } from 'azle';
import { processEvent } from '../eventProcessor';
import { getLastProcessedBlock, updateLastProcessedBlock, getTrackedChains } from '../storage/blockTracker';
import { getContractAddresses } from '../evmContracts/config';
import { isTransactionProcessed } from '../storage/transactionTracker';
import { Chain, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN, chainName } from '../utils/types';
import { EVM_RPC_CANISTER_ID, RpcServices, RpcConfig, getRpcServices, createDefaultRpcConfig } from '../evmContracts/evmRpc';


/**
 * Get logs for a range of blocks using eth_getLogs
 * This is more efficient than scanning individual blocks
 */
async function getLogsForBlocks(
    chain: Chain,
    fromBlock: number,
    toBlock: number,
    contractAddresses: string[]
): Promise<Array<{ transactionHash: string }>> {
    try {
        const rpcServices = getRpcServices(chain);
        const rpcConfig = createDefaultRpcConfig(10_000_000n); // Increased for potentially many logs

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
        console.error(`Error getting logs for blocks ${fromBlock}-${toBlock} on ${chainName(chain)} (${chain}): ${error}`);
        return [];
    }
}

/**
 * Scan chain for unprocessed transactions since last check
 */
async function scanChainForTransactions(chain: Chain): Promise<void> {
    console.log(`Scanning ${chainName(chain)} (${chain}) for unprocessed transactions...`);

    const lastBlock = getLastProcessedBlock(chain);

    // Get contract addresses for this chain
    const contractAddresses = getContractAddresses(chain);
    if (contractAddresses.length === 0) {
        console.log(`No contracts configured for ${chain}, skipping scan`);
        return;
    }

    // Limit the range to avoid too much processing at once
    // Scan a fixed window ahead from last processed block
    const maxBlocksToScan = 1000;
    const endBlock = lastBlock + maxBlocksToScan;

    // Use eth_getLogs to get all logs from our contracts in the block range
    const logs = await getLogsForBlocks(chain, lastBlock + 1, endBlock, contractAddresses);

    console.log(`Found ${logs.length} transactions from our contracts in blocks ${lastBlock + 1}-${endBlock}`);

    // Process each unique transaction
    let processedCount = 0;
    let skippedCount = 0;

    for (const log of logs) {
        const txHash = log.transactionHash;

        // Check if already processed on this chain
        if (isTransactionProcessed(chain, txHash)) {
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
    console.log(`Completed scanning ${chainName(chain)} (${chain}): processed ${processedCount} transactions, skipped ${skippedCount} already processed, up to block ${endBlock}`);
}

/**
 * Scan all configured chains for unprocessed transactions
 */
export async function scanAllChains(): Promise<void> {
    console.log('Starting transaction scan for all chains...');

    // Get all chains from config
    const chains = getTrackedChains();

    // If no chains tracked yet, initialize from config
    const defaultChains: Chain[] = [CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN];
    const chainsToScan = chains.length > 0 ? chains : defaultChains;

    for (const chain of chainsToScan) {
        const contracts = getContractAddresses(chain);
        if (contracts.length > 0) {
            // If no blocks tracked yet, start from block 0 (will be updated as transactions are processed)
            if (getLastProcessedBlock(chain) === 0) {
                console.log(`Starting block tracking for ${chainName(chain)} (${chain}) from block 0`);
            }
            await scanChainForTransactions(chain);
        }
    }

    console.log('Transaction scan completed');
}
