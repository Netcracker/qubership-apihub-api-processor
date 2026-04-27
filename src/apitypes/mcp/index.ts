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

import { buildMcpDocument, dumpMcpDocument } from './mcp.document'
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import { parseMcpFile } from './mcp.parser'
import { ApiBuilder } from '../../types'
import { McpDocument } from './mcp.types'
import { MCP_API_TYPE } from '../../consts'

export * from './mcp.consts'
export * from './mcp.types'
export { buildMcpEntities, validateMcpCapabilities } from './mcp.entities'

export const mcpApiBuilder: ApiBuilder<McpDocument> = {
  apiType: MCP_API_TYPE,
  types: Object.values(MCP_DOCUMENT_TYPE),
  parser: parseMcpFile,
  buildDocument: buildMcpDocument,
  dumpDocument: dumpMcpDocument,
  // No buildOperations — MCP entities are not operations.
  // Entity extraction is handled by buildMcpEntities, called from BuildStrategy.
}
