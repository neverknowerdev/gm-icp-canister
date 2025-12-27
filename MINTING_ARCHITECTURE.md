# Minting Architecture - Timer-Based Internal Processing

## Overview

The GM ICP Canister now uses a timer-based architecture where minting happens entirely inside the canister, without external Gelato-style triggers.

## Architecture Changes

### Before (Gelato-style)
- External Web3 Function calls `processTwitterMintingEvent` or `processFarcasterMintingEvent`
- Batches passed from external system
- Processing triggered externally

### After (Timer-based)
- Internal timer schedules `startMinting` every day at 2:00 AM UTC
- All processing happens inside the canister
- Batches generated internally
- No external exposure of minting methods

## Implementation Details

### Timer System

1. **Timer Manager** (`src/minting/timerManager.ts`)
   - Calculates next 2:00 AM UTC timestamp
   - Schedules timer using `ic.setTimer()` (ICP native)
   - Timer calls `timerCallback` method on the canister

2. **Minting Scheduler** (`src/minting/mintingScheduler.ts`)
   - Initializes on canister creation
   - Schedules first minting timer
   - Reschedules after each minting completes

3. **Minting Processor** (`src/minting/mintingProcessor.ts`)
   - `startMinting()` - main entry point (internal only)
   - Processes Twitter and Farcaster minting
   - Generates batches internally
   - Handles errors and rescheduling

### Canister Methods

#### Public Methods (Remain)
- `handleEvent(chain, transactionId)` - for event processing
- `setConfig(config)` - configuration management
- `initializeTwitterWorker(config, secrets)` - worker setup
- `initializeFarcasterWorker(config, secrets)` - worker setup
- `isTwitterWorkerInitialized()` - status check
- `isFarcasterWorkerInitialized()` - status check

#### Internal Methods (New)
- `timerCallback()` - called by ICP timer system at scheduled time

#### Removed Methods
- ~~`processTwitterMintingEvent()`~~ - removed, now internal
- ~~`processFarcasterMintingEvent()`~~ - removed, now internal

### Flow

1. **Canister Initialization**
   ```
   Canister created → Constructor runs → initializeMintingScheduler()
   → Schedule timer for next 2:00 AM UTC
   ```

2. **Daily Minting Cycle**
   ```
   Timer fires (2:00 AM UTC) → timerCallback() → startMinting()
   → processTwitterMinting() → processFarcasterMinting()
   → rescheduleMinting() → Schedule next day's timer
   ```

3. **Internal Batch Processing**
   - Workers generate batches internally (starting with empty array)
   - Batch processing happens entirely within canister
   - No external calls needed

## Timer Implementation

The timer uses ICP's native timer system:
- `ic.setTimer(timestamp)` - schedules a timer
- Timer calls the `timerCallback` method when it fires
- Timestamp is in nanoseconds since Unix epoch
- Calculated to be next 2:00 AM UTC

## Benefits

1. **No External Dependencies**: No need for Gelato or external Web3 Functions
2. **Self-Contained**: All logic runs inside the canister
3. **Reliable**: ICP timers are reliable and persistent
4. **Cost-Effective**: No external service costs
5. **Simplified Architecture**: Fewer moving parts

## Notes

- Timers persist across canister upgrades
- Timer scheduling happens automatically after each minting
- Error handling ensures timer is rescheduled even if minting fails
- Workers must be initialized before minting can occur

