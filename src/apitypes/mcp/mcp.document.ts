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
import { FILE_FORMAT, FILE_FORMAT_JSON } from '../../consts'
import { createVersionInternalDocument, getDocumentTitle } from '../../utils'
import { dump } from '../../utils/apihubSpecificationExtensions'
import { McpDocument, McpDocumentMetadata } from './mcp.types'

export const buildMcpDocument: DocumentBuilder<McpDocument> = async (parsedFile, file, _ctx): Promise<VersionDocument<McpDocument>> => {
  const { fileId, slug = '', publish = true, mcpEndpoint, ...fileMetadata } = file
  const { type, fileId: parsedFileId, source, data, errors } = parsedFile

  const metadata: McpDocumentMetadata = {
    ...fileMetadata,
    mcpEndpoint: mcpEndpoint as string,
  }

  return {
    fileId: parsedFileId,
    type,
    format: FILE_FORMAT.JSON,
    data,
    slug,
    filename: `${slug}.${FILE_FORMAT.JSON}`,
    title: getDocumentTitle(fileId),
    operationIds: [],
    dependencies: [],
    description: '',
    version: undefined,
    metadata,
    publish,
    source,
    errors: errors?.length ?? 0,
    versionInternalDocument: createVersionInternalDocument(slug),
  }
}

export const dumpMcpDocument: DocumentDumper<McpDocument> = (document, _format) => {
  return new Blob(...dump(document.data, FILE_FORMAT_JSON))
}
