# GM ICP Canister — Event Processor

An ICP canister built with Azle (TypeScript) that processes EVM smart-contract events from multiple chains, similar to Gelato Web3 Functions.

## 🎯 Overview

This canister acts as an event processor that:
- Reacts to EVM smart-contract events from Base Mainnet, WorldChain, and Monad
- Fetches and verifies transactions using the EVM RPC canister
- Routes events to dedicated handlers
- Maintains global user state across multiple chains
- Enforces global uniqueness for Twitter and Farcaster IDs

## 📦 Canister Information

- **Canister ID**: `pbyvv-piaaa-aaaal-qs6cq-cai`
- **Candid UI**: https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=pbyvv-piaaa-aaaal-qs6cq-cai
- **Cycles Wallet**: `pgztb-cqaaa-aaaal-qs6ca-cai`

## 🏗️ Architecture

### Code Structure

```
src/
├── index.ts                    # Main canister entry point
├── eventProcessor.ts           # Event processing logic
├── events/
│   ├── verifyTwitter.ts        # Twitter verification handler
│   └── verifyFarcaster.ts      # Farcaster verification handler
├── userManagement/
│   ├── userStore.ts            # User storage operations
│   └── userTypes.ts           # User data types
└── utils/
    ├── evmRpc.ts              # EVM RPC canister interaction
    ├── eventParser.ts          # Event log parsing
    ├── types.ts                # Common types
    ├── config.ts               # Configuration management
    └── smartContract.ts        # Smart contract interaction
```

### Core Features

- **Event-Driven Architecture**: Processes EVM events from multiple chains
- **Modular Design**: Clean separation of concerns, easy to extend
- **Global User Identity**: Cross-chain user reconciliation with monotonic userId counter
- **Stable Storage**: Persistent state using StableBTreeMap
- **Configuration-Driven**: Runtime configuration via `setConfig` method

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- dfx SDK installed
- ICP tokens for cycles
- Cycles wallet configured

### Installation

```bash
npm install
```

### Build

```bash
# Generate config and build
npm run build

# Or for local development
npm run build:local
```

## ⚙️ Configuration

The canister requires configuration with your contract addresses and event signatures. Since Azle canisters can't read files at runtime, configuration is set via the `setConfig` method.

### Step 1: Generate Config Template

```bash
npm run generate-config
```

This creates `canister-config.json` from the template.

### Step 2: Update Config File

Edit `canister-config.json` with your values:

```json
{
  "contracts": {
    "Base Mainnet": ["0xYourContractAddress"],
    "WorldChain": ["0xYourContractAddress"],
    "Monad": ["0xYourContractAddress"]
  },
  "eventSignatures": {
    "VerifyFarcasterRequested": "0xYourKeccak256Hash",
    "VerifyTwitterByAuthCodeRequested": "0xYourKeccak256Hash"
  }
}
```

### Step 3: Set Config in Canister

**Option A: Use Candid UI (Recommended)**

1. Go to: https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=pbyvv-piaaa-aaaal-qs6cq-cai
2. Find `setConfig` method
3. Fill in the form with your config values
4. Click "Call"

**Option B: Use dfx Command**

```bash
dfx canister call --network ic --identity mainnet gm-icp-canister setConfig '(
  record {
    contracts = record {
      "Base Mainnet" = vec { "0xYourContractAddress" };
      "WorldChain" = vec {};
      "Monad" = vec {};
    };
    eventSignatures = record {
      "VerifyFarcasterRequested" = "0xYourEventSignature";
      "VerifyTwitterByAuthCodeRequested" = "0xYourEventSignature";
    };
  }
)'
```

### Getting Event Signatures

To get the keccak256 hash of your event signature:

```javascript
// Using ethers.js
ethers.utils.id("VerifyFarcasterRequested(address,uint256)")

// Using web3
web3.utils.keccak256("VerifyFarcasterRequested(address,uint256)")
```

Or use an online tool: https://emn178.github.io/online-tools/keccak_256.html

**Important**: Event signatures must match exactly, including parameter types and order.

## 📤 Deployment

### First Time Setup

