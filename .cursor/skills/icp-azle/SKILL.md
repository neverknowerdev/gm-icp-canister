---
name: icp-azle
description: Rules and best practices for writing Azle canisters on ICP
---

# Azle Development Guide for ICP Canisters

## Overview

Azle is a TypeScript/JavaScript CDK for building canisters on the Internet Computer. This guide covers critical patterns, limitations, and best practices.

## Build vs Runtime Environment

### Critical Concept: Two Execution Phases

Azle code runs in **two different environments**:

1. **Build Phase** (Node.js): When you run `npx azle build`, your code is bundled in Node.js. The class constructor and top-level module code execute during this phase.

2. **Runtime Phase** (IC WebAssembly): After deployment, the canister runs on the Internet Computer with full access to IC APIs.

### The IC Runtime Check

Azle uses `globalThis._azleIc` to access IC APIs. This object is **only defined at runtime**, not during build:

```typescript
// From Azle source - setTimer returns 0n when IC not available
if (globalThis._azleIc === undefined && globalThis._azleIcExperimental === undefined) {
    return 0n;
}
```

### What This Means

- **Constructor**: Runs during build. IC APIs return dummy values (undefined, 0n, etc.)
- **@init/@postUpgrade hooks**: Run after deployment. IC APIs work correctly.
- **Query/Update methods**: Run at runtime. IC APIs work correctly.

## Class Structure Best Practices

### Empty Constructor Pattern

```typescript
export default class {
    // Constructor runs during build - IC runtime not available
    // Keep it empty or only do non-IC initialization
    constructor() { }

    @init([])
    init(): void {
        // All IC-dependent initialization goes here
        this.initializeAll();
    }

    @postUpgrade([])
    postUpgrade(): void {
        // Re-initialize after upgrades
        this.initializeAll();
    }

    private initializeAll(): void {
        // StableBTreeMap, setTimer, etc. work here
        initializeEncryption();
        this.scheduleTimers();
    }
}
```

### Why Not Initialize in Constructor?

```typescript
// ❌ BAD - runs during build, StableBTreeMap returns undefined
constructor() {
    const value = myStableBTreeMap.get('key'); // Returns undefined during build!
    initializeEncryption(); // Fails or does nothing
}

// ✅ GOOD - runs after deployment on IC
@init([])
init(): void {
    const value = myStableBTreeMap.get('key'); // Works correctly
    initializeEncryption(); // Works correctly
}
```

## Timer Scheduling

### setTimer API

```typescript
import { setTimer } from 'azle';

// setTimer takes delay in SECONDS as a NUMBER (not bigint)
setTimer(delay: number, callback: () => void | Promise<void>): bigint
```

### Timer Patterns

```typescript
// ✅ GOOD - schedule from @init or @postUpgrade
@init([])
init(): void {
    this.scheduleScanner();
}

private scheduleScanner(): void {
    const delaySeconds = 60 * 60; // 1 hour
    setTimer(delaySeconds, () => {
        this.runScannerCallback();
    });
}

private runScannerCallback(): void {
    scanAllChains()
        .then(() => this.scheduleScanner()) // Reschedule
        .catch((err) => {
            console.error(err);
            this.scheduleScanner(); // Still reschedule on error
        });
}
```

### Timer Limitations

- Timers are **not persisted** across canister upgrades
- Must reschedule timers in `@postUpgrade`
- Timer callbacks should handle errors gracefully

## StableBTreeMap

### Initialization

```typescript
import { StableBTreeMap } from 'azle';

// Top-level initialization is fine - just creates the JS object
// Actual IC storage binding happens at runtime
const myStorage = new StableBTreeMap<string, MyType>(0);

// Memory IDs (0-253) must be unique across all StableBTreeMaps
// 254-255 are reserved by Azle/ic-stable-structures
```

### API (Azle 0.33+)

```typescript
// get() returns V | undefined (not V[])
const value = myStorage.get(key);
if (value === undefined) {
    // Key not found
}

// insert() returns previous value or undefined
myStorage.insert(key, value);

// Other methods
myStorage.containsKey(key): boolean
myStorage.remove(key): V | undefined
myStorage.keys(): K[]
myStorage.values(): V[]
myStorage.items(): [K, V][]
myStorage.len(): number  // Note: returns number, not bigint
```

## Type System

### Use Azle's Types Directly

