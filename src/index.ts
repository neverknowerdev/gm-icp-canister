import { call, IDL, Principal, query, update } from 'azle';

// EVM RPC Canister Principal ID
// Use local canister ID for development, mainnet ID for production
// Note: For local development, the EVM RPC canister may not have access to Base Mainnet
const EVM_RPC_CANISTER_ID = Principal.fromText('ufxgi-4p777-77774-qaadq-cai'); // Local
// const EVM_RPC_CANISTER_ID = Principal.fromText('7hfb6-caaaa-aaaar-qadga-cai'); // Mainnet

export default class {
    @query([IDL.Text], IDL.Text)
    greet(name: string): string {
        return `Hello, ${name}!`;
    }

    @update([IDL.Text, IDL.Text], IDL.Null)
    async handleEvent(chain: string, transactionId: string): Promise<null> {
        // For now, only support Base Mainnet
        if (chain !== 'Base Mainnet') {
            console.log(`Unsupported chain: ${chain}. Only 'Base Mainnet' is supported for now.`);
            return null;
        }

        // Define IDL types for the evm-rpc canister call
        const L2MainnetService = IDL.Variant({
            Alchemy: IDL.Null,
            Ankr: IDL.Null,
            BlockPi: IDL.Null,
            PublicNode: IDL.Null,
        });

        const RpcServices = IDL.Variant({
            BaseMainnet: IDL.Opt(IDL.Vec(L2MainnetService)),
        });

        const RpcConfig = IDL.Record({
            responseSizeEstimate: IDL.Opt(IDL.Nat64),
        });

        const Hash = IDL.Text;

        const LogEntry = IDL.Record({
            address: IDL.Text,
            topics: IDL.Vec(IDL.Text),
            data: IDL.Text,
            blockNumber: IDL.Text,
            transactionHash: IDL.Text,
            transactionIndex: IDL.Text,
            blockHash: IDL.Text,
            logIndex: IDL.Text,
            removed: IDL.Bool,
        });

        const TransactionReceipt = IDL.Record({
            transactionHash: IDL.Text,
            transactionIndex: IDL.Text,
            blockHash: IDL.Text,
            blockNumber: IDL.Text,
            from: IDL.Text,
            to: IDL.Opt(IDL.Text),
            cumulativeGasUsed: IDL.Text,
            gasUsed: IDL.Text,
            contractAddress: IDL.Opt(IDL.Text),
            logs: IDL.Vec(LogEntry),
            logsBloom: IDL.Text,
            status: IDL.Text,
        });



        const MultiRpcResult = IDL.Variant({
            Consistent: IDL.Opt(TransactionReceipt),
            Inconsistent: IDL.Vec(IDL.Opt(TransactionReceipt)),
        });

        try {
            const rpcServices = {
                BaseMainnet: null,
            };

            // Prepare RPC config
            const rpcConfig = {
                responseSizeEstimate: [1_000_000n], // 1MB estimate
            };

            // Make the inter-canister call to evm-rpc canister
            const result = await call(EVM_RPC_CANISTER_ID, 'eth_getTransactionReceipt', {
                args: [rpcServices, rpcConfig, transactionId],
                paramIdlTypes: [RpcServices, RpcConfig, Hash],
                returnIdlType: MultiRpcResult,
            });

            console.log(`Raw result: ${JSON.stringify(result)}`);

            // Extract logs from the result
            if ('Consistent' in result && result.Consistent.length > 0) {
                const receipt = result.Consistent[0];
                if (receipt && receipt.logs) {
                    console.log(`Transaction Receipt for ${transactionId}:`);
                    console.log(`Block Number: ${receipt.blockNumber}`);
                    console.log(`Status: ${receipt.status}`);
                    console.log(`Number of logs: ${receipt.logs.length}`);
                    console.log('\nEvent Logs:');
                    receipt.logs.forEach((log: any, index: number) => {
                        console.log(`\nLog ${index + 1}:`);
                        console.log(`  Address: ${log.address}`);
                        console.log(`  Topics: ${JSON.stringify(log.topics)}`);
                        console.log(`  Data: ${log.data}`);
                        console.log(`  Block Number: ${log.blockNumber}`);
                        console.log(`  Transaction Hash: ${log.transactionHash}`);
                        console.log(`  Log Index: ${log.logIndex}`);
                    });
                } else {
                    console.log(`Transaction ${transactionId} not found or receipt is null.`);
                }
            } else if ('Inconsistent' in result && result.Inconsistent.length > 0) {
                // If results are inconsistent, use the first one
                const receipt = result.Inconsistent[0];
                if (receipt && receipt.logs) {
                    console.log(`Transaction Receipt for ${transactionId} (inconsistent results, using first):`);
                    console.log(`Block Number: ${receipt.blockNumber}`);
                    console.log(`Status: ${receipt.status}`);
                    console.log(`Number of logs: ${receipt.logs.length}`);
                    console.log('\nEvent Logs:');
                    receipt.logs.forEach((log: any, index: number) => {
                        console.log(`\nLog ${index + 1}:`);
                        console.log(`  Address: ${log.address}`);
                        console.log(`  Topics: ${JSON.stringify(log.topics)}`);
                        console.log(`  Data: ${log.data}`);
                        console.log(`  Block Number: ${log.blockNumber}`);
                        console.log(`  Transaction Hash: ${log.transactionHash}`);
                        console.log(`  Log Index: ${log.logIndex}`);
                    });
                } else {
                    console.log(`Transaction ${transactionId} not found or receipt is null (inconsistent results).`);
                    console.log(`Receipt value: ${JSON.stringify(receipt)}`);
                }
            } else {
                console.log(`No transaction receipt found for ${transactionId}.`);
                console.log(`Result structure: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            console.error(`Error fetching transaction receipt: ${error}`);
        }

        return null;
    }
}
