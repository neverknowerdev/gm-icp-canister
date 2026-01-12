# Timelock Controller Canister for ICP

This document describes the Timelock Controller Canister implementation for managing upgrades of `gm-account-manager-canister` and `gm-minting-canister`. The timelock provides a security layer that enforces a delay period before canister upgrades can be executed, similar to timelock patterns used in smart contracts.

## Architecture

The timelock mechanism is implemented as a **separate controller canister** that must be set as the controller for the two existing canisters. This ensures that upgrades cannot bypass the timelock by using `dfx deploy` directly.

### Architecture Diagram

```
┌─────────────────────────────────┐
│  Timelock Controller Canister   │
│  (timelock-controller-canister) │
│                                 │
│  - Stores upgrade proposals     │
│  - Enforces delay (3 days)      │
│  - Validates upgrades           │
└──────────────┬──────────────────┘
               │ Controller
               │
       ┌───────┴───────┐
       │               │
┌──────▼──────┐  ┌─────▼─────────┐
│gm-account-  │  │gm-minting-    │
│manager-     │  │canister       │
│canister     │  │               │
└─────────────┘  └───────────────┘
```

## Overview

The Timelock Controller Canister requires that all canister upgrades be scheduled in advance with a minimum delay period (default: 3 days). This provides:

- **Security**: Prevents immediate, potentially malicious upgrades
- **Transparency**: All upgrade proposals are visible and trackable
- **Time for Review**: Stakeholders have time to review proposed upgrades before they execute
- **Audit Trail**: Complete history of upgrade proposals and their status
- **Enforcement**: Upgrades cannot bypass the timelock because the controller canister controls upgrade permissions

## How It Works

The timelock mechanism follows this workflow:

1. **Set Controller**: The Timelock Controller Canister is set as the controller for the target canisters
2. **Schedule Upgrade**: A proposal is scheduled with a proposal ID, target canister ID, and module hash
3. **Wait Period**: The upgrade cannot be executed until the delay period (default: 3 days) has passed
4. **Verify**: Before executing the upgrade, verify that the delay has passed and the module hash matches
5. **Execute**: Perform the actual upgrade using `dfx` (only the Timelock Controller can upgrade its controlled canisters)
6. **Mark Executed**: Mark the proposal as executed after successful upgrade

### Key Components

- **Upgrade Proposal**: Contains proposal ID, target canister ID, module hash, scheduled execution time, delay, proposer, and optional description
- **Timelock Storage**: Uses `StableBTreeMap` for persistent storage across canister upgrades
- **Time Tracking**: Uses ICP's `ic.time()` API to track current time and enforce delays
- **Default Delay**: 3 days (259,200,000,000,000 nanoseconds)
- **Minimum Delay**: 1 day (24 hours) - enforced for security

## Setup

### 1. Deploy the Timelock Controller Canister

First, deploy the Timelock Controller Canister:

```bash
# Build the canister
dfx build timelock-controller-canister

# Deploy (local)
dfx deploy timelock-controller-canister

# Or deploy to mainnet
dfx deploy timelock-controller-canister --network ic
```

### 2. Set Timelock Controller as Controller

**CRITICAL**: Set the Timelock Controller Canister as the controller for your target canisters. This ensures upgrades can only go through the timelock.

```bash
# Get the Timelock Controller Canister ID
TIMELOCK_ID=$(dfx canister id timelock-controller-canister)

# Set it as controller for account manager canister
dfx canister update-settings gm-account-manager-canister \
  --controller $TIMELOCK_ID \
  --network ic

# Set it as controller for minting canister
dfx canister update-settings gm-minting-canister \
  --controller $TIMELOCK_ID \
  --network ic
```

**Note**: After this step, you (and your original principal) will no longer be able to upgrade the canisters directly. All upgrades must go through the Timelock Controller.

### 3. Verify Timelock Status

Check that the timelock is properly initialized:

```bash
# Check current delay setting
dfx canister call timelock-controller-canister getTimelockDelay
```

Expected output: `(259_200_000_000_000 : nat64)` (3 days in nanoseconds)

### 4. (Optional) Customize Delay

If you need to change the delay (minimum: 1 day):

