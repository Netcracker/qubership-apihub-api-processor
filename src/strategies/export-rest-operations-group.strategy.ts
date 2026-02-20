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

import { GRAPHQL_API_TYPE, REST_API_TYPE } from '../apitypes'
import { createGraphQLExportDocument } from '../apitypes/graphql/graphql.document'
import { createRestExportDocument } from '../apitypes/rest/rest.document'
import { BUILD_TYPE, FILE_FORMAT_HTML, FILE_FORMAT_JSON } from '../consts'
import {
  _TemplateResolver,
  BuilderStrategy,
  BuildResult,
  BuildTypeContexts,
  ExportDocument, ExportFormat,
  ExportOperationsGroupBuildConfig,
  OperationsApiType,
  TRANSFORMATION_KIND_MERGED,
  TRANSFORMATION_KIND_REDUCED,
} from '../types'
import { EXPORT_FORMAT_TO_FILE_FORMAT, getSplittedVersionKey } from '../utils'
import { createCommonStaticExportDocuments, createUnknownExportDocument, generateIndexHtmlPage } from '../utils/export'
import { DocumentGroupStrategy } from './document-group.strategy'
import { MergedDocumentGroupStrategy } from './merged-document-group.strategy'
import { OpenApiExtensionKey } from '@netcracker/qubership-apihub-api-unifier'

export class ExportRestOperationsGroupStrategy implements BuilderStrategy {
  async execute(config: ExportOperationsGroupBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    const { apiType, operationsSpecTransformation } = config

    if (apiType === REST_API_TYPE) {
      switch (operationsSpecTransformation) {
        case TRANSFORMATION_KIND_MERGED:
          await exportMergedDocument(config, buildResult, contexts)
          break
        case TRANSFORMATION_KIND_REDUCED:
          await exportReducedDocuments(config, buildResult, contexts)
          break
      }
    }

    if (apiType === GRAPHQL_API_TYPE) {
      if (operationsSpecTransformation === TRANSFORMATION_KIND_MERGED) {
        throw new Error(
          'Merged specification is not supported for graphql apiType',
        )
      }

      await exportReducedDocuments(config, buildResult, contexts)
    }

    const { packageId, version: versionWithRevision, format = FILE_FORMAT_JSON, groupName } = config
    const [version] = getSplittedVersionKey(versionWithRevision)
    if (buildResult.exportDocuments.length > 1) {
      buildResult.exportFileName = `${packageId}_${version}_${groupName}.zip`
      return buildResult
    }

    buildResult.exportFileName = `${packageId}_${version}_${groupName}.${format}`
    return buildResult
  }
}

async function exportMergedDocument(config: ExportOperationsGroupBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<void> {
  const {
    packageId,
    version: versionWithRevision,
    format = FILE_FORMAT_JSON,
    allowedOasExtensions,
  } = config
  const [version] = getSplittedVersionKey(versionWithRevision)
  const { templateResolver, packageResolver } = contexts.builderContext(config)
  const { name: packageName } = await packageResolver(packageId)

  await new MergedDocumentGroupStrategy().execute({
    ...config,
    buildType: BUILD_TYPE.MERGED_SPECIFICATION,
    format: EXPORT_FORMAT_TO_FILE_FORMAT.get(format)!,
  }, buildResult, contexts)

  if (!buildResult.merged) {
    throw Error('No merged result')
  }

  buildResult.exportDocuments.push(await createRestExportDocument(buildResult.merged.filename, JSON.stringify(buildResult.merged?.data), format, packageName, version, templateResolver, allowedOasExtensions))

  if (format === FILE_FORMAT_HTML) {
    buildResult.exportDocuments.push(...await createCommonStaticExportDocuments(packageName, version, templateResolver))
  }
}

async function exportReducedDocuments(config: ExportOperationsGroupBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<void> {
  const {
    packageId,
    version: versionWithRevision,
    format = FILE_FORMAT_JSON,
    apiType,
    allowedOasExtensions,
  } = config
  const [version] = getSplittedVersionKey(versionWithRevision)
  const { templateResolver, packageResolver } = contexts.builderContext(config)
  const { name: packageName } = await packageResolver(packageId)

  await new DocumentGroupStrategy().execute({
    ...config,
    buildType: BUILD_TYPE.REDUCED_SOURCE_SPECIFICATIONS,
    // TODO by the apitype
    format: EXPORT_FORMAT_TO_FILE_FORMAT.get(format)!,
  }, buildResult, contexts)

  const createExportDocument = getExportDocumentFactory(apiType)
  const generatedHtmlExportDocuments: ExportDocument[] = []
  const transformedDocuments = await Promise.all([...buildResult.documents.values()].map(async document => {
    return createExportDocument(document, format, packageName, version, templateResolver, allowedOasExtensions, generatedHtmlExportDocuments)
  }))

  buildResult.exportDocuments.push(...transformedDocuments)

  if (format === FILE_FORMAT_HTML) {
    buildResult.exportDocuments.push(...await createCommonStaticExportDocuments(packageName, version, templateResolver))

    buildResult.exportDocuments.push(createUnknownExportDocument('index.html', await generateIndexHtmlPage(packageName, version, generatedHtmlExportDocuments, templateResolver)))
  }
}
// TODO move or edit
type ExportDocumentFactory = (
  document: { filename: string; data: unknown },
  format: ExportFormat,
  packageName: string,
  version: string,
  templateResolver: _TemplateResolver,
  allowedOasExtensions: OpenApiExtensionKey[] | undefined,
  generatedHtmlExportDocuments: ExportDocument[],
) => Promise<ExportDocument>

function getExportDocumentFactory(apiType: OperationsApiType | undefined): ExportDocumentFactory {
  switch (apiType) {
    case GRAPHQL_API_TYPE:
      return (doc, format, packageName, version, templateResolver, _allowedOasExtensions, generatedHtmlExportDocuments) =>
        createGraphQLExportDocument(doc.filename, doc.data as string, format, packageName, version, templateResolver, generatedHtmlExportDocuments)
    case REST_API_TYPE:
    default:
      return (doc, format, packageName, version, templateResolver, allowedOasExtensions, generatedHtmlExportDocuments) =>
        createRestExportDocument(doc.filename, JSON.stringify(doc.data), format, packageName, version, templateResolver, allowedOasExtensions, generatedHtmlExportDocuments)
  }
}
