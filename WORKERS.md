# Twitter and Farcaster Workers

This document describes the Twitter and Farcaster worker canisters that process social media data similar to the GMCoin implementation.

## Overview

The workers are designed to:
1. Process Twitter tweets and Farcaster casts containing "gm" keyword
2. Batch process data efficiently
3. Mint coins based on user activity
4. Handle errors and retries gracefully

## Architecture

### Twitter Worker
Located in `src/workers/twitter/`:
- **worker.ts**: Main worker logic
- **batchManager.ts**: Manages batch processing
- **twitterRequester.ts**: Handles Twitter API requests
- **storage.ts**: Manages worker storage
- **types.ts**: Type definitions

### Farcaster Worker
Located in `src/workers/farcaster/`:
- **worker.ts**: Main worker logic
- **batchManager.ts**: Manages batch processing
- **farcasterRequester.ts**: Handles Farcaster API requests
- **storage.ts**: Manages worker storage
- **types.ts**: Type definitions

### Worker Manager
Located in `src/workers/workerManager.ts`:
- Manages initialization and execution of both workers
- Provides unified interface for worker operations

## Usage

### 1. Initialize Twitter Worker

```typescript
// Call from canister
await canister.initializeTwitterWorker(
    {
        contractAddress: "0x...",
        chain: "Base Mainnet",
        tweetLookupURL: "https://api.twitter.com/2/tweets",
        serverURLPrefix: "https://...",
        concurrencyLimit: 10,
        twitterOptimizedServerHost: "https://..."
    },
    {
        bearerToken: "your_twitter_bearer_token",
        optimizedAPISecretKey: "your_optimized_api_key",
        authHeaderName: "Authorization"
    }
);
```

### 2. Initialize Farcaster Worker

```typescript
// Call from canister
await canister.initializeFarcasterWorker(
    {
        contractAddress: "0x...",
        chain: "Base Mainnet",
        farcasterAPIURL: "https://api.farcaster.xyz/v2",
        serverURLPrefix: "https://...",
        concurrencyLimit: 10
    },
    {
        apiKey: "your_farcaster_api_key",
        bearerToken: "optional_bearer_token"
    }
);
```

### 3. Process Minting Events

When a `twitterMintingProcessed` or `farcasterMintingProcessed` event is detected:

```typescript
// For Twitter
const result = await canister.processTwitterMintingEvent(
    mintingDayTimestamp, // Unix timestamp for the minting day
    batches // Array of batches to process
);

// For Farcaster
const result = await canister.processFarcasterMintingEvent(
    mintingDayTimestamp,
    batches
);
```

## How It Works

### Batch Processing

1. **Event Detection**: Workers listen for minting events from the smart contract
2. **Batch Generation**: Creates batches of users to process
3. **Data Fetching**: Fetches tweets/casts from APIs in parallel
4. **Keyword Detection**: Searches for "gm", "#gm", or "$gm" in content
5. **Result Aggregation**: Aggregates results per user
6. **Smart Contract Calls**: Calls contract to mint coins based on results

### Storage

Workers use in-memory storage (can be extended to use ICP stable memory):
- User results per minting day
- Batches and cursors
- Tweets/casts to verify
- Usernames mapping

### Error Handling

- Retries failed batches up to 3 times
- Logs error batches for manual review
- Continues processing other batches even if some fail

## Differences from GMCoin Implementation

1. **Canister-based**: Runs on ICP instead of Gelato Web3 Functions
2. **HTTP Outcalls**: Uses ICP's HTTP outcalls feature for API requests
3. **Storage**: Uses canister storage instead of Gelato storage
4. **Event-driven**: Can be triggered by events or scheduled tasks

## Next Steps

1. **Implement HTTP Outcalls**: Replace placeholder HTTP requests with actual ICP HTTP outcalls
2. **Add Stable Memory**: Implement persistent storage using ICP stable memory
3. **Add Scheduling**: Set up periodic tasks to process minting events
4. **Add Monitoring**: Add logging and metrics for worker performance
5. **Smart Contract Integration**: Complete the smart contract call implementations

## API Reference

### Main Canister Methods

- `initializeTwitterWorker(config, secrets)`: Initialize Twitter worker
- `initializeFarcasterWorker(config, secrets)`: Initialize Farcaster worker
- `processTwitterMintingEvent(timestamp, batches)`: Process Twitter minting event
- `processFarcasterMintingEvent(timestamp, batches)`: Process Farcaster minting event
- `isTwitterWorkerInitialized()`: Check if Twitter worker is initialized
- `isFarcasterWorkerInitialized()`: Check if Farcaster worker is initialized

