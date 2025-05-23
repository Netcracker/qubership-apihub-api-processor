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
  ExportVersionBuildConfig,
  FileFormat,
  JSON_EXPORT_GROUP_FORMAT,
  ResolvedVersionDocument,
  VersionDocument,
} from '../types'
import { getDocumentTitle } from '../utils'
import { removeOasExtensions } from '../utils/removeOasExtensions'
import { OpenApiExtensionKey } from '@netcracker/qubership-apihub-api-unifier'

async function getTransformedDocument(document: ResolvedVersionDocument, format: FileFormat, source: Blob, allowedOasExtensions?: OpenApiExtensionKey[]): Promise<VersionDocument> {
  const { fileId, type, slug } = document

  const versionDocumentBase = {
    fileId,
    type,
    format,
    slug,
    title: getDocumentTitle(fileId),
    dependencies: [],
    description: '',
    operationIds: [],
    publish: true,
    filename: `${getDocumentTitle(fileId)}.${format}`,
    metadata: {},
    source,
  }

  if (source.type.startsWith('text/plain')) {
    const sourceString = JSON.parse(await source.text())
    return {
      ...versionDocumentBase,
      data: removeOasExtensions(JSON.parse(sourceString), allowedOasExtensions),
    }
  }
  if (source.type.startsWith('application/octet-stream')) {
    return {
      ...versionDocumentBase,
      data: '',
    }
  }
  throw new Error(`File media type ${source.type} is not supported`)
}

export class ExportVersionStrategy implements BuilderStrategy {
  async execute(config: ExportVersionBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    const { builderContext } = contexts
    const builderContextObject = builderContext(config)
    const { packageId, version, format = JSON_EXPORT_GROUP_FORMAT, allowedOasExtensions } = config

    const { documents } = await builderContextObject.versionDocumentsResolver(
      version,
      packageId,
    ) ?? { documents: [] }

    for (const document of documents) {
      const file = await builderContextObject.rawDocumentResolver?.(
        version,
        packageId,
        document.slug,
      )

      if (!file) {
        throw new Error(`File ${document.fileId} is missing`)
      }

      // todo handle HTML format
      // @ts-ignore
      buildResult.exportDocuments.push(await getTransformedDocument(document, format, file, allowedOasExtensions))
    }

    buildResult.exportFileName = `${packageId}_${version}.zip`
    return buildResult
  }
}
