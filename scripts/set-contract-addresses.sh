#!/bin/bash

# Script to set contract addresses on the account manager canister
# Base Mainnet and WorldChain: 0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002

set -e

CANISTER_NAME="gm-account-manager-canister"
NETWORK="ic"
IDENTITY="mainnet"

# Contract addresses
BASE_MAINNET_ACCOUNT_MANAGER="0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002"
WORLDCHAIN_ACCOUNT_MANAGER="0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002"

echo "📝 Setting contract addresses..."
echo "   Base Mainnet: $BASE_MAINNET_ACCOUNT_MANAGER"
echo "   WorldChain: $WORLDCHAIN_ACCOUNT_MANAGER"
echo ""

dfx canister call $CANISTER_NAME setContractAddresses "(
  record {
    contracts = record {
      \"Base Mainnet\" = record {
        accountManager = \"$BASE_MAINNET_ACCOUNT_MANAGER\";
        GMCoin = null;
      };
      \"WorldChain\" = record {
        accountManager = \"$WORLDCHAIN_ACCOUNT_MANAGER\";
        GMCoin = null;
      };
    };
  }
)" --network $NETWORK --identity $IDENTITY

echo ""
echo "✅ Contract addresses set successfully!"

