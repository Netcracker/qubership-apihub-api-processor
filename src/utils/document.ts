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

import createSlug from 'slug'
import {
  _ParsedFileResolver,
  ApiOperation,
  BuildResult,
  FILE_KIND,
  FileFormat,
  FileId,
  HTML_EXPORT_GROUP_FORMAT,
  JSON_EXPORT_GROUP_FORMAT,
  OperationsGroupExportFormat,
  PackageDocument,
  ResolvedDocument,
  VersionDocument,
  YAML_EXPORT_GROUP_FORMAT,
} from '../types'
import { bundle, Resolver } from 'api-ref-bundler'
import { FILE_FORMAT_JSON, FILE_FORMAT_YAML } from '../consts'

export const EXPORT_FORMAT_TO_FILE_FORMAT = new Map<OperationsGroupExportFormat, FileFormat>([
  [YAML_EXPORT_GROUP_FORMAT, FILE_FORMAT_YAML],
  [JSON_EXPORT_GROUP_FORMAT, FILE_FORMAT_JSON],
  [HTML_EXPORT_GROUP_FORMAT, FILE_FORMAT_JSON],
])

export function toVersionDocument(document: ResolvedDocument, fileFormat: FileFormat): VersionDocument {
  return {
    data: document.data,
    version: document.version,
    operationIds: document.includedOperationIds ?? [],
    title: document.title,
    filename: `${getDocumentTitle(document.filename)}.${fileFormat}`,
    fileId: document.fileId,
    slug: document.slug,
    type: document.type,
    format: fileFormat,
    dependencies: [],
    description: '',
    metadata: {},
  }
}

export function toPackageDocument(document: VersionDocument): PackageDocument {
  return {
    fileId: document.fileId,
    slug: document.slug,
    filename: document.filename,
    type: document.type,
    format: document.format,
    title: document.title,
    description: document.description,
    operationIds: document.operationIds,
    metadata: document.metadata,
    version: document.version,
  }
}

export function setDocument(buildResult: BuildResult, document: VersionDocument, operations: ApiOperation[] = []): void {
  buildResult.documents.set(document.fileId, document)
  for (const operation of operations) {
    buildResult.operations.set(operation.operationId, operation)
  }
}

createSlug.extend({ '/': '-' })
createSlug.extend({ '_': '_' })
createSlug.extend({ '.': '-' })
createSlug.extend({ '(': '-' })
createSlug.extend({ ')': '-' })

export const findSharedPath = (fileIds: string[]): string => {
  if (!fileIds.length) { return '' }
  const sorted = fileIds.concat().sort()
  const first = sorted[0].split('/')
  const last = sorted[sorted.length - 1].split('/')

  let i = 0
  while (i < first.length - 1 && first[i] === last[i]) { i++ }
  return first.slice(0, i).join('/') + (i ? '/' : '')
}

export const slugify = (text: string, slugs: string[] = []): string => {
  if (!text) {
    return ''
  }

  const slug = createSlug(text)
  let suffix: string = ''
  // add suffix if not unique
  while (slugs.includes(slug + suffix)) { suffix = String(+suffix + 1) }
  return slug + suffix
}

export const getFileExtension = (fileId: string): string => {
  return (/[^\\/]\.([^.\\/]+)$/.exec(fileId.toLowerCase()) || ['']).pop() || ''
}

export const getDocumentTitle = (fileId: string): string => {
  // get file name and remove extension
  const cutDot = fileId.startsWith('.') ? 1 : 0
  return fileId.substring(cutDot).split('/').pop()!.replace(/\.[^/.]+$/, '')
}

export const getBundledFileDataWithDependencies = async (
  fileId: FileId,
  parsedFileResolver: _ParsedFileResolver,
): Promise<{ data: any; dependencies: string[] }> => {
  const dependencies: string[] = []

  const resolver: Resolver = async (filepath: string) => {
    const data = await parsedFileResolver(filepath)

    if (data === null) {
      return {}
    }

    if (data.kind !== FILE_KIND.TEXT) {
      throw new Error(`Dependency with path ${filepath} is not a text file`)
    }

    if (filepath !== fileId) {
      dependencies.push(filepath)
    }

    return data.data
  }

  const bundledFileData = await bundle(fileId, resolver)

  return { data: bundledFileData, dependencies: dependencies }
}

export function capitalize(string: string): string {
  if (!string) {
    return ''
  }

  return string.charAt(0).toUpperCase() + string.slice(1)
}