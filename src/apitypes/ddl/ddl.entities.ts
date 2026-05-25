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

import { PackageDdlContract } from '../../types/package/contracts-ddl'
import { ParsedDdlData } from './ddl.types'
import { BuildConfigFile } from '../../types/external'
import { PACKAGE } from '../../consts'

export function buildDdlContracts(
  documentId: string,
  data: ParsedDdlData,
  file: BuildConfigFile,
): PackageDdlContract[] {
  const metadata = extractMetadata(file)
  return data.entities.map((entity) => {
    const contentPath = `${entity.ddlTableId}.sql`
    const searchText = [entity.schemaName, entity.name].filter(Boolean).join(' ')
    return {
      ddlTableId: entity.ddlTableId,
      kind: entity.kind,
      schemaName: entity.schemaName,
      name: entity.name,
      searchText,
      metadata: metadata ?? undefined,
      documentId,
      contentPath,
    }
  })
}

export function buildDdlContractContent(entity: { rawSql: string }): Blob {
  return new Blob([entity.rawSql], { type: 'text/plain' })
}

function extractMetadata(file: BuildConfigFile): Record<string, unknown> | undefined {
  const { fileId, slug, publish, apiKind, ...rest } = file as Record<string, unknown>
  if (Object.keys(rest).length === 0) { return undefined }
  return rest as Record<string, unknown>
}
