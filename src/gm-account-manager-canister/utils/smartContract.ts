import { User } from '../userManagement/userTypes';
import { encodeCreateOrUpdateUser } from './abiEncoder';
import { getEthereumAddress } from './thresholdSigning';
import { sendSignedTransaction } from './evmTransaction';

// Smart contract interaction utilities

// Chain ID mapping
function getChainId(chain: string): number {
    switch (chain) {
        case 'Base Mainnet':
            return 8453;
        case 'WorldChain':
            return 480; // TODO: Verify actual chain ID
        case 'Monad':
            return 10143; // TODO: Verify actual chain ID
        default:
            throw new Error(`Unknown chain: ${chain}`);
    }
}

/**
 * Calls the smart contract's createOrUpdateUser function
 * This is the main function that updates user data on the smart contract
 * 
 * @param contractAddress - The contract address to call
 * @param chain - The chain name
 * @param userId - The global userId
 * @param wallet - The wallet address for the current chain
 * @param twitterId - Twitter ID (0 if none)
 * @param farcasterId - Farcaster ID (0 if none)
 * @param walletsForChain - Array of wallets for the current chain only
 * @returns Transaction hash if successful, null otherwise
 */
export async function callCreateOrUpdateUser(
    contractAddress: string,
    chain: string,
    userId: bigint,
    wallet: string,
    twitterId: bigint,
    farcasterId: bigint,
    walletsForChain: Array<{ wallet: string, chain: string }>
): Promise<string | null> {
    try {
        console.log(`Calling createOrUpdateUser on contract ${contractAddress}:`);
        console.log(`  userId: ${userId}`);
        console.log(`  wallet: ${wallet}`);
        console.log(`  twitterId: ${twitterId}`);
        console.log(`  farcasterId: ${farcasterId}`);
        console.log(`  walletsForChain: ${walletsForChain.length} wallets`);

        // 1. ABI encode the function call
        const walletAddresses = walletsForChain.map(w => w.wallet);
        const encodedData = encodeCreateOrUpdateUser(
            userId,
            wallet,
            twitterId,
            farcasterId,
            walletAddresses
        );

        // 2. Get canister's Ethereum address
        const canisterAddress = await getEthereumAddress();

        // 3. Get chain ID
        const chainId = getChainId(chain);

        // 4. Send signed transaction via EVM RPC canister
        // sendSignedTransaction will handle transaction serialization and signing internally
        const txHash = await sendSignedTransaction(
            chain,
            chainId,
            contractAddress,
            encodedData,
            canisterAddress
        );

        console.log(`Transaction sent successfully: ${txHash}`);
        return txHash;
    } catch (error: any) {
        console.error(`Error calling createOrUpdateUser: ${error}`);
        return null;
    }
}

/**
 * Calls the smart contract's createUser function (legacy, use createOrUpdateUser instead)
 */
export async function callCreateUser(
    contractAddress: string,
    chain: string,
    userId: bigint,
    wallet: string,
    twitterId: bigint,
    farcasterId: bigint
): Promise<boolean> {
    try {
        const txHash = await callCreateOrUpdateUser(
            contractAddress,
            chain,
            userId,
            wallet,
            twitterId,
            farcasterId,
            [{ wallet, chain }]
        );
        return txHash !== null;
    } catch (error: any) {
        console.error(`Error calling createUser: ${error}`);
        return false;
    }
}

/**
 * Calls the smart contract's addUser function (legacy, use createOrUpdateUser instead)
 */
export async function callAddUser(
    contractAddress: string,
    chain: string,
    userId: bigint,
    userData: User
): Promise<boolean> {
    try {
        // Get wallets for the current chain only
        const walletsForChain = userData.wallets.filter(w => w.chain === chain);
        const primaryWallet = walletsForChain.length > 0 ? walletsForChain[0].wallet : userData.primaryWallet;

        const txHash = await callCreateOrUpdateUser(
            contractAddress,
            chain,
            userData.userId,
            primaryWallet,
            userData.twitterId,
            userData.farcasterId,
            walletsForChain
        );
        return txHash !== null;
    } catch (error: any) {
        console.error(`Error calling addUser: ${error}`);
        return false;
    }
}

/**
 * Encodes user data for smart contract call
 */
export function encodeUserData(user: User): any {
    return {
        userId: user.userId,
        chains: user.chains,
        twitterId: user.twitterId,
        farcasterId: user.farcasterId,
        isVerified: user.isVerified,
        verifications: user.verifications,
        primaryWallet: user.primaryWallet,
        wallets: user.wallets,
    };
}
