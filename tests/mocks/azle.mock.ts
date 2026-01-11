// Mock for Azle's StableBTreeMap and other IC-specific APIs
// This allows unit testing without the IC runtime

import * as crypto from 'crypto';

// Global storage for all mock instances, keyed by storage ID
const mockStorage: Map<number, Map<string, any>> = new Map();

export class MockStableBTreeMap<K, V> {
    private getStorageMap(): Map<string, V> {
        // Use shared storage by ID to allow clearing
        if (!mockStorage.has(this._id)) {
            mockStorage.set(this._id, new Map());
        }
        return mockStorage.get(this._id)! as Map<string, V>;
    }

    constructor(private _id: number) { }

    /**
     * Get a value from the map
     * Returns the value if found, undefined if not found
     * This matches Azle 0.33+ API which returns V | undefined
     */
    get(key: K): V | undefined {
        const keyStr = this.serializeKey(key);
        const map = this.getStorageMap();
        return map.get(keyStr);
    }

    insert(key: K, value: V): void {
        const keyStr = this.serializeKey(key);
        const map = this.getStorageMap();
        map.set(keyStr, value);
    }

    remove(key: K): V | null {
        const keyStr = this.serializeKey(key);
        const map = this.getStorageMap();
        const value = map.get(keyStr);
        if (value !== undefined) {
            map.delete(keyStr);
            return value;
        }
        return null;
    }

    containsKey(key: K): boolean {
        const keyStr = this.serializeKey(key);
        const map = this.getStorageMap();
        return map.has(keyStr);
    }

    isEmpty(): boolean {
        const map = this.getStorageMap();
        return map.size === 0;
    }

    keys(): K[] {
        const map = this.getStorageMap();
        return Array.from(map.keys()).map(k => this.deserializeKey(k));
    }

    values(): V[] {
        const map = this.getStorageMap();
        return Array.from(map.values());
    }

    items(): [K, V][] {
        const map = this.getStorageMap();
        return Array.from(map.entries()).map(([k, v]) => [
            this.deserializeKey(k),
            v,
        ]);
    }

    len(): bigint {
        const map = this.getStorageMap();
        return BigInt(map.size);
    }

    private serializeKey(key: K): string {
        if (typeof key === 'bigint') {
            return `bigint:${key.toString()}`;
        }
        return JSON.stringify(key);
    }

    private deserializeKey(keyStr: string): K {
        if (keyStr.startsWith('bigint:')) {
            return BigInt(keyStr.substring(7)) as K;
        }
        return JSON.parse(keyStr) as K;
    }

    // Helper method to clear this storage instance (for testing)
    clear(): void {
        const map = this.getStorageMap();
        map.clear();
    }
}

// Helper function to clear all mock storage (for testing)
export function clearMockStorage(): void {
    for (const map of mockStorage.values()) {
        map.clear();
    }
}

// Helper function to clear a specific storage by ID (for testing)
export function clearMockStorageById(id: number): void {
    if (mockStorage.has(id)) {
        mockStorage.get(id)!.clear();
    }
}

export const StableBTreeMap = MockStableBTreeMap;

// Mock ic object with rawRand using Node.js crypto
export const ic = {
    /**
     * Returns 32 bytes of randomness from the IC
     * In tests, we use Node.js crypto.randomBytes
     */
    rawRand: async (): Promise<Uint8Array> => {
        return new Uint8Array(crypto.randomBytes(32));
    },
};

// Mock other Azle exports as needed
export const query = () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const update = () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;
export const IDL = {
    Text: 'IDL.Text',
    Null: 'IDL.Null',
    Nat: 'IDL.Nat',
    Nat64: 'IDL.Nat64',
    Nat8: 'IDL.Nat8',
    Int64: 'IDL.Int64',
    Nat16: 'IDL.Nat16',
    Vec: (t: any) => `IDL.Vec(${t})`,
    Opt: (t: any) => `IDL.Opt(${t})`,
    Record: (fields: any) => `IDL.Record(${JSON.stringify(fields)})`,
    Variant: (fields: any) => `IDL.Variant(${JSON.stringify(fields)})`,
    Tuple: (...types: any[]) => `IDL.Tuple(${types.join(', ')})`,
};
export const Principal = {
    fromText: (text: string) => ({ _azlePrincipal: text }),
};
export const call = async (canisterId: any, method: string, options: any) => {
    // Mock implementation
    return { Ok: [{ logs: [] }] };
};
