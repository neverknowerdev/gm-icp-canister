// Timelock utility for upgrade scheduling with delay
// This is the core timelock logic for the Timelock Controller Canister

import { StableBTreeMap, ic } from 'azle';

// Default delay: 3 days in nanoseconds
const DEFAULT_DELAY_NS = BigInt(3 * 24 * 60 * 60 * 1_000_000_000);

// Minimum delay: 1 day in nanoseconds (security requirement)
const MINIMUM_DELAY_NS = BigInt(24 * 60 * 60 * 1_000_000_000);

export interface UpgradeProposal {
    proposalId: string;
    targetCanisterId: string; // Principal ID of the canister to upgrade
    moduleHash: string; // Hash of the new WASM module
    scheduledTime: bigint; // Timestamp in nanoseconds when upgrade can be executed
    delay: bigint; // Delay period in nanoseconds
    proposer: string; // Principal ID of the proposer
    description?: string; // Optional description of the upgrade
    executed: boolean; // Whether the upgrade has been executed
}

// Stable storage for timelock state
// Key: proposalId, Value: UpgradeProposal
const upgradeProposalsStorage = new StableBTreeMap<string, UpgradeProposal>(0);

// Storage for the configured delay (singleton)
const TIMELOCK_DELAY_KEY = 'timelock_delay';
const timelockDelayStorage = new StableBTreeMap<string, bigint>(1);

/**
 * Get current time in nanoseconds
 * Uses ic.time() from Azle, falls back to Date.now() for testing
 */
function getCurrentTime(): bigint {
    try {
        // Use ic.time() from Azle (returns nanoseconds)
        return ic.time();
    } catch {
        // Fallback for testing environments where ic.time() might not be available
        // Convert milliseconds to nanoseconds
        return BigInt(Date.now() * 1_000_000);
    }
}

/**
 * Initialize timelock with default delay (3 days)
 * Should be called during canister initialization
 */
export function initializeTimelock(): void {
    const existingDelay = timelockDelayStorage.get(TIMELOCK_DELAY_KEY);
    if (existingDelay.length === 0) {
        timelockDelayStorage.insert(TIMELOCK_DELAY_KEY, DEFAULT_DELAY_NS);
        console.log(`Timelock initialized with default delay: ${DEFAULT_DELAY_NS}ns (3 days)`);
    } else {
        console.log(`Timelock already initialized with delay: ${existingDelay[0]}ns`);
    }
}

/**
 * Get the configured timelock delay
 */
export function getTimelockDelay(): bigint {
    const delay = timelockDelayStorage.get(TIMELOCK_DELAY_KEY);
    if (delay.length === 0) {
        // Return default if not initialized
        return DEFAULT_DELAY_NS;
    }
    return delay[0];
}

/**
 * Set the timelock delay (only allowed if >= 1 day)
 */
export function setTimelockDelay(newDelay: bigint): void {
    if (newDelay < MINIMUM_DELAY_NS) {
        throw new Error(`Timelock delay must be at least ${MINIMUM_DELAY_NS}ns (1 day)`);
    }
    timelockDelayStorage.insert(TIMELOCK_DELAY_KEY, newDelay);
    console.log(`Timelock delay updated to: ${newDelay}ns`);
}

/**
 * Schedule an upgrade proposal
 * @param proposalId Unique identifier for this upgrade proposal
 * @param targetCanisterId Principal ID of the canister to upgrade
 * @param moduleHash Hash of the new WASM module to be deployed
 * @param proposer Principal ID of the person proposing the upgrade
 * @param description Optional description of what the upgrade does
 * @throws Error if proposal already exists or delay is too short
 */
export function scheduleUpgrade(
    proposalId: string,
    targetCanisterId: string,
    moduleHash: string,
    proposer: string,
    description?: string
): void {
    if (!proposalId || !targetCanisterId || !moduleHash) {
        throw new Error('Proposal ID, target canister ID, and module hash are required');
    }

    // Check if proposal already exists
    if (upgradeProposalsStorage.containsKey(proposalId)) {
        throw new Error(`Upgrade proposal with ID ${proposalId} already exists`);
    }

    const delay = getTimelockDelay();
    if (delay < MINIMUM_DELAY_NS) {
        throw new Error(`Timelock delay is too short (minimum: ${MINIMUM_DELAY_NS}ns)`);
    }

    const currentTime = getCurrentTime();
    const scheduledTime = currentTime + delay;

    const proposal: UpgradeProposal = {
        proposalId,
        targetCanisterId,
        moduleHash,
        scheduledTime,
        delay,
        proposer,
        description,
        executed: false,
    };

    upgradeProposalsStorage.insert(proposalId, proposal);

    console.log(`Upgrade proposal scheduled:`);
    console.log(`  Proposal ID: ${proposalId}`);
    console.log(`  Target Canister: ${targetCanisterId}`);
    console.log(`  Module Hash: ${moduleHash}`);
    console.log(`  Scheduled Time: ${scheduledTime} (${new Date(Number(scheduledTime / BigInt(1_000_000))).toISOString()})`);
    console.log(`  Delay: ${delay}ns (${Number(delay / BigInt(1_000_000_000)) / (24 * 60 * 60)} days)`);
}

