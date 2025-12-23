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
    };
    export function call(canisterId: any, method: string, options: any): Promise<any>;
}

