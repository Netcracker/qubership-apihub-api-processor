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

import { BuilderContext, BuildResult } from '../types'
import { BuildConfigFile } from '../types/external'
import { PackageDdlContractsFile, PackageMcpContractsFile } from '../types/package'
import { DDL_DOCUMENT_TYPE, ParsedDdlData, buildDdlContracts } from '../apitypes/ddl'
import { MCP_DOCUMENT_TYPE, ParsedMcpData, buildMcpContracts } from '../apitypes/mcp'

export async function buildContracts(
  files: BuildConfigFile[],
  buildResult: BuildResult,
  ctx: BuilderContext,
): Promise<{ ddlContracts?: PackageDdlContractsFile; mcpContracts?: PackageMcpContractsFile; mcpEntityDataMap?: Map<string, unknown> }> {
  const ddlContracts: PackageDdlContractsFile = { contracts: [] }
  const mcpContracts: PackageMcpContractsFile = { contracts: [] }
  const mcpEntityDataMap = new Map<string, unknown>()

  for (const file of files) {
    const document = buildResult.documents.get(file.fileId)
    if (!document) { continue }

    const parsedFile = await ctx.parsedFileResolver(file.fileId)
    if (!parsedFile || parsedFile.kind !== 'text') { continue }

    if (document.type === DDL_DOCUMENT_TYPE.DDL) {
      const data = parsedFile.data as ParsedDdlData
      if (data && data.entities) {
        const contracts = buildDdlContracts(file.fileId, data, file)
        ddlContracts.contracts.push(...contracts)
      }
    } else if (document.type === MCP_DOCUMENT_TYPE.MCP) {
      const data = parsedFile.data as ParsedMcpData
      if (data && data.entities) {
        const { contracts, entityDataMap } = buildMcpContracts(file.fileId, data, file)
        mcpContracts.contracts.push(...contracts)
        for (const [key, val] of entityDataMap) {
          mcpEntityDataMap.set(key, val)
        }
      }
    }
  }

  return {
    ddlContracts: ddlContracts.contracts.length > 0 ? ddlContracts : undefined,
    mcpContracts: mcpContracts.contracts.length > 0 ? mcpContracts : undefined,
    mcpEntityDataMap: mcpEntityDataMap.size > 0 ? mcpEntityDataMap : undefined,
  }
}
