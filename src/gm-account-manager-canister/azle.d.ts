// Type declarations for Azle 0.33+ - using mock types for testing
// In production, these would be provided by the azle package
declare module 'azle' {
    export class StableBTreeMap<K, V> {
        constructor(id: number);
        // Azle 0.33+ returns V | undefined, not V[]
        get(key: K): V | undefined;
        insert(key: K, value: V): void;
        remove(key: K): V | null;
        containsKey(key: K): boolean;
        isEmpty(): boolean;
        keys(): K[];
        values(): V[];
        items(): [K, V][];
        len(): bigint;
    }

    export function query(paramTypes: any[], returnType: any): any;
    export function update(paramTypes: any[], returnType: any): any;

    export const IDL: any;
    export const Principal: {
        fromText(text: string): any;
        fromUint8Array(bytes: Uint8Array): any;
    };
    export function call(canisterId: any, method: string, options: any): Promise<any>;

    // Azle 0.33+ exports individual functions, not an ic object
    export function setTimer(delay: bigint, callback: () => void): bigint;
    export function randSeed(seed: Uint8Array): void;
}

// Global crypto for Azle's CSPRNG
declare global {
    var crypto: {
        getRandomValues<T extends ArrayBufferView | null>(array: T): T;
    };
}

