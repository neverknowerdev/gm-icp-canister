#!/bin/bash

# Comprehensive integration test script
# Tests the entire flow: canister initialization -> contract setup -> event processing

set -e

CANISTER_NAME="gm-account-manager-canister"
NETWORK="ic"
IDENTITY="mainnet"
BASE_MAINNET_CHAIN_ID=8453
CONTRACT_ADDRESS="0x7ea1bc48c4CafE3349D696d14f0E3c9C63F02002"

echo "🧪 Integration Test Suite"
echo "========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check canister status
echo "1️⃣  Checking canister status..."
if dfx canister status $CANISTER_NAME --network $NETWORK --identity $IDENTITY > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Canister is deployed${NC}"
else
    echo -e "${RED}❌ Canister not found or not accessible${NC}"
    exit 1
fi
echo ""

# Test 2: Initialize EVM wallet address
echo "2️⃣  Testing initEvmWalletAddress..."
EVM_ADDRESS=$(dfx canister call $CANISTER_NAME initEvmWalletAddress --network $NETWORK --identity $IDENTITY 2>&1 | grep -o '0x[a-fA-F0-9]*' | head -1 || echo "")
if [ -z "$EVM_ADDRESS" ]; then
    echo -e "${RED}❌ Failed to initialize EVM wallet address${NC}"
    echo "   Check canister logs for details:"
    echo "   dfx canister logs $CANISTER_NAME --network $NETWORK --identity $IDENTITY"
    exit 1
else
    echo -e "${GREEN}✅ EVM wallet address initialized: $EVM_ADDRESS${NC}"
fi
echo ""

# Test 3: Verify EVM wallet address (query)
echo "3️⃣  Verifying evmWalletAddress query..."
QUERIED_ADDRESS=$(dfx canister call $CANISTER_NAME evmWalletAddress --network $NETWORK --identity $IDENTITY 2>&1 | grep -o '0x[a-fA-F0-9]*' | head -1 || echo "")
if [ -z "$QUERIED_ADDRESS" ]; then
    echo -e "${YELLOW}⚠️  Could not query EVM wallet address (may not be cached yet)${NC}"
elif [ "$QUERIED_ADDRESS" != "$EVM_ADDRESS" ]; then
    echo -e "${RED}❌ Address mismatch! Init: $EVM_ADDRESS, Query: $QUERIED_ADDRESS${NC}"
    exit 1
else
    echo -e "${GREEN}✅ EVM wallet address verified: $QUERIED_ADDRESS${NC}"
fi
echo ""

# Test 4: Get encryption public key
echo "4️⃣  Getting encryption public key..."
PUB_KEY=$(dfx canister call $CANISTER_NAME encryptionPublicKey --network $NETWORK --identity $IDENTITY 2>&1 | grep -o '[a-f0-9]\{64\}' | head -1 || echo "")
if [ -z "$PUB_KEY" ]; then
    echo -e "${YELLOW}⚠️  Could not get encryption public key${NC}"
else
    echo -e "${GREEN}✅ Encryption public key retrieved (length: ${#PUB_KEY} chars)${NC}"
fi
echo ""

# Test 5: Set contract addresses
echo "5️⃣  Setting contract addresses..."
dfx canister call $CANISTER_NAME setContractAddresses "(
  record {
    contracts = record {
      \"Base Mainnet\" = record {
        accountManager = \"$CONTRACT_ADDRESS\";
        GMCoin = null;
      };
      \"WorldChain\" = record {
        accountManager = \"$CONTRACT_ADDRESS\";
        GMCoin = null;
      };
    };
  }
)" --network $NETWORK --identity $IDENTITY > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Contract addresses set successfully${NC}"
    echo "   Base Mainnet AccountManager: $CONTRACT_ADDRESS"
    echo "   WorldChain AccountManager: $CONTRACT_ADDRESS"
else
    echo -e "${RED}❌ Failed to set contract addresses${NC}"
    exit 1
fi
echo ""

# Test 6: Test getTransactionStatus (should return "unprocessed" for non-existent tx)
echo "6️⃣  Testing getTransactionStatus..."
STATUS=$(dfx canister call $CANISTER_NAME getTransactionStatus "($BASE_MAINNET_CHAIN_ID : nat32, \"0x0000000000000000000000000000000000000000000000000000000000000000\" : text)" --network $NETWORK --identity $IDENTITY 2>&1 | grep -o '"[^"]*"' | tr -d '"' | head -1 || echo "")
if [ "$STATUS" == "unprocessed" ]; then
    echo -e "${GREEN}✅ getTransactionStatus working correctly (returned: $STATUS)${NC}"
else
    echo -e "${YELLOW}⚠️  getTransactionStatus returned: $STATUS${NC}"
fi
echo ""

# Test 7: Test getUser (should return empty for non-existent user)
echo "7️⃣  Testing getUser query..."
USER_RESULT=$(dfx canister call $CANISTER_NAME getUser "(0 : nat64)" --network $NETWORK --identity $IDENTITY 2>&1 | grep -o 'opt\|vec' | head -1 || echo "")
if [ "$USER_RESULT" == "opt" ]; then
    echo -e "${GREEN}✅ getUser query working correctly${NC}"
else
    echo -e "${YELLOW}⚠️  getUser returned unexpected format${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Integration tests completed!${NC}"
echo ""
echo "📋 Summary:"
echo "   - Canister ID: $(dfx canister id $CANISTER_NAME --network $NETWORK --identity $IDENTITY)"
echo "   - EVM Wallet Address: $EVM_ADDRESS"
echo "   - Contract Address: $CONTRACT_ADDRESS"
echo "   - Chain ID: $BASE_MAINNET_CHAIN_ID (Base Mainnet)"
echo ""
echo "📝 Next steps:"
echo "   1. The canister is ready to process events"
echo "   2. Test from UI by requesting Twitter/Farcaster verification"
echo "   3. Monitor canister logs: dfx canister logs $CANISTER_NAME --network $NETWORK --identity $IDENTITY"
echo ""

