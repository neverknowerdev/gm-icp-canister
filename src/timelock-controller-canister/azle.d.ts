// Type declarations for Azle - using mock types for testing
// In production, these would be provided by the azle package
declare module 'azle' {
    export class StableBTreeMap<K, V> {
        constructor(id: number);
        get(key: K): V[];
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
    export const ic: {
        id(): Principal;
        caller(): Principal;
        rawRand(): Promise<Uint8Array>;
        time(): bigint;
    };
}

// Global ic object type
declare global {
    var ic: {
        id(): Principal;
        caller(): Principal;
        setTimer(timestamp: bigint): void;
        rawRand(): Promise<Uint8Array>;
        time(): bigint;
    };
}

