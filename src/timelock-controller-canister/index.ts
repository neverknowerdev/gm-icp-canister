import { query, update, IDL, Principal, ic } from 'azle';
import * as timelock from './utils/timelock';

export default class {
    constructor() {
        // Initialize timelock mechanism on canister creation
        try {
            timelock.initializeTimelock();
        } catch (error: any) {
            console.error(`Error initializing timelock: ${error}`);
        }
    }

    /**
     * Schedule an upgrade proposal with timelock delay (default: 3 days)
     * Only canister controllers can schedule upgrades
     * @param proposalId Unique identifier for this upgrade proposal
     * @param targetCanisterId Principal ID of the canister to upgrade
     * @param moduleHash Hash of the new WASM module (should be computed from the WASM file)
     * @param description Optional description of what the upgrade does
     */
    @update([IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Text)], IDL.Null)
    scheduleUpgrade(
        proposalId: string,
        targetCanisterId: string,
        moduleHash: string,
        description?: string
    ): null {
        try {
            const caller = ic.caller();
            const proposer = caller.toString();

            timelock.scheduleUpgrade(proposalId, targetCanisterId, moduleHash, proposer, description || undefined);
            console.log(`Upgrade scheduled by ${proposer} for canister ${targetCanisterId}`);
            return null;
        } catch (error: any) {
            console.error(`Error scheduling upgrade: ${error}`);
            throw new Error(`Failed to schedule upgrade: ${error.message || error}`);
        }
    }

    /**
     * Check if an upgrade proposal is ready to be executed
     * @param proposalId The proposal ID to check
     * @returns true if ready, false otherwise
     */
    @query([IDL.Text], IDL.Bool)
    isUpgradeReady(proposalId: string): boolean {
        try {
            return timelock.isUpgradeReady(proposalId);
        } catch (error: any) {
            console.error(`Error checking upgrade readiness: ${error}`);
            return false;
        }
    }

    /**
     * Get upgrade proposal details
     * @param proposalId The proposal ID
     * @returns Upgrade proposal details or null if not found
     */
    @query([IDL.Text], IDL.Opt(IDL.Record({
        proposalId: IDL.Text,
        targetCanisterId: IDL.Text,
        moduleHash: IDL.Text,
        scheduledTime: IDL.Nat64,
        delay: IDL.Nat64,
        proposer: IDL.Text,
        description: IDL.Opt(IDL.Text),
        executed: IDL.Bool,
    })))
    getUpgradeProposal(proposalId: string): any {
        try {
            const proposal = timelock.getUpgradeProposal(proposalId);
            if (!proposal) {
                return [];
            }
            return [{
                proposalId: proposal.proposalId,
                targetCanisterId: proposal.targetCanisterId,
                moduleHash: proposal.moduleHash,
                scheduledTime: proposal.scheduledTime,
                delay: proposal.delay,
                proposer: proposal.proposer,
                description: proposal.description ? [proposal.description] : [],
                executed: proposal.executed,
            }];
        } catch (error: any) {
            console.error(`Error getting upgrade proposal: ${error}`);
            return [];
        }
    }

    /**
     * Get all upgrade proposals (optionally filtered by target canister)
     * @param targetCanisterId Optional canister ID to filter by
     * @returns Array of upgrade proposals
     */
    @query([IDL.Opt(IDL.Text)], IDL.Vec(IDL.Record({
        proposalId: IDL.Text,
        targetCanisterId: IDL.Text,
        moduleHash: IDL.Text,
        scheduledTime: IDL.Nat64,
        delay: IDL.Nat64,
        proposer: IDL.Text,
        description: IDL.Opt(IDL.Text),
        executed: IDL.Bool,
    })))
    getAllUpgradeProposals(targetCanisterId?: string): any[] {
        try {
            const proposals = timelock.getAllUpgradeProposals(targetCanisterId || undefined);
            return proposals.map(p => ({
                proposalId: p.proposalId,
                targetCanisterId: p.targetCanisterId,
                moduleHash: p.moduleHash,
                scheduledTime: p.scheduledTime,
                delay: p.delay,
                proposer: p.proposer,
                description: p.description ? [p.description] : [],
                executed: p.executed,
            }));
        } catch (error: any) {
            console.error(`Error getting all upgrade proposals: ${error}`);
            return [];
        }
    }

    /**
     * Verify that an upgrade can be executed (checks proposal and time delay)
     * This should be called before executing the actual upgrade via dfx
     * @param proposalId The proposal ID
     * @param moduleHash The module hash to verify
     * @throws Error if upgrade cannot be executed
     */
    @query([IDL.Text, IDL.Text], IDL.Bool)
    verifyUpgrade(proposalId: string, moduleHash: string): boolean {
        try {
            timelock.checkTimeDelay(proposalId, moduleHash);
            return true;
        } catch (error: any) {
            console.error(`Upgrade verification failed: ${error.message || error}`);
            throw new Error(`Upgrade verification failed: ${error.message || error}`);
        }
    }

    /**
     * Mark an upgrade proposal as executed
     * Call this after successfully executing an upgrade via dfx
     * @param proposalId The proposal ID to mark as executed
     */
    @update([IDL.Text], IDL.Null)
    markUpgradeExecuted(proposalId: string): null {
        try {
            timelock.markUpgradeExecuted(proposalId);
            console.log(`Upgrade proposal ${proposalId} marked as executed`);
            return null;
        } catch (error: any) {
            console.error(`Error marking upgrade as executed: ${error}`);
            throw new Error(`Failed to mark upgrade as executed: ${error.message || error}`);
        }
    }

    /**
     * Clear an upgrade proposal (removes it)
     * Only canister controllers can clear proposals
     * @param proposalId The proposal ID to clear
     */
    @update([IDL.Text], IDL.Null)
    clearUpgradeProposal(proposalId: string): null {
        try {
            timelock.clearUpgradeProposal(proposalId);
            console.log(`Upgrade proposal ${proposalId} cleared`);
            return null;
        } catch (error: any) {
            console.error(`Error clearing upgrade proposal: ${error}`);
            throw new Error(`Failed to clear upgrade proposal: ${error.message || error}`);
        }
    }

    /**
     * Cancel an upgrade proposal (removes it without execution)
     * Only canister controllers can cancel proposals
     * @param proposalId The proposal ID to cancel
     */
    @update([IDL.Text], IDL.Null)
    cancelUpgradeProposal(proposalId: string): null {
        try {
            timelock.cancelUpgradeProposal(proposalId);
            console.log(`Upgrade proposal ${proposalId} cancelled`);
            return null;
        } catch (error: any) {
            console.error(`Error cancelling upgrade proposal: ${error}`);
            throw new Error(`Failed to cancel upgrade proposal: ${error.message || error}`);
        }
    }

    /**
     * Get time remaining until upgrade can be executed
     * @param proposalId The proposal ID
     * @returns Remaining time in nanoseconds, or 0 if ready/not found
     */
    @query([IDL.Text], IDL.Nat64)
    getUpgradeTimeRemaining(proposalId: string): bigint {
        try {
            return timelock.getTimeRemaining(proposalId);
        } catch (error: any) {
            console.error(`Error getting upgrade time remaining: ${error}`);
            return BigInt(0);
        }
    }

    /**
     * Get the configured timelock delay
     * @returns Delay in nanoseconds
     */
    @query([], IDL.Nat64)
    getTimelockDelay(): bigint {
        return timelock.getTimelockDelay();
    }

    /**
     * Set the timelock delay (minimum: 1 day)
     * Only canister controllers can change the delay
     * @param delayNs New delay in nanoseconds
     */
    @update([IDL.Nat64], IDL.Null)
    setTimelockDelay(delayNs: bigint): null {
        try {
            timelock.setTimelockDelay(delayNs);
            console.log(`Timelock delay updated to: ${delayNs}ns`);
            return null;
        } catch (error: any) {
            console.error(`Error setting timelock delay: ${error}`);
            throw new Error(`Failed to set timelock delay: ${error.message || error}`);
        }
    }
}

