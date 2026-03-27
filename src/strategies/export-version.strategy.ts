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

import {
  BuilderStrategy,
  BuildResult,
  BuildTypeContexts,
  ExportDocument,
  ExportVersionBuildConfig,
  ResolvedVersionDocument,
  SHAREABILITY_STATUS_UNKNOWN,
  ShareabilityStatus,
} from '../types'
import { getDocumentTitle, getFileExtension, getSplittedVersionKey } from '../utils'
import {
  createCommonStaticExportDocuments,
  createSingleFileExportName,
  createUnknownExportDocument,
  generateIndexHtmlPage,
} from '../utils/export'
import { isRestDocument, unknownApiBuilder } from '../apitypes'
import { FILE_FORMAT_HTML, FILE_FORMAT_JSON } from '../consts'

export class ExportVersionStrategy implements BuilderStrategy {
  async execute(config: ExportVersionBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    let isSingleNonRestDocument = false
    switch (config.format) {
      case FILE_FORMAT_HTML:
        isSingleNonRestDocument = await exportToHTML(config, buildResult, contexts)
        break
      default:
        isSingleNonRestDocument = await defaultExport(config, buildResult, contexts)
        break
    }

    const { packageId, version: versionWithRevision, format = FILE_FORMAT_JSON } = config
    const [version] = getSplittedVersionKey(versionWithRevision)
    if (buildResult.exportDocuments.length > 1) {
      buildResult.exportFileName = `${packageId}_${version}.zip`
      return buildResult
    }

    const singleExportDocument = buildResult.exportDocuments[0]
    const singleExportDocumentExtension = isSingleNonRestDocument
      ? getFileExtension(singleExportDocument.filename)
      : format

    buildResult.exportFileName = createSingleFileExportName(
      packageId,
      version,
      getDocumentTitle(singleExportDocument.filename),
      singleExportDocumentExtension,
    )
    return buildResult
  }
}

async function exportToHTML(config: ExportVersionBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<boolean> {
  const {
    versionDocumentsResolver,
    rawDocumentResolver,
    templateResolver,
    packageResolver,
    apiBuilders,
  } = contexts.builderContext(config)
  const { packageId, version: versionWithRevision, format, allowedOasExtensions } = config
  const [version] = getSplittedVersionKey(versionWithRevision)
  const { name: packageName } = await packageResolver(packageId)
  const { documents } = await versionDocumentsResolver(versionWithRevision, packageId) ?? { documents: [] }
  const documentsFilteredByShareabilityStatus = filterDocumentsByShareabilityStatus(documents, config)

  const generatedHtmlExportDocuments: ExportDocument[] = []
  const restDocuments = documentsFilteredByShareabilityStatus.filter(isRestDocument)
  const shouldAddIndexPage = restDocuments.length > 0
  const transformedDocuments = await Promise.all(documentsFilteredByShareabilityStatus.map(async document => {
    const { createExportDocument } = apiBuilders.find(({ types }) => types.includes(document.type)) || unknownApiBuilder
    const file = await rawDocumentResolver(versionWithRevision, packageId, document.slug)
    return await createExportDocument?.(file.name, await file.text(), format, packageName, version, templateResolver, allowedOasExtensions, generatedHtmlExportDocuments, shouldAddIndexPage) ?? createUnknownExportDocument(file.name, file)
  }))

  buildResult.exportDocuments.push(...transformedDocuments)

  if (generatedHtmlExportDocuments.length > 0) {
    buildResult.exportDocuments.push(...await createCommonStaticExportDocuments(packageName, version, templateResolver))
  }
  if (shouldAddIndexPage) {
    const readme = await buildResult.exportDocuments.find(({ filename }) => filename.toLowerCase() === 'readme.md')?.data.text()
    buildResult.exportDocuments.push(createUnknownExportDocument('index.html', await generateIndexHtmlPage(packageName, version, generatedHtmlExportDocuments, templateResolver, readme)))
  }

  return isSingleNonRestDocument(documentsFilteredByShareabilityStatus)
}

async function defaultExport(config: ExportVersionBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<boolean> {
  const {
    versionDocumentsResolver,
    rawDocumentResolver,
    templateResolver,
    packageResolver,
    apiBuilders,
  } = contexts.builderContext(config)
  const { packageId, version: versionWithRevision, format, allowedOasExtensions } = config
  const [version] = getSplittedVersionKey(versionWithRevision)
  const { name: packageName } = await packageResolver(packageId)
  const { documents } = await versionDocumentsResolver(versionWithRevision, packageId) ?? { documents: [] }
  const documentsFilteredByShareabilityStatus = filterDocumentsByShareabilityStatus(documents, config)

  const transformedDocuments = await Promise.all(documentsFilteredByShareabilityStatus.map(async document => {
    const { createExportDocument } = apiBuilders.find(({ types }) => types.includes(document.type)) || unknownApiBuilder
    const file = await rawDocumentResolver(versionWithRevision, packageId, document.slug)
    return await createExportDocument?.(file.name, await file.text(), format, packageName, version, templateResolver, allowedOasExtensions) ?? createUnknownExportDocument(file.name, file)
  }))

  buildResult.exportDocuments.push(...transformedDocuments)

  return isSingleNonRestDocument(documentsFilteredByShareabilityStatus)
}

function isSingleNonRestDocument(documents: ReadonlyArray<ResolvedVersionDocument>): boolean {
  return documents.length === 1 && !isRestDocument(documents[0])
}

function filterDocumentsByShareabilityStatus(
  documents: ReadonlyArray<ResolvedVersionDocument>,
  config: ExportVersionBuildConfig,
): ReadonlyArray<ResolvedVersionDocument> {
  const { allowedShareabilityStatuses } = config

  // DEBUG ONLY - remove after verifying export works correctly
  console.log('[export-version] filterByShareability called:', {
    allowedShareabilityStatuses: allowedShareabilityStatuses,
    totalDocs: documents.length,
    statuses: documents.map(d => ({ slug: d.slug, shareabilityStatus: d.shareabilityStatus })),
  })

  if (!allowedShareabilityStatuses || allowedShareabilityStatuses.length === 0) {
    return documents
  }
  const allowedSet = new Set<ShareabilityStatus>(allowedShareabilityStatuses)
  const filtered = documents.filter(doc => allowedSet.has(doc.shareabilityStatus ?? SHAREABILITY_STATUS_UNKNOWN))

  // DEBUG ONLY - remove after verifying export works correctly
  console.log('[export-version] filtered to', filtered.length, 'shareable documents')

  return filtered
}
