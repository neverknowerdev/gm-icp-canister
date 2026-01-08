import { ParsedEvent, Chain } from '../utils/types';
import {
    getUserByFarcasterId,
} from '../userManagement/userStore';
import { callCreateOrUpdateUser } from '../utils/smartContract';
import { getContractAddress } from '../utils/config';
import { generateNextUserId } from '../storage/atomicCounter';
import { fetchTransactionReceipt } from '../utils/evmRpc';
import { extractEvents } from '../utils/eventParser';
import { getContractAddresses } from '../utils/config';
import { processUserEvent } from './userEvents';
import { verifyFarcasterAuthBigInt } from '../utils/farcasterVerification';

/**
 * Handles VerifyFarcasterRequested event
 * 
 * New flow:
 * 1. Extract Farcaster ID and wallet from event args
 * 2. Check if Farcaster ID exists globally (across all chains)
 * 3. If exists: Get user data (userId, twitterId, farcasterId, wallets for current chain only), call createOrUpdateUser
 * 4. If new: Generate new userId atomically, call createOrUpdateUser with available info
 * 5. Wait for transaction receipt
 * 6. Process all events from that transaction (UserCreated, WalletLinked, etc.)
 * 7. NO direct memory modifications - only via events from contract
 */
export async function verifyFarcaster(
    event: ParsedEvent,
    chain: Chain,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyFarcasterRequested event`);
    console.log(`Event args: ${JSON.stringify(event.args)}`);

    // Extract auth token and wallet from event
    const wallet = transactionFrom.toLowerCase(); // Use transaction from address as wallet

    // Extract auth token from event data (decoded string from ABI-encoded data)
    const authToken = event.args.authToken || event.args.authCode || event.args.data;

    if (!authToken || authToken === '0x' || (typeof authToken === 'string' && authToken.startsWith('0x') && authToken.length < 10)) {
        console.error('No auth token found in event. Event must contain Farcaster auth token.');
        return;
    }

    // Clean auth token - remove 0x prefix if present
    let cleanAuthToken = typeof authToken === 'string' ? authToken : '';
    if (cleanAuthToken.startsWith('0x')) {
        cleanAuthToken = cleanAuthToken.slice(2);
    }

    // If we have a decoded string from parsing, use that
    let authTokenString = cleanAuthToken;
    if (event.args.authToken && typeof event.args.authToken === 'string') {
        authTokenString = event.args.authToken;
    }

    console.log(`Verifying Farcaster auth token...`);

    // Verify auth token with Farcaster API and get Farcaster ID
    let farcasterId: bigint;
    try {
        farcasterId = await verifyFarcasterAuthBigInt(authTokenString);
        if (farcasterId === 0n) {
            console.error('Failed to verify Farcaster: got zero farcaster id');
            return;
        }

        console.log(`Successfully verified Farcaster auth token, Farcaster ID (FID): ${farcasterId}`);
    } catch (error: any) {
        console.error(`Failed to verify Farcaster auth token: ${error.message}`);
        return;
    }



    const contractAddress = getContractAddress(chain);
    if (!contractAddress) {
        console.error(`No contract address configured for chain: ${chain}`);
        return;
    }

    // Check if Farcaster ID exists globally
    const existingUserByFarcaster = getUserByFarcasterId(farcasterId);

    let userId: bigint;
    let twitterIdToSend: bigint = 0n;
    let farcasterIdToSend: bigint = farcasterId;
    let walletsForChain: Array<{ wallet: string, chain: Chain }> = [{ wallet, chain }];

    if (existingUserByFarcaster) {
        // Farcaster ID already exists - use existing userId
        console.log(`Farcaster ID ${farcasterId} already exists for user ${existingUserByFarcaster.userId}`);
        userId = existingUserByFarcaster.userId;
        twitterIdToSend = existingUserByFarcaster.twitterId;
        farcasterIdToSend = existingUserByFarcaster.farcasterId;

        // Get wallets for current chain only
        walletsForChain = existingUserByFarcaster.wallets.filter(w => w.chain === chain);
        if (walletsForChain.length === 0) {
            walletsForChain = [{ wallet, chain }];
        }
    } else {
        // New user - generate userId atomically
        console.log(`Farcaster ID ${farcasterId} is new - generating userId`);
        userId = await generateNextUserId();
        console.log(`Generated userId: ${userId}`);
    }

    // Call createOrUpdateUser on smart contract
    console.log(`Calling createOrUpdateUser for userId=${userId}, wallet=${wallet}, farcasterId=${farcasterIdToSend}`);
    const txHash = await callCreateOrUpdateUser(
        contractAddress,
        chain,
        userId,
        wallet,
        twitterIdToSend,
        farcasterIdToSend,
        walletsForChain
    );

    if (!txHash) {
        console.error(`Failed to call createOrUpdateUser - transaction not sent`);
        return;
    }

    console.log(`Transaction sent: ${txHash}, waiting for receipt...`);

    // Wait for transaction receipt
    const receipt = await fetchTransactionReceipt(chain, txHash);
    if (!receipt) {
        console.error(`Failed to fetch transaction receipt for ${txHash}`);
        return;
    }

    // Verify transaction status
    if (receipt.status !== undefined && receipt.status !== 1n) {
        console.error(`Transaction ${txHash} failed (status: ${receipt.status})`);
        return;
    }

    console.log(`Transaction ${txHash} confirmed, processing events...`);

    // Extract and process all events from the transaction
    const allowedContracts = getContractAddresses(chain);
    const events = extractEvents(receipt.logs, allowedContracts);

    for (const userEvent of events) {
        console.log(`Processing event from createOrUpdateUser transaction: ${userEvent.eventName}`);
        await processUserEvent(userEvent, chain);
    }

    console.log(`Completed processing VerifyFarcasterRequested for Farcaster ID ${farcasterId}`);
}