```bash
# Set delay to 7 days (in nanoseconds)
# 7 days = 7 * 24 * 60 * 60 * 1_000_000_000 = 604_800_000_000_000 nanoseconds

dfx canister call timelock-controller-canister setTimelockDelay '(604_800_000_000_000 : nat64)'
```

**Note**: Only the Timelock Controller's controllers can modify the delay.

## Usage

### Step 1: Compute Module Hash

Before scheduling an upgrade, you need to compute the hash of the new WASM module:

```bash
# Build the canister first
dfx build gm-account-manager-canister

# Compute SHA-256 hash of the WASM file
sha256sum .azle/gm-account-manager-canister/gm-account-manager-canister.wasm

# Or on macOS:
shasum -a 256 .azle/gm-account-manager-canister/gm-account-manager-canister.wasm
```

The output will be a 64-character hexadecimal string (e.g., `a1b2c3d4e5f6...`).

**Alternative**: You can also use Node.js to compute the hash:

```javascript
const crypto = require('crypto');
const fs = require('fs');

const wasm = fs.readFileSync('.azle/gm-account-manager-canister/gm-account-manager-canister.wasm');
const hash = crypto.createHash('sha256').update(wasm).digest('hex');
console.log(hash);
```

### Step 2: Get Target Canister ID

Get the Principal ID of the canister you want to upgrade:

```bash
# Get canister ID
ACCOUNT_MANAGER_ID=$(dfx canister id gm-account-manager-canister --network ic)
echo $ACCOUNT_MANAGER_ID

# Or for minting canister
MINTING_ID=$(dfx canister id gm-minting-canister --network ic)
echo $MINTING_ID
```

### Step 3: Schedule the Upgrade

Schedule the upgrade proposal with a unique proposal ID:

```bash
# Schedule upgrade for account manager canister
dfx canister call timelock-controller-canister scheduleUpgrade '(
  "upgrade-v1.2.0",  # proposal ID (unique identifier)
  "'$ACCOUNT_MANAGER_ID'",  # target canister ID
  "a1b2c3d4e5f6...", # module hash (SHA-256 of WASM file)
  opt "Add new feature X and fix bug Y"  # optional description
)'

# Schedule upgrade for minting canister
dfx canister call timelock-controller-canister scheduleUpgrade '(
  "upgrade-v1.2.0-minting",
  "'$MINTING_ID'",
  "a1b2c3d4e5f6...",
  opt "Performance improvements and bug fixes"
)'
```

