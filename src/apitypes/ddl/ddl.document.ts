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

import { DocumentBuilder, DocumentDumper, VersionDocument } from '../../types'
import { createVersionInternalDocument, getDocumentTitle } from '../../utils'
import { ParsedDdlData } from './ddl.types'

export const buildDdlDocument: DocumentBuilder<ParsedDdlData> = async (parsedFile, file): Promise<VersionDocument<ParsedDdlData>> => {
  const { fileId, slug = '', publish = true, ...fileMetadata } = file
  const { data } = parsedFile
  return {
    fileId,
    type: parsedFile.type,
    format: parsedFile.format,
    data,
    slug,
    publish,
    filename: `${slug}.${parsedFile.format}`,
    title: getDocumentTitle(fileId),
    dependencies: [],
    description: '',
    operationIds: [],
    metadata: fileMetadata,
    source: parsedFile.source,
    version: undefined,
    errors: 0,
    versionInternalDocument: createVersionInternalDocument(slug),
  }
}

// The verbatim source SQL is the runnable, correctly-ordered document (originalDocument).
export const dumpDdlDocument: DocumentDumper<ParsedDdlData> = (document) => {
  const { data } = document
  return new Blob([data.originalDocument], { type: 'text/plain' })
}
