#!/bin/bash

# Create cycles wallet from terminal using dfx commands
# This requires some ICP to create the canister

set -e

IDENTITY=${1:-mainnet}
NETWORK=ic

echo "🔧 Creating cycles wallet from terminal"
echo ""

# Get principal
PRINCIPAL=$(dfx identity get-principal --identity $IDENTITY)
echo "Principal: $PRINCIPAL"
echo ""

# Check ICP balance
echo "Checking ICP balance..."
ICP_BALANCE=$(dfx ledger balance --network $NETWORK --identity $IDENTITY 2>&1 | grep -o '[0-9.]* ICP' | head -1 || echo "0 ICP")
echo "ICP Balance: $ICP_BALANCE"
echo ""

# Check cycles balance
echo "Checking cycles balance..."
CYCLES_BALANCE=$(dfx cycles balance --network $NETWORK --identity $IDENTITY 2>&1 | head -1 || echo "0")
echo "Cycles Balance: $CYCLES_BALANCE"
echo ""

echo "To create a cycles wallet, you need to:"
echo ""
echo "1. Create a canister (requires ICP):"
echo "   dfx ledger create-canister $PRINCIPAL --amount 0.1 --network $NETWORK --identity $IDENTITY"
echo ""
echo "2. This will return a canister ID. Then deploy wallet code to it:"
echo "   dfx identity deploy-wallet <CANISTER_ID> --network $NETWORK --identity $IDENTITY"
echo ""
echo "3. Set it as your wallet:"
echo "   dfx identity set-wallet <CANISTER_ID> --network $NETWORK --identity $IDENTITY"
echo ""

if [[ "$ICP_BALANCE" == "0 ICP" ]] || [[ -z "$ICP_BALANCE" ]]; then
    echo "⚠️  You don't have ICP to create a canister."
    echo ""
    echo "Options:"
    echo "1. Buy/send more ICP to your account"
    echo "2. Use the NNS frontend to create a cycles wallet (might have different requirements)"
    echo "3. Check if a wallet already exists for your principal in IC Dashboard"
fi
