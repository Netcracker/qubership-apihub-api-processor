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

import {
  McpDocument,
  McpOperationMeta,
  McpPrompt,
  McpResource,
  McpTool,
  McpToolsDocument,
  McpResourcesDocument,
  McpPromptsDocument,
  MCP_ENTITY_TYPE_TOOL,
  MCP_ENTITY_TYPE_RESOURCE,
  MCP_ENTITY_TYPE_PROMPT,
  VersionMcpOperation,
} from './mcp.types'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import { APIHUB_API_COMPATIBILITY_KIND_BWC, MCP_API_TYPE } from '../../consts'

export const buildMcpToolOperation = (
  operationId: string,
  tool: McpTool,
  documentSlug: string,
  mcpEndpoint: string,
  versionInternalDocumentId: string,
): VersionMcpOperation => {
  const singleEntitySpec: McpToolsDocument = { tools: [tool] }
  const title = tool.name

  const metadata: McpOperationMeta = {
    entityType: MCP_ENTITY_TYPE_TOOL,
    toolId: operationId,
    mcpEndpoint,
    name: tool.name,
    title,
    description: tool.description ?? '',
  }

  return buildMcpOperation(operationId, title, documentSlug, metadata, singleEntitySpec, versionInternalDocumentId)
}

export const buildMcpResourceOperation = (
  operationId: string,
  resource: McpResource,
  documentSlug: string,
  mcpEndpoint: string,
  versionInternalDocumentId: string,
): VersionMcpOperation => {
  const singleEntitySpec: McpResourcesDocument = { resources: [resource] }
  const title = resource.name

  const metadata: McpOperationMeta = {
    entityType: MCP_ENTITY_TYPE_RESOURCE,
    resourceId: operationId,
    mcpEndpoint,
    uri: resource.uri,
    name: resource.name,
    title,
    description: resource.description ?? '',
    mimeType: resource.mimeType,
  }

  return buildMcpOperation(operationId, title, documentSlug, metadata, singleEntitySpec, versionInternalDocumentId)
}

export const buildMcpPromptOperation = (
  operationId: string,
  prompt: McpPrompt,
  documentSlug: string,
  mcpEndpoint: string,
  versionInternalDocumentId: string,
): VersionMcpOperation => {
  const singleEntitySpec: McpPromptsDocument = { prompts: [prompt] }
  const title = prompt.name

  const metadata: McpOperationMeta = {
    entityType: MCP_ENTITY_TYPE_PROMPT,
    promptId: operationId,
    mcpEndpoint,
    name: prompt.name,
    title,
    description: prompt.description ?? '',
  }

  return buildMcpOperation(operationId, title, documentSlug, metadata, singleEntitySpec, versionInternalDocumentId)
}

const buildMcpOperation = (
  operationId: string,
  title: string,
  documentSlug: string,
  metadata: McpOperationMeta,
  data: McpDocument,
  versionInternalDocumentId: string,
): VersionMcpOperation => {
  return {
    operationId,
    documentId: documentSlug,
    apiType: MCP_API_TYPE,
    apiKind: APIHUB_API_COMPATIBILITY_KIND_BWC,
    deprecated: false,
    title,
    metadata,
    tags: [],
    data,
    searchScopes: {},
    search: { useOperationDataAsSearchText: true },
    deprecatedItems: [],
    models: {},
    versionInternalDocumentId,
  }
}
