# Integration Guide: Complete System Integration

## System Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   UI/User   │─────▶│ Smart Contract   │─────▶│  ICP Canister   │
│ (gmcoin-v2) │      │  (Base Mainnet)  │      │ (ylges-qaaaa...)│
└─────────────┘      └──────────────────┘      └─────────────────┘
     │                        │                          │
     │ 1. Request Verification│                          │
     │                        │                          │
     │ 2. Transaction Confirmed                          │
     │                        │                          │
     │ 3. Call /api/canister/│                          │
     │    handle-event        │                          │
     │                        │                          │
     │                        │ 4. handleEvent(chainId,  │
     │                        │    transactionId)        │
     │                        │                          │
     │                        │ 5. Fetch Transaction     │
     │                        │    Receipt via EVM RPC   │
     │                        │                          │
     │                        │ 6. Process Events &      │
     │                        │    Verify Accounts       │
     │                        │                          │
     │                        │ 7. Update User State     │
     │                        │                          │
     │ 8. Query User Status   │                          │
     └────────────────────────┴──────────────────────────┘
```

## Flow Details

### 1. User Initiates Verification (UI)

**Location**: `gmcoin-v2/frontend/src/hooks/useAccountManager.ts`

- User clicks "Verify Twitter" or "Verify Farcaster"
- UI calls `requestTwitterVerification()` or `requestFarcasterVerification()`
- Transaction is sent to AccountManager contract on Base Mainnet

**Contract Address**: `0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002`
**Chain ID**: `8453` (Base Mainnet)

### 2. Transaction Confirmation

**Location**: `gmcoin-v2/frontend/src/hooks/useAccountManager.ts` (lines 30-64)

- `useWaitForTransactionReceipt` detects transaction confirmation
- Automatically triggers canister event processing via API route

### 3. API Route Triggers Canister

**Location**: `gmcoin-v2/frontend/src/app/api/canister/handle-event/route.ts`

- Receives `chainId` and `transactionId`
- Validates input
- Calls `handleCanisterEvent(chainId, transactionId)`

### 4. Canister Processes Event

**Location**: `gm-icp-canister/src/gm-account-manager-canister/index.ts` (handleEvent)

- Validates chain ID
- Calls `processEvent(chain, transactionId)`

**Chain ID Mapping**:
- `8453` → Base Mainnet
- `480` → WorldChain

### 5. Event Processing

**Location**: `gm-icp-canister/src/gm-account-manager-canister/eventProcessor.ts`

Steps:
1. Check if transaction already processed (prevent duplicates)
2. Fetch transaction receipt via EVM RPC
3. Verify contract address matches configured address
4. Extract events from receipt
5. Route events to handlers:
   - `VerifyTwitterByAuthCodeRequested` → `verifyTwitter()`
   - `VerifyFarcasterRequested` → `verifyFarcaster()`
   - User events → `processUserEvent()`

### 6. Verification Handlers

**Twitter Verification**: `gm-icp-canister/src/gm-account-manager-canister/verification/verifyTwitter.ts`
- Decrypts Twitter API credentials
- Fetches tweet from Twitter API
- Verifies auth code in tweet
- Creates/updates user record

**Farcaster Verification**: `gm-icp-canister/src/gm-account-manager-canister/verification/verifyFarcaster.ts`
- Decrypts Farcaster API credentials
- Verifies FID and wallet address via Farcaster API
- Creates/updates user record

### 7. User State Updates

**Location**: `gm-icp-canister/src/gm-account-manager-canister/userEvents.ts`

- User record created/updated in StableBTreeMap
- Transaction marked as processed
- User can be queried via:
  - `getUser(userId)`
  - `getUserByTwitterId(twitterId)`
  - `getUserByFarcasterId(farcasterId)`

## Setup Checklist

### ✅ Canister Setup

1. **Deploy canister**:
   ```bash
   cd gm-icp-canister
   dfx deploy gm-account-manager-canister --network ic --identity mainnet
   ```

2. **Initialize EVM wallet**:
   ```bash
   dfx canister call gm-account-manager-canister initEvmWalletAddress --network ic --identity mainnet
   ```

3. **Set contract addresses**:
   ```bash
   ./scripts/set-contract-addresses.sh
   ```

4. **Configure API credentials** (via deploy-account-manager.ts script):
   - Twitter API credentials (encrypted)
   - Farcaster API credentials (encrypted)

### ✅ Frontend Setup

1. **Set environment variables**:
   ```bash
   NEXT_PUBLIC_ICP_CANISTER_ID=ylges-qaaaa-aaaal-qtlsq-cai
   NEXT_PUBLIC_ACCOUNT_MANAGER_ADDRESS=0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002
   NEXT_PUBLIC_IC_HOST=https://icp-api.io
   ```

2. **Verify canister client**:
   - Check `gmcoin-v2/frontend/src/lib/canister/client.ts`
   - Ensure CANISTER_ID is correct
   - Verify Candid interface matches canister

3. **Test connection**:
   ```bash
   # From frontend directory
   curl -X POST http://localhost:3000/api/canister/handle-event \
     -H "Content-Type: application/json" \
     -d '{"chainId": 8453, "transactionId": "0x0000000000000000000000000000000000000000000000000000000000000000"}'
   ```

## Testing

### Unit Tests

```bash
cd gm-icp-canister
npm test
```

### Integration Tests

```bash
cd gm-icp-canister
./scripts/test-integration.sh
```

### End-to-End Test

1. **Start frontend**:
   ```bash
   cd gmcoin-v2/frontend
   npm run dev
   ```

2. **Connect wallet** to Base Mainnet

3. **Request Twitter verification**:
   - Enter Twitter auth code
   - Submit transaction
   - Monitor browser console for canister call logs

4. **Verify canister processed event**:
   ```bash
   dfx canister logs gm-account-manager-canister --network ic --identity mainnet | tail -50
   ```

5. **Query user data**:
   ```bash
   dfx canister call gm-account-manager-canister getUserByTwitterId "(YOUR_TWITTER_ID : nat64)" --network ic --identity mainnet
   ```

## Troubleshooting

### Canister Not Processing Events

1. **Check contract addresses are set**:
   ```bash
   dfx canister logs gm-account-manager-canister --network ic --identity mainnet | grep "Contract addresses"
   ```

2. **Verify chain ID mapping**:
   - Base Mainnet: `8453`
   - WorldChain: `480`
   - Check `utils/types.ts` for valid chain IDs

3. **Check EVM RPC configuration**:
   - Canister needs EVM RPC access
   - Verify EVM_RPC_CANISTER_ID is correct

### Frontend Not Calling Canister

1. **Check browser console** for errors
2. **Verify API route is accessible**:
   ```bash
   curl http://localhost:3000/api/canister/handle-event
   ```
3. **Check NEXT_PUBLIC_ICP_CANISTER_ID** environment variable

### Verification Failing

1. **Check API credentials are encrypted correctly**:
   ```bash
   dfx canister call gm-account-manager-canister encryptionPublicKey --network ic --identity mainnet
   ```

2. **Verify Twitter/Farcaster API credentials** are valid

3. **Check canister logs** for detailed error messages

## Monitoring

### View Canister Logs

```bash
dfx canister logs gm-account-manager-canister --network ic --identity mainnet --follow
```

### Check Transaction Status

```bash
dfx canister call gm-account-manager-canister getTransactionStatus "(8453 : nat32, \"0xYOUR_TX_HASH\")" --network ic --identity mainnet
```

### Query User Data

```bash
# By user ID
dfx canister call gm-account-manager-canister getUser "(1 : nat64)" --network ic --identity mainnet