/**
 * Check if an upgrade proposal is ready to be executed
 * @param proposalId The proposal ID to check
 * @returns true if the delay has passed, false otherwise
 * @throws Error if proposal doesn't exist
 */
export function isUpgradeReady(proposalId: string): boolean {
    const proposals = upgradeProposalsStorage.get(proposalId);
    if (proposals.length === 0) {
        throw new Error(`Upgrade proposal with ID ${proposalId} not found`);
    }

    const proposal = proposals[0];
    const currentTime = getCurrentTime();

    return currentTime >= proposal.scheduledTime && !proposal.executed;
}

/**
 * Get upgrade proposal details
 * @param proposalId The proposal ID
 * @returns UpgradeProposal if found, null otherwise
 */
export function getUpgradeProposal(proposalId: string): UpgradeProposal | null {
    const proposals = upgradeProposalsStorage.get(proposalId);
    if (proposals.length === 0) {
        return null;
    }
    return proposals[0];
}

/**
 * Get all upgrade proposals for a specific canister
 * @param targetCanisterId The canister ID to filter by (optional)
 * @returns Array of upgrade proposals
 */
export function getAllUpgradeProposals(targetCanisterId?: string): UpgradeProposal[] {
    const allProposals = upgradeProposalsStorage.values();
    if (!targetCanisterId) {
        return allProposals;
    }
    return allProposals.filter(p => p.targetCanisterId === targetCanisterId);
}

/**
 * Check if an upgrade can be executed (validates proposal and time delay)
 * @param proposalId The proposal ID
 * @param moduleHash The module hash to verify against the proposal
 * @throws Error if proposal doesn't exist, module hash doesn't match, delay hasn't passed, or already executed
 */
export function checkTimeDelay(proposalId: string, moduleHash: string): void {
    const proposals = upgradeProposalsStorage.get(proposalId);
    if (proposals.length === 0) {
        throw new Error(`Upgrade proposal with ID ${proposalId} not found`);
    }

    const proposal = proposals[0];

    if (proposal.executed) {
        throw new Error(`Upgrade proposal ${proposalId} has already been executed`);
    }

    if (proposal.moduleHash !== moduleHash) {
        throw new Error(`Module hash mismatch. Expected: ${proposal.moduleHash}, Got: ${moduleHash}`);
    }

    const currentTime = getCurrentTime();
    if (currentTime < proposal.scheduledTime) {
        const remainingNs = proposal.scheduledTime - currentTime;
        const remainingSeconds = Number(remainingNs / BigInt(1_000_000_000));
        const remainingDays = remainingSeconds / (24 * 60 * 60);
        throw new Error(
            `Time delay not passed. Remaining: ${remainingDays.toFixed(2)} days (${remainingSeconds}s)`
        );
    }
}

/**
 * Mark an upgrade proposal as executed
 * @param proposalId The proposal ID to mark as executed
 */
export function markUpgradeExecuted(proposalId: string): void {
    const proposals = upgradeProposalsStorage.get(proposalId);
    if (proposals.length === 0) {
        throw new Error(`Upgrade proposal with ID ${proposalId} not found`);
    }

    const proposal = proposals[0];
    proposal.executed = true;
    upgradeProposalsStorage.insert(proposalId, proposal);
    console.log(`Upgrade proposal ${proposalId} marked as executed`);
}

/**
 * Clear an upgrade proposal (removes it)
 * @param proposalId The proposal ID to clear
 */
export function clearUpgradeProposal(proposalId: string): void {
    const removed = upgradeProposalsStorage.remove(proposalId);
    if (removed === null) {
        throw new Error(`Upgrade proposal with ID ${proposalId} not found`);
    }
    console.log(`Upgrade proposal ${proposalId} cleared`);
}

/**
 * Cancel an upgrade proposal (removes it without execution)
 * @param proposalId The proposal ID to cancel
 */
export function cancelUpgradeProposal(proposalId: string): void {
    clearUpgradeProposal(proposalId);
    console.log(`Upgrade proposal ${proposalId} cancelled`);
}

/**
 * Get time remaining until upgrade can be executed
 * @param proposalId The proposal ID
 * @returns Remaining time in nanoseconds, or 0 if ready/not found
 */
export function getTimeRemaining(proposalId: string): bigint {
    const proposals = upgradeProposalsStorage.get(proposalId);
    if (proposals.length === 0) {
        return BigInt(0);
    }

    const proposal = proposals[0];

    if (proposal.executed) {
        return BigInt(0);
    }

    const currentTime = getCurrentTime();

    if (currentTime >= proposal.scheduledTime) {
        return BigInt(0);
    }

    return proposal.scheduledTime - currentTime;
}