**Important Notes**:
- The proposal ID must be unique
- The module hash must match the actual WASM file you intend to deploy
- The target canister ID must be the Principal ID of the canister to upgrade
- Only the Timelock Controller's controllers can schedule upgrades
- The proposer (caller's principal) is automatically recorded

### Step 4: Check Proposal Status

Query the proposal to see when it will be ready:

```bash
# Get proposal details
dfx canister call timelock-controller-canister getUpgradeProposal '("upgrade-v1.2.0")'

# Check if upgrade is ready to execute
dfx canister call timelock-controller-canister isUpgradeReady '("upgrade-v1.2.0")'

# Get time remaining until upgrade can be executed (in nanoseconds)
dfx canister call timelock-controller-canister getUpgradeTimeRemaining '("upgrade-v1.2.0")'
```

### Step 5: Wait for Delay Period

Wait until the delay period has passed. You can periodically check if the upgrade is ready:

```bash
# Check readiness (returns true when ready)
dfx canister call timelock-controller-canister isUpgradeReady '("upgrade-v1.2.0")'
```

### Step 6: Verify Before Upgrade

**CRITICAL**: Always verify the upgrade before executing it:

```bash
# Verify upgrade can be executed
# This checks: proposal exists, delay has passed, module hash matches
dfx canister call timelock-controller-canister verifyUpgrade '(
  "upgrade-v1.2.0",
  "a1b2c3d4e5f6..."  # Must match the hash used in scheduleUpgrade
)'
```

If verification succeeds, the upgrade can proceed. If it fails, you'll receive an error message explaining why.

### Step 7: Execute the Upgrade

After verification succeeds, execute the upgrade using `dfx`. Since the Timelock Controller is the controller, only it can upgrade the canisters (though in practice, you would need to use the Timelock Controller's controller principal to execute the upgrade):

```bash
# Deploy the upgrade (you need to be a controller of the Timelock Controller)
dfx deploy gm-account-manager-canister --network ic

# Or for minting canister
dfx deploy gm-minting-canister --network ic
```

**Important**: The actual upgrade is performed via `dfx deploy`, but because the Timelock Controller is the controller of the target canisters, upgrades can only proceed if you have controller access to the Timelock Controller.

### Step 8: Mark Upgrade as Executed

After successful upgrade, mark the proposal as executed:

```bash
# Mark the proposal as executed
dfx canister call timelock-controller-canister markUpgradeExecuted '("upgrade-v1.2.0")'
```

### Step 9: (Optional) Clear the Proposal

After marking as executed, you can optionally clear the proposal:

```bash
# Clear the proposal after successful upgrade
dfx canister call timelock-controller-canister clearUpgradeProposal '("upgrade-v1.2.0")'
```

This removes the proposal from storage and keeps the system clean.

## Canceling an Upgrade Proposal

If you need to cancel a scheduled upgrade (before it's executed):

```bash
# Cancel the proposal
dfx canister call timelock-controller-canister cancelUpgradeProposal '("upgrade-v1.2.0")'
```

**Note**: You can schedule a new proposal with the same or different module hash after canceling.

## Querying Proposals

### Get All Proposals

To see all upgrade proposals:

```bash
# Get all upgrade proposals
dfx canister call timelock-controller-canister getAllUpgradeProposals
```

### Get Proposals for Specific Canister

To filter proposals by target canister:

```bash
# Get proposals for a specific canister
dfx canister call timelock-controller-canister getAllUpgradeProposals '(opt "'$ACCOUNT_MANAGER_ID'")'
```

This returns an array of all proposals with their details, including:
- Proposal ID
- Target canister ID
- Module hash
- Scheduled execution time
- Delay period
- Proposer principal
- Optional description
- Execution status

## API Reference

### Update Methods (Require Controller Privileges)

#### `scheduleUpgrade(proposalId: string, targetCanisterId: string, moduleHash: string, description?: string)`
Schedule a new upgrade proposal with timelock delay.

#### `markUpgradeExecuted(proposalId: string)`
Mark an upgrade proposal as executed after successful upgrade.

#### `clearUpgradeProposal(proposalId: string)`
Clear an upgrade proposal (removes it from storage).

#### `cancelUpgradeProposal(proposalId: string)`
Cancel an upgrade proposal (removes it without execution).

#### `setTimelockDelay(delayNs: bigint)`
Set the timelock delay (minimum: 1 day). Only controllers can change this.

### Query Methods (Public)

#### `getUpgradeProposal(proposalId: string): UpgradeProposal | null`
Get details of a specific upgrade proposal.

#### `getAllUpgradeProposals(targetCanisterId?: string): UpgradeProposal[]`
Get all upgrade proposals, optionally filtered by target canister.

#### `isUpgradeReady(proposalId: string): boolean`
Check if an upgrade proposal is ready to be executed (delay has passed).

#### `verifyUpgrade(proposalId: string, moduleHash: string): boolean`
Verify that an upgrade can be executed (checks proposal existence, delay, module hash match, and not already executed).

#### `getUpgradeTimeRemaining(proposalId: string): bigint`
Get remaining time in nanoseconds until upgrade can be executed (0 if ready or not found).

#### `getTimelockDelay(): bigint`
Get the configured timelock delay in nanoseconds.

## Security Considerations

1. **Controller Setup**: The Timelock Controller Canister **must** be set as the controller of the target canisters. Without this, upgrades can bypass the timelock.

2. **Access Control**: Only controllers of the Timelock Controller Canister can schedule, cancel, or clear upgrade proposals. This is enforced by ICP's controller system.

3. **Module Hash Verification**: Always verify the module hash matches the actual WASM file before executing upgrades. This prevents deploying incorrect code.

4. **Minimum Delay**: The system enforces a minimum delay of 1 day to prevent rapid, potentially malicious upgrades.

5. **Time Source**: The system uses ICP's `ic.time()` API, which provides trusted, consensus-based time that cannot be manipulated by individual nodes.

6. **Persistent Storage**: Upgrade proposals are stored in `StableBTreeMap`, which persists across canister upgrades, ensuring proposals are not lost.

7. **Transparency**: All proposals are queryable, providing full transparency of planned upgrades.

8. **Execution Tracking**: Proposals can be marked as executed to track which upgrades have been applied.

## Troubleshooting

### Error: "Upgrade proposal with ID ... already exists"
**Solution**: Use a different proposal ID, or cancel the existing proposal first.

### Error: "Time delay not passed"
**Solution**: Wait until the delay period has elapsed. Check `getUpgradeTimeRemaining` to see how much time remains.

### Error: "Module hash mismatch"
**Solution**: Ensure you're using the correct module hash that matches your WASM file. Recompute the hash if needed.

### Error: "Timelock delay is too short"
**Solution**: The delay must be at least 1 day. Use a delay >= 24 hours.

### Cannot upgrade canisters directly
**Solution**: This is expected! After setting the Timelock Controller as the controller, you must upgrade through the timelock process. Ensure you have controller access to the Timelock Controller Canister.

### Verification fails but delay seems to have passed
**Solution**: 
1. Check that you're using the correct proposal ID
2. Verify the module hash matches exactly
3. Ensure the target canister ID is correct
4. Check canister logs for detailed error messages
5. Verify the proposal hasn't already been executed

## Comparison with Smart Contract Timelock

This ICP canister timelock is similar to the Solidity timelock pattern used in the GMCoin smart contracts:

| Feature | Smart Contract (GMCoin) | ICP Canister (Controller Pattern) |
|---------|------------------------|-----------------------------------|
| Delay | 3 days | 3 days (default) |
| Storage | Contract storage | StableBTreeMap |
| Time Source | `block.timestamp` | `ic.time()` |
| Upgrade Method | `upgradeToAndCall()` | `dfx deploy` (via controller) |
| Verification | On-chain check | Query method |
| Access Control | `onlyOwner` modifier | ICP controller system |
| Enforcement | Contract logic | Controller privileges |

## Examples

### Complete Upgrade Workflow

```bash
# 1. Build new version
dfx build gm-account-manager-canister

# 2. Compute hash
HASH=$(shasum -a 256 .azle/gm-account-manager-canister/gm-account-manager-canister.wasm | awk '{print $1}')
echo "Module hash: $HASH"

# 3. Get canister ID
CANISTER_ID=$(dfx canister id gm-account-manager-canister --network ic)
echo "Canister ID: $CANISTER_ID"

# 4. Schedule upgrade
dfx canister call timelock-controller-canister scheduleUpgrade "(
  \"upgrade-v2.0.0\",
  \"$CANISTER_ID\",
  \"$HASH\",
  opt \"Major version upgrade with new features\"
)"

# 5. Monitor status (repeat until ready)
dfx canister call timelock-controller-canister isUpgradeReady '("upgrade-v2.0.0")'
dfx canister call timelock-controller-canister getUpgradeTimeRemaining '("upgrade-v2.0.0")'

# 6. Verify (after delay has passed)
dfx canister call timelock-controller-canister verifyUpgrade "(\"upgrade-v2.0.0\", \"$HASH\")"

# 7. Deploy (if verification succeeds)
dfx deploy gm-account-manager-canister --network ic

# 8. Mark as executed
dfx canister call timelock-controller-canister markUpgradeExecuted '("upgrade-v2.0.0")'

# 9. Clear proposal (optional)
dfx canister call timelock-controller-canister clearUpgradeProposal '("upgrade-v2.0.0")'
```

## Related Files

- `src/timelock-controller-canister/index.ts` - Main canister interface
- `src/timelock-controller-canister/utils/timelock.ts` - Timelock implementation logic
- `src/timelock-controller-canister/azle.d.ts` - TypeScript type definitions

## References

- [ICP Timers Documentation](https://internetcomputer.org/docs/building-apps/network-features/periodic-tasks-timers)
- [ICP Canister Controllers](https://internetcomputer.org/docs/current/developer-docs/management/service/)
- [Azle Documentation](https://demergent-labs.github.io/azle/)
- [ICP Canister Upgrades](https://internetcomputer.org/docs/current/developer-docs/updates/upgrades/)
- GMCoin Smart Contract Timelock: `GMCoin/contracts/lib/Timelock.sol`
