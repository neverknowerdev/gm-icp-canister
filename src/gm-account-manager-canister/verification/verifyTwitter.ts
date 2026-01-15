import { ParsedEvent, Chain } from '../utils/types';
import { getUserByTwitterId } from '../userManagement/userStore';
import { verifyTwitterAuthCode } from './twitterVerification';
import { callCreateOrUpdateUser } from '../evmContracts/smartContract';
import { getContracts, getContractAddresses } from '../evmContracts/config';
import { generateNextUserId } from '../storage/atomicCounter';
import { fetchTransactionReceipt } from '../evmContracts/evmRpc';
import { extractEvents } from '../evmContracts/eventDecoder';
import { processUserEvent } from '../userEvents';

/**
 * Handles VerifyTwitterByAuthCodeRequested event
 * 
 * Flow:
 * 1. Extract authCode, tweetID, userID (Twitter user ID), and wallet from event args
 * 2. Validate auth code format and verify with Twitter API
 * 3. Check if Twitter ID exists globally (across all chains)
 * 4. If exists: Get user data, call createOrUpdateUser
 * 5. If new: Generate new userId atomically, call createOrUpdateUser
 * 6. Wait for transaction receipt
 * 7. Process all events from that transaction
 * 
 * @throws Error if any step fails
 */
function safeStringify(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    });
}

export async function verifyTwitter(
    event: ParsedEvent,
    chain: Chain,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyTwitterByAuthCodeRequested event`);
    console.log(`Event args: ${safeStringify(event.args)}`);
    console.log(`Transaction from: ${transactionFrom}`);
    console.log(`Event args keys: ${Object.keys(event.args || {}).join(', ')}`);

    // Extract values - check all possible field names
    const authCode = event.args.authCode || event.args.auth_code || event.args[1];
    const tweetID = event.args.tweetID || event.args.tweet_id || event.args[2];
    const twitterUserID = event.args.twitterID || event.args.twitter_id || event.args.userID || event.args.user_id || event.args[3];
    // Use wallet from event args (user's wallet), not transactionFrom (account abstraction wallet)
    const wallet = (event.args.wallet || transactionFrom || '').toLowerCase();

    console.log(`Extracted values - wallet: ${wallet}, authCode: ${authCode} (type: ${typeof authCode}), tweetID: ${tweetID} (type: ${typeof tweetID}), twitterUserID: ${twitterUserID} (type: ${typeof twitterUserID})`);

    if (!wallet || !wallet.startsWith('0x')) {
        throw new Error(`No valid wallet found in event. Event must contain wallet address. Got: ${wallet}`);
    }

    if (!authCode || typeof authCode !== 'string') {
        throw new Error(`No auth code found in event. Event must contain authCode string. Got: ${typeof authCode}, value: ${authCode}`);
    }

    if (!tweetID || typeof tweetID !== 'string') {
        throw new Error(`No tweet ID found in event. Event must contain tweetID string. Got: ${typeof tweetID}, value: ${tweetID}`);
    }

    if (!twitterUserID || (typeof twitterUserID !== 'string' && typeof twitterUserID !== 'bigint' && typeof twitterUserID !== 'number')) {
        throw new Error(`No user ID found in event. Event must contain twitterID. Got: ${typeof twitterUserID}, value: ${twitterUserID}`);
    }
    
    // Convert to string if it's a number or bigint
    const twitterUserIDStr = typeof twitterUserID === 'string' ? twitterUserID : String(twitterUserID);

    console.log(`Verifying Twitter auth code: ${authCode}, tweetID: ${tweetID}, twitterUserID: ${twitterUserIDStr}, wallet: ${wallet}`);

    // Verify auth code with Twitter API
    await verifyTwitterAuthCode(authCode, tweetID, twitterUserIDStr, wallet);
    console.log(`Successfully verified Twitter auth code`);

    // Convert Twitter user ID to bigint
    const twitterId = BigInt(twitterUserIDStr);

    const contractAddress = getContracts(chain)?.accountManager;
    if (!contractAddress) {
        throw new Error(`No contract address configured for chain: ${chain}`);
    }

    // Check if Twitter ID exists globally
    const existingUser = getUserByTwitterId(twitterId);

    let userId: bigint;
    let twitterIdToSend: bigint = twitterId;
    let farcasterIdToSend: bigint = 0n;
    let walletsForChain: Array<{ wallet: string; chain: Chain }> = [{ wallet, chain }];

    if (existingUser) {
        // Twitter ID already exists - use existing userId
        console.log(`Twitter ID ${twitterId} already exists for user ${existingUser.userId}`);
        userId = existingUser.userId;
        twitterIdToSend = existingUser.twitterId;
        farcasterIdToSend = existingUser.farcasterId;

        // Get wallets for current chain only
        walletsForChain = existingUser.wallets.filter(w => w.chain === chain);
        if (walletsForChain.length === 0) {
            walletsForChain = [{ wallet, chain }];
        }
    } else {
        // New user - generate userId atomically
        console.log(`Twitter ID ${twitterId} is new - generating userId`);
        userId = await generateNextUserId();
        console.log(`Generated userId: ${userId}`);
    }

    // Call createOrUpdateUser on smart contract
    console.log(`Calling createOrUpdateUser for userId=${userId}, wallet=${wallet}, twitterId=${twitterId}`);
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
        throw new Error('Failed to call createOrUpdateUser - transaction not sent');
    }

    console.log(`Transaction sent: ${txHash}, waiting for receipt...`);

    // Wait for transaction receipt
    const receipt = await fetchTransactionReceipt(chain, txHash);
    if (!receipt) {
        throw new Error(`Failed to fetch transaction receipt for ${txHash}`);
    }

    // Verify transaction status
    if (receipt.status !== undefined && receipt.status !== 1n) {
        throw new Error(`Transaction ${txHash} failed (status: ${receipt.status})`);
    }

    console.log(`Transaction ${txHash} confirmed, processing events...`);

    // Extract and process all events from the transaction
    const allowedContracts = getContractAddresses(chain);
    const events = extractEvents(receipt.logs, allowedContracts);

    for (const userEvent of events) {
        console.log(`Processing event from createOrUpdateUser transaction: ${userEvent.eventName}`);
        await processUserEvent(userEvent, chain);
    }

    console.log(`Completed processing verification for Twitter ID ${twitterId}`);
}
