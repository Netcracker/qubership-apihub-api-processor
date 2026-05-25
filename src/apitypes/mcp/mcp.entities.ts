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
): { contracts: PackageMcpContract[]; entityDataMap: Map<string, unknown> } {
  const fileMetadata = file.metadata as Record<string, unknown> | undefined
  const mcpEndpoint = fileMetadata?.mcpEndpoint as string | undefined
  if (!mcpEndpoint) {
    throw new Error(`MCP endpoint is required for file ${file.fileId}: set metadata.mcpEndpoint in the publish config`)
  }

  const contractMetadata = extractMetadata(file)
  const entityDataMap = new Map<string, unknown>()

  const contracts = data.entities.map((entity, idx) => {
    const name = entity.kind === 'init' ? 'initialize' : (entity.name || `${entity.kind}_${idx}`)
    const safeEndpoint = mcpEndpoint.replace(/[^a-zA-Z0-9]/g, '_')
    const mcpEntityId = `${safeEndpoint}.${entity.kind}.${name}`.replace(/\s+/g, '_')
    const contentPath = `${mcpEntityId}.json`
    entityDataMap.set(contentPath, entity.data)
    const searchText = [name, entity.description, mcpEndpoint].filter(Boolean).join(' ')
    return {
      mcpEntityId,
      kind: entity.kind,
      name,
      mcpEndpoint,
      searchText,
      metadata: contractMetadata ?? undefined,
      documentId,
      contentPath,
    }
  })

  return { contracts, entityDataMap }
}

export function buildMcpContractContent(entity: { data: unknown }): Blob {
  return new Blob([JSON.stringify(entity.data, null, 2)], { type: 'application/json' })
}

function extractMetadata(file: BuildConfigFile): Record<string, unknown> | undefined {
  const { fileId, slug, publish, apiKind, metadata, ...rest } = file as Record<string, unknown>
  const combined: Record<string, unknown> = { ...(metadata as Record<string, unknown> || {}), ...rest }
  delete combined['mcpEndpoint']
  return Object.keys(combined).length > 0 ? combined : undefined
}
