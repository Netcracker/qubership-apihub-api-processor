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

import { Realm } from '@netcracker/qubership-apihub-ddlapi'
import { normalize } from '@netcracker/qubership-apihub-api-unifier'
import { VersionDocument } from '../../types'
import { createSerializedInternalDocument } from '../../utils'
import { DDL_EFFECTIVE_NORMALIZE_OPTIONS } from './ddl.consts'

/**
 * Build the version-internal document for a DDL document the same way REST does (AD3):
 * normalize the Realm → denormalize → serialize, and attach the serialized form to the
 * document's `versionInternalDocument` (which must already exist via `createVersionInternalDocument`).
 *
 * `createSerializedInternalDocument` performs the `denormalize(effectiveDocument) → serializeDocument`
 * half, so we pass it the already-normalized Realm as the effective document.
 */
export function serializeDdlInternalDocument(document: VersionDocument, realm: Realm): void {
  const effectiveRealm = normalize(realm, { ...DDL_EFFECTIVE_NORMALIZE_OPTIONS, source: realm }) as Realm
  createSerializedInternalDocument(document, effectiveRealm, DDL_EFFECTIVE_NORMALIZE_OPTIONS)
}

/**
 * Per-entity SQL for one table — the content of `ddl/<ddlEntityId>` (AD4, Task 5).
 *
 * STUB: real extraction (the table's `CREATE TABLE` + `CREATE INDEX` + `COMMENT ON`, minimal and
 * valid) belongs in ddlapi. For v1 this returns a deterministic stub built from the arguments so the
 * `ddl/` file is populated and the build/packaging wiring can be exercised end-to-end.
 *
 * TODO(ddlapi): replace this stub with a real per-table statement extractor in ddlapi.
 */
export function extractTableStatements(sourceSql: string, schema: string, tableName: string): string {
  return `${schema}\n${tableName}\n${sourceSql}`
}
