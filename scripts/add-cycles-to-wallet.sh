#!/bin/bash

# Add cycles to wallet canister
# Usage: ./scripts/add-cycles-to-wallet.sh [amount_in_tc] [wallet_id]

set -e

AMOUNT_TC=${1:-2}
WALLET_ID=${2:-pgztb-cqaaa-aaaal-qs6ca-cai}
IDENTITY=${3:-mainnet}
NETWORK=ic

echo "💰 Adding cycles to wallet: $WALLET_ID"
echo "Amount: $AMOUNT_TC TC"
echo ""

# Convert TC to cycles (1 TC = 1,000,000,000,000 cycles)
CYCLES=$((AMOUNT_TC * 1000000000000))

echo "Converting ICP to cycles..."
dfx cycles convert --amount $AMOUNT_TC --network $NETWORK --identity $IDENTITY

echo ""
echo "Depositing cycles to wallet..."
dfx canister deposit-cycles $CYCLES $WALLET_ID --network $NETWORK --identity $IDENTITY

echo ""
echo "✅ Done! Checking wallet balance..."
dfx wallet balance --network $NETWORK --identity $IDENTITY