```typescript
// ✅ GOOD - import from 'azle' directly
import { query, update, init, postUpgrade, IDL, setTimer, StableBTreeMap } from 'azle';

// ❌ BAD - don't create custom azle.d.ts files
// They can have incorrect types and cause runtime errors
```

### Azle 0.33+ exports TypeScript source files directly:
- Types are resolved from `node_modules/azle/src/stable/lib/`
- Use `moduleResolution: "bundler"` in tsconfig.json

## Canister Methods

### Decorators

```typescript
@query([IDL.Text], IDL.Text)  // [paramTypes], returnType
getName(id: string): string { ... }

@update([IDL.Text, IDL.Nat64], IDL.Null)
setData(key: string, value: bigint): null { ... }

@init([])  // Runs on first deployment
init(): void { ... }

@postUpgrade([])  // Runs after each upgrade
postUpgrade(): void { ... }
```

### Async Methods

```typescript
// Update methods can be async
@update([IDL.Text], IDL.Text)
async fetchData(url: string): Promise<string> {
    const result = await someAsyncOperation();
    return result;
}

// Query methods should generally be sync
// (async queries exist but have limitations)
```

## Inter-Canister Calls

```typescript
import { call, IDL, Principal } from 'azle';

const result = await call(
    Principal.fromText('aaaaa-aa'),
    'method_name',
    {
        args: [arg1, arg2],
        paramIdlTypes: [IDL.Text, IDL.Nat64],
        returnIdlType: IDL.Text,
        cycles: 1_000_000_000n, // Optional: cycles to forward
    }
);
```

## Debugging and Logging

### Console API

Azle provides `console.log`, `console.error`, `console.warn`, and `console.info` that output to IC's debug print:

```typescript
console.log('Info message');
console.error('Error message');
console.warn('Warning message');

// All map to IC's debug_print under the hood
```

### Viewing Logs

```bash
# View canister logs (requires dfx 0.15+)
dfx canister logs <canister-name>

# For local development
dfx canister logs <canister-name> --network local

# For mainnet
dfx canister logs <canister-name> --network ic
```

### BigInt Serialization Issue

```typescript
// ❌ BAD - JSON.stringify throws on BigInt
const obj = { value: 123n, name: 'test' };
console.log(JSON.stringify(obj)); // TypeError: Do not know how to serialize a BigInt

// ✅ GOOD - Use template literals
console.log(`Value: ${obj.value}, Name: ${obj.name}`);

// ✅ GOOD - Convert BigInt to string first
const safeObj = { value: obj.value.toString(), name: obj.name };
console.log(JSON.stringify(safeObj));

// ✅ GOOD - Use custom replacer
const replacer = (key: string, value: any) => 
    typeof value === 'bigint' ? value.toString() : value;
console.log(JSON.stringify(obj, replacer));
```

### Logging Best Practices

```typescript
// 1. Add context to log messages
console.log(`[Scanner] Processing transaction ${txHash} on chain ${chainId}`);

// 2. Log errors with full context
try {
    await processTransaction(txHash);
} catch (error: any) {
    console.error(`[Scanner] Failed to process ${txHash}: ${error.message}`);
    console.error(`[Scanner] Stack: ${error.stack || 'No stack trace'}`);
}

// 3. Use structured logging for complex data
console.log(`[UserStore] Created user: id=${userId}, wallet=${wallet}, chain=${chainName}`);

// 4. Avoid logging sensitive data
// ❌ console.log(`API Key: ${apiKey}`);
// ✅ console.log(`API Key configured: ${apiKey ? 'yes' : 'no'}`);
```

### Debug Logging Pattern

```typescript
// Define debug flag (can be toggled)
const DEBUG = true;

function debugLog(component: string, message: string): void {
    if (DEBUG) {
        console.log(`[${component}] ${message}`);
    }
}

// Usage
debugLog('Timer', `Scheduled next run in ${delaySeconds}s`);
```

### Logging Limitations

| Limitation | Description |
|------------|-------------|
| **No persistent logs** | Logs are ephemeral, not stored permanently |
| **Size limits** | Very long messages may be truncated |
| **No log levels** | All logs go to same output (use prefixes) |
| **Async timing** | Logs may not appear in exact order |
| **Query logs** | Query method logs may not be visible in all contexts |

### Error Object Handling

