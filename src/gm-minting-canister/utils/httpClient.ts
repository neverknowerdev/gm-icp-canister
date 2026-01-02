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

/**
 * Makes an HTTP request using ICP's HTTP outcalls feature
 * This uses the ic.http_request function from ICP runtime
 * 
 * TODO: Implement proper HTTP outcalls using ICP's native API
 * For now, this is a placeholder that throws an error indicating
 * it needs to be implemented for production use
 */
export async function httpRequest(
    url: string,
    options: HttpRequestOptions
): Promise<{ body: string; status: number }> {
    // Check if we're in a test environment
    if (typeof ic === 'undefined' || !ic.httpRequest) {
        throw new Error(
            'HTTP outcalls not available. This function needs to be implemented ' +
            'using ICP\'s native HTTP outcalls API. In production, use ic.httpRequest() ' +
            'from the ICP runtime environment.'
        );
    }

    try {
        const urlObj = new URL(url);

        // Convert headers to the format expected by ICP
        const headers: Array<[string, string]> = [];
        if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
                headers.push([key.toLowerCase(), value]);
            }
        }

        // Prepare the HTTP request
        const httpRequest = {
            url: url,
            method: {
                GET: null,
                POST: options.body ? { body: new TextEncoder().encode(options.body) } : null,
                PUT: options.body ? { body: new TextEncoder().encode(options.body) } : null,
                DELETE: null,
            }[options.method],
            headers: headers,
            body: options.body ? new TextEncoder().encode(options.body) : undefined,
            max_response_bytes: options.maxResponseBytes || 2_000_000n, // 2MB default
            transform: options.transformMethodName ? {
                function: [ic.id(), options.transformMethodName] as [any, string],
                context: Uint8Array.from([]),
            } : undefined,
        };

        // Make the HTTP request using ic.http_request
        const response = await ic.httpRequest(httpRequest);

        // Parse the response
        const status = Number(response.status.code);
        const body = new TextDecoder().decode(response.body);

        if (status >= 200 && status < 300) {
            return { body, status };
        } else {
            throw new Error(`HTTP ${status}: ${body}`);
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
 * Makes a GET request with retry logic
 * @param url The URL to request
 * @param headers Optional headers
 * @param maxRetries Number of retry attempts (default: 1, meaning 2 total attempts)
 * @returns Response body and status
 * @throws Error if all retry attempts fail
 */
export async function httpGetWithRetries(
    url: string,
    headers?: Record<string, string>,
    maxRetries: number = 1
): Promise<{ body: string; status: number }> {
    let lastError: any = null;
    const totalAttempts = maxRetries + 1; // Initial attempt + retries

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
            return await httpGet(url, headers);
        } catch (error) {
            lastError = error;
            console.error(`HTTP GET error (attempt ${attempt}/${totalAttempts}) for ${url}:`, error);

            // If this was the last attempt, throw the error
            if (attempt === totalAttempts) {
                throw error;
            }

            // Otherwise, continue to retry (no delay needed, just retry immediately)
        }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error(` to fetch ${url} after ${totalAttempts} attempts`);
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

