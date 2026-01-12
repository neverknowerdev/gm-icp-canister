#!/bin/bash

# Script to test and upgrade the account manager canister
# This script tests initEvmWalletAddress and upgrades the canister

set -e

CANISTER_NAME="gm-account-manager-canister"
NETWORK="ic"
IDENTITY="mainnet"

echo "🔍 Testing current canister..."
echo ""

# Test initEvmWalletAddress
echo "1️⃣ Testing initEvmWalletAddress..."
dfx canister call $CANISTER_NAME initEvmWalletAddress --network $NETWORK --identity $IDENTITY || {
    echo "❌ initEvmWalletAddress failed. This is expected if the canister hasn't been upgraded yet."
    echo ""
}

# Test evmWalletAddress query
echo ""
echo "2️⃣ Testing evmWalletAddress query..."
dfx canister call $CANISTER_NAME evmWalletAddress --network $NETWORK --identity $IDENTITY || {
    echo "❌ evmWalletAddress query failed. This is expected if not initialized yet."
    echo ""
}

echo ""
echo "📦 Building canister..."
dfx build $CANISTER_NAME --network $NETWORK

echo ""
echo "⬆️  Upgrading canister..."
dfx canister upgrade $CANISTER_NAME --network $NETWORK --identity $IDENTITY

echo ""
echo "✅ Upgrade complete! Now testing..."
echo ""

# Test initEvmWalletAddress after upgrade
echo "3️⃣ Testing initEvmWalletAddress after upgrade..."
dfx canister call $CANISTER_NAME initEvmWalletAddress --network $NETWORK --identity $IDENTITY

echo ""
echo "4️⃣ Verifying evmWalletAddress..."
dfx canister call $CANISTER_NAME evmWalletAddress --network $NETWORK --identity $IDENTITY

echo ""
echo "✅ All tests passed!"

