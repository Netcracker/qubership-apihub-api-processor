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

import { GRAPHQL_API_TYPE } from '../apitypes'
import { createGraphQLExportDocument } from '../apitypes/graphql/graphql.document'
import { BUILD_TYPE, FILE_FORMAT_JSON } from '../consts'
import {
  BuilderStrategy,
  BuildResult,
  BuildTypeContexts,
  ExportDocument,
  ExportGraphQLOperationsGroupBuildConfig,
  TRANSFORMATION_KIND_REDUCED,
} from '../types'
import { EXPORT_API_TYPE_FORMATS, getSplittedVersionKey } from '../utils'
import { DocumentGroupStrategy } from './document-group.strategy'

export class ExportGraphQlOperationsGroupStrategy implements BuilderStrategy {
  async execute(
    config: ExportGraphQLOperationsGroupBuildConfig,
    buildResult: BuildResult,
    contexts: BuildTypeContexts,
  ): Promise<BuildResult> {
    const { apiType, operationsSpecTransformation } = config

    if (apiType !== GRAPHQL_API_TYPE) {
      throw new Error('This strategy is only supported for graphql apiType')
    }
    if (operationsSpecTransformation !== TRANSFORMATION_KIND_REDUCED) {
      throw new Error(
        'This transformation kind is not supported for graphql apiType',
      )
    }

    await exportReducedDocuments(config, buildResult, contexts)

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

async function exportReducedDocuments(
  config: ExportGraphQLOperationsGroupBuildConfig,
  buildResult: BuildResult,
  contexts: BuildTypeContexts,
): Promise<void> {
  const {
    packageId,
    version: versionWithRevision,
    format = GRAPHQL_API_TYPE,
    apiType,
  } = config
  const [version] = getSplittedVersionKey(versionWithRevision)
  const { templateResolver, packageResolver } = contexts.builderContext(config)
  const { name: packageName } = await packageResolver(packageId)

  const availableFormatsForApiType = EXPORT_API_TYPE_FORMATS.get(apiType)
  const documentFormat = availableFormatsForApiType?.get(format)
  if (!documentFormat) {
    throw new Error(`Export format is not supported: ${format}`)
  }

  await new DocumentGroupStrategy().execute(
    {
      ...config,
      buildType: BUILD_TYPE.REDUCED_SOURCE_SPECIFICATIONS,
      format: documentFormat,
    },
    buildResult,
    contexts,
  )

  const generatedHtmlExportDocuments: ExportDocument[] = []
  const transformedDocuments = await Promise.all([...buildResult.documents.values()].map(async document => {
    return createGraphQLExportDocument(
      document.filename,
      document.data as string,
      format,
      packageName,
      version,
      templateResolver,
      generatedHtmlExportDocuments,
    )
  }))

  buildResult.exportDocuments.push(...transformedDocuments)
}
