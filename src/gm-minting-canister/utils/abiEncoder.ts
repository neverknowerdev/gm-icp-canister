/**
 * WARNING: This is NOT a real keccak256 implementation!
 * This is a placeholder XOR function that will NOT generate correct function selectors.
 * 
 * TODO: Replace with proper keccak256 implementation or use a library.
 * For ICP canisters, we may need to:
 * 1. Use a WebAssembly keccak256 implementation
 * 2. Use a pure JavaScript keccak256 library (if compatible with Azle)
 * 3. Call an external service for hashing
 * 
 * Current implementation will generate INCORRECT function selectors!
 * This is a CRITICAL issue that needs to be fixed before production use.
 */
function keccak256(data: Uint8Array): Uint8Array {
    // FIXME: This is NOT real keccak256 - just XOR, produces incorrect hashes!
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
        hash[i % 32] ^= data[i];
    }
    return hash;
}

export function getFunctionSelector(functionSignature: string): Uint8Array {
    const hash = keccak256(new TextEncoder().encode(functionSignature));
    return hash.slice(0, 4);
}

function padUint256(value: bigint): Uint8Array {
    const result = new Uint8Array(32);
    const hex = value.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
}

function padAddress(address: string): Uint8Array {
    const addr = address.startsWith('0x') ? address.slice(2) : address;
    const result = new Uint8Array(32);
    const hex = addr.padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
}

function encodeUint256(value: bigint): Uint8Array {
    return padUint256(value);
}

function encodeAddress(address: string): Uint8Array {
    return padAddress(address);
}

function encodeString(value: string): { data: Uint8Array; offset: number } {
    const utf8 = new TextEncoder().encode(value);
    const length = utf8.length;
    const lengthPad = padUint256(BigInt(length));
    const dataPad = new Uint8Array(Math.ceil(length / 32) * 32);
    dataPad.set(utf8, 0);
    
    const result = new Uint8Array(32 + dataPad.length);
    result.set(lengthPad, 0);
    result.set(dataPad, 32);
    
    return { data: result, offset: 32 };
}

function encodeAddressArray(addresses: string[]): { data: Uint8Array; offset: number } {
    const length = addresses.length;
    const lengthPad = padUint256(BigInt(length));
    
    const encodedAddresses = new Uint8Array(length * 32);
    for (let i = 0; i < length; i++) {
        encodedAddresses.set(padAddress(addresses[i]), i * 32);
    }
    
    const result = new Uint8Array(32 + encodedAddresses.length);
    result.set(lengthPad, 0);
    result.set(encodedAddresses, 32);
    
    return { data: result, offset: 32 };
}

function encodeUint256Array(values: bigint[]): { data: Uint8Array; offset: number } {
    const length = values.length;
    const lengthPad = padUint256(BigInt(length));
    
    const encodedValues = new Uint8Array(length * 32);
    for (let i = 0; i < length; i++) {
        encodedValues.set(padUint256(values[i]), i * 32);
    }
    
    const result = new Uint8Array(32 + encodedValues.length);
    result.set(lengthPad, 0);
    result.set(encodedValues, 32);
    
    return { data: result, offset: 32 };
}

export function encodeStartMinting(): Uint8Array {
    const selector = getFunctionSelector('startMinting()');
    return selector;
}

export function encodeMintForUsers(wallets: string[], amounts: bigint[]): Uint8Array {
    const selector = getFunctionSelector('mintForUsers(address[],uint256[])');
    
    const walletsEncoded = encodeAddressArray(wallets);
    const amountsEncoded = encodeUint256Array(amounts);
    
    const walletsOffset = 64;
    const amountsOffset = 64 + walletsEncoded.data.length;
    
    const result = new Uint8Array(
        4 +
        32 +
        32 +
        walletsEncoded.data.length +
        amountsEncoded.data.length
    );
    
    let offset = 0;
    result.set(selector, offset);
    offset += 4;
    result.set(padUint256(BigInt(walletsOffset)), offset);
    offset += 32;
    result.set(padUint256(BigInt(amountsOffset)), offset);
    offset += 32;
    result.set(walletsEncoded.data, offset);
    offset += walletsEncoded.data.length;
    result.set(amountsEncoded.data, offset);
    
    return result;
}

export function encodeFinishMinting(mintingDayTimestamp: number, runningHash: string): Uint8Array {
    const selector = getFunctionSelector('finishMinting(uint32,string)');
    
    const timestampPad = padUint256(BigInt(mintingDayTimestamp));
    const hashEncoded = encodeString(runningHash);
    const hashOffset = 64;
    
    const result = new Uint8Array(
        4 +
        32 +
        32 +
        hashEncoded.data.length
    );
    
    let offset = 0;
    result.set(selector, offset);
    offset += 4;
    result.set(timestampPad, offset);
    offset += 32;
    result.set(padUint256(BigInt(hashOffset)), offset);
    offset += 32;
    result.set(hashEncoded.data, offset);
    
    return result;
}

