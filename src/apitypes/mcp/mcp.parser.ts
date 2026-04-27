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

import { MCP_DOCUMENT_TYPE, MCP_FILE_FORMAT } from './mcp.consts'
import { McpDocument } from './mcp.types'
import mcpToolsSchema from './schemas/mcp-tools.json'
import mcpResourcesSchema from './schemas/mcp-resources.json'
import mcpPromptsSchema from './schemas/mcp-prompts.json'
import mcpInitSchema from './schemas/mcp-init.json'
import { FILE_KIND, TextFile } from '../../types'
import { getFileExtension, validateDocument } from '../../utils'
import { isObject } from '../../utils/objects'

type McpDetectionResult = {
  type: (typeof MCP_DOCUMENT_TYPE)[keyof typeof MCP_DOCUMENT_TYPE]
  schema: object
}

/**
 * Detects whether a parsed JSON object is an MCP document and which type.
 *
 * Detection rules:
 * - Has `capabilities` object + `protocolVersion` string + `serverInfo` object → mcp-init
 * - Has a top-level `tools` array of objects → mcp-tools
 * - Has a top-level `resources` array of objects → mcp-resources
 * - Has a top-level `prompts` array of objects → mcp-prompts
 *
 * Init detection is checked first because it is the most specific (3 required fields).
 *
 * Schema validation (including required fields like `name`) is performed
 * separately after detection.
 */
function detectMcpType(data: unknown): McpDetectionResult | undefined {
  if (!isObject(data)) {
    return undefined
  }

  const obj = data as Record<string, unknown>

  if (isObject(obj.capabilities) && typeof obj.protocolVersion === 'string' && isObject(obj.serverInfo)) {
    return { type: MCP_DOCUMENT_TYPE.INIT, schema: mcpInitSchema }
  }

  if (Array.isArray(obj.tools) && (obj.tools.length === 0 || isObject(obj.tools[0]))) {
    return { type: MCP_DOCUMENT_TYPE.TOOLS, schema: mcpToolsSchema }
  }

  if (Array.isArray(obj.resources) && (obj.resources.length === 0 || isObject(obj.resources[0]))) {
    return { type: MCP_DOCUMENT_TYPE.RESOURCES, schema: mcpResourcesSchema }
  }

  if (Array.isArray(obj.prompts) && (obj.prompts.length === 0 || isObject(obj.prompts[0]))) {
    return { type: MCP_DOCUMENT_TYPE.PROMPTS, schema: mcpPromptsSchema }
  }

  return undefined
}

export const parseMcpFile = async (fileId: string, source: Blob): Promise<TextFile<McpDocument> | undefined> => {
  const sourceString = await source.text()
  const extension = getFileExtension(fileId)

  // MCP documents are JSON only
  if (extension !== MCP_FILE_FORMAT.JSON && !sourceString.trimStart().startsWith('{')) {
    return undefined
  }

  let data: unknown
  try {
    data = JSON.parse(sourceString)
  } catch {
    return undefined
  }

  const detection = detectMcpType(data)
  if (!detection) {
    return undefined
  }

  // Validate against MCP schema
  const validationErrors = validateDocument(detection.schema, data)

  if (validationErrors.length > 0) {
    const errorMessages = validationErrors
      .map(err => err.message || String(err))
      .join('; ')
    throw new Error(`MCP validation failed for '${fileId}': ${errorMessages}`)
  }

  return {
    fileId,
    type: detection.type,
    format: MCP_FILE_FORMAT.JSON,
    data: data as McpDocument,
    source,
    errors: undefined,
    kind: FILE_KIND.TEXT,
  }
}
