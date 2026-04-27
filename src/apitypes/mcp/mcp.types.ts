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

import { VersionDocument } from '../../types'
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

export interface McpInitDocument {
  capabilities: Record<string, unknown>
  protocolVersion: string
  serverInfo: {
    name: string
    version: string
    [key: string]: unknown
  }
  instructions?: string
  [key: string]: unknown
}

export type McpDocument = McpToolsDocument | McpResourcesDocument | McpPromptsDocument | McpInitDocument

export type McpDocumentType = (typeof MCP_DOCUMENT_TYPE)[keyof typeof MCP_DOCUMENT_TYPE]

// MCP entity type discriminator

export const MCP_ENTITY_TYPE_TOOL = 'tool' as const
export const MCP_ENTITY_TYPE_RESOURCE = 'resource' as const
export const MCP_ENTITY_TYPE_PROMPT = 'prompt' as const
export const MCP_ENTITY_TYPE_INIT = 'init' as const

export type McpEntityType =
  | typeof MCP_ENTITY_TYPE_TOOL
  | typeof MCP_ENTITY_TYPE_RESOURCE
  | typeof MCP_ENTITY_TYPE_PROMPT
  | typeof MCP_ENTITY_TYPE_INIT

// Search configuration

export interface McpEntitySearch {
  useEntityDataAsSearchText: boolean
}

// Entity metadata types (type-specific fields only)

export interface McpToolMeta {
  toolId: string
  name: string
  description: string
}

export interface McpResourceMeta {
  resourceId: string
  name: string
  description: string
  uri: string
  mimeType?: string
}

export interface McpPromptMeta {
  promptId: string
  name: string
  description: string
}

export interface McpInitMeta {
  initId: string
  serverName: string
  serverVersion: string
  protocolVersion: string
  description: string
}

export type McpEntityMeta = McpToolMeta | McpResourceMeta | McpPromptMeta | McpInitMeta

// MCP entity types (build result entities, separate from ApiOperation)

export interface McpEntity<D = McpDocument, M = McpEntityMeta> {
  entityId: string
  documentId: string
  entityType: McpEntityType
  mcpEndpoint: string
  title: string
  search: McpEntitySearch
  metadata: M
  data: D
}

export interface McpToolEntity extends McpEntity<McpToolsDocument, McpToolMeta> {
  entityType: typeof MCP_ENTITY_TYPE_TOOL
}
export interface McpResourceEntity extends McpEntity<McpResourcesDocument, McpResourceMeta> {
  entityType: typeof MCP_ENTITY_TYPE_RESOURCE
}
export interface McpPromptEntity extends McpEntity<McpPromptsDocument, McpPromptMeta> {
  entityType: typeof MCP_ENTITY_TYPE_PROMPT
}
export interface McpInitEntity extends McpEntity<McpInitDocument, McpInitMeta> {
  entityType: typeof MCP_ENTITY_TYPE_INIT
}

// MCP build result (separate from operations)

export interface McpBuildResult {
  tools: Map<string, McpToolEntity>
  resources: Map<string, McpResourceEntity>
  prompts: Map<string, McpPromptEntity>
  init: Map<string, McpInitEntity>
}

export function createEmptyMcpBuildResult(): McpBuildResult {
  return {
    tools: new Map(),
    resources: new Map(),
    prompts: new Map(),
    init: new Map(),
  }
}

// MCP document metadata (passed from buildMcpDocument to buildMcpEntities via VersionDocument.metadata)
export interface McpDocumentMetadata {
  mcpEndpoint: string
  [key: string]: unknown
}

// Typed aliases
export type VersionMcpDocument = VersionDocument<McpDocument>
