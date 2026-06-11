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
  McpEntity,
  McpEntityId,
  McpEntityIndex,
  McpKind,
  PackageMcpFile,
} from '../types/package/mcp'
import { NotificationMessage } from '../types/package'
import { MCP_DOCUMENT_TYPE } from '../apitypes/mcp'
import { DuplicateHandler, setReportingDuplicate, validateDocument } from '../utils'
import { MESSAGE_SEVERITY } from '../consts'
import mcpInitSchema from '../apitypes/mcp/schemas/mcp-init.json'
import mcpToolsSchema from '../apitypes/mcp/schemas/mcp-tools.json'
import mcpResourcesSchema from '../apitypes/mcp/schemas/mcp-resources.json'
import mcpPromptsSchema from '../apitypes/mcp/schemas/mcp-prompts.json'

const MCP_SCHEMA_BY_TYPE: Record<string, object> = {
  [MCP_DOCUMENT_TYPE.MCP_INIT]: mcpInitSchema,
  [MCP_DOCUMENT_TYPE.MCP_TOOLS]: mcpToolsSchema,
  [MCP_DOCUMENT_TYPE.MCP_RESOURCES]: mcpResourcesSchema,
  [MCP_DOCUMENT_TYPE.MCP_PROMPTS]: mcpPromptsSchema,
}

export interface McpBuildContext {
  mcpEntities: McpEntityIndex
}

export function createMcpBuildContext(): McpBuildContext {
  return {
    mcpEntities: new Map(),
  }
}

export type DuplicateMcpEntityHandler = DuplicateHandler<McpEntity>

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
  const entities: McpEntity[] = builder.buildMcpEntities(document, file)
  const entityIds: McpEntityId[] = []
  for (const entity of entities) {
    setReportingDuplicate(ctx.mcpEntities, entity.mcpEntityId, entity, onDuplicate)
    entityIds.push(entity.mcpEntityId)
  }
  // record which entities this document owns, so an incremental update can drop them granularly
  document.mcpEntityIds = entityIds
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
  for (const { data: _data, ...index } of entities.values()) {
    // strip the payload (`data`) — mcp.json is the lightweight index; payloads live in mcp/{id}.json
    grouped[KIND_TO_FIELD[index.kind]].push(index)
  }
  return grouped
}

/**
 * Every MCP endpoint published in a version must carry its OWN init: a publish may contain documents
 * for several endpoints at once, and each endpoint's init is the mandatory descriptor of that server.
 * An endpoint that publishes any entity but has no init fails the publish.
 */
export function validateMcpInitRequired(entities: McpEntityIndex): void {
  const endpoints = new Set<string>()
  const endpointsWithInit = new Set<string>()
  for (const entity of entities.values()) {
    endpoints.add(entity.mcpEndpoint)
    if (entity.kind === MCP_KIND.INIT) { endpointsWithInit.add(entity.mcpEndpoint) }
  }
  for (const endpoint of endpoints) {
    if (!endpointsWithInit.has(endpoint)) {
      throw new Error(`MCP init is required: endpoint '${endpoint}' publishes entities but has no init`)
    }
  }
}

/**
 * Validate every MCP document against the MCP JSON schema for its type. Mandatory and FATAL: any
 * non-conforming document throws → the publish fails (same policy as duplicate entities / missing
 * init). Validates the whole document (its raw `originalDocument`), so it also catches files that were
 * detected as MCP but yielded no usable entities. Non-MCP documents are skipped.
 */
export function validateMcpDocumentsSchema(documents: Map<string, VersionDocument>): void {
  for (const document of documents.values()) {
    const schema = MCP_SCHEMA_BY_TYPE[document.type]
    if (!schema) { continue }
    const originalDocument = document.data?.originalDocument
    if (!originalDocument) { continue }
    const errors = validateDocument(schema, originalDocument)
    if (errors.length > 0) {
      const detail = errors.map(e => `${e.instancePath || '/'} ${e.message ?? 'does not match schema'}`.trim()).join('; ')
      throw new Error(`MCP ${document.type} file '${document.fileId}' does not conform to schema: ${detail}`)
    }
  }
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
    const capabilities = initDocument?.data?.originalDocument?.capabilities as Record<string, unknown> | undefined
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
