# GM ICP Canisters

An ICP canister system built with Azle (TypeScript) for processing EVM smart-contract events and managing token minting.

## 🎯 Overview

This project contains two canisters:

### 1. Account Manager Canister (`gm-account-manager-canister`)
- Processes EVM smart-contract events from Base Mainnet and WorldChain
- Handles Twitter and Farcaster verification requests
- Maintains global user state across multiple chains
- Enforces global uniqueness for social account IDs

### 2. Minting Canister (`gm-minting-canister`)
- Processes daily minting operations
- Queries account manager for verified users
- Mints tokens to smart contracts on each chain

## 📦 Project Structure

```
src/
├── gm-account-manager-canister/
│   ├── index.ts                    # Main canister entry point
│   ├── eventProcessor.ts           # Event processing logic
│   ├── events/
│   │   ├── verifyTwitter.ts        # Twitter verification handler
│   │   ├── verifyFarcaster.ts      # Farcaster verification handler
│   │   └── userEvents.ts           # User event handlers
│   ├── evmContracts/
│   │   ├── config.ts               # Contract addresses & event signatures
│   │   ├── abiEncoder.ts           # ABI encoding (uses micro-eth-signer)
│   │   ├── evmTransaction.ts       # Transaction building & signing
│   │   ├── evmRpc.ts               # EVM RPC canister interaction
│   │   ├── smartContract.ts        # Smart contract calls
│   │   ├── thresholdSigning.ts     # ICP threshold ECDSA signing
│   │   ├── eventDecoder.ts         # ABI-based event decoding
│   │   └── abi/
│   │       └── accountManagement.json  # Contract ABI
│   ├── verification/
│   │   ├── twitterVerification.ts  # Twitter API integration
│   │   └── farcasterVerification.ts # Farcaster API integration
│   ├── userManagement/
│   │   └── userStore.ts            # User storage operations
│   ├── scanner/
│   │   ├── transactionScanner.ts   # Scans for unprocessed transactions
│   │   └── scannerScheduler.ts     # Scanner timer scheduling
│   ├── storage/
│   │   ├── transactionTracker.ts   # Transaction processing state
│   │   ├── storageCleaner.ts       # Old data cleanup
│   │   └── storageCleanerScheduler.ts
│   ├── encryption/
│   │   └── index.ts                # X25519 + AES-GCM encryption
│   └── utils/
│       ├── types.ts                # Common types
│       └── httpClient.ts           # HTTP client for external APIs
│
└── gm-minting-canister/
    ├── index.ts                    # Main canister entry point
    ├── evmContracts/
    │   ├── contractFunctions.ts    # Minting contract calls
    │   ├── abiEncoder.ts           # ABI encoding
    │   ├── evmTransaction.ts       # Transaction handling
    │   ├── thresholdSigning.ts     # Threshold ECDSA signing
    │   └── abi/
    │       └── gmCoin.json         # GMCoin contract ABI
    ├── icpCanisters/
    │   └── accountManagmentCanister.ts  # Account manager client
    ├── minting/
    │   ├── minting.ts              # Main minting logic
    │   ├── complexityManager.ts    # Epoch & complexity management
    │   ├── globalRetryWorker.ts    # Error retry logic
    │   └── ...
    └── workers/
        ├── twitter/
        └── farcaster/
```

## 🚀 Deployment

### Prerequisites

- Node.js >= 18.0.0
- dfx SDK >= 0.15.0 installed
- ICP tokens for cycles
- Yarn package manager

### Installation

```bash
yarn install
```

### Build

```bash
yarn build
```

## 📤 Deploying Account Manager Canister

### Method 1: Automated Deployment Script

The deployment script handles everything: building, deploying, and configuring.

#### Step 1: Set Environment Variables

```bash
# Required - API credentials (will be encrypted)
export TWITTER_BEARER_TOKEN="your-twitter-bearer-token"
export FARCASTER_API_KEY="your-farcaster-api-key"

# Optional - API URLs (have sensible defaults)
export TWITTER_TWEET_FETCH_URL="https://api.twitter.com/2/tweets"
export TWITTER_HEADER_NAME="Authorization"
export FARCASTER_API_URL="https://api.warpcast.com"

# Optional - Contract addresses (can be set later)
export BASE_MAINNET_ACCOUNT_MANAGER="0x..."      # Recommended
export WORLDCHAIN_ACCOUNT_MANAGER="0x..."        # Recommended
# GMCoin addresses are optional (only needed for minting canister)
export BASE_MAINNET_GMCOIN="0x..."               # Optional
export WORLDCHAIN_GMCOIN="0x..."                 # Optional
```

#### Step 2: Run Deployment Script

```bash
# Deploy to IC mainnet
npx ts-node scripts/deploy-account-manager.ts ic mainnet

# Or deploy to local replica
npx ts-node scripts/deploy-account-manager.ts local default
```

The script will:
1. Build and deploy the canister
2. Get the encryption public key
3. Encrypt sensitive credentials using X25519 + AES-GCM
4. Call `setContractAddresses`, `setTwitterConfig`, and `setFarcasterConfig`

### Method 2: Manual Deployment

#### Step 1: Deploy Canister

```bash
# Build
dfx build gm-account-manager-canister --network ic --identity mainnet

# Deploy
dfx deploy gm-account-manager-canister --network ic --identity mainnet
```

#### Step 2: Get Encryption Public Key

```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister encryptionPublicKey
```

Save the returned hex string - you'll need it to encrypt secrets.

#### Step 3: Set Contract Addresses

