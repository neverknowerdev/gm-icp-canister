import { ParsedEvent, Chain } from '../utils/types';
import { getUserByFarcasterId } from '../userManagement/userStore';
import { verifyFarcasterAuthBigInt } from './farcasterVerification';
import { callCreateOrUpdateUser } from '../evmContracts/smartContract';
import { getContracts, getContractAddresses } from '../evmContracts/config';
import { generateNextUserId } from '../storage/atomicCounter';
import { fetchTransactionReceipt } from '../evmContracts/evmRpc';
import { extractEvents } from '../evmContracts/eventDecoder';
import { processUserEvent } from '../userEvents';

/**
 * Handles VerifyFarcasterRequested event
 * 
 * Flow:
 * 1. Extract auth token and wallet from event args
 * 2. Verify auth token with Farcaster API to get Farcaster ID
 * 3. Check if Farcaster ID exists globally (across all chains)
 * 4. If exists: Get user data, call createOrUpdateUser
 * 5. If new: Generate new userId atomically, call createOrUpdateUser
 * 6. Wait for transaction receipt
 * 7. Process all events from that transaction
 * 
 * @throws Error if any step fails
 */
export async function verifyFarcaster(
    event: ParsedEvent,
    chain: Chain,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyFarcasterRequested event`);
    const safeStringify = (obj: any): string => {
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        });
    };
    console.log(`Event args: ${safeStringify(event.args)}`);

    // Extract auth token and wallet from event
    const wallet = transactionFrom.toLowerCase();

    // Extract auth token from event data (decoded string from ABI-encoded data)
    const authToken = event.args.authToken || event.args.authCode || event.args.data;

    if (!authToken || authToken === '0x' || (typeof authToken === 'string' && authToken.startsWith('0x') && authToken.length < 10)) {
        throw new Error('No auth token found in event. Event must contain Farcaster auth token.');
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
    const farcasterId = await verifyFarcasterAuthBigInt(authTokenString);
    if (farcasterId === 0n) {
        throw new Error('Failed to verify Farcaster: got zero farcaster id');
    }

    console.log(`Successfully verified Farcaster auth token, Farcaster ID (FID): ${farcasterId}`);

    const contractAddress = getContracts(chain)?.accountManager;
    if (!contractAddress) {
        throw new Error(`No contract address configured for chain: ${chain}`);
    }

    // Check if Farcaster ID exists globally
    const existingUser = getUserByFarcasterId(farcasterId);

    let userId: bigint;
    let twitterIdToSend: bigint = 0n;
    let farcasterIdToSend: bigint = farcasterId;
    let walletsForChain: Array<{ wallet: string; chain: Chain }> = [{ wallet, chain }];

    if (existingUser) {
        // Farcaster ID already exists - use existing userId
        console.log(`Farcaster ID ${farcasterId} already exists for user ${existingUser.userId}`);
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
        console.log(`Farcaster ID ${farcasterId} is new - generating userId`);
        userId = await generateNextUserId();
        console.log(`Generated userId: ${userId}`);
    }

    // Call createOrUpdateUser on smart contract
    console.log(`Calling createOrUpdateUser for userId=${userId}, wallet=${wallet}, farcasterId=${farcasterId}`);
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

    console.log(`Completed processing verification for Farcaster ID ${farcasterId}`);
}
