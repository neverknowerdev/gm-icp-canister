import { ParsedEvent } from '../utils/types';
import {
    getUserByFarcasterId,
    getUserByWallet,
    createUser,
    addWalletToUser,
    updateUserFarcasterId,
    getUser,
} from '../userManagement/userStore';
import { callCreateUser, callAddUser, encodeUserData } from '../utils/smartContract';
import { getContractAddress } from '../utils/config';

/**
 * Handles VerifyFarcasterRequested event
 * 
 * Logic:
 * 1. Extract Farcaster ID and wallet from event args
 * 2. Check if Farcaster ID is globally unique
 * 3. If Farcaster ID exists -> add wallet to existing user
 * 4. If new user -> create new user with global userId
 * 5. Call smart contract (createUser or addUser)
 */
export async function verifyFarcaster(
    event: ParsedEvent,
    chain: string,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyFarcasterRequested event`);
    console.log(`Event args: ${JSON.stringify(event.args)}`);

    // TODO: Parse event args properly based on ABI
    // For now, assuming args structure (needs to match Solidity event)
    // Expected: VerifyFarcasterRequested(address indexed wallet, uint256 indexed farcasterId, ...)
    const wallet = transactionFrom.toLowerCase(); // Use transaction from address as wallet
    const farcasterId = event.args.topic1 ? BigInt(event.args.topic1) : 0n;

    if (farcasterId === 0n) {
        console.error('Invalid Farcaster ID in event');
        return;
    }

    // Check if Farcaster ID is globally unique
    const existingUserByFarcaster = getUserByFarcasterId(farcasterId);
    
    if (existingUserByFarcaster) {
        // Farcaster ID already exists - add wallet to existing user
        console.log(`Farcaster ID ${farcasterId} already exists for user ${existingUserByFarcaster.userId}`);
        
        const walletAdded = addWalletToUser(existingUserByFarcaster.userId, wallet, chain);
        if (walletAdded) {
            console.log(`Added wallet ${wallet} on ${chain} to user ${existingUserByFarcaster.userId}`);
            
            // Update user data and call smart contract
            const updatedUser = getUser(existingUserByFarcaster.userId);
            if (updatedUser) {
                const contractAddress = getContractAddress(chain);
                if (contractAddress) {
                    await callAddUser(contractAddress, chain, updatedUser.userId, updatedUser);
                }
            }
        } else {
            console.error(`Failed to add wallet ${wallet} to user ${existingUserByFarcaster.userId}`);
        }
    } else {
        // New user - check if wallet already exists
        const existingUserByWallet = getUserByWallet(wallet, chain);
        
        if (existingUserByWallet) {
            // Wallet exists but no Farcaster ID - update Farcaster ID
            console.log(`Wallet ${wallet} exists, updating Farcaster ID`);
            updateUserFarcasterId(existingUserByWallet.userId, farcasterId);
            
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
            const newUser = createUser(wallet, chain, 0n, farcasterId);
            console.log(`Created new user ${newUser.userId} with Farcaster ID ${farcasterId}`);
            
            // Call smart contract: createUser(userId, wallet, twitterId=0, farcasterId)
            const contractAddress = getContractAddress(chain);
            if (contractAddress) {
                await callCreateUser(contractAddress, chain, newUser.userId, wallet, 0n, farcasterId);
            }
        }
    }
}