```typescript
// Error objects don't serialize well
try {
    await riskyOperation();
} catch (error: any) {
    // ❌ BAD - may lose information
    console.error(error);
    
    // ✅ GOOD - extract useful info
    if (error instanceof Error) {
        console.error(`Error: ${error.name}: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
    } else {
        console.error(`Error: ${String(error)}`);
    }
}
```

### Timing and Performance Logging

```typescript
@update([], IDL.Null)
async processData(): Promise<null> {
    const startTime = Date.now();
    
    await doWork();
    
    const duration = Date.now() - startTime;
    console.log(`[Performance] processData completed in ${duration}ms`);
    
    return null;
}
```

## Error Handling

### Graceful Degradation

```typescript
// Always wrap IC API calls in try-catch
try {
    const result = await call(canisterId, 'method', options);
} catch (error: any) {
    console.error(`Call failed: ${error}`);
    // Handle gracefully
}
```

## Common Pitfalls

### 1. Initializing in Constructor

```typescript
// ❌ Doesn't work - constructor runs during build
constructor() {
    myStorage.insert('key', 'value');
}
```

### 2. Wrong setTimer Delay Type

```typescript
// ❌ Wrong - setTimer takes number, not bigint
setTimer(60n, callback);

// ✅ Correct
setTimer(60, callback);
```

### 3. Expecting Timers to Survive Upgrades

```typescript
// Timers are lost on upgrade - reschedule in postUpgrade
@postUpgrade([])
postUpgrade(): void {
    this.scheduleAllTimers();
}
```

### 4. Custom azle.d.ts Files

```typescript
// ❌ Don't create custom type declarations
// declare module 'azle' { ... }

// ✅ Use Azle's actual types
import { setTimer } from 'azle';
// Types come from node_modules/azle/src/stable/lib/
```

### 5. Blocking Operations in Query Methods

```typescript
// ❌ Queries have instruction limits
@query([], IDL.Vec(IDL.Text))
getAllItems(): string[] {
    return hugeArray.map(expensiveOperation); // May hit limit
}

// ✅ Use pagination
@query([IDL.Nat32, IDL.Nat32], IDL.Vec(IDL.Text))
getItems(offset: number, limit: number): string[] {
    return items.slice(offset, offset + limit);
}
```

## Project Structure

```
src/
  my-canister/
    index.ts          # Main canister class with decorators
    storage/          # StableBTreeMap wrappers
    utils/            # Helper functions
    my-canister.did   # Candid interface file
```

## Useful Imports

```typescript
// Core Azle
import { query, update, init, postUpgrade, IDL, setTimer, call, Principal, StableBTreeMap } from 'azle';

// IDL types for Candid
IDL.Text, IDL.Nat, IDL.Nat8, IDL.Nat16, IDL.Nat32, IDL.Nat64
IDL.Int, IDL.Int8, IDL.Int16, IDL.Int32, IDL.Int64
IDL.Bool, IDL.Null, IDL.Float32, IDL.Float64
IDL.Vec(type), IDL.Opt(type), IDL.Record({...}), IDL.Variant({...})
```

## Randomness in Azle

### How Randomness Works on IC

The Internet Computer provides cryptographically secure randomness through a threshold BLS signature scheme. Azle wraps this in a familiar `crypto.getRandomValues()` API.

### Using crypto.getRandomValues()

```typescript
// Azle provides a WASM-compatible crypto.getRandomValues()
const randomBytes = new Uint8Array(32);
crypto.getRandomValues(randomBytes);

// Works with typed arrays
const randomInts = new Uint32Array(4);
crypto.getRandomValues(randomInts);
```

### When Randomness is Available

**Important**: The CSPRNG is seeded from ICP's `raw_rand` **after** the @init/@postUpgrade hooks complete.

```typescript
// ❌ BAD - may not be properly seeded yet
constructor() {
    const key = new Uint8Array(32);
    crypto.getRandomValues(key); // May not have good entropy!
}

// ✅ GOOD - called after @init, CSPRNG is properly seeded
@init([])
init(): void {
    // Use setTimer to defer random operations
    setTimer(0, () => {
        const key = new Uint8Array(32);
        crypto.getRandomValues(key); // Properly seeded
    });
}

// ✅ GOOD - update methods run after initialization
@update([], IDL.Text)
generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes); // Properly seeded
    return bytesToHex(bytes);
}
```

### Randomness Limitations

| Limitation | Description |
|------------|-------------|
| **Not in queries** | Query methods are read-only; randomness requires state change |
| **Async on IC** | Getting randomness involves consensus, adds latency |
| **Limited size** | Max 65,536 bytes per call |
| **Deterministic replays** | Same random values across subnet replicas for consensus |

### Best Practices

```typescript
// 1. Generate keys in update methods or timer callbacks
@update([], IDL.Null)
initializeKeys(): null {
    const privateKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);
    // Store in StableBTreeMap
    return null;
}

