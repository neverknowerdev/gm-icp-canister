import { ParsedEvent } from '../utils/types';
import {
    getUserByTwitterId,
    getUserByWallet,
    createUser,
    addWalletToUser,
    updateUserTwitterId,
    getUser,
} from '../userManagement/userStore';
import { callCreateUser, callAddUser, encodeUserData } from '../utils/smartContract';
import { getContractAddress } from '../utils/config';

/**
 * Handles VerifyTwitterByAuthCodeRequested event
 * 
 * Logic:
 * 1. Extract Twitter ID and wallet from event args
 * 2. Check if Twitter ID is globally unique
 * 3. If Twitter ID exists -> add wallet to existing user
 * 4. If new user -> create new user with global userId
 * 5. Call smart contract (createUser or addUser)
 */
export async function verifyTwitter(
    event: ParsedEvent,
    chain: string,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyTwitterByAuthCodeRequested event`);
    console.log(`Event args: ${JSON.stringify(event.args)}`);

    // TODO: Parse event args properly based on ABI
    // For now, assuming args structure (needs to match Solidity event)
    // Expected: VerifyTwitterByAuthCodeRequested(address indexed wallet, uint256 indexed twitterId, ...)
    const wallet = transactionFrom.toLowerCase(); // Use transaction from address as wallet
    const twitterId = event.args.topic1 ? BigInt(event.args.topic1) : 0n;

    if (twitterId === 0n) {
        console.error('Invalid Twitter ID in event');
        return;
    }

    // Check if Twitter ID is globally unique
    const existingUserByTwitter = getUserByTwitterId(twitterId);
    
    if (existingUserByTwitter) {
        // Twitter ID already exists - add wallet to existing user
        console.log(`Twitter ID ${twitterId} already exists for user ${existingUserByTwitter.userId}`);
        
        const walletAdded = addWalletToUser(existingUserByTwitter.userId, wallet, chain);
        if (walletAdded) {
            console.log(`Added wallet ${wallet} on ${chain} to user ${existingUserByTwitter.userId}`);
            
            // Update user data and call smart contract
            const updatedUser = getUser(existingUserByTwitter.userId);
            if (updatedUser) {
                const contractAddress = getContractAddress(chain);
                if (contractAddress) {
                    await callAddUser(contractAddress, chain, updatedUser.userId, updatedUser);
                }
            }
        } else {
            console.error(`Failed to add wallet ${wallet} to user ${existingUserByTwitter.userId}`);
        }
    } else {
        // New user - check if wallet already exists
        const existingUserByWallet = getUserByWallet(wallet, chain);
        
        if (existingUserByWallet) {
            // Wallet exists but no Twitter ID - update Twitter ID
            console.log(`Wallet ${wallet} exists, updating Twitter ID`);
            updateUserTwitterId(existingUserByWallet.userId, twitterId);
            
            // Update user data and call smart contract
            const updatedUser = getUser(existingUserByWallet.userId);
            if (updatedUser) {
                const contractAddress = getContractAddress(chain);
                if (contractAddress) {
                    await callAddUser(contractAddress, chain, updatedUser.userId, updatedUser);
                }
            }
        } else {
            // Completely new user - create with global userId
            const newUser = createUser(wallet, chain, twitterId, 0n);
            console.log(`Created new user ${newUser.userId} with Twitter ID ${twitterId}`);
            
            // Call smart contract: createUser(userId, wallet, twitterId, farcasterId=0)
            const contractAddress = getContractAddress(chain);
            if (contractAddress) {
                await callCreateUser(contractAddress, chain, newUser.userId, wallet, twitterId, 0n);
            }
        }
    }
}

