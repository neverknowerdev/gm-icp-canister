// Configuration management
// Reads from canister-config.json which is generated during deployment

import { Chain, chainIdFromName, chainName, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from './types';

// Config interface accepts chain names (for API compatibility)
interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

// Internal storage uses chain IDs as keys
let contractsByChainId = new Map<Chain, string[]>();
let configCache: Config | null = null;

/**
 * Loads configuration from JSON file
 * In Azle, we can't directly read files, so this will be initialized via canister init
 * For now, we'll use a default config that can be updated
 */
function loadConfig(): Config {
    if (configCache) {
        return configCache;
    }

    // Default configuration
    // This will be replaced by actual config during deployment
    const defaultConfig: Config = {
        contracts: {
            'Base Mainnet': [],
            'WorldChain': [],
        },
        eventSignatures: {
            'VerifyFarcasterRequested': '',
            'VerifyTwitterByAuthCodeRequested': '',
            'UserCreated': '',
            'UserRemoved': '',
            'SocialAccountLinked': '',
            'PrimaryWalletUpdated': '',
            'WalletLinked': '',
            'HumanVerificationUpdated': '',
        },
    };

    // TODO: In production, load from canister-config.json or initialize via canister init
    // For now, return default config
    configCache = defaultConfig;
    // Initialize internal storage
    updateInternalStorage(defaultConfig);
    return configCache;
}

/**
 * Update internal storage from config (converts chain names to chain IDs)
 */
function updateInternalStorage(config: Config): void {
    contractsByChainId.clear();
    for (const [chainName, addresses] of Object.entries(config.contracts)) {
        const chainId = chainIdFromName(chainName);
        if (chainId !== null) {
            contractsByChainId.set(chainId, addresses);
        }
    }
}

/**
 * Initialize config (called during canister init or deployment)
 */
export function initConfig(config: Config): void {
    configCache = config;
    updateInternalStorage(config);
    console.log('Configuration initialized');
}

/**
 * Get contract addresses for a chain (by chain ID)
 */
export function getContractAddresses(chain: Chain): string[] {
    loadConfig(); // Ensure config is loaded
    return contractsByChainId.get(chain) || [];
}

/**
 * Get first contract address for a chain (primary contract)
 */
export function getContractAddress(chain: Chain): string | null {
    const addresses = getContractAddresses(chain);
    return addresses.length > 0 ? addresses[0] : null;
}

/**
 * Get event signature hash by event name
 */
export function getEventSignature(eventName: string): string | null {
    const config = loadConfig();
    return config.eventSignatures[eventName] || null;
}

/**
 * Get all event signatures
 */
export function getAllEventSignatures(): Record<string, string> {
    const config = loadConfig();
    return config.eventSignatures;
}

