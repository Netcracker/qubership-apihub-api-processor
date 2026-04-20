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

import { OperationsBuilder } from '../../types'
import { calculateMcpEntityId, DuplicateEntry, findDuplicates, isNotEmpty } from '../../utils'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import {
  McpDocument,
  McpDocumentMetadata,
  McpToolsDocument,
  McpResourcesDocument,
  McpPromptsDocument,
  MCP_ENTITY_TYPE_TOOL,
  MCP_ENTITY_TYPE_RESOURCE,
  MCP_ENTITY_TYPE_PROMPT,
  VersionMcpOperation,
} from './mcp.types'
import { buildMcpToolOperation, buildMcpResourceOperation, buildMcpPromptOperation } from './mcp.operation'

export const buildMcpOperations: OperationsBuilder<McpDocument> = async (document, _ctx) => {
  const { data, type, slug: documentSlug, metadata, versionInternalDocument } = document

  const { mcpEndpoint } = metadata as McpDocumentMetadata

  const versionInternalDocumentId = versionInternalDocument.versionDocumentId

  const operations: VersionMcpOperation[] = []
  const operationIdMap = new Map<string, string[]>()

  const trackOperationId = (operationId: string, entityName: string): void => {
    if (!operationIdMap.has(operationId)) {
      operationIdMap.set(operationId, [])
    }
    operationIdMap.get(operationId)!.push(entityName)
  }

  switch (type) {
    case MCP_DOCUMENT_TYPE.TOOLS: {
      const toolsDoc = data as McpToolsDocument
      for (const tool of toolsDoc.tools) {
        const operationId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_TOOL, tool.name)
        trackOperationId(operationId, tool.name)
        operations.push(buildMcpToolOperation(operationId, tool, documentSlug, mcpEndpoint, versionInternalDocumentId))
      }
      break
    }
    case MCP_DOCUMENT_TYPE.RESOURCES: {
      const resourcesDoc = data as McpResourcesDocument
      for (const resource of resourcesDoc.resources) {
        const operationId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_RESOURCE, resource.name)
        trackOperationId(operationId, resource.name)
        operations.push(buildMcpResourceOperation(operationId, resource, documentSlug, mcpEndpoint, versionInternalDocumentId))
      }
      break
    }
    case MCP_DOCUMENT_TYPE.PROMPTS: {
      const promptsDoc = data as McpPromptsDocument
      for (const prompt of promptsDoc.prompts) {
        const operationId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_PROMPT, prompt.name)
        trackOperationId(operationId, prompt.name)
        operations.push(buildMcpPromptOperation(operationId, prompt, documentSlug, mcpEndpoint, versionInternalDocumentId))
      }
      break
    }
  }

  const duplicates = findDuplicates(operationIdMap)
  if (isNotEmpty(duplicates)) {
    throw createDuplicatesError(document.fileId, duplicates)
  }

  return operations
}

function createDuplicatesError(fileId: string, duplicates: DuplicateEntry<string>[]): Error {
  const duplicatesList = duplicates
    .map(({ operationId, operations }) => {
      return `- entityId '${operationId}': Found ${operations.length} entities: ${operations.join(', ')}`
    })
    .join('\n')
  return new Error(`Duplicated entity IDs found within MCP document '${fileId}':\n${duplicatesList}`)
}
