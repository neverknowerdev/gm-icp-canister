#!/bin/bash

# Deployment script for GM ICP Canister
# Usage: ./scripts/deploy.sh [network] [identity]
# Example: ./scripts/deploy.sh ic mainnet

set -e

NETWORK=${1:-ic}
IDENTITY=${2:-mainnet}

echo "🚀 Deploying GM ICP Canister to $NETWORK with identity $IDENTITY"
echo ""

# Step 1: Generate config if it doesn't exist
if [ ! -f "canister-config.json" ]; then
    echo "📝 Generating canister-config.json..."
    npm run generate-config
    echo "⚠️  Please update canister-config.json with your contract addresses and event signatures!"
    echo "   Press Enter to continue after updating the config..."
    read
fi

# Step 2: Check if cycles wallet exists, deploy if needed
echo "🔍 Checking cycles wallet..."
if ! dfx identity get-wallet --network $NETWORK --identity $IDENTITY &>/dev/null; then
    echo "📦 Deploying cycles wallet..."
    dfx identity deploy-wallet --network $NETWORK --identity $IDENTITY
    echo "✅ Cycles wallet deployed!"
fi

# Step 3: Check if canister exists
CANISTER_ID=$(dfx canister id gm-icp-canister --network $NETWORK --identity $IDENTITY 2>/dev/null || echo "")

if [ -z "$CANISTER_ID" ]; then
    echo "📦 Creating canister..."
    # Try creating, if it fails, dfx deploy will handle it
    dfx canister create gm-icp-canister --network $NETWORK --identity $IDENTITY || echo "⚠️  Canister creation failed, will try during deploy..."
else
    echo "✅ Canister already exists: $CANISTER_ID"
fi

# Step 4: Build
echo ""
echo "🔨 Building canister..."
dfx build --network $NETWORK --identity $IDENTITY gm-icp-canister

# Step 5: Deploy (this will create canister if it doesn't exist)
echo ""
echo "🚀 Deploying canister..."
dfx deploy --network $NETWORK --identity $IDENTITY gm-icp-canister

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Canister ID: $(dfx canister id gm-icp-canister --network $NETWORK --identity $IDENTITY)"
echo ""
echo "Test with:"
echo "  dfx canister call --network $NETWORK --identity $IDENTITY gm-icp-canister handleEvent '(\"Base Mainnet\", \"0xd026c13df3cc54176089cce0b6cff245d6fe8d901beb9664207bc188db076970\")'"
echo ""
echo "View logs with:"
echo "  dfx canister logs --network $NETWORK --identity $IDENTITY gm-icp-canister"

