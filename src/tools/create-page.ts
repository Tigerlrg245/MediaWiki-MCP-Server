import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeAuthenticatedApiRequest, getPageUrl, formatEditComment, getCsrfToken } from '../common/utils.js';
import type { MwRestApiPageObject } from '../types/mwRestApi.js';

export function createPageTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'create-page',
		'Creates a wiki page with the provided content.',
		{
			source: z.string().describe( 'Page content in the format specified by the contentModel parameter' ),
			title: z.string().describe( 'Wiki page title' ),
			comment: z.string().describe( 'Reason for creating the page' ).optional(),
			contentModel: z.string().describe( 'Type of content on the page. Defaults to "wikitext"' ).optional()
		},
		{
			title: 'Create page',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async (
			{ source, title, comment, contentModel }
		) => handleCreatePageTool( source, title, comment, contentModel )
	);
}

async function handleCreatePageTool(
	source: string,
	title: string,
	comment?: string,
	contentModel?: string
): Promise<CallToolResult> {
	try {
		// Get CSRF token first
		const csrfToken = await getCsrfToken();
		if ( !csrfToken ) {
			return {
				content: [
					{ type: 'text', text: 'Failed to create page: Could not obtain CSRF token' } as TextContent
				],
				isError: true
			};
		}

		// Use Action API to create page
		const data = await makeAuthenticatedApiRequest<{ edit: { result: string; pageid: number; title: string; oldrevid: number; newrevid: number } }>( {
			action: 'edit',
			title: title,
			text: source,
			summary: formatEditComment( 'create-page', comment ),
			token: csrfToken,
			format: 'json',
			...( contentModel && { contentmodel: contentModel } )
		} );

		if ( !data || !data.edit ) {
			return {
				content: [
					{ type: 'text', text: 'Failed to create page: No data returned from API' } as TextContent
				],
				isError: true
			};
		}

		if ( data.edit.result !== 'Success' ) {
			return {
				content: [
					{ type: 'text', text: `Failed to create page: ${ data.edit.result }` } as TextContent
				],
				isError: true
			};
		}

		return {
			content: createPageToolResult( data.edit )
		};
	} catch ( error ) {
		return {
			content: [
				{ type: 'text', text: `Failed to create page: ${ ( error as Error ).message }` } as TextContent
			],
			isError: true
		};
	}
}

function createPageToolResult( result: { result: string; pageid: number; title: string; oldrevid: number; newrevid: number } ): TextContent[] {
	return [
		{
			type: 'text',
			text: `Page created successfully: ${ getPageUrl( result.title ) }`
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
