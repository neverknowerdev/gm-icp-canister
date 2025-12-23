#!/bin/bash

# Script to set canister configuration from canister-config.json
# Usage: ./scripts/set-config.sh [network] [identity]

set -e

NETWORK=${1:-ic}
IDENTITY=${2:-mainnet}
CONFIG_FILE="canister-config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found"
    echo "Run: npm run generate-config"
    exit 1
fi

echo "📝 Setting configuration from $CONFIG_FILE"
echo ""

# Read the config file and format it for dfx canister call
# This is a bit complex because we need to format it as Candid arguments

CONFIG_JSON=$(cat $CONFIG_FILE)

# Extract values
BASE_CONTRACTS=$(echo $CONFIG_JSON | jq -r '.contracts."Base Mainnet" | map("\"" + . + "\"") | join(", ")')
WORLD_CONTRACTS=$(echo $CONFIG_JSON | jq -r '.contracts."WorldChain" | map("\"" + . + "\"") | join(", ")')
MONAD_CONTRACTS=$(echo $CONFIG_JSON | jq -r '.contracts."Monad" | map("\"" + . + "\"") | join(", ")')
FARCASTER_SIG=$(echo $CONFIG_JSON | jq -r '.eventSignatures."VerifyFarcasterRequested"')
TWITTER_SIG=$(echo $CONFIG_JSON | jq -r '.eventSignatures."VerifyTwitterByAuthCodeRequested"')

# Build the Candid argument
CANDID_ARG="(record {
  contracts = record {
    \"Base Mainnet\" = vec { $(echo $BASE_CONTRACTS | sed 's/"\([^"]*\)"/\1/g' | sed 's/, /; /g') };
    \"WorldChain\" = vec { $(echo $WORLD_CONTRACTS | sed 's/"\([^"]*\)"/\1/g' | sed 's/, /; /g') };
    \"Monad\" = vec { $(echo $MONAD_CONTRACTS | sed 's/"\([^"]*\)"/\1/g' | sed 's/, /; /g') };
  };
  eventSignatures = record {
    \"VerifyFarcasterRequested\" = \"$FARCASTER_SIG\";
    \"VerifyTwitterByAuthCodeRequested\" = \"$TWITTER_SIG\";
  };
})"

echo "Setting config..."
dfx canister call --network $NETWORK --identity $IDENTITY gm-icp-canister setConfig "$CANDID_ARG"

echo ""
echo "✅ Configuration set successfully!"

