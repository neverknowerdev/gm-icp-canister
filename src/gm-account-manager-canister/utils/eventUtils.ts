// Event parsing utilities - helpers for extracting data from event logs

/**
 * Convert hex string to BigInt
 */
export function hexToBigInt(hex: string): bigint {
    if (!hex || hex === '0x') {
        return 0n;
    }
    // Remove 0x prefix if present
    const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
    return BigInt('0x' + cleaned);
}

/**
 * Convert hex string to address (0x + last 40 chars, lowercased)
 */
export function hexToAddress(hex: string): string {
    if (!hex) {
        return '';
    }
    // Remove 0x prefix if present
    const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
    // Take last 40 characters (20 bytes = 40 hex chars)
    const addressHex = cleaned.slice(-40);
    return '0x' + addressHex.toLowerCase();
}

/**
 * Extract uint256 from topic (padded hex)
 */
export function topicToUint256(topic: string): bigint {
    return hexToBigInt(topic);
}

/**
 * Extract address from topic (padded hex, address is last 40 chars)
 */
export function topicToAddress(topic: string): string {
    return hexToAddress(topic);
}

/**
 * Parse event data to extract non-indexed parameters
 * This is a simplified version - in production, you'd need proper ABI decoding
 * 
 * @param data - The event data hex string
 * @param types - Array of parameter types (e.g., ['uint256', 'uint256'])
 * @returns Array of parsed values
 */
export function parseEventData(data: string, types: string[]): any[] {
    if (!data || data === '0x') {
        return [];
    }

    const cleaned = data.startsWith('0x') ? data.slice(2) : data;
    const results: any[] = [];

    // Each parameter takes 64 hex characters (32 bytes)
    let offset = 0;
    for (const type of types) {
        const paramHex = cleaned.slice(offset, offset + 64);
        
        if (type === 'uint256' || type === 'uint64' || type === 'uint32') {
            results.push(hexToBigInt('0x' + paramHex));
        } else if (type === 'address') {
            results.push(hexToAddress('0x' + paramHex));
        } else if (type === 'bool') {
            results.push(hexToBigInt('0x' + paramHex) !== 0n);
        } else if (type === 'string') {
            // String encoding is more complex - would need proper ABI decoding
            // For now, return as-is
            results.push('0x' + paramHex);
        } else {
            // Unknown type, return as hex
            results.push('0x' + paramHex);
        }

        offset += 64;
        if (offset >= cleaned.length) {
            break;
        }
    }

    return results;
}

