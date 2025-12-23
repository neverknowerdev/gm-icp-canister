#!/bin/bash

# Simple script to set config - you'll need to manually format the Candid
# Usage: ./scripts/set-config-simple.sh

NETWORK=${1:-ic}
IDENTITY=${2:-mainnet}

echo "To set the configuration, you need to call setConfig with Candid format."
echo ""
echo "Example command:"
echo ""
echo "dfx canister call --network $NETWORK --identity $IDENTITY gm-icp-canister setConfig '("
echo "  record {"
echo "    contracts = record {"
echo "      \"Base Mainnet\" = vec { \"0xYourContractAddress\" };"
echo "      \"WorldChain\" = vec {};"
echo "      \"Monad\" = vec {};"
echo "    };"
echo "    eventSignatures = record {"
echo "      \"VerifyFarcasterRequested\" = \"0xYourEventSignature\";"
echo "      \"VerifyTwitterByAuthCodeRequested\" = \"0xYourEventSignature\";"
echo "    };"
echo "  }"
echo ")'"
echo ""
echo "Or use the Candid UI to set it interactively:"
echo "https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=pbyvv-piaaa-aaaal-qs6cq-cai"

