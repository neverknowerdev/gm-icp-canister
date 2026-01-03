# Threshold Keys and EVM RPC Implementation Guide

## What Needs to Be Implemented

Currently, the code has **placeholder functions** that don't actually do anything. You need to replace them with real implementations that:

1. **Sign transactions** using ICP's threshold ECDSA API
2. **Send transactions** to Ethereum/Base using the EVM RPC canister
3. **Encode contract calls** properly using ABI encoding

## Current Placeholder Code

In `chainContract.ts`, these functions are placeholders:

```typescript
// ❌ This doesn't actually sign anything - just returns empty bytes
async function signTransaction(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(65); // Just returns empty signature
}

// ❌ This doesn't actually call the contract - just logs
export async function startMinting(...) {
    // TODO: Implement actual EVM RPC call
    return true; // Always succeeds, doesn't do anything
}
```

## What You Need to Implement

### 1. Threshold ECDSA Signing

ICP provides threshold ECDSA signing through the management canister. Here's how to implement it:

```typescript
import { ic, Principal } from 'azle';

// Derivation path for your canister's key
const DERIVATION_PATH: Uint8Array[] = [
    new TextEncoder().encode('minting_canister'),
    // Add more path components as needed
];

/**
 * Sign transaction data using ICP's threshold ECDSA
 */
async function signTransaction(data: Uint8Array): Promise<Uint8Array> {
    if (!thresholdKeyConfig) {
        throw new Error('Threshold key not configured');
    }

    try {
        // Step 1: Create a message hash (keccak256 for Ethereum)
        // You'll need a keccak256 implementation or use a library
        const messageHash = keccak256(data);
        
        // Step 2: Call ICP's threshold ECDSA API
        // This uses the management canister's sign_with_ecdsa method
        const managementCanister = Principal.fromText('aaaaa-aa');
        
        const signatureResult = await ic.call(managementCanister, 'sign_with_ecdsa', {
            args: [{
                message_hash: Array.from(messageHash),
                derivation_path: DERIVATION_PATH,
                key_id: {
                    curve: { secp256k1: null },
                    name: 'dfx_test_key' // Or your production key name
                }
            }],
            // Note: Actual API may differ - check ICP documentation
        });
        
        // Step 3: Extract signature from result
        // Signature format: 65 bytes (r: 32 bytes, s: 32 bytes, v: 1 byte)
        const signature = new Uint8Array(signatureResult.signature);
        
        console.log(`Transaction signed successfully, signature length: ${signature.length}`);
        return signature;
        
    } catch (error: any) {
        console.error(`Error signing transaction: ${error}`);
        throw error;
    }
}

// Helper function for keccak256 (you'll need to implement or import)
function keccak256(data: Uint8Array): Uint8Array {
    // Use a keccak256 library like @noble/hashes or similar
    // This is just a placeholder
    throw new Error('keccak256 not implemented');
}
```

