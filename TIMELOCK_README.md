# Timelock Mechanism for ICP Canisters

This document describes the timelock mechanism implemented for both `gm-account-manager-canister` and `gm-minting-canister`. The timelock provides a security layer that enforces a delay period before canister upgrades can be executed, similar to timelock patterns used in smart contracts.

## Overview

The timelock mechanism requires that all canister upgrades be scheduled in advance with a minimum delay period (default: 3 days). This provides:

- **Security**: Prevents immediate, potentially malicious upgrades
- **Transparency**: All upgrade proposals are visible and trackable
- **Time for Review**: Stakeholders have time to review proposed upgrades before they execute
- **Audit Trail**: Complete history of upgrade proposals and their status

## How It Works

The timelock mechanism follows this workflow:

1. **Schedule Upgrade**: A canister controller proposes an upgrade by scheduling it with a proposal ID and module hash
2. **Wait Period**: The upgrade cannot be executed until the delay period (default: 3 days) has passed
3. **Verify**: Before executing the upgrade, verify that the delay has passed and the module hash matches
4. **Execute**: Perform the actual upgrade using `dfx` (after verification)
5. **Clear**: Clear the proposal after successful upgrade

### Key Components

- **Upgrade Proposal**: Contains proposal ID, module hash, scheduled execution time, delay, proposer, and optional description
- **Timelock Storage**: Uses `StableBTreeMap` for persistent storage across canister upgrades
- **Time Tracking**: Uses ICP's `ic.time()` API to track current time and enforce delays
- **Default Delay**: 3 days (259,200,000,000,000 nanoseconds)
- **Minimum Delay**: 1 day (24 hours) - enforced for security

## Setup

### 1. Initialization

The timelock mechanism is automatically initialized when the canister is created. The default delay is set to 3 days.

**No manual setup required** - initialization happens automatically in the canister constructor.

### 2. Verify Timelock Status

Check that the timelock is properly initialized:

```bash
# Check current delay setting
dfx canister call gm-account-manager-canister getTimelockDelay
dfx canister call gm-minting-canister getTimelockDelay
```

Expected output: `(259_200_000_000_000 : nat64)` (3 days in nanoseconds)

### 3. (Optional) Customize Delay

If you need to change the delay (minimum: 1 day):

```bash
# Set delay to 7 days (in nanoseconds)
# 7 days = 7 * 24 * 60 * 60 * 1_000_000_000 = 604_800_000_000_000 nanoseconds

dfx canister call gm-account-manager-canister setTimelockDelay '(604_800_000_000_000 : nat64)'
dfx canister call gm-minting-canister setTimelockDelay '(604_800_000_000_000 : nat64)'
```

**Note**: Only canister controllers can modify the delay.

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

### Step 2: Schedule the Upgrade

Schedule the upgrade proposal with a unique proposal ID:

```bash
# Schedule upgrade for account manager canister
dfx canister call gm-account-manager-canister scheduleUpgrade '(
  "upgrade-v1.2.0",  # proposal ID (unique identifier)
  "a1b2c3d4e5f6...", # module hash (SHA-256 of WASM file)
  opt "Add new feature X and fix bug Y"  # optional description
)'

# Schedule upgrade for minting canister
dfx canister call gm-minting-canister scheduleUpgrade '(
  "upgrade-v1.2.0",
  "a1b2c3d4e5f6...",
  opt "Performance improvements and bug fixes"
)'
```

