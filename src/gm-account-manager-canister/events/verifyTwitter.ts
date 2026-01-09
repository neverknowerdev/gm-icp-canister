import { ParsedEvent, Chain } from '../utils/types';
import { callVerifyTwitter } from '../utils/smartContract';
import { getContractAddress } from '../utils/config';
import { fetchTransactionReceipt } from '../utils/evmRpc';
import { verifyTwitterAuthCode } from '../utils/twitterVerification';

/**
 * Handles VerifyTwitterByAuthCodeRequested event
 * 
 * Flow based on GMCoin web3-functions/twitter-verification-authcode:
 * 1. Extract authCode, tweetID, userID, and wallet from event args
 * 2. Validate auth code format (must start with 'GM', contains wallet letters)
 * 3. Fetch tweet using Twitter API with tweetID
 * 4. Check if auth code exists in tweet content
 * 5. Verify user ID matches tweet author
 * 6. Call verifyTwitter(userID, wallet) on smart contract
 */
export async function verifyTwitter(
    event: ParsedEvent,
    chain: Chain,
    transactionFrom: string
): Promise<void> {
    console.log(`Processing VerifyTwitterByAuthCodeRequested event`);
    console.log(`Event args: ${JSON.stringify(event.args)}`);

    const wallet = transactionFrom.toLowerCase();

    const authCode = event.args.authCode;
    const tweetID = event.args.tweetID;
    const userID = event.args.userID;

    if (!authCode || typeof authCode !== 'string') {
        console.error('No auth code found in event. Event must contain authCode string.');
        return;
    }

    if (!tweetID || typeof tweetID !== 'string') {
        console.error('No tweet ID found in event. Event must contain tweetID string.');
        return;
    }

    if (!userID || typeof userID !== 'string') {
        console.error('No user ID found in event. Event must contain userID string.');
        return;
    }

    console.log(`Verifying Twitter auth code: ${authCode}, tweetID: ${tweetID}, userID: ${userID}`);

    try {
        await verifyTwitterAuthCode(authCode, tweetID, userID, wallet);
        console.log(`Successfully verified Twitter auth code`);
    } catch (error: any) {
        console.error(`Failed to verify Twitter auth code: ${error.message}`);
        return;
    }

    const contractAddress = getContractAddress(chain);
    if (!contractAddress) {
        console.error(`No contract address configured for chain: ${chain}`);
        return;
    }

    console.log(`Calling verifyTwitter for userID=${userID}, wallet=${wallet}`);
    const txHash = await callVerifyTwitter(
        contractAddress,
        chain,
        userID,
        wallet
    );

    if (!txHash) {
        console.error(`Failed to call verifyTwitter - transaction not sent`);
        return;
    }

    console.log(`Transaction sent: ${txHash}, waiting for receipt...`);

    const receipt = await fetchTransactionReceipt(chain, txHash);
    if (!receipt) {
        console.error(`Failed to fetch transaction receipt for ${txHash}`);
        return;
    }

    if (receipt.status !== undefined && receipt.status !== 1n) {
        console.error(`Transaction ${txHash} failed (status: ${receipt.status})`);
        return;
    }

    console.log(`Transaction ${txHash} confirmed`);
    console.log(`Completed processing VerifyTwitterByAuthCodeRequested for userID ${userID}`);
}
