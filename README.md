# GM ICP Canisters

ICP canister system built with Azle (TypeScript) for processing EVM smart-contract events and managing token minting.

## Overview

Two main canisters:

1. **Account Manager Canister** (`gm-account-manager-canister`)
   - Processes EVM events from Base Mainnet and WorldChain
   - Handles Twitter and Farcaster verification
   - Maintains global user state across chains
   - Canister ID: `ylges-qaaaa-aaaal-qtlsq-cai` (mainnet)

2. **Minting Canister** (`gm-minting-canister`)
   - Processes daily minting operations
   - Queries account manager for verified users
   - Mints tokens to smart contracts

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- dfx SDK >= 0.15.0
- ICP tokens for cycles

### Installation
```bash
yarn install
```

### Build
```bash
yarn build
```

## Deployment

### Automated Deployment (Recommended)

```bash
# Set environment variables
export TWITTER_BEARER_TOKEN="your-token"
export FARCASTER_API_KEY="your-key"
export BASE_MAINNET_ACCOUNT_MANAGER="0x..."
export WORLDCHAIN_ACCOUNT_MANAGER="0x..."

# Deploy to mainnet
npx ts-node scripts/deploy-account-manager.ts ic mainnet
```

The script handles:
- Building and deploying
- Encryption of sensitive credentials
- Configuration setup

### Manual Deployment

#### 1. Deploy Canister
```bash
dfx build gm-account-manager-canister --network ic --identity mainnet
dfx deploy gm-account-manager-canister --network ic --identity mainnet
```

#### 2. Get Encryption Public Key
```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister encryptionPublicKey
```

#### 3. Set Contract Addresses
```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister setContractAddresses '(
    record {
        contracts = record {
            "Base Mainnet" = record {
                accountManager = "0xYourAddress";
                GMCoin = null;
            };
            "WorldChain" = record {
                accountManager = "0xYourAddress";
                GMCoin = null;
            };
        };
    }
)'
```

#### 4. Set Twitter Config (Encrypted)
Use the deployment script which handles encryption, or encrypt manually using X25519 + AES-GCM.

#### 5. Set Farcaster Config (Encrypted)
Same encryption process as Twitter config.

## Canister Methods

### Account Manager Canister

| Method | Type | Description |
|--------|------|-------------|
| `setContractAddresses` | update | Set contract addresses for chains |
| `setTwitterConfig` | update | Set Twitter API config (encrypted) |
| `setFarcasterConfig` | update | Set Farcaster API config (encrypted) |
| `handleEvent` | update | Process transaction events (chainId: nat32, txHash: text) |
| `getUser` | query | Get user by userId |
| `getUserByTwitterId` | query | Get user by Twitter ID |
| `getUserByFarcasterId` | query | Get user by Farcaster ID |
| `getUsers` | query | Get multiple users |
| `getTwitterUsers` | query | Get Twitter users (paginated) |
| `getFarcasterUsers` | query | Get Farcaster users (paginated) |
| `getTransactionStatus` | query | Get tx processing status |
| `evmWalletAddress` | query | Get canister's EVM wallet address |
| `encryptionPublicKey` | query | Get X25519 public key for encryption |
| `initEvmWalletAddress` | update | Initialize EVM wallet address |

### Transaction Status
```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister getTransactionStatus '(8453, "0x123...")'
```
Returns: `"processed"`, `"in_progress"`, or `"unprocessed"`

## Event Processing

### Supported Events

**Request Events:**
- `VerifyTwitterByAuthCodeRequested(address wallet, string authCode, string tweetID, string userID)`
- `VerifyFarcasterRequested(address wallet, string authToken)`

**User Events:**
- `UserCreated(uint256 userId, address wallet, ...)`
- `UserRemoved(uint256 userId)`
- `SocialAccountLinked(uint256 userId, string socialType, uint256 socialId)`
- `PrimaryWalletUpdated(uint256 userId, address wallet)`
- `WalletLinked(uint256 userId, address wallet, string chain)`
- `HumanVerificationUpdated(uint256 userId, bool isVerified)`

### Processing Flow

1. Frontend calls contract → emits event
2. Frontend calls canister: `handleEvent(chainId, txHash)`
3. Canister fetches transaction receipt via EVM RPC
4. Canister processes events and verifies social accounts
5. Canister calls contract back with verification
6. Contract emits user events
7. Canister processes user events and updates state

## Testing

```bash
# Run all tests
yarn test

# Run with coverage
yarn test --coverage
```

## Managing Cycles

```bash
# Check canister cycles
dfx canister status gm-account-manager-canister --network ic --identity mainnet

# Check wallet balance
dfx wallet balance --network ic --identity mainnet

# Top up canister
dfx cycles top-up <CANISTER_ID> 1000000000000 --network ic --identity mainnet
```

## Troubleshooting

### "Account manager canister ID not set"
```bash
dfx canister call gm-minting-canister setAccountManagerCanisterId '(principal "ylges-qaaaa-aaaal-qtlsq-cai")'
```

### EVM Wallet Address Not Initialized
```bash
# Initialize manually
dfx canister call --network ic --identity mainnet gm-account-manager-canister initEvmWalletAddress

# Then query
dfx canister call --network ic --identity mainnet gm-account-manager-canister evmWalletAddress
```

### Viewing Logs

The IC Dashboard doesn't show logs directly. Use:
- Query methods to check transaction status
- Check contract events directly on blockchain explorer
- For local development: `dfx canister logs gm-account-manager-canister`

## Technical Details

### Libraries
- **micro-eth-signer**: ABI encoding, transaction serialization
- **@noble/hashes**: Keccak-256, SHA-256, HKDF
- **@noble/curves**: X25519 ECDH
- **@noble/ciphers**: AES-GCM encryption
- **azle**: ICP TypeScript framework

### Features
- WASM compatible crypto operations
- Threshold ECDSA signing via ICP
- Secure secret encryption (X25519 + AES-GCM)
- Event-driven architecture
- Transaction deduplication

## Chain IDs

- Base Mainnet: `8453`
- WorldChain: `480`

## Project Structure

```
src/
├── gm-account-manager-canister/
│   ├── index.ts                    # Main entry point
│   ├── eventProcessor.ts           # Event processing
│   ├── evmContracts/               # EVM integration
│   ├── verification/               # Social verification
│   ├── userManagement/             # User storage
│   ├── scanner/                    # Transaction scanner
│   └── storage/                    # State management
└── gm-minting-canister/
    ├── index.ts
    ├── minting/                    # Minting logic
    └── workers/                    # Twitter/Farcaster workers
```

## Scripts

- `scripts/deploy-account-manager.ts` - Automated deployment
- `scripts/set-contract-addresses.sh` - Set contract addresses
- `scripts/check-balance.sh` - Check cycles balance