**Important Notes**:
- The proposal ID must be unique
- The module hash must match the actual WASM file you intend to deploy
- Only canister controllers can schedule upgrades
- The proposer (caller's principal) is automatically recorded

### Step 3: Check Proposal Status

Query the proposal to see when it will be ready:

```bash
# Get proposal details
dfx canister call gm-account-manager-canister getUpgradeProposal '("upgrade-v1.2.0")'

# Check if upgrade is ready to execute
dfx canister call gm-account-manager-canister isUpgradeReady '("upgrade-v1.2.0")'

# Get time remaining until upgrade can be executed (in nanoseconds)
dfx canister call gm-account-manager-canister getUpgradeTimeRemaining '("upgrade-v1.2.0")'
```

### Step 4: Wait for Delay Period

Wait until the delay period has passed. You can periodically check if the upgrade is ready:

```bash
# Check readiness (returns true when ready)
dfx canister call gm-account-manager-canister isUpgradeReady '("upgrade-v1.2.0")'
```

### Step 5: Verify Before Upgrade

**CRITICAL**: Always verify the upgrade before executing it:

```bash
# Verify upgrade can be executed
# This checks: proposal exists, delay has passed, module hash matches
dfx canister call gm-account-manager-canister verifyUpgrade '(
  "upgrade-v1.2.0",
  "a1b2c3d4e5f6..."  # Must match the hash used in scheduleUpgrade
)'
```

If verification succeeds, the upgrade can proceed. If it fails, you'll receive an error message explaining why.

### Step 6: Execute the Upgrade

After verification succeeds, execute the upgrade using `dfx`:

```bash
# Deploy the upgrade
dfx deploy gm-account-manager-canister --network ic

# Or for local development:
dfx deploy gm-account-manager-canister
```

**Important**: The actual upgrade is performed via `dfx deploy`, not through a canister method. The timelock mechanism only tracks and validates proposals.

### Step 7: Clear the Proposal

After successful upgrade, clear the proposal:

```bash
# Clear the proposal after successful upgrade
dfx canister call gm-account-manager-canister clearUpgradeProposal '("upgrade-v1.2.0")'
```

This removes the proposal from storage and keeps the system clean.

## Canceling an Upgrade Proposal

If you need to cancel a scheduled upgrade (before it's executed):

```bash
# Cancel the proposal
dfx canister call gm-account-manager-canister cancelUpgradeProposal '("upgrade-v1.2.0")'
```

**Note**: You can schedule a new proposal with the same or different module hash after canceling.

## Querying All Proposals

To see all upgrade proposals:

```bash
# Get all upgrade proposals
dfx canister call gm-account-manager-canister getAllUpgradeProposals
```

This returns an array of all proposals with their details, including:
- Proposal ID
- Module hash
- Scheduled execution time
- Delay period
- Proposer principal
- Optional description

## API Reference

### Update Methods (Require Controller Privileges)

#### `scheduleUpgrade(proposalId: string, moduleHash: string, description?: string)`
Schedule a new upgrade proposal with timelock delay.

#### `clearUpgradeProposal(proposalId: string)`
Clear an upgrade proposal after successful execution.

#### `cancelUpgradeProposal(proposalId: string)`
Cancel an upgrade proposal without executing it.

#### `setTimelockDelay(delayNs: bigint)`
Set the timelock delay (minimum: 1 day). Only controllers can change this.

### Query Methods (Public)

#### `getUpgradeProposal(proposalId: string): UpgradeProposal | null`
Get details of a specific upgrade proposal.

#### `getAllUpgradeProposals(): UpgradeProposal[]`
Get all upgrade proposals.

#### `isUpgradeReady(proposalId: string): boolean`
Check if an upgrade proposal is ready to be executed (delay has passed).

#### `verifyUpgrade(proposalId: string, moduleHash: string): boolean`
Verify that an upgrade can be executed (checks proposal existence, delay, and module hash match).

#### `getUpgradeTimeRemaining(proposalId: string): bigint`
Get remaining time in nanoseconds until upgrade can be executed (0 if ready or not found).

#### `getTimelockDelay(): bigint`
Get the configured timelock delay in nanoseconds.

## Security Considerations

1. **Access Control**: Only canister controllers can schedule, cancel, or clear upgrade proposals. This is enforced by ICP's controller system.

2. **Module Hash Verification**: Always verify the module hash matches the actual WASM file before executing upgrades. This prevents deploying incorrect code.

3. **Minimum Delay**: The system enforces a minimum delay of 1 day to prevent rapid, potentially malicious upgrades.

4. **Time Source**: The system uses ICP's `ic.time()` API, which provides trusted, consensus-based time that cannot be manipulated by individual nodes.

5. **Persistent Storage**: Upgrade proposals are stored in `StableBTreeMap`, which persists across canister upgrades, ensuring proposals are not lost.

6. **Transparency**: All proposals are queryable, providing full transparency of planned upgrades.

## Troubleshooting

### Error: "Upgrade proposal with ID ... already exists"
**Solution**: Use a different proposal ID, or cancel the existing proposal first.

### Error: "Time delay not passed"
**Solution**: Wait until the delay period has elapsed. Check `getUpgradeTimeRemaining` to see how much time remains.

### Error: "Module hash mismatch"
**Solution**: Ensure you're using the correct module hash that matches your WASM file. Recompute the hash if needed.

### Error: "Timelock delay is too short"
**Solution**: The delay must be at least 1 day. Use a delay >= 24 hours.

### Verification fails but delay seems to have passed
**Solution**: 
1. Check that you're using the correct proposal ID
2. Verify the module hash matches exactly
3. Ensure you're querying the correct canister
4. Check canister logs for detailed error messages

## Comparison with Smart Contract Timelock

This ICP canister timelock is similar to the Solidity timelock pattern used in the GMCoin smart contracts:

| Feature | Smart Contract (GMCoin) | ICP Canister |
|---------|------------------------|--------------|
| Delay | 3 days | 3 days (default) |
| Storage | Contract storage | StableBTreeMap |
| Time Source | `block.timestamp` | `ic.time()` |
| Upgrade Method | `upgradeToAndCall()` | `dfx deploy` (external) |
| Verification | On-chain check | Query method |
| Access Control | `onlyOwner` modifier | ICP controller system |

## Examples

### Complete Upgrade Workflow

```bash
# 1. Build new version
dfx build gm-account-manager-canister

# 2. Compute hash
HASH=$(shasum -a 256 .azle/gm-account-manager-canister/gm-account-manager-canister.wasm | awk '{print $1}')
echo "Module hash: $HASH"

# 3. Schedule upgrade
dfx canister call gm-account-manager-canister scheduleUpgrade "(
  \"upgrade-v2.0.0\",
  \"$HASH\",
  opt \"Major version upgrade with new features\"
)"

# 4. Monitor status (repeat until ready)
dfx canister call gm-account-manager-canister isUpgradeReady '("upgrade-v2.0.0")'
dfx canister call gm-account-manager-canister getUpgradeTimeRemaining '("upgrade-v2.0.0")'

# 5. Verify (after delay has passed)
dfx canister call gm-account-manager-canister verifyUpgrade "(\"upgrade-v2.0.0\", \"$HASH\")"

# 6. Deploy (if verification succeeds)
dfx deploy gm-account-manager-canister --network ic

# 7. Clear proposal
dfx canister call gm-account-manager-canister clearUpgradeProposal '("upgrade-v2.0.0")'
```

## Related Files

- `src/gm-account-manager-canister/utils/timelock.ts` - Timelock implementation for account manager
- `src/gm-minting-canister/utils/timelock.ts` - Timelock implementation for minting canister
- `src/gm-account-manager-canister/index.ts` - Canister interface with timelock methods
- `src/gm-minting-canister/index.ts` - Canister interface with timelock methods

## References

- [ICP Timers Documentation](https://internetcomputer.org/docs/building-apps/network-features/periodic-tasks-timers)
- [Azle Documentation](https://demergent-labs.github.io/azle/)
- [ICP Canister Upgrades](https://internetcomputer.org/docs/current/developer-docs/updates/upgrades/)
- GMCoin Smart Contract Timelock: `GMCoin/contracts/lib/Timelock.sol`

