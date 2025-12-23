#!/bin/bash

# Quick script to check all balances
# Usage: ./scripts/check-balance.sh [identity]

IDENTITY=${1:-mainnet}
NETWORK=ic

echo "💰 Balance Check for identity: $IDENTITY"
echo "=========================================="
echo ""

echo "📊 ICP Balance (Ledger):"
dfx ledger balance --network $NETWORK --identity $IDENTITY
echo ""

echo "🔄 Cycles Balance (Account):"
dfx cycles balance --network $NETWORK --identity $IDENTITY
echo ""

echo "💼 Wallet Cycles Balance:"
WALLET=$(dfx identity get-wallet --network $NETWORK --identity $IDENTITY 2>/dev/null || echo "")
if [ -n "$WALLET" ]; then
    dfx wallet balance --network $NETWORK --identity $IDENTITY
    echo ""
    echo "Wallet ID: $WALLET"
else
    echo "No wallet configured"
fi

echo ""
echo "=========================================="

