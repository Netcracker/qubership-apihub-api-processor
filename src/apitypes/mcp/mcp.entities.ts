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

import { McpEntityWithData, McpKind, MCP_KIND } from '../../types'
import { ParsedMcpData } from './mcp.types'
import { BuildConfigFile } from '../../types'
import { isString, slugify, SLUG_OPTIONS_OPERATION_ID } from '../../utils'

const KIND_TO_WRAPPER_KEY: Record<string, string> = {
  [MCP_KIND.TOOL]: 'tools',
  [MCP_KIND.RESOURCE]: 'resources',
  [MCP_KIND.PROMPT]: 'prompts',
}

export function calculateMcpEntityId(
  mcpEndpoint: string,
  kind: string,
  name: string,
): string {
  const safeEndpoint = slugify(mcpEndpoint, SLUG_OPTIONS_OPERATION_ID).replace(/^-+|-+$/g, '')
  const safeName = slugify(name, SLUG_OPTIONS_OPERATION_ID).replace(/^-+|-+$/g, '')
  return `${safeEndpoint}-${kind}-${safeName}`
}

export function wrapEntityData(kind: McpKind, data: unknown): unknown {
  if (kind === MCP_KIND.INIT) { return data }
  const key = KIND_TO_WRAPPER_KEY[kind]
  return { [key]: [data] }
}

export function buildMcpEntities(
  documentId: string,
  data: ParsedMcpData,
  file: BuildConfigFile,
): McpEntityWithData[] {
  const fileMetadata = file.metadata as Record<string, unknown> | undefined
  const mcpEndpoint = fileMetadata?.mcpEndpoint
  if (!isString(mcpEndpoint)) {
    throw new Error(`MCP file '${file.fileId}' is missing required metadata.mcpEndpoint`)
  }

  const seen = new Map<string, string>()

  return data.entities.map((entity) => {
    const mcpEntityId = calculateMcpEntityId(mcpEndpoint, entity.kind, entity.name)

    if (seen.has(mcpEntityId)) {
      throw new Error(
        `Duplicate MCP entity ID '${mcpEntityId}': '${entity.name}' conflicts with '${seen.get(mcpEntityId)}' in file '${file.fileId}'`,
      )
    }
    seen.set(mcpEntityId, entity.name)

    const title = entity.kind === MCP_KIND.INIT
      ? 'init'
      : (isString(entity.data['title']) ? entity.data['title'] : entity.name)
    const description = entity.kind === MCP_KIND.INIT ? '' : (entity.description ?? '')

    return {
      entity: {
        mcpEntityId,
        kind: entity.kind,
        title,
        description,
        mcpEndpoint,
        search: { useEntityDataAsSearchText: true },
        documentId,
      },
      entityData: wrapEntityData(entity.kind, entity.data),
    }
  })
}
