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

import { loadFileAsStringFromRegistry, LocalRegistry, VERSIONS_PATH } from './registry'
import { VERSION_STATUS } from '../../src/consts'

/** What a file is published as: the type of its document, and whether the document is flagged as errored. */
export interface PublishedDocumentType {
  type: string
  errored: boolean
}

/** One file and what it is expected to be published as. */
export interface DocumentTypeCase extends PublishedDocumentType {
  // unique within its test file: the package id is derived from it
  name: string
  fileId: string
  content: string
  // whatever the build config has to say about the file beyond its id
  fileConfig?: Record<string, unknown>
}

/**
 * Publish the file of a case alone, as a draft, and read its type and error flag from `documents.json` — the
 * entry the backend consumes.
 *
 * The type decides where a client shows the document and which API type the backend flags, so a broken file
 * published as `unknown` drops out of its own API.
 *
 * `subject` and the case name make the package id, so `subject` has to differ between test files.
 */
export async function publishDocumentTypeCase(
  subject: string,
  { name, fileId, content, fileConfig }: DocumentTypeCase,
): Promise<PublishedDocumentType> {
  const packageId = `document-type/${subject}/${name.replace(/\W+/g, '-')}`
  await new LocalRegistry(packageId).publishFromContent(
    { [fileId]: content },
    { packageId, version: 'v1', status: VERSION_STATUS.DRAFT, files: [{ fileId, ...fileConfig }] },
  )

  const { documents } = JSON.parse(
    (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'documents.json'))!,
  ) as { documents: Array<{ type: string; hasErrors?: boolean }> }
  const [entry] = documents
  return { type: entry.type, errored: entry.hasErrors === true }
}
