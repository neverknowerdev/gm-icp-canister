import { verifyTwitter } from '../../src/gm-account-manager-canister/events/verifyTwitter';
import { ParsedEvent, CHAIN_BASE_MAINNET, CHAIN_WORLDCHAIN } from '../../src/gm-account-manager-canister/utils/types';
import * as smartContract from '../../src/gm-account-manager-canister/evmContracts/smartContract';
import * as config from '../../src/gm-account-manager-canister/evmContracts/config';
import * as evmRpc from '../../src/gm-account-manager-canister/evmContracts/evmRpc';
import * as twitterVerification from '../../src/gm-account-manager-canister/verification/twitterVerification';

jest.mock('../../src/gm-account-manager-canister/evmContracts/smartContract');
jest.mock('../../src/gm-account-manager-canister/evmContracts/config');
jest.mock('../../src/gm-account-manager-canister/evmContracts/evmRpc');
jest.mock('../../src/gm-account-manager-canister/verification/twitterVerification');

describe('verifyTwitter Handler', () => {
    const mockEvent: ParsedEvent = {
        eventName: 'VerifyTwitterByAuthCodeRequested',
        contractAddress: '0xContract',
        args: {
            authCode: 'GM001234567890ab12',
            tweetID: '1234567890',
            userID: '100',
        },
        logIndex: 0n,
        transactionHash: '0xtxhash',
        blockNumber: 1000n,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (config.getContracts as jest.Mock).mockReturnValue({ accountManager: '0xContract', GMCoin: '' });
        (smartContract.callVerifyTwitter as jest.Mock).mockResolvedValue('0xtxhash123');
        (evmRpc.fetchTransactionReceipt as jest.Mock).mockResolvedValue({
            status: 1n,
            logs: [],
        });
        (twitterVerification.verifyTwitterAuthCode as jest.Mock).mockResolvedValue('100');
    });

    it('should verify Twitter and call verifyTwitter on contract', async () => {
        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalledWith(
            'GM001234567890ab12',
            '1234567890',
            '100',
            '0xwallet'
        );
        expect(smartContract.callVerifyTwitter).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            '100',
            '0xwallet'
        );
        expect(evmRpc.fetchTransactionReceipt).toHaveBeenCalledWith(CHAIN_BASE_MAINNET, '0xtxhash123');
    });

    it('should handle missing auth code', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                tweetID: '1234567890',
                userID: '100',
            },
        };

        await verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).not.toHaveBeenCalled();
    });

    it('should handle missing tweet ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                authCode: 'GM001234567890ab12',
                userID: '100',
            },
        };

        await verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).not.toHaveBeenCalled();
    });

    it('should handle missing user ID', async () => {
        const invalidEvent: ParsedEvent = {
            ...mockEvent,
            args: {
                authCode: 'GM001234567890ab12',
                tweetID: '1234567890',
            },
        };

        await verifyTwitter(invalidEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).not.toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).not.toHaveBeenCalled();
    });

    it('should handle missing contract address gracefully', async () => {
        (config.getContracts as jest.Mock).mockReturnValue(null);

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).not.toHaveBeenCalled();
    });

    it('should handle verification failure', async () => {
        (twitterVerification.verifyTwitterAuthCode as jest.Mock).mockRejectedValue(
            new Error('Auth code not found in tweet')
        );

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).not.toHaveBeenCalled();
    });

    it('should handle failed transaction', async () => {
        (smartContract.callVerifyTwitter as jest.Mock).mockResolvedValue(null);

        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWallet');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalled();
        expect(smartContract.callVerifyTwitter).toHaveBeenCalled();
        expect(evmRpc.fetchTransactionReceipt).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive wallet addresses', async () => {
        await verifyTwitter(mockEvent, CHAIN_BASE_MAINNET, '0xWALLET');

        expect(twitterVerification.verifyTwitterAuthCode).toHaveBeenCalledWith(
            'GM001234567890ab12',
            '1234567890',
            '100',
            '0xwallet'
        );
        expect(smartContract.callVerifyTwitter).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_BASE_MAINNET,
            '100',
            '0xwallet'
        );
    });

    it('should work with different chains', async () => {
        await verifyTwitter(mockEvent, CHAIN_WORLDCHAIN, '0xWallet');

        expect(smartContract.callVerifyTwitter).toHaveBeenCalledWith(
            '0xContract',
            CHAIN_WORLDCHAIN,
            '100',
            '0xwallet'
        );
    });
});