# By Twitter ID
dfx canister call gm-account-manager-canister getUserByTwitterId "(YOUR_TWITTER_ID : nat64)" --network ic --identity mainnet

# By Farcaster ID
dfx canister call gm-account-manager-canister getUserByFarcasterId "(YOUR_FARCASTER_ID : nat64)" --network ic --identity mainnet
```

## Key Files

### Canister
- `src/gm-account-manager-canister/index.ts` - Main canister interface
- `src/gm-account-manager-canister/eventProcessor.ts` - Event processing logic
- `src/gm-account-manager-canister/evmContracts/thresholdSigning.ts` - ECDSA signing
- `src/gm-account-manager-canister/utils/types.ts` - Chain ID definitions

### Frontend
- `frontend/src/hooks/useAccountManager.ts` - Account manager hook
- `frontend/src/lib/canister/client.ts` - Canister client
- `frontend/src/app/api/canister/handle-event/route.ts` - API route
- `frontend/src/components/onboarding-screen.tsx` - UI components

## Next Steps

1. ✅ Fix `initEvmWalletAddress()` - **COMPLETED**
2. ✅ Update frontend client - **COMPLETED**
3. ⏳ Deploy and test - **READY**
4. ⏳ Monitor production usage - **PENDING**
5. ⏳ Add error alerting - **PENDING**

