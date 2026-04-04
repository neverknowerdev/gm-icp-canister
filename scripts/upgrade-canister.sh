#!/bin/bash

# Upgrade script for gm-account-manager-canister
# This script upgrades the canister to mainnet with the scanner fix
# NOTE: Uses 'default' identity because it's a controller of the canister

set -e

CANISTER_NAME="gm-account-manager-canister"
NETWORK="ic"
IDENTITY="default"  # Changed from 'mainnet' - default identity is a controller

# Suppress warning about plaintext identity (required for mainnet with default identity)
export DFX_WARNING=-mainnet_plaintext_identity

echo "🔨 Building canister..."
dfx build $CANISTER_NAME --network $NETWORK --identity $IDENTITY

echo ""
echo "⬆️  Deploying/upgrading canister..."
# Use dfx deploy which automatically upgrades if canister exists
dfx deploy $CANISTER_NAME --network $NETWORK --identity $IDENTITY

echo ""
echo "✅ Upgrade complete!"
echo ""
echo "Canister ID: $(dfx canister id $CANISTER_NAME --network $NETWORK --identity $IDENTITY)"
echo ""
echo "The scanner will now automatically run every 60 minutes to process events."
echo ""
echo "To verify the scanner is working, check logs:"
echo "  dfx canister logs $CANISTER_NAME --network $NETWORK --identity $IDENTITY | grep -i scanner"

