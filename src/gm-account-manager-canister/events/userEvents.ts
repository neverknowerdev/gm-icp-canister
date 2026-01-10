// Event Handlers for User-related events from smart contract
// These events are processed AFTER the transaction that calls createOrUpdateUser

import { ParsedEvent, Chain } from '../utils/types';
import {
    getUser,
    createUserWithId,
    updateUserTwitterId,
    updateUserFarcasterId,
    addWalletToUser,
    updateUserPrimaryWallet,
    removeUser,
    markUserAsVerified,
} from '../userManagement/userStore';
import { decodeEvent } from '../evmContracts/eventDecoder';

/**
 * Build topics array from ParsedEvent args
 */
function buildTopics(args: Record<string, any>): string[] {
    const topics: string[] = [];
    if (args.topic0) topics.push(args.topic0);
    if (args.topic1) topics.push(args.topic1);
    if (args.topic2) topics.push(args.topic2);
    if (args.topic3) topics.push(args.topic3);
    return topics;
}

/**
 * Handle UserCreated event
 * Event: UserCreated(uint256 indexed userId, address indexed wallet, uint256 twitterId, uint256 farcasterId)
 */
export async function handleUserCreated(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing UserCreated event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('UserCreated', topics, data);

    if (!decoded) {
        console.error('Failed to decode UserCreated event');
        return;
    }

    const { userId, wallet, twitterId, farcasterId } = decoded.args;

    if (!userId || !wallet) {
        console.error('Invalid UserCreated event - missing userId or wallet');
        return;
    }

    // Create user in memory (smart contract is source of truth, but we cache locally)
    const existingUser = getUser(userId);
    if (!existingUser) {
        createUserWithId(userId, wallet, chain, twitterId || 0n, farcasterId || 0n);
        console.log(`User created in memory: userId=${userId}, wallet=${wallet}, chain=${chain}, twitterId=${twitterId || 0n}, farcasterId=${farcasterId || 0n}`);
    } else {
        console.log(`User ${userId} already exists in memory - skipping creation`);
    }
}

/**
 * Handle UserRemoved event
 * Event: UserRemoved(uint256 indexed userId)
 */
export async function handleUserRemoved(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing UserRemoved event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('UserRemoved', topics, data);

    if (!decoded) {
        console.error('Failed to decode UserRemoved event');
        return;
    }

    const { userId } = decoded.args;

    if (!userId) {
        console.error('Invalid UserRemoved event - missing userId');
        return;
    }

    removeUser(userId);
    console.log(`User removed: userId=${userId}`);
}

/**
 * Handle SocialAccountLinked event
 * Event: SocialAccountLinked(uint256 indexed userId, string indexed socialType, uint256 indexed socialId)
 * Note: indexed strings are stored as keccak256 hash, so we use heuristics to determine type
 */
export async function handleSocialAccountLinked(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing SocialAccountLinked event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('SocialAccountLinked', topics, data);

    if (!decoded) {
        console.error('Failed to decode SocialAccountLinked event');
        return;
    }

    const { userId, socialId } = decoded.args;
    // socialType is indexed string, so it's a hash - we need to infer from context

    if (!userId || !socialId) {
        console.error('Invalid SocialAccountLinked event - missing userId or socialId');
        return;
    }

    const user = getUser(userId);
    if (!user) {
        console.error(`User ${userId} not found`);
        return;
    }

    // Infer socialType from existing user data
    let socialType: string;
    if (user.twitterId > 0n && user.twitterId !== socialId) {
        socialType = 'farcaster';
    } else if (user.farcasterId > 0n && user.farcasterId !== socialId) {
        socialType = 'twitter';
    } else if (user.twitterId === 0n) {
        socialType = 'twitter';
    } else {
        socialType = 'farcaster';
    }

    if (socialType === 'twitter') {
        updateUserTwitterId(userId, socialId);
        console.log(`Linked Twitter ID ${socialId} to user ${userId}`);
    } else {
        updateUserFarcasterId(userId, socialId);
        console.log(`Linked Farcaster ID ${socialId} to user ${userId}`);
    }
}

/**
 * Handle PrimaryWalletUpdated event
 * Event: PrimaryWalletUpdated(uint256 indexed userId, address indexed wallet)
 */
export async function handlePrimaryWalletUpdated(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing PrimaryWalletUpdated event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('PrimaryWalletUpdated', topics, data);

    if (!decoded) {
        console.error('Failed to decode PrimaryWalletUpdated event');
        return;
    }

    const { userId, wallet } = decoded.args;

    if (!userId || !wallet) {
        console.error('Invalid PrimaryWalletUpdated event - missing userId or wallet');
        return;
    }

    updateUserPrimaryWallet(userId, wallet);
    console.log(`Primary wallet updated for user ${userId}: ${wallet}`);
}

/**
 * Handle WalletLinked event
 * Event: WalletLinked(uint256 indexed userId, address indexed wallet, string chain)
 */
export async function handleWalletLinked(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing WalletLinked event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('WalletLinked', topics, data);

    if (!decoded) {
        console.error('Failed to decode WalletLinked event');
        return;
    }

    const { userId, wallet } = decoded.args;
    // chain is in data but we use context chain as fallback

    if (!userId || !wallet) {
        console.error('Invalid WalletLinked event - missing userId or wallet');
        return;
    }

    // Use decoded chain if available, otherwise use context chain
    const walletChain = decoded.args.chain ? chain : chain; // TODO: Parse chain from decoded if needed

    addWalletToUser(userId, wallet, walletChain);
    console.log(`Wallet linked to user ${userId}: ${wallet} on ${walletChain}`);
}

/**
 * Handle HumanVerificationUpdated event
 * Event: HumanVerificationUpdated(uint256 indexed userId, bool isVerified)
 */
export async function handleHumanVerificationUpdated(event: ParsedEvent, chain: Chain): Promise<void> {
    console.log(`Processing HumanVerificationUpdated event`);

    const topics = buildTopics(event.args);
    const data = event.args.data || '0x';
    const decoded = decodeEvent('HumanVerificationUpdated', topics, data);

    if (!decoded) {
        console.error('Failed to decode HumanVerificationUpdated event');
        return;
    }

    const { userId, isVerified } = decoded.args;

    if (!userId) {
        console.error('Invalid HumanVerificationUpdated event - missing userId');
        return;
    }

    if (isVerified) {
        markUserAsVerified(userId);
        console.log(`Verification status updated for user ${userId}: verified`);
    } else {
        // TODO: Add function to unverify user if needed
        console.log(`Verification status updated for user ${userId}: unverified (not implemented)`);
    }
}

/**
 * Route event to appropriate handler
 */
export async function processUserEvent(event: ParsedEvent, chain: Chain): Promise<void> {
    const eventName = event.eventName;

    switch (eventName) {
        case 'UserCreated':
            await handleUserCreated(event, chain);
            break;
        case 'UserRemoved':
            await handleUserRemoved(event, chain);
            break;
        case 'SocialAccountLinked':
            await handleSocialAccountLinked(event, chain);
            break;
        case 'PrimaryWalletUpdated':
            await handlePrimaryWalletUpdated(event, chain);
            break;
        case 'WalletLinked':
            await handleWalletLinked(event, chain);
            break;
        case 'HumanVerificationUpdated':
            await handleHumanVerificationUpdated(event, chain);
            break;
        default:
            console.warn(`Unknown user event: ${eventName}`);
    }
}
