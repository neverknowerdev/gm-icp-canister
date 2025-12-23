import { query, update, IDL } from 'azle';
import { processEvent } from './eventProcessor';
import { initConfig } from './utils/config';

interface Config {
    contracts: {
        [chain: string]: string[];
    };
    eventSignatures: {
        [eventName: string]: string;
    };
}

export default class {
    @query([IDL.Text], IDL.Text)
    greet(name: string): string {
        return `Hello, ${name}!`;
    }

    @update([IDL.Text, IDL.Text], IDL.Null)
    async handleEvent(chain: string, transactionId: string): Promise<null> {
        try {
            await processEvent(chain, transactionId);
        } catch (error: any) {
            console.error(`Error processing event: ${error}`);
            if (error.message) {
                console.error(`Error message: ${error.message}`);
            }
        }
        return null;
    }

    @update([IDL.Record({
        contracts: IDL.Record({
            'Base Mainnet': IDL.Vec(IDL.Text),
            'WorldChain': IDL.Vec(IDL.Text),
            'Monad': IDL.Vec(IDL.Text),
        }),
        eventSignatures: IDL.Record({
            'VerifyFarcasterRequested': IDL.Text,
            'VerifyTwitterByAuthCodeRequested': IDL.Text,
        }),
    })], IDL.Null)
    setConfig(config: Config): null {
        initConfig(config);
        console.log('Configuration updated successfully');
        return null;
    }
}
