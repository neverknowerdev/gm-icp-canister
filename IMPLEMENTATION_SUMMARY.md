# GM-ICP-Canister Implementation Summary

This document summarizes the implementation of minting features based on the GMCoin Gelato worker implementation.

## ✅ Completed Features

### 1. Twitter Re-verification for High-Likes Tweets
- **Location**: `src/gm-minting-canister/workers/twitter/process.ts`
- **Implementation**: 
  - Tweets with >100 likes are separated during processing
  - Re-verified using official Twitter API via `fetchTweetsByIDs()`
  - Top 300 tweets (by likes) are re-verified in batch
  - Results are updated with verified like counts and recalculated token amounts
- **Threshold**: `REVERIFICATION_LIKES_THRESHOLD = 100`
- **Batch Size**: `VERIFY_TWEET_BATCH_SIZE = 300`

### 2. Farcaster Minting Worker
- **Location**: `src/gm-minting-canister/workers/farcaster/`
- **Files Created**:
  - `process.ts` - Main Farcaster processing logic
  - `farcasterRequester.ts` - Farcaster API client
  - `types.ts` - Type definitions
- **Features**:
  - Fetches casts by FID
  - Processes casts similar to Twitter tweets
  - Calculates token amounts based on keyword matches (gm, #gm, $gm)
  - Stores casts in batch storage
  - Integrated into main minting flow

### 3. Smart Contract Minting with Threshold Keys
- **Location**: `src/gm-minting-canister/chainContract.ts`
- **Implementation**:
  - Added `setThresholdKeyConfig()` to configure threshold keys
  - Added `signTransaction()` function to sign transactions using threshold keys
  - Updated `startMinting()`, `mintForUsers()`, and `finishMinting()` to use threshold key signing
  - Transactions are signed before being sent to EVM RPC canister
- **Note**: Actual threshold key signing implementation depends on ICP's threshold signing API setup

### 4. Error Retry Logic with Exponential Backoff
- **Location**: `src/gm-minting-canister/minting/retryManager.ts`
- **Features**:
  - Retry tasks stored with metadata (type, data, retry count, next retry time)
  - Exponential backoff: delay = initial_delay * 2^retryCount
  - Initial delay: 60 seconds
  - Max delay: 1 hour
  - Default max retries: 3
  - Uses ICP timers (`ic.setTimer`) for scheduling
  - Supports retry types: `twitter-query`, `farcaster-query`, `minting-call`
- **Integration**: 
  - Failed Twitter/Farcaster queries automatically added to retry queue
  - Failed minting calls added to retry queue
  - `processRetryTasks()` called by timer callback

### 5. Complexity Calculation (Moved from Smart Contract)
- **Location**: `src/gm-minting-canister/minting/complexityManager.ts`
- **Features**:
  - Epoch management (configurable epoch length in days)
  - Complexity adjustment based on epoch performance
  - Points streak tracking
  - Coins multiplicator calculation
- **Logic** (matches smart contract):
  - If current epoch points > last epoch points: multiplicator * 0.7 (decrease 30%)
  - If current epoch points <= last epoch points:
    - If streak <= -3: multiplicator * 1.3 (increase 30%)
    - If streak == -2: multiplicator * 1.2 (increase 20%)
    - Otherwise: no change
- **Integration**: Called during `startMinting()` to check for new epoch and adjust complexity

### 6. Epoch Management and Difficulty Adjustment
- **Location**: `src/gm-minting-canister/minting/complexityManager.ts`
- **Features**:
  - `shouldStartNewEpoch()` - Checks if new epoch should start
  - `startNewEpoch()` - Starts new epoch and adjusts complexity
  - `addEpochPoints()` - Adds points to current epoch
  - `getCoinsMultiplicator()` - Returns current multiplicator
- **Integration**: 
  - Epoch check happens at start of minting process
  - Points accumulated during minting added to current epoch
  - Complexity adjusted when new epoch starts

### 7. Additional Checks and Locks
- **Location**: `src/gm-minting-canister/minting.ts`
- **Features**:
  - **Minting Lock**: Prevents concurrent minting processes
  - **Status Tracking**: Minting status (`done`, `in-progress`, `error`)
  - **Error Handling**: Comprehensive try-catch with status updates
  - **Validation**: Checks for configuration before processing
  - **Logging**: Detailed logging throughout the process

## 📁 File Structure

```
src/gm-minting-canister/
├── minting.ts                    # Main minting processor (updated)
├── chainContract.ts              # Smart contract interface (updated with threshold keys)
├── storage.ts                    # Storage (updated with cast support)
├── minting/
│   ├── complexityManager.ts     # NEW: Complexity and epoch management
│   ├── retryManager.ts          # NEW: Retry logic with exponential backoff
│   ├── mintingScheduler.ts      # Existing scheduler
│   └── timerManager.ts          # Existing timer manager
└── workers/
    ├── twitter/
    │   ├── process.ts            # Updated with re-verification
    │   ├── twitterRequester.ts   # Existing
    │   └── types.ts             # Existing
    └── farcaster/               # NEW: Farcaster worker
        ├── process.ts
        ├── farcasterRequester.ts
        └── types.ts
```

## 🔧 Configuration

### Threshold Keys
Threshold keys must be configured before minting:
```typescript
setThresholdKeyConfig(threshold: number, publicKey: string);
```

### Epoch Configuration
Epoch configuration must be initialized:
```typescript
initializeEpochConfig(
    epochNumber: bigint,
    epochStartedAt: number,
    lastEpochPoints: bigint,
    currentEpochPoints: bigint,
    pointsDeltaStreak: bigint,
    coinsMultiplicator: bigint,
    epochDays: number
);
```

## 🔄 Integration Points

1. **Minting Process Flow**:
   - Check minting lock
   - Check/start new epoch
   - Process Twitter minting (with re-verification)
   - Process Farcaster minting
   - Add points to epoch
   - Mint to smart contracts (with threshold key signing)
   - Handle errors with retry queue

2. **Retry Process**:
   - Failed queries/calls added to retry queue
   - Timer callback processes retry tasks
   - Exponential backoff applied
   - Max retries enforced

3. **Complexity Management**:
   - Checked at start of minting
   - Adjusted when new epoch starts
   - Points accumulated during minting
   - Multiplicator used for token calculations

## 📝 Notes

1. **Threshold Key Signing**: The actual implementation of threshold key signing depends on the ICP threshold signing API. The current implementation provides the structure and placeholder for the signing logic.

2. **EVM RPC Integration**: The smart contract calls use placeholder implementations. Actual integration with EVM RPC canister needs to be completed based on the canister's API.

3. **Account Manager Integration**: Farcaster user fetching requires the account manager canister to expose `getFarcasterUsers()` method.

4. **Testing**: All features should be tested thoroughly, especially:
   - Re-verification logic for high-likes tweets
   - Retry mechanism with exponential backoff
   - Epoch transitions and complexity adjustments
   - Concurrent minting prevention

## 🚀 Next Steps

1. Complete threshold key signing implementation using ICP API
2. Complete EVM RPC canister integration
3. Add unit tests for all new features
4. Test retry mechanism with actual failures
5. Verify epoch transitions and complexity calculations
6. Performance testing for large-scale minting

