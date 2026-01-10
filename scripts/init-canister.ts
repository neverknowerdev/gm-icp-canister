/**
 * Canister initialization function
 * This can be called during canister deployment to initialize configuration
 * 
 * Note: This is a TypeScript file that can be used if you want to initialize
 * the canister with config during deployment. For now, config is loaded from
 * the default values and can be updated via a separate update method if needed.
 */

import { initContracts } from '../src/gm-account-manager-canister/evmContracts/config';

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

/**
 * Initialize canister with configuration
 * This would be called during canister deployment
 */
export function init(config: Config): void {
    initContracts(config);
}

