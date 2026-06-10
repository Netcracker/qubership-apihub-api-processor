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

import { ZippableDocument } from '../../types'
import { ResolvedVersionDocument } from '../../types/external'

// Single document type, unlike MCP's four per-file types — the entity kind (table/view) is
// determined per entity inside the parsed model, not per file.
export const DDL_DOCUMENT_TYPE = 'ddl' as const

export function isDdlDocument(document: ZippableDocument | ResolvedVersionDocument): boolean {
  return document.type === DDL_DOCUMENT_TYPE
}
