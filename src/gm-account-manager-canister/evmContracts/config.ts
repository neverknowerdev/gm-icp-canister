// Configuration management for contract addresses
// Event signatures are auto-generated from ABI

import { Chain, chainIdFromName } from '../utils/types';
import { getEventSignature as getAbiEventSignature } from './eventDecoder';

// Contract addresses for a chain
export interface ChainContracts {
    accountManager: string;
    GMCoin?: string;  // Optional - not required for account manager
}

// Input config interface (contracts only, signatures auto-generated)
export interface ContractsConfig {
    contracts: {
        [chain: string]: ChainContracts;
    };
}

// Internal storage
let contractsByChainId = new Map<Chain, ChainContracts>();
let eventSignaturesCache: Record<string, string> = {};
let configInitialized = false;

// List of events we support (signatures will be derived from ABI)
const SUPPORTED_EVENTS = [
    'VerifyFarcasterRequested',
    'VerifyTwitterByAuthCodeRequested',
    'UserCreated',
    'UserRemoved',
    'SocialAccountLinked',
    'PrimaryWalletUpdated',
    'WalletLinked',
    'HumanVerificationUpdated',
];

/**
 * Initialize event signatures from ABI
 */
function initEventSignatures(): void {
    eventSignaturesCache = {};
    for (const eventName of SUPPORTED_EVENTS) {
        const signature = getAbiEventSignature(eventName);
        if (signature) {
            eventSignaturesCache[eventName] = signature;
        }
    }
}

/**
 * Ensure config is initialized with defaults
 * NOTE: Do NOT clear contracts here - they may have been set via setContractAddresses
 * Only initialize event signatures if not already done
 */
function ensureInitialized(): void {
    if (!configInitialized) {
        // Initialize event signatures from ABI (if not already initialized)
        // Do NOT clear contracts - they may have been set via setContractAddresses
        // contractsByChainId should persist across upgrades if using stable memory
        initEventSignatures();
        configInitialized = true;
    }
}

/**
 * Update internal storage from config (converts chain names to chain IDs)
 */
function updateContractStorage(config: ContractsConfig): void {
    contractsByChainId.clear();
    for (const [chainName, contracts] of Object.entries(config.contracts)) {
        const chainId = chainIdFromName(chainName);
        if (chainId !== null) {
            contractsByChainId.set(chainId, contracts);
        }
    }
}

/**
 * Initialize contracts (called during canister init or deployment)
 * Event signatures are auto-generated from ABI
 */
export function initContracts(config: ContractsConfig): void {
    updateContractStorage(config);
    initEventSignatures();
    configInitialized = true;
    console.log('Contract addresses initialized');
}

/**
 * Get contracts for a chain (by chain ID)
 */
export function getContracts(chain: Chain): ChainContracts | null {
    ensureInitialized();
    return contractsByChainId.get(chain) || null;
}

/**
 * Get all contract addresses for a chain as an array (for filtering/validation)
 */
export function getContractAddresses(chain: Chain): string[] {
    const contracts = getContracts(chain);
    if (!contracts) return [];
    const addresses: string[] = [];
    if (contracts.accountManager && typeof contracts.accountManager === 'string' && contracts.accountManager.trim() !== '') {
        addresses.push(contracts.accountManager);
    }
    if (contracts.GMCoin && typeof contracts.GMCoin === 'string' && contracts.GMCoin.trim() !== '') {
        addresses.push(contracts.GMCoin);
    }
    return addresses.filter(addr => addr && typeof addr === 'string' && addr.trim() !== '');
}

/**
 * Get event signature hash by event name
 * Signatures are auto-generated from ABI
 */
export function getEventSignature(eventName: string): string | null {
    ensureInitialized();
    return eventSignaturesCache[eventName] || null;
}

/**
 * Get all event signatures
 * Signatures are auto-generated from ABI
 */
export function getAllEventSignatures(): Record<string, string> {
    ensureInitialized();
    return { ...eventSignaturesCache };
}