// 2. Use timer to defer initialization if needed in @init
@init([])
init(): void {
    setTimer(0, async () => {
        // CSPRNG is now properly seeded
        this.generateKeys();
    });
}

// 3. For cryptographic keys, use appropriate libraries
import { x25519 } from '@noble/curves/ed25519';

const privateKey = new Uint8Array(32);
crypto.getRandomValues(privateKey);
const publicKey = x25519.getPublicKey(privateKey);
```

### Alternative: Using raw_rand Directly

For explicit control, you can call the management canister's `raw_rand` method:

```typescript
import { call, Principal } from 'azle';

// Get 32 bytes of randomness from IC
const randomBytes = await call<[], Uint8Array>(
    Principal.fromText('aaaaa-aa'), // Management canister
    'raw_rand',
    {
        args: [],
        paramIdlTypes: [],
        returnIdlType: IDL.Vec(IDL.Nat8),
    }
);
```

## Library Selection: WASM Compatibility

### Use High-Level Libraries with WASM Support

Azle canisters run in a WebAssembly environment. Always prefer libraries that:
1. Are pure JavaScript/TypeScript (no native bindings)
2. Don't rely on Node.js-specific APIs (fs, crypto, Buffer, etc.)
3. Explicitly support WASM/browser environments

### Recommended Libraries

#### Cryptography (use @noble/* libraries)

```typescript
// ✅ GOOD - @noble libraries are pure JS, WASM-compatible
import { x25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// ❌ BAD - Node.js crypto module doesn't work in WASM
import * as crypto from 'crypto';
```

#### Ethereum/EVM Operations

```typescript
// ✅ GOOD - micro-eth-signer is lightweight, WASM-compatible
import { Transaction } from 'micro-eth-signer';

// ❌ BAD - ethers.js has Node.js dependencies
import { ethers } from 'ethers';

// ❌ BAD - web3.js has Node.js dependencies  
import Web3 from 'web3';
```

#### Data Encoding

```typescript
// ✅ GOOD - Use built-in or pure JS implementations
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ✅ GOOD - @noble/hashes/utils for hex encoding
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// ❌ BAD - Node.js Buffer doesn't work reliably
Buffer.from(data, 'hex');
```

### Libraries to Avoid in WASM

| Category | Avoid | Use Instead |
|----------|-------|-------------|
| Crypto | `crypto` (Node.js) | `@noble/curves`, `@noble/hashes`, `@noble/ciphers` |
| Ethereum | `ethers.js`, `web3.js` | `micro-eth-signer`, `@noble/curves/secp256k1` |
| Encoding | `Buffer` | `TextEncoder/Decoder`, `@noble/hashes/utils` |
| HTTP | `axios`, `node-fetch` | Use IC's HTTP outcalls via `call()` |
| File System | `fs` | `StableBTreeMap` for persistence |

### Checking WASM Compatibility

Before using a library:
1. Check if it mentions "browser" or "WASM" support
2. Look for `"browser"` or `"module"` fields in package.json
3. Ensure no native dependencies (`node-gyp`, `.node` files)
4. Test the build: `npx azle build your-canister`

### Example: Cryptographic Operations

```typescript
// Complete example using WASM-compatible libraries
import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

// Generate key pair
const privateKey = new Uint8Array(32);
crypto.getRandomValues(privateKey); // Azle provides this
const publicKey = x25519.getPublicKey(privateKey);

// Derive shared secret
const sharedSecret = x25519.getSharedSecret(privateKey, otherPublicKey);

// Derive AES key using HKDF
const aesKey = hkdf(sha256, sharedSecret, undefined, info, 32);

// Encrypt with AES-GCM
const cipher = gcm(aesKey, nonce);
const ciphertext = cipher.encrypt(plaintext);
```

## References

- [Azle GitHub](https://github.com/demergent-labs/azle)
- [Azle Book](https://demergent-labs.github.io/azle/)
- [IC Interface Spec](https://internetcomputer.org/docs/current/references/ic-interface-spec)
- [@noble/curves](https://github.com/paulmillr/noble-curves) - WASM-compatible elliptic curves
- [@noble/hashes](https://github.com/paulmillr/noble-hashes) - WASM-compatible hash functions
- [micro-eth-signer](https://github.com/paulmillr/micro-eth-signer) - Lightweight Ethereum signing