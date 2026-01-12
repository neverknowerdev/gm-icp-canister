# Deployment Steps for Fixed Canister

## Summary of Fixes

### ✅ Fixed `initEvmWalletAddress()` Error

**Issue**: The ECDSA public key retrieval was failing because we weren't passing the canister's own principal to the management canister.

**Solution**: Updated `thresholdSigning.ts` to:
- Use `ic.id()` to get the canister's own principal
- Pass it to the `ecdsa_public_key` call as `canister_id: [selfPrincipal]`
- Added proper error handling and fallback

### ✅ Updated Frontend Client

- Fixed Candid interface to match actual canister interface
- Updated `handleEvent` to use chain ID (nat32) instead of chain name
- Added `initEvmWalletAddress()` and `evmWalletAddress()` methods
- Updated canister ID to mainnet: `ylges-qaaaa-aaaal-qtlsq-cai`

## Deployment Steps

### 1. Build the Canister

```bash
cd gm-icp-canister
dfx build gm-account-manager-canister --network ic
```

### 2. Upgrade the Canister

If dfx is working normally:

```bash
dfx canister upgrade gm-account-manager-canister --network ic --identity mainnet
```

Or use the helper script:

```bash
./scripts/test-and-upgrade.sh
```

### 3. Test `initEvmWalletAddress()`

```bash
dfx canister call gm-account-manager-canister initEvmWalletAddress --network ic --identity mainnet
```

This should return the Ethereum wallet address (e.g., `0x...`).

### 4. Verify EVM Wallet Address (Query)

```bash
dfx canister call gm-account-manager-canister evmWalletAddress --network ic --identity mainnet
```

This should return the same address.

### 5. Set Contract Addresses

Set the AccountManager contract address:

```bash
./scripts/set-contract-addresses.sh
```

Or manually:

```bash
dfx canister call gm-account-manager-canister setContractAddresses '(
  record {
    contracts = record {
      "Base Mainnet" = record {
        accountManager = "0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002";
        GMCoin = null;
      };
      "WorldChain" = record {
        accountManager = "0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002";
        GMCoin = null;
      };
    };
  }
)' --network ic --identity mainnet
```

## Troubleshooting

### If dfx is crashing with color error

This is a known dfx issue. Try:
1. Update dfx: `dfx upgrade`
2. Use the scripts which handle errors gracefully
3. Run commands manually one at a time

### If `initEvmWalletAddress()` still fails

1. Check canister logs:
   ```bash
   dfx canister logs gm-account-manager-canister --network ic --identity mainnet
   ```

2. Verify the canister has access to threshold ECDSA:
   - The canister needs to be able to call the management canister
   - Check that `key_1` is available on mainnet

3. Check error messages in the logs for specific issues

## Testing End-to-End

After deployment:

1. **Test EVM wallet initialization:**
   ```bash
   dfx canister call gm-account-manager-canister initEvmWalletAddress --network ic --identity mainnet
   ```

2. **Verify contract addresses are set:**
   - The canister should process events from the AccountManager contract
   - Check canister logs after a verification transaction

3. **Test from UI:**
   - Connect wallet to Base Mainnet
   - Request Twitter/Farcaster verification
   - Check that the canister processes the event

## Files Changed

1. `src/gm-account-manager-canister/evmContracts/thresholdSigning.ts` - Fixed ECDSA key retrieval
2. `gmcoin-v2/frontend/src/lib/canister/client.ts` - Updated to match canister interface
3. `gmcoin-v2/frontend/src/app/api/canister/handle-event/route.ts` - Use chain ID
4. `gmcoin-v2/frontend/src/hooks/useAccountManager.ts` - Use chain ID
5. `gmcoin-v2/frontend/src/app/api/canister/set-config/route.ts` - Updated interface

## Next Steps

1. ✅ Fix `initEvmWalletAddress()` - **COMPLETED**
2. ✅ Update frontend client - **COMPLETED**
3. ⏳ Deploy fixed canister - **READY TO DEPLOY**
4. ⏳ Test initialization - **READY TO TEST**
5. ⏳ Set contract addresses - **READY TO SET**
6. ⏳ Test end-to-end flow - **READY TO TEST**

