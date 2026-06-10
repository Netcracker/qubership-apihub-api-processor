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

import { FILE_KIND, TextFile } from '../../types'
import { getFileExtension } from '../../utils'
import { FILE_FORMAT_DDL, FILE_FORMAT_SQL } from '../../consts'
import { DDL_DOCUMENT_TYPE } from './ddl.consts'
import { ParsedDdlData } from './ddl.types'

export const parseDdlFile = async (fileId: string, source: Blob): Promise<TextFile<ParsedDdlData> | undefined> => {
  const extension = getFileExtension(fileId)
  if (extension !== FILE_FORMAT_SQL && extension !== FILE_FORMAT_DDL) {
    // Not a DDL file — return undefined fast (BEFORE importing ddlapi) so the parser stays a
    // no-op for every other file. This keeps the ddlapi + WASM load lazy: it only happens when
    // an actual .sql/.ddl file is encountered.
    return undefined
  }

  const sql = await source.text()

  // Lazy boundary: dynamic import() so ddlapi (and its Postgres WASM) is excluded from any
  // bundle/runtime that never publishes a DDL file.
  const { buildFromDdl } = await import('@netcracker/qubership-apihub-ddlapi')

  const errors: { message: string }[] = []
  // Hard syntax errors throw DdlParseError → propagated (parseFile turns it into a fatal
  // "Cannot parse file" → publish fails), matching the "invalid SQL breaks publish" decision.
  // Non-fatal issues (out-of-scope statements, unresolved refs, duplicates) are collected and
  // surfaced as document errors → notifications, while the parsed model is still produced.
  const realm = await buildFromDdl(sql, {
    onError: (e) => errors.push({ message: `${e.kind}: ${e.message}` }),
  })

  return {
    fileId,
    type: DDL_DOCUMENT_TYPE,
    format: extension,
    data: { realm, originalDocument: sql },
    source,
    kind: FILE_KIND.TEXT,
    errors: errors.length ? errors : undefined,
  }
}
