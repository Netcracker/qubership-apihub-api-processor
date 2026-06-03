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

import { FILE_KIND, TextFile } from '../../types'
import { getFileExtension, validateDocument } from '../../utils'
import { FILE_FORMAT_JSON } from '../../consts'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import { McpEntityRaw, ParsedMcpData } from './mcp.types'
import { McpKind, MCP_KIND } from '../../types'
import { isObject, isString } from '../../utils'
import mcpInitSchema from './schemas/mcp-init.json'
import mcpToolsSchema from './schemas/mcp-tools.json'
import mcpResourcesSchema from './schemas/mcp-resources.json'
import mcpPromptsSchema from './schemas/mcp-prompts.json'

const SCHEMA_BY_TYPE: Record<string, object> = {
  [MCP_DOCUMENT_TYPE.MCP_INIT]: mcpInitSchema,
  [MCP_DOCUMENT_TYPE.MCP_TOOLS]: mcpToolsSchema,
  [MCP_DOCUMENT_TYPE.MCP_RESOURCES]: mcpResourcesSchema,
  [MCP_DOCUMENT_TYPE.MCP_PROMPTS]: mcpPromptsSchema,
}

/**
 * Validate the document against its MCP schema (versions 2024-11-05 … 2025-11-25).
 * The `draft` revision is out of scope: its init response (`DiscoverResult`) drops `protocolVersion`
 * for `supportedVersions`, which our `mcp-init` schema still requires — so skip schema validation for
 * that draft-shaped init to avoid false errors. (Tools/resources/prompts have no version marker; the
 * only draft divergence there is `inputSchema` becoming optional.)
 */
function validateMcpSchema(docType: string, obj: Record<string, unknown>): { message: string }[] {
  if (docType === MCP_DOCUMENT_TYPE.MCP_INIT && !isString(obj.protocolVersion) && Array.isArray(obj.supportedVersions)) {
    return []
  }
  const schema = SCHEMA_BY_TYPE[docType]
  if (!schema) { return [] }
  return validateDocument(schema, obj).map(e => ({
    message: `${e.instancePath || '/'} ${e.message ?? 'schema validation failed'}`.trim(),
  }))
}

function detectMcpDocumentType(obj: Record<string, unknown>): string | undefined {
  // init response: pre-draft uses a single `protocolVersion` string; the draft replaces it with a
  // `supportedVersions` array (DiscoverResult) — accept either as the init marker.
  if (
    isObject(obj.capabilities) && isObject(obj.serverInfo) &&
    (isString(obj.protocolVersion) || Array.isArray(obj.supportedVersions))
  ) {
    return MCP_DOCUMENT_TYPE.MCP_INIT
  }
  if (Array.isArray(obj.tools)) { return MCP_DOCUMENT_TYPE.MCP_TOOLS }
  if (Array.isArray(obj.resources)) { return MCP_DOCUMENT_TYPE.MCP_RESOURCES }
  if (Array.isArray(obj.prompts)) { return MCP_DOCUMENT_TYPE.MCP_PROMPTS }
  return undefined
}

const LIST_TYPE_MAPPING: Record<string, { key: string; kind: McpKind }> = {
  [MCP_DOCUMENT_TYPE.MCP_TOOLS]: { key: 'tools', kind: MCP_KIND.TOOL },
  [MCP_DOCUMENT_TYPE.MCP_RESOURCES]: { key: 'resources', kind: MCP_KIND.RESOURCE },
  [MCP_DOCUMENT_TYPE.MCP_PROMPTS]: { key: 'prompts', kind: MCP_KIND.PROMPT },
}

// A list item (tool/resource/prompt) is only usable if it carries a non-empty string `name`:
// the name becomes a segment of the MCP entity id, so an empty one would yield a degenerate id
// and collide with any other nameless entity. Validate it once here instead of casting blindly.
type McpListItemRaw = Record<string, unknown> & { name: string }

function hasValidName(item: Record<string, unknown>): item is McpListItemRaw {
  return isString(item.name) && item.name.trim().length > 0
}

interface ExtractEntitiesResult {
  entities: McpEntityRaw[]
  errors: { message: string }[]
}

function extractEntities(obj: Record<string, unknown>, docType: string): ExtractEntitiesResult {
  if (docType === MCP_DOCUMENT_TYPE.MCP_INIT) {
    return { entities: [{ kind: MCP_KIND.INIT, name: 'initialize', data: obj }], errors: [] }
  }

  const mapping = LIST_TYPE_MAPPING[docType]
  if (!mapping) { return { entities: [], errors: [] } }

  const arr = obj[mapping.key]
  if (!Array.isArray(arr)) { return { entities: [], errors: [] } }

  const entities: McpEntityRaw[] = []
  const errors: { message: string }[] = []

  arr.forEach((item, index) => {
    if (!isObject(item)) {
      errors.push({ message: `Skipped ${mapping.kind} at index ${index}: expected an object` })
      return
    }
    if (!hasValidName(item)) {
      errors.push({ message: `Skipped ${mapping.kind} at index ${index}: missing or empty required 'name'` })
      return
    }
    entities.push({
      kind: mapping.kind,
      name: item.name,
      description: isString(item.description) ? item.description : undefined,
      data: item,
    })
  })

  return { entities, errors }
}

export const parseMcpFile = async (fileId: string, source: Blob): Promise<TextFile<ParsedMcpData> | undefined> => {
  const extension = getFileExtension(fileId)
  if (extension !== FILE_FORMAT_JSON) {
    return undefined
  }

  const data = await source.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    // MCP document type is detected from the parsed object's shape, so at this point
    // we don't yet know whether this is an MCP file. Invalid JSON simply means it cannot
    // be one — return undefined to let the next builder in the chain claim the file
    // (parseFile rethrows on a thrown error, which would abort the whole parse chain).
    return undefined
  }

  if (!isObject(parsed) || Array.isArray(parsed)) {
    return undefined
  }

  const obj = parsed as Record<string, unknown>
  const docType = detectMcpDocumentType(obj)
  if (!docType) {
    return undefined
  }

  const { entities, errors } = extractEntities(obj, docType)
  if (entities.length === 0) {
    return undefined
  }

  // schema validation runs only once the document is confirmed MCP (so we never reject a foreign file)
  const allErrors = [...validateMcpSchema(docType, obj), ...errors]

  return {
    fileId,
    type: docType,
    format: FILE_FORMAT_JSON,
    data: { entities, rawJson: obj },
    source,
    kind: FILE_KIND.TEXT,
    errors: allErrors.length ? allErrors : undefined,
  }
}
