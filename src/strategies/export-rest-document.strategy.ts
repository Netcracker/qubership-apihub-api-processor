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
  ExportRestDocumentBuildConfig,
  FileFormat,
  VersionDocument,
} from '../types'
import { REST_DOCUMENT_TYPE } from '../apitypes'
import { getDocumentTitle } from '../utils'
import { OpenApiExtensionKey } from '@netcracker/qubership-apihub-api-unifier'
import { removeOasExtensions } from '../utils/removeOasExtensions'

async function getTransformedDocument(documentId: string, format: FileFormat, file: File, allowedOasExtensions?: OpenApiExtensionKey[]): Promise<VersionDocument> {
  const sourceString = await file.text()

  return {
    // todo make data optional
    data: removeOasExtensions(JSON.parse(sourceString), allowedOasExtensions),
    fileId: file.name,
    type: REST_DOCUMENT_TYPE.OAS3, // todo one of REST_DOCUMENT_TYPE
    format,
    slug: documentId,
    title: getDocumentTitle(file.name),
    dependencies: [],
    description: '',
    operationIds: [],
    publish: true,
    // filename: file.name,
    filename: file.name,
    metadata: {},
    source: file,
  }
}

export class ExportRestDocumentStrategy implements BuilderStrategy {
  async execute(config: ExportRestDocumentBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    const { builderContext } = contexts
    const builderContextObject = builderContext(config)
    const { packageId, version, documentId, format, allowedOasExtensions } = config

    const file = await builderContextObject.rawDocumentResolver?.(
      version,
      packageId,
      documentId, //document.slug,
    )

    if (!file) {
      throw new Error(`File ${documentId} is missing`)
    }

    // buildResult.documents.set(document.fileId, getTransformedDocument(document, format, file))
    // todo handle HTML format
    // @ts-ignore
    buildResult.exportDocuments.push(await getTransformedDocument(documentId, format, file, allowedOasExtensions))
    buildResult.exportFileName = `${packageId}_${version}_${getDocumentTitle(file.name)}.${format}`

    return buildResult
  }
}
