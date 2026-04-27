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
  McpToolEntity,
  McpResourceEntity,
  McpPromptEntity,
  McpInitEntity,
  McpTool,
  McpResource,
  McpPrompt,
  McpToolsDocument,
  McpResourcesDocument,
  McpPromptsDocument,
  McpInitDocument,
  MCP_ENTITY_TYPE_TOOL,
  MCP_ENTITY_TYPE_RESOURCE,
  MCP_ENTITY_TYPE_PROMPT,
  MCP_ENTITY_TYPE_INIT,
} from './mcp.types'

export const buildMcpToolEntity = (
  entityId: string,
  tool: McpTool,
  documentSlug: string,
  mcpEndpoint: string,
): McpToolEntity => {
  const singleEntitySpec: McpToolsDocument = { tools: [tool] }

  return {
    entityId,
    documentId: documentSlug,
    entityType: MCP_ENTITY_TYPE_TOOL,
    mcpEndpoint,
    title: tool.name,
    search: { useEntityDataAsSearchText: true },
    metadata: {
      toolId: entityId,
      name: tool.name,
      description: tool.description ?? '',
    },
    data: singleEntitySpec,
  }
}

export const buildMcpResourceEntity = (
  entityId: string,
  resource: McpResource,
  documentSlug: string,
  mcpEndpoint: string,
): McpResourceEntity => {
  const singleEntitySpec: McpResourcesDocument = { resources: [resource] }

  return {
    entityId,
    documentId: documentSlug,
    entityType: MCP_ENTITY_TYPE_RESOURCE,
    mcpEndpoint,
    title: resource.name,
    search: { useEntityDataAsSearchText: true },
    metadata: {
      resourceId: entityId,
      name: resource.name,
      description: resource.description ?? '',
      uri: resource.uri,
      mimeType: resource.mimeType,
    },
    data: singleEntitySpec,
  }
}

export const buildMcpPromptEntity = (
  entityId: string,
  prompt: McpPrompt,
  documentSlug: string,
  mcpEndpoint: string,
): McpPromptEntity => {
  const singleEntitySpec: McpPromptsDocument = { prompts: [prompt] }

  return {
    entityId,
    documentId: documentSlug,
    entityType: MCP_ENTITY_TYPE_PROMPT,
    mcpEndpoint,
    title: prompt.name,
    search: { useEntityDataAsSearchText: true },
    metadata: {
      promptId: entityId,
      name: prompt.name,
      description: prompt.description ?? '',
    },
    data: singleEntitySpec,
  }
}

export const buildMcpInitEntity = (
  entityId: string,
  initDoc: McpInitDocument,
  documentSlug: string,
  mcpEndpoint: string,
): McpInitEntity => {
  return {
    entityId,
    documentId: documentSlug,
    entityType: MCP_ENTITY_TYPE_INIT,
    mcpEndpoint,
    title: initDoc.serverInfo.name,
    search: { useEntityDataAsSearchText: true },
    metadata: {
      initId: entityId,
      serverName: initDoc.serverInfo.name,
      serverVersion: initDoc.serverInfo.version,
      protocolVersion: initDoc.protocolVersion,
      description: initDoc.instructions ?? '',
    },
    data: initDoc,
  }
}
