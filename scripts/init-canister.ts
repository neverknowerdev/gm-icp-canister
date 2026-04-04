/**
 * Canister initialization types and functions
 * 
 * This file defines the configuration structure for initializing
 * the account-manager canister after deployment.
 * 
 * Configuration is set via canister update methods:
 * - setContractAddresses: Set smart contract addresses for each chain
 * - setTwitterConfig: Set Twitter API configuration (with encrypted bearer token)
 * - setFarcasterConfig: Set Farcaster API configuration (with encrypted API key)
 * 
 * Event signatures are automatically calculated from the ABI during initialization.
 */

import { initContracts } from '../src/gm-account-manager-canister/evmContracts/config';

/**
 * Chain contract addresses configuration
 */
interface ChainContracts {
    accountManager: string;
    GMCoin: string;
}

/**
 * Contracts configuration for all chains
 */
interface ContractsConfig {
    contracts: {
        [chain: string]: ChainContracts;
    };
}

/**
 * Twitter API configuration
 * bearerToken should be encrypted using the canister's public key
 */
interface TwitterConfig {
    tweetFetchURL: string;
    headerName: string;
    bearerTokenEncrypted: string;
}

/**
 * Farcaster API configuration
 * apiKey should be encrypted using the canister's public key
 */
interface FarcasterConfig {
    apiKeyEncrypted: string;
    apiUrl?: string;
}

/**
 * Initialize canister with contract addresses
 * Event signatures are auto-calculated from ABI
 */
export function initWithContracts(config: ContractsConfig): void {
    initContracts(config);
}

/**
 * Example configuration for reference
 */
export const exampleConfig: ContractsConfig = {
    contracts: {
        'Base Mainnet': {
            accountManager: '0x...',
            GMCoin: '0x...',
        },
        'WorldChain': {
            accountManager: '0x...',
            GMCoin: '0x...',
        },
    },
};
