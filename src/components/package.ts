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

import JSZip from 'jszip'
import { version } from '../../package.json'

import type {
  ApiOperation,
  BuilderContext,
  BuildResult,
  PackageComparison,
  PackageComparisonOperations,
  PackageComparisons,
  PackageConfig,
  PackageDocuments,
  PackageNotifications,
  PackageOperation,
  PackageOperations,
  VersionDocument,
} from '../types'
import { unknownApiBuilder } from '../apitypes'
import { PACKAGE } from '../consts'
import { takeIf, toPackageDocument } from '../utils'

export interface ZipTool {
  // todo method should only accept Blob content, transformation is not a responsibility of this method
  file: (name: string, content: object | string | Blob) => Promise<void>
  folder: (name: string) => ZipTool
  buildResult: (options?: JSZip.JSZipGeneratorOptions) => Promise<any>
}

export const createVersionPackage = async (
  buildResult: BuildResult,
  zip: ZipTool,
  ctx: BuilderContext,
  options?: JSZip.JSZipGeneratorOptions,
): Promise<any> => {
  await createInfoFile(zip, buildResult.config)

  const documents = buildResult.merged ? [buildResult.merged] : [...buildResult.documents.values()]

  createDocumentsFile(zip, documents)
  await createDocumentDataFiles(zip, documents, ctx)

  createOperationsFile(zip, buildResult.operations)
  const operationsDir = zip.folder(PACKAGE.OPERATIONS_DIR_NAME)!
  for (const { data, operationId } of buildResult.operations.values()) {
    createOperationDataFile(operationsDir, operationId, data)
  }

  if (buildResult.comparisons.length) {
    const comparisons: PackageComparison[] = buildResult.comparisons.map(({ data, ...rest }) => rest)
    createComparisonsFile(zip, { comparisons })
    const comparisonsDir = zip.folder(PACKAGE.COMPARISONS_DIR_NAME)

    for (const comparison of buildResult.comparisons) {
      if (!comparison.comparisonFileId || !comparison.data) { continue }
      createComparisonDataFile(comparisonsDir!, comparison.comparisonFileId, { operations: comparison.data })
    }
  }
  createNotificationsFile(zip, { notifications: buildResult.notifications })

  return await zip.buildResult(options)
}

const createInfoFile = async (zip: ZipTool, config: PackageConfig): Promise<void> => {
  zip.file(PACKAGE.INFO_FILE_NAME, { ...config, builderVersion: version })
}

const createNotificationsFile = (zip: ZipTool, notifications: PackageNotifications): void => {
  zip.file(PACKAGE.NOTIFICATIONS_FILE_NAME, notifications)
}

const createDocumentsFile = (zip: ZipTool, documents: VersionDocument[]): void => {
  const result: PackageDocuments = { documents: [] }

  for (const document of documents) {
    if (!document.publish) { continue }

    result.documents.push(toPackageDocument(document))
  }

  zip.file(PACKAGE.DOCUMENTS_FILE_NAME, result)
}

const createDocumentDataFiles = async (zip: ZipTool, documents: VersionDocument[], ctx: BuilderContext): Promise<void> => {
  const documentsDir = zip.folder(PACKAGE.DOCUMENTS_DIR_NAME)

  const { apiBuilders, config: { format } } = ctx

  for (const document of documents) {
    // skip components
    if (!document.publish) { continue }

    const apiBuilder =
      apiBuilders.find(({ types }) => types.includes(document.type)) || unknownApiBuilder
    const data = apiBuilder.dumpDocument(document, format)
    await documentsDir?.file(document.filename, data)
  }
}

const createOperationsFile = (zip: ZipTool, operations: Map<string, ApiOperation>): void => {
  const data: PackageOperations = { operations: [] }
  const SEARCH_SCOPES_MAP: Record<string, string> = {}

  for (const operation of operations.values()) {
    const searchScopes = Object
      .entries(operation.searchScopes)
      .reduce((acc, next) => {
        const [key, value] = next
        acc[key] = [...value.values()].sort().join(' ')
        return acc
      }, { ...SEARCH_SCOPES_MAP })

    data.operations.push({
      operationId: operation.operationId,
      title: operation.title,
      dataHash: operation.dataHash,
      deprecated: operation.deprecated,
      apiKind: operation.apiKind,
      apiType: operation.apiType,
      metadata: operation.metadata,
      searchScopes: searchScopes,

      ...(takeIf({ deprecatedItems: operation.deprecatedItems }, !!operation.deprecatedItems?.length)),
      deprecatedInfo: operation.deprecatedInfo,
      deprecatedInPreviousVersions: operation.deprecatedInPreviousVersions,

      models: operation.models,
      tags: operation.tags,
      apiAudience: operation.apiAudience,
    })
  }

  zip.file(PACKAGE.OPERATIONS_FILE_NAME, data)
}

const createOperationDataFile = (zipFolder: ZipTool, operationId: string, operation: PackageOperation): void => {
  zipFolder.file(operationId, operation)
}

const createComparisonsFile = (zip: ZipTool, comparisons: PackageComparisons): void => {
  zip.file(PACKAGE.COMPARISONS_FILE_NAME, comparisons)
}

const createComparisonDataFile = (zipFolder: ZipTool, comparisonFileId: string, comparison: PackageComparisonOperations): void => {
  zipFolder.file(comparisonFileId, comparison)
}