**Resources:**
- [ICP Threshold ECDSA Documentation](https://internetcomputer.org/docs/current/developer-docs/integrations/t-ecdsa/)
- [Azle ECDSA Examples](https://github.com/demergent-labs/azle/tree/main/examples)

### 2. EVM RPC Canister Integration

The EVM RPC canister allows you to send transactions to Ethereum/Base. Here's how to implement it:

```typescript
import { call, IDL, Principal } from 'azle';

const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai');

/**
 * Send a signed transaction to Ethereum/Base via EVM RPC canister
 */
async function sendSignedTransaction(
    chainId: number,
    to: string, // Contract address
    data: Uint8Array, // Encoded function call
    signature: Uint8Array // ECDSA signature
): Promise<string> {
    try {
        // Step 1: Recover the public key from signature (if needed)
        // Or use the canister's public key directly
        
        // Step 2: Construct the raw transaction
        // Ethereum transaction format:
        // - nonce
        // - gasPrice
        // - gasLimit
        // - to (contract address)
        // - value (0 for contract calls)
        // - data (encoded function call)
        // - v, r, s (signature components)
        
        const transaction = {
            nonce: await getNonce(chainId), // Get from chain or manage locally
            gasPrice: '0x' + (20000000000).toString(16), // 20 gwei (adjust as needed)
            gasLimit: '0x' + (500000).toString(16), // Estimate gas
            to: to,
            value: '0x0',
            data: '0x' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(''),
            chainId: chainId,
            // v, r, s from signature
            v: signature[64], // Last byte
            r: '0x' + Array.from(signature.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(''),
            s: '0x' + Array.from(signature.slice(32, 64)).map(b => b.toString(16).padStart(2, '0')).join(''),
        };
        
        // Step 3: Serialize transaction (RLP encoding)
        const serializedTx = serializeTransaction(transaction);
        
        // Step 4: Call EVM RPC canister
        const result = await call(EVM_RPC_CANISTER_ID, 'eth_sendRawTransaction', {
            args: ['0x' + Array.from(serializedTx).map(b => b.toString(16).padStart(2, '0')).join('')],
            paramIdlTypes: [IDL.Text],
            returnIdlType: IDL.Text, // Returns transaction hash
        });
        
        console.log(`Transaction sent, hash: ${result}`);
        return result;
        
    } catch (error: any) {
        console.error(`Error sending transaction: ${error}`);
        throw error;
    }
}

// Helper to get nonce for the canister's address
async function getNonce(chainId: number): Promise<number> {
    // Get the canister's Ethereum address (derived from public key)
    // Then query the chain for its nonce
    // This requires implementing address derivation and RPC calls
    throw new Error('getNonce not implemented');
}

// Helper to serialize transaction (RLP encoding)
function serializeTransaction(tx: any): Uint8Array {
    // Implement RLP encoding
    // Libraries like ethereumjs-util can help
    throw new Error('serializeTransaction not implemented');
}
```

**Resources:**
- [EVM RPC Canister Documentation](https://internetcomputer.org/docs/current/developer-docs/integrations/evm-rpc/)
- [Ethereum Transaction Format](https://ethereum.org/en/developers/docs/transactions/)

### 3. ABI Encoding

You need to properly encode function calls. Here's an example:

```typescript
/**
 * Encode a function call using ABI encoding
 */
function encodeFunctionCall(
    functionName: string,
    functionSignature: string, // e.g., "startMinting()"
    params: any[]
): Uint8Array {
    // Step 1: Get function selector (first 4 bytes of keccak256 hash)
    const selector = getFunctionSelector(functionSignature);
    
    // Step 2: Encode parameters
    const encodedParams = encodeParameters(params);
    
    // Step 3: Concatenate selector + encoded params
    const encoded = new Uint8Array(4 + encodedParams.length);
    encoded.set(selector, 0);
    encoded.set(encodedParams, 4);
    
    return encoded;
}

// Example: Encode startMinting()
function encodeStartMinting(): Uint8Array {
    return encodeFunctionCall(
        'startMinting',
        'startMinting()',
        [] // No parameters
    );
}

// Example: Encode mintForUsers(address[] wallets, uint256[] amounts)
function encodeMintForUsers(wallets: string[], amounts: bigint[]): Uint8Array {
    return encodeFunctionCall(
        'mintForUsers',
        'mintForUsers(address[],uint256[])',
        [wallets, amounts]
    );
}
```

**Libraries you might need:**
- `@ethersproject/abi` for ABI encoding
- `@noble/hashes` for keccak256
- `ethereumjs-util` for RLP encoding

## Complete Implementation Example

Here's what a complete `startMinting` function should look like:

```typescript
export async function startMinting(chainContract: ChainContract): Promise<boolean> {
    try {
        // Step 1: Encode the function call
        const encodedData = encodeStartMinting();
        
        // Step 2: Create the full transaction data
        // For contract calls, this is just the encoded function call
        const transactionData = encodedData;
        
        // Step 3: Sign the transaction
        const signature = await signTransaction(transactionData);
        
        // Step 4: Send the signed transaction
        const txHash = await sendSignedTransaction(
            chainContract.chainId,
            chainContract.gmCoin.contractAddress,
            encodedData,
            signature
        );
        
        console.log(`Minting started on chain ${chainContract.chain} (${chainContract.chainId}), tx: ${txHash}`);
        
        // Step 5: Wait for confirmation (optional)
        await waitForTransaction(txHash, chainContract.chainId);
        
        return true;
    } catch (error: any) {
        console.error(`Error starting minting on chain ${chainContract.chainId}: ${error}`);
        return false;
    }
}
```

## What You Need to Do

1. **Install required libraries** (if using npm packages in Azle):
   ```bash
   npm install @ethersproject/abi @noble/hashes
   ```

2. **Implement threshold ECDSA signing**:
   - Use ICP's `sign_with_ecdsa` API
   - Handle key derivation paths
   - Extract signature components (r, s, v)

3. **Implement EVM RPC calls**:
   - Call the EVM RPC canister
   - Serialize transactions (RLP encoding)
   - Handle transaction receipts

4. **Implement ABI encoding**:
   - Encode function selectors
   - Encode parameters (addresses, uint256, arrays, etc.)

5. **Test thoroughly**:
   - Test on testnet first
   - Verify signatures are valid
   - Verify transactions are successful

## Alternative: Use Existing Libraries

If Azle supports npm packages, you might be able to use:
- `ethers.js` for ABI encoding and transaction handling
- `@noble/hashes` for keccak256
- Existing ICP libraries for threshold signing

## Questions to Answer

1. **Do you already have threshold keys set up?** If not, you need to configure them during canister deployment.

2. **What's your canister's Ethereum address?** This is derived from the threshold key's public key.

3. **Do you have the EVM RPC canister ID?** The one in the code (`7hfb6-caaaa-aaaar-qadga-cai`) might be a placeholder.

4. **What's the exact API of the EVM RPC canister?** You need to know the exact method names and parameters.

## Next Steps

1. Check ICP documentation for the exact threshold ECDSA API
2. Check EVM RPC canister documentation for the exact API
3. Implement the three main functions (signing, sending, encoding)
4. Test on testnet
5. Deploy to mainnet

The structure is there - you just need to fill in the actual API calls!