1. **Create Cycles Wallet** (if you don't have one):
   ```bash
   # Create wallet canister
   dfx ledger create-canister $(dfx identity get-principal --identity mainnet) --amount 0.25 --network ic --identity mainnet
   
   # Deploy wallet code (replace <CANISTER_ID> with the ID from above)
   dfx identity deploy-wallet <CANISTER_ID> --network ic --identity mainnet
   
   # Set as wallet
   dfx identity set-wallet <CANISTER_ID> --network ic --identity mainnet
   ```

2. **Fund Wallet with Cycles**:
   ```bash
   # Convert ICP to cycles
   dfx cycles convert --amount=0.5 --network ic --identity mainnet
   
   # Transfer cycles to wallet
   dfx cycles top-up <WALLET_ID> 2000000000000 --network ic --identity mainnet
   ```

### Deploy

```bash
# Deploy to mainnet
dfx deploy --network ic --identity mainnet gm-icp-canister

# Or use the deployment script
./scripts/deploy.sh ic mainnet
```

## 🧪 Testing

### Test Event Processing

```bash
dfx canister call --network ic --identity mainnet gm-icp-canister handleEvent '("Base Mainnet", "0xd026c13df3cc54176089cce0b6cff245d6fe8d901beb9664207bc188db076970")'
```

### View Logs

```bash
dfx canister logs --network ic --identity mainnet gm-icp-canister
```

### Check Canister Status

```bash
dfx canister status gm-icp-canister --network ic --identity mainnet
```

## 💰 Managing Cycles

### Check Balances

```bash
# Check ICP balance
dfx ledger balance --network ic --identity mainnet

# Check cycles balance (account)
dfx cycles balance --network ic --identity mainnet

# Check wallet cycles balance
dfx wallet balance --network ic --identity mainnet
```

### Transfer Cycles

```bash
# Convert ICP to cycles
dfx cycles convert --amount=0.5 --network ic --identity mainnet

# Transfer cycles to a canister
dfx cycles top-up <CANISTER_ID> <AMOUNT> --network ic --identity mainnet

# Transfer cycles to wallet
dfx cycles top-up <WALLET_ID> <AMOUNT> --network ic --identity mainnet
```

### Quick Balance Check Script

```bash
./scripts/check-balance.sh mainnet
```

## 🔧 Core Functionality

### handleEvent(chain, transactionId)

Main entry point for processing events.

**Parameters:**
- `chain`: Chain name ("Base Mainnet", "WorldChain", or "Monad")
- `transactionId`: Transaction hash to process

**Process:**
1. Validates chain and fetches transaction receipt
2. Verifies transaction is to an allowed contract
3. Extracts events from transaction logs
4. Routes events to appropriate handlers
5. Handlers process events and update user state

### Supported Events

- **VerifyTwitterByAuthCodeRequested**: Handles Twitter verification
  - Enforces global Twitter ID uniqueness
  - Creates new users or updates existing users
  - Calls smart contract `createUser` or `addUser`

- **VerifyFarcasterRequested**: Handles Farcaster verification
  - Enforces global Farcaster ID uniqueness
  - Creates new users or updates existing users
  - Calls smart contract `createUser` or `addUser`

## 👤 User Data Model

```typescript
interface User {
  userId: bigint;              // Globally unique, monotonic counter
  chains: string[];            // Chains user is active on
  twitterId: bigint;           // Twitter ID (globally unique)
  farcasterId: bigint;         // Farcaster ID (globally unique)
  isVerified: boolean;         // Verification status
  verifications: string[];     // List of verifications
  primaryWallet: string;       // Primary wallet address
  wallets: Wallet[];           // All wallets across chains
}

interface Wallet {
  wallet: string;              // Wallet address
  chain: string;               // Chain name
}
```

### Global User ID Strategy

- `userId` is globally unique across all chains
- Uses monotonic counter (always increasing)
- Independent of blockchain
- Enables cross-chain user reconciliation

## 🔗 Smart Contract Integration

The canister calls your Solidity contracts:

- **createUser(userId, wallet, twitterId, farcasterId)**: Creates a new user
- **addUser(userId, userData)**: Updates existing user with new data

**Note**: Smart contract interaction is currently stubbed. Implement actual calls in `src/utils/smartContract.ts` based on your contract ABI.

## 📝 Development

### Local Development

```bash
# Start local replica
dfx start --background

# Build locally
npm run build:local

# Deploy locally
dfx deploy
```

### Adding New Event Handlers

1. Create handler file in `src/events/`
2. Register handler in `src/eventProcessor.ts`
3. Add event signature to config
4. Update `src/utils/eventParser.ts` to parse the event

### Project Scripts

```bash
npm run generate-config    # Generate config file from template
npm run build              # Build for mainnet
npm run build:local        # Build for local development
```

## 🐛 Troubleshooting

### "No contracts configured"

Set the configuration using `setConfig` method (see Configuration section).

### "Insufficient cycles balance"

1. Check wallet balance: `dfx wallet balance --network ic --identity mainnet`
2. Convert ICP to cycles: `dfx cycles convert --amount=0.5 --network ic --identity mainnet`
3. Transfer to wallet: `dfx cycles top-up <WALLET_ID> 2000000000000 --network ic --identity mainnet`

### Build Errors

- Make sure all dependencies are installed: `npm install`
- Check that Azle version is stable (0.33.0)
- Verify TypeScript compilation: `npx tsc --noEmit`

### Canister Out of Cycles

```bash
# Check canister cycles
dfx canister status gm-icp-canister --network ic --identity mainnet

# Top up canister
dfx cycles top-up pbyvv-piaaa-aaaal-qs6cq-cai 1000000000000 --network ic --identity mainnet
```

## 📚 References

- [Azle Documentation](https://demergent-labs.github.io/azle/candid_rpc.html)
- [Azle Candid RPC Examples](https://github.com/demergent-labs/azle/tree/main/examples/stable/test/end_to_end/candid_rpc)
- [EVM RPC Canister](https://internetcomputer.org/docs/building-apps/chain-fusion/ethereum/evm-rpc/evm-rpc-canister)
- [Internet Computer Docs](https://internetcomputer.org/docs/current/developer-docs)

## ⚠️ Important Notes

- Use **stable Azle version only** (no experimental features)
- Configuration must be set via `setConfig` after deployment
- Event signatures must match your Solidity events exactly
- Smart contract calls need to be implemented based on your ABI
- Canister requires cycles for operations (monitor balance regularly)

## 📄 License

[Add your license here]
