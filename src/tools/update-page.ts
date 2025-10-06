import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeAuthenticatedApiRequest, getPageUrl, formatEditComment, getCsrfToken } from '../common/utils.js';
import type { MwRestApiPageObject } from '../types/mwRestApi.js';

export function updatePageTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'update-page',
		'Updates a wiki page. Replaces the existing content of a page with the provided content',
		{
			title: z.string().describe( 'Wiki page title' ),
			source: z.string().describe( 'Page content in the same content model of the existing page' ),
			latestId: z.number().describe( 'Identifier for the revision used as the base for the new source' ),
			comment: z.string().describe( 'Summary of the edit' ).optional()
		},
		{
			title: 'Update page',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async (
			{ title, source, latestId, comment }
		) => handleUpdatePageTool( title, source, latestId, comment )
	);
}

async function handleUpdatePageTool(
	title: string,
	source: string,
	latestId: number,
	comment?: string
): Promise<CallToolResult> {
	try {
		// Get CSRF token first
		const csrfToken = await getCsrfToken();
		if ( !csrfToken ) {
			return {
				content: [
					{ type: 'text', text: 'Failed to update page: Could not obtain CSRF token' } as TextContent
				],
				isError: true
			};
		}

		// Use Action API to update page
		const data = await makeAuthenticatedApiRequest<{ edit: { result: string; pageid: number; title: string; oldrevid: number; newrevid: number } }>( {
			action: 'edit',
			title: title,
			text: source,
			summary: formatEditComment( 'update-page', comment ),
			token: csrfToken,
			format: 'json',
			baserevid: latestId.toString()
		} );

		if ( !data || !data.edit ) {
			return {
				content: [
					{ type: 'text', text: 'Failed to update page: No data returned from API' } as TextContent
				],
				isError: true
			};
		}

		if ( data.edit.result !== 'Success' ) {
			return {
				content: [
					{ type: 'text', text: `Failed to update page: ${ data.edit.result }` } as TextContent
				],
				isError: true
			};
		}

		return {
			content: updatePageToolResult( data.edit )
		};
	} catch ( error ) {
		return {
			content: [
				{ type: 'text', text: `Failed to update page: ${ ( error as Error ).message }` } as TextContent
			],
			isError: true
		};
	}
}

function updatePageToolResult( result: { result: string; pageid: number; title: string; oldrevid: number; newrevid: number } ): TextContent[] {
	return [
		{
			type: 'text',
			text: `Page updated successfully: ${ getPageUrl( result.title ) }`
		},
		{
			type: 'text',
			text: [
				'Page object:',
				`Page ID: ${ result.pageid }`,
				`Title: ${ result.title }`,
				`Latest revision ID: ${ result.newrevid }`,
				`Result: ${ result.result }`
			].join( '\n' )
		}
	];
}
