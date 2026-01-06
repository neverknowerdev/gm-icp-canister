// Event Handlers for User-related events from smart contract
// These events are processed AFTER the transaction that calls createOrUpdateUser

import { ParsedEvent } from '../utils/types';
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
import { topicToUint256, topicToAddress, parseEventData } from '../utils/eventUtils';

/**
 * Handle UserCreated event
 * Event: UserCreated(uint256 indexed userId, address indexed wallet, uint256 twitterId, uint256 farcasterId)
 * Topics: [eventSignature, userId, wallet]
 * Data: [twitterId (32 bytes), farcasterId (32 bytes)]
 */
export async function handleUserCreated(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing UserCreated event`);
    
    // Extract indexed parameters from topics
    // topic1 = userId, topic2 = wallet address
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    const wallet = event.args.topic2 ? topicToAddress(event.args.topic2) : null;
    
    if (!userId || !wallet) {
        console.error('Invalid UserCreated event - missing userId or wallet');
        return;
    }

    // Parse non-indexed parameters from event data (twitterId, farcasterId)
    let twitterId = 0n;
    let farcasterId = 0n;

    if (event.args.data && event.args.data !== '0x') {
        const parsed = parseEventData(event.args.data, ['uint256', 'uint256']);
        if (parsed.length >= 2) {
            twitterId = typeof parsed[0] === 'bigint' ? parsed[0] : 0n;
            farcasterId = typeof parsed[1] === 'bigint' ? parsed[1] : 0n;
        }
    }

    // Create user in memory (smart contract is source of truth, but we cache locally)
    // When UserCreated event is received, we sync the user to memory
    const existingUser = getUser(userId);
    if (!existingUser) {
        // Create user with the userId from contract (use wallet from event)
        createUserWithId(userId, wallet, chain, twitterId, farcasterId);
        console.log(`User created in memory: userId=${userId}, wallet=${wallet}, chain=${chain}, twitterId=${twitterId}, farcasterId=${farcasterId}`);
    } else {
        console.log(`User ${userId} already exists in memory - skipping creation`);
    }
}

/**
 * Handle UserRemoved event
 * Event: UserRemoved(uint256 indexed userId)
 * Topics: [eventSignature, userId]
 */
export async function handleUserRemoved(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing UserRemoved event`);
    
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    
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
 * Topics: [eventSignature, userId, keccak256(socialType), socialId]
 * socialType: "twitter" or "farcaster" (keccak256 hashed in topic)
 */
export async function handleSocialAccountLinked(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing SocialAccountLinked event`);
    
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    const socialId = event.args.topic3 ? topicToUint256(event.args.topic3) : null;
    
    // topic2 is keccak256 hash of socialType string - we need to decode it
    // For now, check if it matches known hashes, or use data field if available
    let socialType: string | null = null;
    
    if (event.args.topic2) {
        // Common keccak256 hashes for "twitter" and "farcaster"
        // In production, you'd compute these or get from ABI
        const twitterHash = '0x' + 'twitter'.padEnd(64, '0'); // Simplified - actual hash needed
        const farcasterHash = '0x' + 'farcaster'.padEnd(64, '0'); // Simplified - actual hash needed
        
        // Try to extract from data if available, or use heuristics
        if (event.args.data && event.args.data !== '0x') {
            // If socialType is in data (non-indexed), parse it
            const parsed = parseEventData(event.args.data, ['string']);
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
                socialType = parsed[0];
            }
        }
        
        // Fallback: try to match topic hash (would need actual keccak256 implementation)
        // For now, assume we can infer from context or use a different approach
    }
    
    if (!userId || !socialId) {
        console.error('Invalid SocialAccountLinked event - missing userId or socialId');
        return;
    }

    const user = getUser(userId);
    if (!user) {
        console.error(`User ${userId} not found`);
        return;
    }

    // If socialType not extracted, try to infer from existing user data
    if (!socialType) {
        // If user already has a twitterId and we're linking a different one, might be farcaster
        // This is a heuristic - proper implementation needs socialType parsing
        if (user.twitterId > 0n && user.twitterId !== socialId) {
            socialType = 'farcaster';
        } else if (user.farcasterId > 0n && user.farcasterId !== socialId) {
            socialType = 'twitter';
        } else {
            // Try both - update the one that's 0
            if (user.twitterId === 0n) {
                socialType = 'twitter';
            } else {
                socialType = 'farcaster';
            }
        }
    }

    if (socialType === 'twitter' || socialType.toLowerCase() === 'twitter') {
        updateUserTwitterId(userId, socialId);
        console.log(`Linked Twitter ID ${socialId} to user ${userId}`);
    } else if (socialType === 'farcaster' || socialType.toLowerCase() === 'farcaster') {
        updateUserFarcasterId(userId, socialId);
        console.log(`Linked Farcaster ID ${socialId} to user ${userId}`);
    } else {
        console.error(`Unknown social type: ${socialType}`);
    }
}

/**
 * Handle PrimaryWalletUpdated event
 * Event: PrimaryWalletUpdated(uint256 indexed userId, address indexed wallet)
 * Topics: [eventSignature, userId, wallet]
 */
export async function handlePrimaryWalletUpdated(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing PrimaryWalletUpdated event`);
    
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    const wallet = event.args.topic2 ? topicToAddress(event.args.topic2) : null;
    
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
 * Topics: [eventSignature, userId, wallet]
 * Data: [chain (string)]
 */
export async function handleWalletLinked(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing WalletLinked event`);
    
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    const wallet = event.args.topic2 ? topicToAddress(event.args.topic2) : null;
    
    if (!userId || !wallet) {
        console.error('Invalid WalletLinked event - missing userId or wallet');
        return;
    }

    // Extract chain from event data if available, otherwise use context chain
    let walletChain = chain;
    if (event.args.data && event.args.data !== '0x') {
        // Try to parse chain string from data
        // String encoding in ABI is complex - would need proper decoding
        // For now, use context chain
    }

    addWalletToUser(userId, wallet, walletChain);
    console.log(`Wallet linked to user ${userId}: ${wallet} on ${walletChain}`);
}

/**
 * Handle HumanVerificationUpdated event
 * Event: HumanVerificationUpdated(uint256 indexed userId, bool isVerified)
 * Topics: [eventSignature, userId]
 * Data: [isVerified (bool, 32 bytes)]
 */
export async function handleHumanVerificationUpdated(event: ParsedEvent, chain: string): Promise<void> {
    console.log(`Processing HumanVerificationUpdated event`);
    
    const userId = event.args.topic1 ? topicToUint256(event.args.topic1) : null;
    
    if (!userId) {
        console.error('Invalid HumanVerificationUpdated event - missing userId');
        return;
    }

    // Extract isVerified from event data
    let isVerified = true; // Default to true
    if (event.args.data && event.args.data !== '0x') {
        const parsed = parseEventData(event.args.data, ['bool']);
        if (parsed.length > 0 && typeof parsed[0] === 'boolean') {
            isVerified = parsed[0];
        } else {
            // Check if value is non-zero (bool is encoded as uint256)
            const value = parseEventData(event.args.data, ['uint256']);
            if (value.length > 0 && typeof value[0] === 'bigint') {
                isVerified = value[0] !== 0n;
            }
        }
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
export async function processUserEvent(event: ParsedEvent, chain: string): Promise<void> {
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