```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister setContractAddresses '(
    record {
        contracts = record {
            "Base Mainnet" = record {
                accountManager = "0xYourAccountManagerAddress";
                GMCoin = null;
            };
            "WorldChain" = record {
                accountManager = "0xYourAccountManagerAddress";
                GMCoin = null;
            };
        };
    }
)'

# Or with GMCoin addresses (optional):
dfx canister call --network ic --identity mainnet gm-account-manager-canister setContractAddresses '(
    record {
        contracts = record {
            "Base Mainnet" = record {
                accountManager = "0xYourAccountManagerAddress";
                GMCoin = opt "0xYourGMCoinAddress";
            };
            "WorldChain" = record {
                accountManager = "0xYourAccountManagerAddress";
                GMCoin = opt "0xYourGMCoinAddress";
            };
        };
    }
)'
```

#### Step 4: Set Twitter Config

All Twitter config fields must be encrypted using the public key (see encryption section below):

```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister setTwitterConfig '(
    record {
        tweetFetchURLEncrypted = "encrypted-hex-string";
        headerNameEncrypted = "encrypted-hex-string";
        bearerTokenEncrypted = "encrypted-hex-string";
    }
)'
```

#### Step 5: Set Farcaster Config

```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister setFarcasterConfig '(
    record {
        apiKeyEncrypted = "your-encrypted-hex-string";
        apiUrl = opt "https://api.warpcast.com";
    }
)'
```

### Encryption Format

Secrets are encrypted using X25519 ECDH + AES-256-GCM:

1. Generate ephemeral X25519 keypair
2. Derive shared secret with canister's public key
3. Use HKDF-SHA256 to derive AES key
4. Encrypt with AES-256-GCM
5. Format: `ephemeralPublicKey || nonce || ciphertext` (hex-encoded)

See `scripts/deploy-account-manager.ts` for the encryption implementation.

## 🔧 Canister Methods

### Account Manager Canister

| Method | Type | Description |
|--------|------|-------------|
| `setContractAddresses` | update | Set contract addresses for each chain |
| `setTwitterConfig` | update | Set Twitter API config (encrypted) |
| `setFarcasterConfig` | update | Set Farcaster API config (encrypted) |
| `handleEvent` | update | Process a transaction's events |
| `getUser` | query | Get user by userId |
| `getUserByTwitterId` | query | Get user by Twitter ID |
| `getUserByFarcasterId` | query | Get user by Farcaster ID |
| `getUsers` | query | Get multiple users by IDs |
| `getTwitterUsers` | query | Get Twitter users (paginated) |
| `getFarcasterUsers` | query | Get Farcaster users (paginated) |
| `getTransactionStatus` | query | Get tx processing status |
| `evmWalletAddress` | query | Get canister's EVM wallet address |
| `encryptionPublicKey` | query | Get X25519 public key for encryption |

### Transaction Status

Query transaction processing status:

```bash
dfx canister call --network ic --identity mainnet gm-account-manager-canister getTransactionStatus '(8453, "0x123...")'
```

Returns:
- `"processed"` - Transaction has been fully processed
- `"in_progress"` - Transaction is currently being processed
- `"unprocessed"` - Transaction has not been processed yet

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run with coverage
yarn test --coverage
```

## 📝 Event Signatures

Event signatures are automatically calculated from the ABI during initialization. The following events are supported:

**Request Events:**
- `VerifyTwitterByAuthCodeRequested(address wallet, string authCode)`
- `VerifyFarcasterRequested(address wallet, string authToken)`

**User Events:**
- `UserCreated(uint256 userId, address wallet, uint256 twitterId, uint256 farcasterId)`
- `UserRemoved(uint256 userId)`
- `SocialAccountLinked(uint256 userId, string socialType, uint256 socialId)`
- `PrimaryWalletUpdated(uint256 userId, address wallet)`
- `WalletLinked(uint256 userId, address wallet, string chain)`
- `HumanVerificationUpdated(uint256 userId, bool isVerified)`

## 💰 Managing Cycles

### Check Balances

```bash
# Check canister cycles
dfx canister status gm-account-manager-canister --network ic --identity mainnet

# Check wallet balance
dfx wallet balance --network ic --identity mainnet
```

### Top Up Canister

```bash
# Convert ICP to cycles
dfx cycles convert --amount=0.5 --network ic --identity mainnet

# Top up canister
dfx cycles top-up <CANISTER_ID> 1000000000000 --network ic --identity mainnet
```

## 🐛 Troubleshooting

### "Account manager canister ID not set"
The minting canister needs to know the account manager canister ID:
```bash
dfx canister call gm-minting-canister setAccountManagerCanisterId '(principal "your-canister-id")'
```

### "Invalid public key format"
The encryption public key should be a 64-character hex string. Make sure you're parsing the dfx response correctly.

### Build Errors
- Make sure all dependencies are installed: `yarn install`
- Check TypeScript compilation: `npx tsc --noEmit`

## 📚 Technical Details

### Libraries Used

- **micro-eth-signer**: ABI encoding, transaction serialization, event decoding
- **@noble/hashes**: Keccak-256, SHA-256, HKDF
- **@noble/curves**: X25519 ECDH
- **@noble/ciphers**: AES-GCM encryption
- **azle**: ICP TypeScript canister framework

### Key Features

- **WASM Compatible**: All crypto operations work in WebAssembly
- **Deterministic**: No random operations in ABI/RLP encoding
- **Threshold Signatures**: Uses ICP's native threshold ECDSA
- **Secure Secrets**: API keys encrypted with X25519 + AES-GCM

## 📄 License

[Add your license here]
