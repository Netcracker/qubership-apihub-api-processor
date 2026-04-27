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

import { NotificationMessage, VersionDocument } from '../../types'
import { calculateMcpEntityId, DuplicateEntry, findDuplicates, isNotEmpty } from '../../utils'
import { MESSAGE_SEVERITY } from '../../consts'
import { MCP_DOCUMENT_TYPE, isMcpDocument } from './mcp.consts'
import {
  McpBuildResult,
  McpDocument,
  McpDocumentMetadata,
  McpToolsDocument,
  McpResourcesDocument,
  McpPromptsDocument,
  McpInitDocument,
  MCP_ENTITY_TYPE_TOOL,
  MCP_ENTITY_TYPE_RESOURCE,
  MCP_ENTITY_TYPE_PROMPT,
  MCP_ENTITY_TYPE_INIT,
  createEmptyMcpBuildResult,
} from './mcp.types'
import { buildMcpToolEntity, buildMcpResourceEntity, buildMcpPromptEntity, buildMcpInitEntity } from './mcp.entity'

/**
 * Extracts MCP entities from all MCP documents in the build result.
 * Called after buildFiles, iterates over documents and populates McpBuildResult.
 */
export function buildMcpEntities(documents: Map<string, VersionDocument>): McpBuildResult {
  const result = createEmptyMcpBuildResult()
  const entityIdMap = new Map<string, string[]>()

  for (const document of documents.values()) {
    if (!isMcpDocument(document)) { continue }

    const mcpDoc = document as VersionDocument<McpDocument>
    const { data, type, slug: documentSlug, metadata } = mcpDoc
    const { mcpEndpoint } = metadata as McpDocumentMetadata

    switch (type) {
      case MCP_DOCUMENT_TYPE.TOOLS: {
        const toolsDoc = data as McpToolsDocument
        for (const tool of toolsDoc.tools) {
          const entityId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_TOOL, tool.name)
          trackEntityId(entityIdMap, entityId, tool.name, document.fileId)
          result.tools.set(entityId, buildMcpToolEntity(entityId, tool, documentSlug, mcpEndpoint))
        }
        break
      }
      case MCP_DOCUMENT_TYPE.RESOURCES: {
        const resourcesDoc = data as McpResourcesDocument
        for (const resource of resourcesDoc.resources) {
          const entityId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_RESOURCE, resource.name)
          trackEntityId(entityIdMap, entityId, resource.name, document.fileId)
          result.resources.set(entityId, buildMcpResourceEntity(entityId, resource, documentSlug, mcpEndpoint))
        }
        break
      }
      case MCP_DOCUMENT_TYPE.PROMPTS: {
        const promptsDoc = data as McpPromptsDocument
        for (const prompt of promptsDoc.prompts) {
          const entityId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_PROMPT, prompt.name)
          trackEntityId(entityIdMap, entityId, prompt.name, document.fileId)
          result.prompts.set(entityId, buildMcpPromptEntity(entityId, prompt, documentSlug, mcpEndpoint))
        }
        break
      }
      case MCP_DOCUMENT_TYPE.INIT: {
        const initDoc = data as McpInitDocument
        const entityId = calculateMcpEntityId(mcpEndpoint, MCP_ENTITY_TYPE_INIT, MCP_ENTITY_TYPE_INIT)
        trackEntityId(entityIdMap, entityId, MCP_ENTITY_TYPE_INIT, document.fileId)
        result.init.set(entityId, buildMcpInitEntity(entityId, initDoc, documentSlug, mcpEndpoint))
        break
      }
    }
  }

  const duplicates = findDuplicates(entityIdMap)
  if (isNotEmpty(duplicates)) {
    throw createDuplicatesError(duplicates)
  }

  return result
}

function trackEntityId(map: Map<string, string[]>, entityId: string, entityName: string, fileId: string): void {
  if (!map.has(entityId)) {
    map.set(entityId, [])
  }
  map.get(entityId)!.push(`${entityName} (${fileId})`)
}

function createDuplicatesError(duplicates: DuplicateEntry<string>[]): Error {
  const duplicatesList = duplicates
    .map(({ operationId, operations }) => {
      return `- entityId '${operationId}': Found ${operations.length} entities: ${operations.join(', ')}`
    })
    .join('\n')
  return new Error(`Duplicated MCP entity IDs found:\n${duplicatesList}`)
}

const CAPABILITY_ENTITY_MAP: { capability: string; label: string; hasEntities: (mcp: McpBuildResult, endpoint: string) => boolean }[] = [
  { capability: 'tools', label: 'tools', hasEntities: (mcp, ep) => hasEntitiesForEndpoint(mcp.tools, ep) },
  { capability: 'resources', label: 'resources', hasEntities: (mcp, ep) => hasEntitiesForEndpoint(mcp.resources, ep) },
  { capability: 'prompts', label: 'prompts', hasEntities: (mcp, ep) => hasEntitiesForEndpoint(mcp.prompts, ep) },
]

function hasEntitiesForEndpoint(entities: Map<string, { mcpEndpoint: string }>, endpoint: string): boolean {
  for (const entity of entities.values()) {
    if (entity.mcpEndpoint === endpoint) { return true }
  }
  return false
}

export function validateMcpCapabilities(mcp: McpBuildResult): NotificationMessage[] {
  const notifications: NotificationMessage[] = []

  for (const initEntity of mcp.init.values()) {
    const endpoint = initEntity.mcpEndpoint
    const capabilities = initEntity.data.capabilities

    for (const { capability, label, hasEntities } of CAPABILITY_ENTITY_MAP) {
      const declared = capability in capabilities
      const provided = hasEntities(mcp, endpoint)

      if (declared && !provided) {
        notifications.push({
          severity: MESSAGE_SEVERITY.Warning,
          message: `MCP endpoint '${endpoint}': server declares '${label}' capability but no ${label} document was provided`,
        })
      }
      if (!declared && provided) {
        notifications.push({
          severity: MESSAGE_SEVERITY.Warning,
          message: `MCP endpoint '${endpoint}': ${label} document was provided but server does not declare '${label}' capability`,
        })
      }
    }
  }

  return notifications
}
