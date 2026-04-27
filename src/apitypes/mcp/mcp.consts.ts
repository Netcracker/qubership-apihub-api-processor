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

import { FILE_FORMAT_JSON } from '../../consts'
import { ResolvedVersionDocument, ZippableDocument } from '../../types'

export const MCP_SCHEMA_VERSION = '2025-11-25'

export const MCP_DOCUMENT_TYPE = {
  TOOLS: 'mcp-tools',
  RESOURCES: 'mcp-resources',
  PROMPTS: 'mcp-prompts',
  INIT: 'mcp-init',
} as const

export const MCP_FILE_FORMAT = {
  JSON: FILE_FORMAT_JSON,
} as const

export function isMcpDocument(document: ZippableDocument | ResolvedVersionDocument): boolean {
  return Object.values(MCP_DOCUMENT_TYPE).some(type => document.type === type)
}
