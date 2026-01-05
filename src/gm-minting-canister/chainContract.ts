import { call, IDL, Principal } from 'azle';
import { signWithThresholdEcdsa, setKeyId, setDerivationPath, getPublicKey } from './utils/thresholdSigning';
import { encodeStartMinting, encodeMintForUsers, encodeFinishMinting } from './utils/abiEncoder';
import { sendSignedTransaction, waitForTransaction } from './utils/evmTransaction';

let thresholdKeyConfig: {
    threshold: number;
    publicKey: string;
    keyName: string;
    derivationPath: Uint8Array[];
} | null = null;

let canisterEthereumAddress: string | null = null;

export async function setThresholdKeyConfig(
    threshold: number,
    publicKey: string,
    keyName: string = 'dfx_test_key',
    derivationPath: Uint8Array[] = [new TextEncoder().encode('minting_canister')]
): Promise<void> {
    thresholdKeyConfig = { threshold, publicKey, keyName, derivationPath };

    setKeyId(keyName, true);
    setDerivationPath(derivationPath);

    try {
        const pubKey = await getPublicKey();
        canisterEthereumAddress = publicKey;
    } catch (error: any) {
        console.warn(`Could not get public key: ${error}`);
    }
}

export interface ChainContract {
    chain: string;
    chainId: number;
    accountManagement: {
        contractAddress: string;
    };
    gmCoin: {
        contractAddress: string;
    };
}

async function signTransaction(data: Uint8Array): Promise<Uint8Array> {
    if (!thresholdKeyConfig) {
        throw new Error('Threshold key not configured. Call setThresholdKeyConfig() first.');
    }

    try {
        const signature = await signWithThresholdEcdsa(data);
        return signature;
    } catch (error: any) {
        console.error(`Error signing transaction: ${error}`);
        throw error;
    }
}

export async function startMinting(chainContract: ChainContract): Promise<boolean> {
    if (!canisterEthereumAddress) {
        throw new Error('Canister Ethereum address not set. Call setThresholdKeyConfig() first.');
    }

    try {
        const encodedData = encodeStartMinting();
        const signature = await signTransaction(encodedData);

        const txHash = await sendSignedTransaction(
            chainContract.chain,
            chainContract.chainId,
            chainContract.gmCoin.contractAddress,
            encodedData,
            signature,
            canisterEthereumAddress
        );

        try {
            await waitForTransaction(chainContract.chain, txHash);
        } catch (error: any) {
            console.warn(`Transaction ${txHash} not confirmed yet: ${error}`);
        }

        return true;
    } catch (error: any) {
        console.error(`Error starting minting on chain ${chainContract.chainId}: ${error}`);
        return false;
    }
}

export async function mintForUsers(
    chainContract: ChainContract,
    userAmounts: Map<string, bigint>
): Promise<boolean> {
    try {
        const wallets: string[] = [];
        const amounts: bigint[] = [];

        for (const [wallet, amount] of userAmounts.entries()) {
            wallets.push(wallet);
            amounts.push(amount);
        }

        if (!canisterEthereumAddress) {
            throw new Error('Canister Ethereum address not set. Call setThresholdKeyConfig() first.');
        }

        const encodedData = encodeMintForUsers(wallets, amounts);
        const signature = await signTransaction(encodedData);

        const txHash = await sendSignedTransaction(
            chainContract.chain,
            chainContract.chainId,
            chainContract.gmCoin.contractAddress,
            encodedData,
            signature,
            canisterEthereumAddress
        );

        try {
            await waitForTransaction(chainContract.chain, txHash);
        } catch (error: any) {
            console.warn(`Transaction ${txHash} not confirmed yet: ${error}`);
        }

        return true;
    } catch (error: any) {
        console.error(`Error minting for users on chain ${chainContract.chainId}: ${error}`);
        return false;
    }
}

export async function finishMinting(
    chainContract: ChainContract,
    mintingDayTimestamp: number,
    runningHash: string
): Promise<boolean> {
    if (!canisterEthereumAddress) {
        throw new Error('Canister Ethereum address not set. Call setThresholdKeyConfig() first.');
    }

    try {
        const encodedData = encodeFinishMinting(mintingDayTimestamp, runningHash);
        const signature = await signTransaction(encodedData);

        const txHash = await sendSignedTransaction(
            chainContract.chain,
            chainContract.chainId,
            chainContract.gmCoin.contractAddress,
            encodedData,
            signature,
            canisterEthereumAddress
        );

        try {
            await waitForTransaction(chainContract.chain, txHash);
        } catch (error: any) {
            console.warn(`Transaction ${txHash} not confirmed yet: ${error}`);
        }

        return true;
    } catch (error: any) {
        console.error(`Error finishing minting on chain ${chainContract.chainId}: ${error}`);
        return false;
    }
}