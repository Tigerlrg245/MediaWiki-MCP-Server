import fetch, { Response } from 'node-fetch';
import { USER_AGENT } from '../server.js';
import { scriptPath, wikiServer, oauthToken, articlePath, privateWiki } from './config.js';

async function fetchCore(
	baseUrl: string,
	options?: {
		params?: Record<string, string>;
		headers?: Record<string, string>;
		body?: Record<string, unknown> | string;
		method?: string;
	}
): Promise<Response> {
	let url = baseUrl;

	if ( url.startsWith( '//' ) ) {
		url = 'https:' + url;
	}

	if ( options?.params ) {
		const queryString = new URLSearchParams( options.params ).toString();
		if ( queryString ) {
			url = `${ url }?${ queryString }`;
		}
	}

	const requestHeaders: Record<string, string> = {
		'User-Agent': USER_AGENT
	};

	if ( options?.headers ) {
		Object.assign( requestHeaders, options.headers );
	}

	const fetchOptions: { headers: Record<string, string>; method?: string; body?: string } = {
		headers: requestHeaders,
		method: options?.method || 'GET'
	};
	if ( options?.body ) {
		// If body is already a string (form data), use it directly
		// Otherwise, stringify it (for JSON)
		fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify( options.body );
	}
	const response = await fetch( url, fetchOptions );
	if ( !response.ok ) {
		const errorBody = await response.text().catch( () => 'Could not read error response body' );
		throw new Error(
			`HTTP error! status: ${ response.status } for URL: ${ response.url }. Response: ${ errorBody }`
		);
	}
	return response;
}

export async function makeApiRequest<T>(
	url: string,
	params?: Record<string, string>
): Promise<T | null> {
	const response = await fetchCore( url, {
		params,
		headers: { Accept: 'application/json' }
	} );
	return ( await response.json() ) as T;
}

export async function makeRestGetRequest<T>(
	path: string,
	params?: Record<string, string>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};
	const token = oauthToken();
	if ( ( needAuth || privateWiki() ) && token !== undefined ) {
		headers.Authorization = `Bearer ${ token }`;
	}
	const response = await fetchCore( `${ wikiServer() }${ scriptPath() }/rest.php${ path }`, {
		params: params,
		headers: headers
	} );
	return ( await response.json() ) as T;
}

export async function makeRestPutRequest<T>(
	path: string,
	body: Record<string, unknown>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};
	const token = oauthToken();
	if ( ( needAuth || privateWiki() ) && token !== undefined ) {
		headers.Authorization = `Bearer ${ token }`;
	}
	const response = await fetchCore( `${ wikiServer() }${ scriptPath() }/rest.php${ path }`, {
		headers: headers,
		method: 'PUT',
		body: body
	} );
	return ( await response.json() ) as T;
}

export async function makeRestPostRequest<T>(
	path: string,
	body?: Record<string, unknown>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};
	const token = oauthToken();
	if ( ( needAuth || privateWiki() ) && token !== undefined ) {
		headers.Authorization = `Bearer ${ token }`;
	}
	const response = await fetchCore( `${ wikiServer() }${ scriptPath() }/rest.php${ path }`, {
		headers: headers,
		method: 'POST',
		body: body
	} );
	return ( await response.json() ) as T;
}

export async function fetchPageHtml( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		return await response.text();
	} catch ( error ) {
		console.error( `Error fetching HTML page from ${ url }:`, error );
		return null;
	}
}

export async function fetchImageAsBase64( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from( arrayBuffer );
		return buffer.toString( 'base64' );
	} catch ( error ) {
		console.error( `Error fetching image from ${ url }:`, error );
		return null;
	}
}

export function getPageUrl( title: string ): string {
	return `${ wikiServer() }${ articlePath() }/${ encodeURIComponent( title ) }`;
}

export function formatEditComment( tool: string, comment?: string ): string {
	const suffix = `(via ${ tool } on MediaWiki MCP Server)`;
	if ( !comment ) {
		return `Automated edit ${ suffix }`;
	}
	return `${ comment } ${ suffix }`;
}

export async function getCsrfToken(): Promise<string | null> {
	const token = oauthToken();
	if ( !token ) {
		return null;
	}
	
	try {
		const response = await makeAuthenticatedApiRequest<{ query: { tokens: { csrftoken: string } } }>( {
			action: 'query',
			meta: 'tokens',
			type: 'csrf',
			format: 'json'
		} );
		
		if ( response && response.query && response.query.tokens && response.query.tokens.csrftoken ) {
			return response.query.tokens.csrftoken;
		}
		return null;
	} catch ( error ) {
		console.error( 'Error getting CSRF token:', error );
		return null;
	}
}

export async function makeAuthenticatedApiRequest<T>(
	params: Record<string, string>
): Promise<T | null> {
	const token = oauthToken();
	if ( !token ) {
		throw new Error( 'OAuth token required for authenticated requests' );
	}
	
	const headers: Record<string, string> = {
		'Authorization': `Bearer ${ token }`,
		'Content-Type': 'application/x-www-form-urlencoded'
	};
	
	// Convert params to URL-encoded form data
	const formData = new URLSearchParams( params ).toString();
	
	const response = await fetchCore( `${ wikiServer() }${ scriptPath() }/api.php`, {
		method: 'POST',
		headers: headers,
		body: formData
	} );
	return ( await response.json() ) as T;
}
