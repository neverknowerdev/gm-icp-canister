// Configuration management
// Reads from canister-config.json which is generated during deployment

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

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
            'Monad': [],
        },
        eventSignatures: {
            'VerifyFarcasterRequested': '',
            'VerifyTwitterByAuthCodeRequested': '',
        },
    };

    // TODO: In production, load from canister-config.json or initialize via canister init
    // For now, return default config
    configCache = defaultConfig;
    return configCache;
}

/**
 * Initialize config (called during canister init or deployment)
 */
export function initConfig(config: Config): void {
    configCache = config;
    console.log('Configuration initialized');
}

/**
 * Get contract addresses for a chain
 */
export function getContractAddresses(chain: string): string[] {
    const config = loadConfig();
    return config.contracts[chain] || [];
}

/**
 * Get first contract address for a chain (primary contract)
 */
export function getContractAddress(chain: string): string | null {
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

