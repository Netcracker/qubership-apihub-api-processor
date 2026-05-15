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

import { FILE_KIND, FileFormat, TextFile } from '../../types/internal'
import { getFileExtension } from '../../utils'
import { DDL_DOCUMENT_TYPE, DDL_FILE_FORMATS } from './ddl.consts'
import { DdlEntity, ParsedDdlData } from './ddl.types'

// Match CREATE TABLE [IF NOT EXISTS] [[schema.]name]
const CREATE_TABLE_REGEX = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/gi
// Match CREATE [OR REPLACE] VIEW [[schema.]name]
const CREATE_VIEW_REGEX = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s/gi

export function parseDdlContent(sql: string): DdlEntity[] {
  const entities: DdlEntity[] = []
  const seen = new Set<string>()

  for (const regex of [CREATE_TABLE_REGEX, CREATE_VIEW_REGEX]) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    const kind = regex === CREATE_TABLE_REGEX ? 'table' : 'view'
    while ((match = regex.exec(sql)) !== null) {
      const schemaName = match[1] ?? undefined
      const name = match[2]
      const ddlTableId = schemaName ? `${schemaName}.${name}` : name
      if (seen.has(ddlTableId)) { continue }
      seen.add(ddlTableId)
      // Extract the raw SQL for this statement (best-effort: from CREATE to the next semicolon)
      const startIdx = match.index
      const endIdx = sql.indexOf(';', startIdx)
      const rawSql = endIdx >= 0 ? sql.slice(startIdx, endIdx + 1) : sql.slice(startIdx)
      entities.push({ ddlTableId, kind, schemaName, name, deprecated: false, rawSql })
    }
  }

  return entities
}

export const parseDdlFile = async (fileId: string, source: Blob): Promise<TextFile<ParsedDdlData> | undefined> => {
  const extension = getFileExtension(fileId)
  if (!(DDL_FILE_FORMATS as ReadonlyArray<string>).includes(extension)) {
    return undefined
  }
  const content = await source.text()
  const entities = parseDdlContent(content)
  return {
    fileId,
    type: DDL_DOCUMENT_TYPE.DDL,
    format: extension as FileFormat,
    data: { entities, rawContent: content },
    source,
    kind: FILE_KIND.TEXT,
  }
}
