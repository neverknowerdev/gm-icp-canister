#!/bin/bash

# Script to set up cycles wallet for mainnet
# Usage: ./scripts/setup-wallet.sh [identity]

set -e

IDENTITY=${1:-mainnet}
NETWORK=ic

echo "🔧 Setting up cycles wallet for identity: $IDENTITY on network: $NETWORK"
echo ""

# Check if wallet already exists
WALLET=$(dfx identity get-wallet --network $NETWORK --identity $IDENTITY 2>/dev/null || echo "")

if [ -n "$WALLET" ]; then
    echo "✅ Cycles wallet already exists: $WALLET"
    exit 0
fi

echo "📦 Creating cycles wallet..."
echo ""
echo "For mainnet, you need to create a cycles wallet canister."
echo "This can be done via:"
echo ""
echo "1. NNS Frontend (recommended):"
echo "   - Go to https://nns.ic0.app/"
echo "   - Connect your wallet"
echo "   - Navigate to 'Cycles' section"
echo "   - Create a cycles wallet"
echo ""
echo "2. Or use dfx with a wallet canister ID:"
echo "   dfx identity set-wallet <WALLET_CANISTER_ID> --network $NETWORK --identity $IDENTITY"
echo ""
echo "3. Or deploy a new wallet (requires cycles):"
echo "   dfx ledger create-canister <CONTROLLER_PRINCIPAL> --network $NETWORK --identity $IDENTITY"
echo "   dfx identity set-wallet <WALLET_CANISTER_ID> --network $NETWORK --identity $IDENTITY"
echo ""

# Alternative: Try to use the default cycles wallet
echo "Attempting to use default cycles wallet..."
DEFAULT_WALLET="rdmx6-jaaaa-aaaah-qcayq-cai"  # Default cycles wallet on mainnet

echo "Setting wallet to: $DEFAULT_WALLET"
dfx identity set-wallet $DEFAULT_WALLET --network $NETWORK --identity $IDENTITY 2>&1 || {
    echo ""
    echo "❌ Could not set default wallet automatically."
    echo ""
    echo "Please create a cycles wallet manually:"
    echo "1. Visit https://nns.ic0.app/"
    echo "2. Create a cycles wallet"
    echo "3. Then run:"
    echo "   dfx identity set-wallet <YOUR_WALLET_ID> --network $NETWORK --identity $IDENTITY"
    exit 1
}

echo "✅ Wallet set successfully!"
dfx identity get-wallet --network $NETWORK --identity $IDENTITY

