/**
 * Copyright 2024-2025 NetCracker Technology Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ApiOperation, VersionDocument } from '../../types'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'

// MCP entity types

export interface McpTool {
  name: string
  description?: string
  inputSchema: object
}

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpPromptArgument {
  name: string
  description?: string
}

export interface McpPrompt {
  name: string
  title?: string
  description?: string
  arguments?: McpPromptArgument[]
}

// MCP document types (results of tools/list, resources/list, prompts/list)

export interface McpToolsDocument {
  tools: McpTool[]
}

export interface McpResourcesDocument {
  resources: McpResource[]
}

export interface McpPromptsDocument {
  prompts: McpPrompt[]
}

export type McpDocument = McpToolsDocument | McpResourcesDocument | McpPromptsDocument

export type McpDocumentType = (typeof MCP_DOCUMENT_TYPE)[keyof typeof MCP_DOCUMENT_TYPE]

// MCP entity type discriminator

export const MCP_ENTITY_TYPE_TOOL = 'tool' as const
export const MCP_ENTITY_TYPE_RESOURCE = 'resource' as const
export const MCP_ENTITY_TYPE_PROMPT = 'prompt' as const

export type McpEntityType =
  | typeof MCP_ENTITY_TYPE_TOOL
  | typeof MCP_ENTITY_TYPE_RESOURCE
  | typeof MCP_ENTITY_TYPE_PROMPT

// Operation metadata types

export interface McpBaseMeta {
  mcpEndpoint: string
  name: string
  title: string
  description: string
}

export interface McpToolMeta extends McpBaseMeta {
  entityType: typeof MCP_ENTITY_TYPE_TOOL
  toolId: string
}

export interface McpResourceMeta extends McpBaseMeta {
  entityType: typeof MCP_ENTITY_TYPE_RESOURCE
  resourceId: string
  uri: string
  mimeType?: string
}

export interface McpPromptMeta extends McpBaseMeta {
  entityType: typeof MCP_ENTITY_TYPE_PROMPT
  promptId: string
}

export type McpOperationMeta = McpToolMeta | McpResourceMeta | McpPromptMeta

// MCP document metadata (passed from buildMcpDocument to buildMcpOperations via VersionDocument.metadata)
export interface McpDocumentMetadata {
  mcpEndpoint: string
  [key: string]: unknown
}

// Typed aliases
export type VersionMcpDocument = VersionDocument<McpDocument>
export type VersionMcpOperation = ApiOperation<McpDocument, McpOperationMeta>
