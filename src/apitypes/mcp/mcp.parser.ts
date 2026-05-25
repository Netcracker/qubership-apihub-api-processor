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

import { FILE_KIND, TextFile } from '../../types/internal'
import { getFileExtension } from '../../utils'
import { FILE_FORMAT_JSON } from '../../consts'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import { McpEntityRaw, ParsedMcpData } from './mcp.types'

function isMcpShape(obj: Record<string, unknown>): boolean {
  return (
    (typeof obj['capabilities'] === 'object' && typeof obj['serverInfo'] === 'object') ||
    Array.isArray(obj['tools']) ||
    Array.isArray(obj['prompts']) ||
    Array.isArray(obj['resources'])
  )
}

function extractEntities(obj: Record<string, unknown>): McpEntityRaw[] {
  const entities: McpEntityRaw[] = []

  if (typeof obj['capabilities'] === 'object' && typeof obj['serverInfo'] === 'object') {
    const serverInfo = obj['serverInfo'] as Record<string, unknown>
    entities.push({
      kind: 'init',
      name: 'initialize',
      data: obj,
    })
  }

  for (const [key, kind] of [['tools', 'tool'], ['prompts', 'prompt'], ['resources', 'resource']] as const) {
    const arr = obj[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'object' && item !== null) {
          const entry = item as Record<string, unknown>
          entities.push({
            kind,
            name: (entry['name'] as string) || '',
            description: (entry['description'] as string) || undefined,
            data: item,
          })
        }
      }
    }
  }

  return entities
}

export const parseMcpFile = async (fileId: string, source: Blob): Promise<TextFile<ParsedMcpData> | undefined> => {
  const extension = getFileExtension(fileId)
  if (extension !== FILE_FORMAT_JSON) {
    return undefined
  }
  const text = await source.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined
  }
  const obj = parsed as Record<string, unknown>
  if (!isMcpShape(obj)) {
    return undefined
  }

  const entities = extractEntities(obj)
  if (entities.length === 0) {
    return undefined
  }

  return {
    fileId,
    type: MCP_DOCUMENT_TYPE.MCP,
    format: FILE_FORMAT_JSON,
    data: { entities, rawJson: obj },
    source,
    kind: FILE_KIND.TEXT,
  }
}
