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
import { MCP_DOCUMENT_TYPE } from './mcp.consts'
import { ParsedMcpData } from './mcp.types'
import { createVersionInternalDocument } from '../../utils'

export const buildMcpDocument: DocumentBuilder<ParsedMcpData> = async (parsedFile, file): Promise<VersionDocument<ParsedMcpData>> => {
  const { fileId, slug = '', publish = true, ...metadata } = file
  const data = parsedFile.data as ParsedMcpData
  const title = data.serverName || fileId.split('/').pop()!.replace(/\.[^/.]+$/, '')
  return {
    fileId,
    type: MCP_DOCUMENT_TYPE.MCP,
    format: parsedFile.format,
    data,
    slug,
    publish,
    filename: fileId,
    title,
    dependencies: [],
    description: JSON.stringify(data.rawJson),
    operationIds: [],
    metadata,
    source: parsedFile.source,
    versionInternalDocument: createVersionInternalDocument(slug),
  }
}

export const dumpMcpDocument: DocumentDumper<ParsedMcpData> = (document) => {
  const content = typeof document.description === 'string' ? document.description : JSON.stringify(document.data)
  return new Blob([content], { type: 'application/json' })
}
