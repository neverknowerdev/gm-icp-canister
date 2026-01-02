# Refactoring Summary: Split into Two Canisters

## Overview

The codebase has been refactored from a single `gm-icp-canister` into two separate canisters:

1. **gm-account-manager-canister** - Handles account verification and user management
2. **gm-minting-canister** - Handles minting logic and worker management

## Directory Structure

### gm-account-manager-canister
```
src/gm-account-manager-canister/
├── index.ts                    # Main entry point with event handling and user queries
├── eventProcessor.ts          # Event processing logic
├── events/
│   ├── verifyTwitter.ts       # Twitter verification handler
│   └── verifyFarcaster.ts     # Farcaster verification handler
├── userManagement/
│   ├── userStore.ts           # User storage operations
│   └── userTypes.ts          # User data types
└── utils/
    ├── config.ts              # Configuration management
    ├── eventParser.ts         # Event log parsing
    ├── evmRpc.ts             # EVM RPC canister interaction
    ├── httpClient.ts         # HTTP client utilities
    ├── smartContract.ts      # Smart contract interaction
    └── types.ts              # Common types
```

### gm-minting-canister
```
src/gm-minting-canister/
├── index.ts                    # Main entry point with minting scheduler and worker management
├── minting/
│   ├── mintingProcessor.ts    # Minting process orchestration
│   ├── mintingScheduler.ts    # Daily minting scheduler
│   ├── mintingUtils.ts        # Minting utility functions
│   └── timerManager.ts        # Timer management for scheduling
├── workers/
│   ├── workerManager.ts       # Worker manager
│   ├── twitter/              # Twitter worker implementation
│   ├── farcaster/            # Farcaster worker implementation
│   └── storage/              # Worker storage utilities
└── utils/
    ├── accountManagerClient.ts # Client for querying account manager canister
    ├── httpClient.ts          # HTTP client utilities
    └── types.ts               # Common types
```

## Key Changes

### 1. Separation of Concerns
- **Account Manager**: All user verification, event processing, and user data management
- **Minting Canister**: All minting logic, worker management, and scheduling

### 2. Inter-Canister Communication
- The minting canister can query user data from the account manager canister using the `accountManagerClient.ts`
- The account manager canister exposes query methods: `getUser`, `getUserByTwitterId`, `getUserByFarcasterId`, and `getUsers`

### 3. Configuration
- Both canisters are defined in `dfx.json`
- The account manager canister uses `setConfig` to configure contracts and event signatures
- The minting canister uses `initializeTwitterWorker` and `initializeFarcasterWorker` to configure workers

### 4. Candid Interfaces
- `src/gm-account-manager-canister/gm-account-manager-canister.did` - Account manager interface
- `src/gm-minting-canister/gm-minting-canister.did` - Minting canister interface

## Deployment

### Build Both Canisters
```bash
dfx build gm-account-manager-canister
dfx build gm-minting-canister
```

### Deploy Both Canisters
```bash
dfx deploy gm-account-manager-canister
dfx deploy gm-minting-canister
```

### Set Account Manager Configuration
```bash
# Use the set-config.sh script, but update it to use gm-account-manager-canister
dfx canister call gm-account-manager-canister setConfig '(...)'
```

### Initialize Minting Canister Workers
```bash
dfx canister call gm-minting-canister initializeTwitterWorker '(...)'
dfx canister call gm-minting-canister initializeFarcasterWorker '(...)'
```

### Set Account Manager Canister ID in Minting Canister
After deploying both canisters, you'll need to set the account manager canister ID in the minting canister so it can query user data. This can be done by:
1. Getting the account manager canister ID: `dfx canister id gm-account-manager-canister`
2. Adding a method to the minting canister to set the account manager canister ID, or
3. Hardcoding it in the minting canister code (not recommended for production)

## Next Steps

1. **Update deployment scripts** (`scripts/deploy.sh`, `scripts/set-config.sh`) to work with both canisters
2. **Add method to minting canister** to set the account manager canister ID dynamically
3. **Update README.md** with new architecture and deployment instructions
4. **Test inter-canister communication** between the two canisters
5. **Update any CI/CD pipelines** to build and deploy both canisters

## Notes

- The old `gm-icp-canister` code is still in `src/index.ts` and can be removed once migration is complete
- Both canisters share the same `evm_rpc` canister dependency
- The account manager canister is the source of truth for all user data
- The minting canister queries user data from the account manager when needed

