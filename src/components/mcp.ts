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

import { ApiBuilder, BuildConfigFile, VersionDocument } from '../types'
import {
  MCP_COLLECTION_KEY,
  MCP_KIND,
  McpEntityDataMap,
  McpEntityId,
  McpEntityIndex,
  McpEntityWithData,
  McpKind,
  PackageMcpEntity,
  PackageMcpFile,
} from '../types/package/mcp'
import { NotificationMessage } from '../types/package'
import { ParsedMcpData } from '../apitypes/mcp'
import { DuplicateHandler, setReportingDuplicate } from '../utils'
import { MESSAGE_SEVERITY } from '../consts'

export interface McpBuildContext {
  mcpEntities: McpEntityIndex
  mcpEntityData: McpEntityDataMap
}

export function createMcpBuildContext(): McpBuildContext {
  return {
    mcpEntities: new Map(),
    mcpEntityData: new Map(),
  }
}

export type DuplicateMcpEntityHandler = DuplicateHandler<PackageMcpEntity>

export const createDuplicateMcpEntityHandler = (): DuplicateMcpEntityHandler => (existing, duplicate) => {
  // the same document re-processed (e.g. incremental rebuild) is not a cross-document duplicate
  if (existing.documentId === duplicate.documentId) { return }
  throw new Error(
    `Duplicate MCP entity ID '${duplicate.mcpEntityId}' found in different documents: '${existing.documentId}' and '${duplicate.documentId}'`,
  )
}

export function processMcpDocument(
  file: BuildConfigFile,
  document: VersionDocument,
  builder: ApiBuilder,
  ctx: McpBuildContext,
  onDuplicate?: DuplicateMcpEntityHandler,
): void {
  if (!builder.buildMcpEntities) { return }
  const results: McpEntityWithData[] = builder.buildMcpEntities(document, file)
  const entityIds: McpEntityId[] = []
  for (const { entity, entityData } of results) {
    setReportingDuplicate(ctx.mcpEntities, entity.mcpEntityId, entity, onDuplicate)
    ctx.mcpEntityData.set(entity.mcpEntityId, entityData)
    entityIds.push(entity.mcpEntityId)
  }
  // record which entities this document owns, so an incremental update can drop them granularly
  document.mcpEntityIds = entityIds
}

export interface McpBuildResult {
  mcpEntities: McpEntityIndex
  mcpEntityData: McpEntityDataMap
  notifications: NotificationMessage[]
}

export function finalizeMcp(ctx: McpBuildContext, documents: Map<string, VersionDocument>): McpBuildResult {
  const notifications: NotificationMessage[] = []
  validateMcpCapabilities(ctx.mcpEntities, documents, notifications)
  return {
    mcpEntities: ctx.mcpEntities,
    mcpEntityData: ctx.mcpEntityData,
    notifications,
  }
}

const KIND_TO_FIELD: Record<McpKind, keyof PackageMcpFile> = {
  [MCP_KIND.INIT]: 'inits',
  [MCP_KIND.TOOL]: 'tools',
  [MCP_KIND.RESOURCE]: 'resources',
  [MCP_KIND.PROMPT]: 'prompts',
}

/** Group the flat entity index into the `{ inits, tools, resources, prompts }` shape written to `mcp.json`. */
export function groupMcpEntitiesByKind(entities: McpEntityIndex): PackageMcpFile {
  const grouped: PackageMcpFile = { inits: [], tools: [], resources: [], prompts: [] }
  for (const entity of entities.values()) {
    grouped[KIND_TO_FIELD[entity.kind]].push(entity)
  }
  return grouped
}

const CAPABILITY_TO_KIND: [string, McpKind][] = [
  [MCP_COLLECTION_KEY[MCP_KIND.TOOL], MCP_KIND.TOOL],
  [MCP_COLLECTION_KEY[MCP_KIND.PROMPT], MCP_KIND.PROMPT],
  [MCP_COLLECTION_KEY[MCP_KIND.RESOURCE], MCP_KIND.RESOURCE],
]

/**
 * Cross-check: for every init entity, warn if its document declares a capability (tools/prompts/resources)
 * for which no entity of the matching kind exists under the same endpoint. Derives everything from the
 * stored entities plus the init document's raw JSON, so it can run after granular incremental updates too.
 */
export function validateMcpCapabilities(
  entities: McpEntityIndex,
  documents: Map<string, VersionDocument>,
  notifications: NotificationMessage[],
): void {
  const allEntities = [...entities.values()]
  for (const initEntity of allEntities) {
    if (initEntity.kind !== MCP_KIND.INIT) { continue }
    const initDocument = documents.get(initEntity.documentId)
    const capabilities = (initDocument?.data as ParsedMcpData | undefined)?.rawJson?.capabilities as Record<string, unknown> | undefined
    if (!capabilities) { continue }
    for (const [capKey, kind] of CAPABILITY_TO_KIND) {
      if (!capabilities[capKey]) { continue }
      const hasEntities = allEntities.some(e => e.mcpEndpoint === initEntity.mcpEndpoint && e.kind === kind)
      if (!hasEntities) {
        notifications.push({
          severity: MESSAGE_SEVERITY.Warning,
          message: `MCP init declares '${capKey}' capability for endpoint '${initEntity.mcpEndpoint}', but no ${kind} entities were found`,
          fileId: initEntity.documentId,
        })
      }
    }
  }
}
