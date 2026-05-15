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

import { PackageMcpContract } from '../../types/package/contracts-mcp'
import { ParsedMcpData } from './mcp.types'
import { BuildConfigFile } from '../../types/external'

export function buildMcpContracts(
  documentId: string,
  data: ParsedMcpData,
  file: BuildConfigFile,
): PackageMcpContract[] {
  const metadata = extractMetadata(file)
  return data.entities.map((entity, idx) => {
    const entityName = entity.name || `${entity.kind}_${idx}`
    const mcpEntityId = `${data.serverName}.${entity.kind}.${entityName}`.replace(/\s+/g, '_')
    const contentPath = `${mcpEntityId}.json`
    return {
      mcpEntityId,
      kind: entity.kind,
      title: entity.title,
      mcpEndpoint: data.endpoint,
      serverName: data.serverName,
      deprecated: false,
      metadata: metadata ?? undefined,
      documentId,
      contentPath,
    }
  })
}

export function buildMcpContractContent(entity: { data: unknown }): Blob {
  return new Blob([JSON.stringify(entity.data, null, 2)], { type: 'application/json' })
}

function extractMetadata(file: BuildConfigFile): Record<string, unknown> | undefined {
  const { fileId, slug, publish, apiKind, ...rest } = file as Record<string, unknown>
  if (Object.keys(rest).length === 0) { return undefined }
  return rest as Record<string, unknown>
}
