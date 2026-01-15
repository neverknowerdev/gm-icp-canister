// HTTP Client for ICP canisters using HTTP outcalls
// Uses ICP's HTTP outcalls feature
// Note: In production, this needs to be implemented using the proper ICP HTTP outcalls API

export interface HttpRequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
    maxResponseBytes?: bigint;
    transformMethodName?: string;
}

export interface HttpResponse {
    status: number;
    headers: Array<[string, string]>;
    body: Uint8Array;
}

// Access ic from global scope (available in ICP canister runtime)
// In tests, this will be undefined, so we'll handle that gracefully
declare const ic: any;

import { call, IDL, Principal } from 'azle';

const MANAGEMENT_CANISTER = Principal.fromText('aaaaa-aa');

/**
 * Makes an HTTP request using ICP's HTTP outcalls feature
 * Uses the management canister's http_request method via Azle's call()
 */
export async function httpRequest(
    url: string,
    options: HttpRequestOptions
): Promise<{ body: string; status: number }> {
    try {
        // Don't use URL constructor - it requires experimental mode in Azle
        // Just validate that url is a string and starts with http:// or https://
        if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            throw new Error(`Invalid URL: ${url}`);
        }
        
        // Convert headers to the format expected by ICP
        // In Candid, record { text; text } with unnamed fields is encoded as a tuple
        const headers: Array<[string, string]> = [];
        if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
                headers.push([key.toLowerCase(), value]);
            }
        }

        // Prepare the HTTP request according to ICP's HTTP outcalls spec
        // In Azle, Opt(T) is encoded as [] for None or [value] for Some when using IDL.Vec()
        const maxResponseBytes = options.maxResponseBytes || 2_000_000n;
        const maxResponseBytesOpt = maxResponseBytes ? [maxResponseBytes] : [];
        
        // Opt(transform) - use [] for None, or [value] for Some
        const transformOpt = options.transformMethodName && typeof ic !== 'undefined' && ic.id ? [{
            function: [ic.id(), options.transformMethodName] as [any, string],
            context: Array.from(Uint8Array.from([])),
        }] : [];
        
        // Encode HTTP method as variant - use lowercase variant names
        let methodVariant: any;
        switch (options.method) {
            case 'GET':
                methodVariant = { get: null };
                break;
            case 'POST':
                methodVariant = { post: { body: Array.from(new TextEncoder().encode(options.body || '')) } };
                break;
            case 'PUT':
                methodVariant = { put: { body: Array.from(new TextEncoder().encode(options.body || '')) } };
                break;
            case 'DELETE':
                methodVariant = { delete: null };
                break;
            default:
                throw new Error(`Unsupported HTTP method: ${options.method}`);
        }
        
        const httpRequestParams = {
            url: url,
            method: methodVariant,
            headers: headers,
            max_response_bytes: maxResponseBytesOpt,
            transform: transformOpt,
        };

        // Define the IDL types for http_request
        // Note: Opt(T) in Candid is represented as Vec(T) where [] = None and [value] = Some(value)
        // Variant field names must be lowercase to match ICP's HTTP outcalls spec
        const HttpRequest = IDL.Record({
            url: IDL.Text,
            method: IDL.Variant({
                get: IDL.Null,
                post: IDL.Record({ body: IDL.Vec(IDL.Nat8) }),
                put: IDL.Record({ body: IDL.Vec(IDL.Nat8) }),
                delete: IDL.Null,
            }),
            headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
            max_response_bytes: IDL.Vec(IDL.Nat64), // Opt(nat64) is encoded as Vec(nat64)
            transform: IDL.Vec(IDL.Record({ // Opt(transform) is encoded as Vec(transform)
                function: IDL.Tuple(IDL.Principal, IDL.Text),
                context: IDL.Vec(IDL.Nat8),
            })),
        });

        const HttpResponse = IDL.Record({
            status: IDL.Record({ code: IDL.Nat16 }),
            headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
            body: IDL.Vec(IDL.Nat8),
        });

        // Make the HTTP request using the management canister
        const response = await call(MANAGEMENT_CANISTER, 'http_request', {
            args: [httpRequestParams],
            paramIdlTypes: [HttpRequest],
            returnIdlType: HttpResponse,
        });

        // Parse the response
        const statusCode = Number(response.status.code);
        const bodyBytes = new Uint8Array(response.body);
        const body = new TextDecoder().decode(bodyBytes);

        if (statusCode >= 200 && statusCode < 300) {
            return { body, status: statusCode };
        } else {
            throw new Error(`HTTP ${statusCode}: ${body}`);
        }
    } catch (error: any) {
        console.error(`HTTP request error for ${url}:`, error);
        throw new Error(`HTTP request failed: ${error.message || error}`);
    }
}

/**
 * Makes a GET request
 */
export async function httpGet(
    url: string,
    headers?: Record<string, string>
): Promise<{ body: string; status: number }> {
    return httpRequest(url, {
        method: 'GET',
        headers: headers,
    });
}

/**
 * Makes a POST request
 */
export async function httpPost(
    url: string,
    body: string,
    headers?: Record<string, string>
): Promise<{ body: string; status: number }> {
    return httpRequest(url, {
        method: 'POST',
        headers: headers,
        body: body,
    });
}

