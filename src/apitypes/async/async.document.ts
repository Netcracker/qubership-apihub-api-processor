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
  _TemplateResolver,
  DocumentBuilder,
  DocumentDumper,
  ExportDocument,
  ExportFormat,
  VersionDocument,
} from '../../types'
import { FILE_FORMAT, FILE_FORMAT_HTML } from '../../consts'
import {
  createBundlingErrorHandler,
  createVersionInternalDocument,
  EXPORT_FORMAT_TO_FILE_FORMAT,
  getBundledFileDataWithDependencies,
  getDocumentTitle,
  isObject,
} from '../../utils'
import { dump } from '../../utils/apihubSpecificationExtensions'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import { AsyncDocumentInfo } from './async.types'
import { getApiKindProperty } from '../../components/document'
import { OpenApiExtensionKey } from '@netcracker/qubership-apihub-api-unifier'
import { removeOasExtensions } from '../../utils/removeOasExtensions'
import { generateHtmlPage } from '../../utils/export'

// TODO ExternalDocs and Tags have refs support in AsyncAPI, need to handle them properly
const asyncApiDocumentMeta = (data: AsyncAPIV3.AsyncAPIObject): AsyncDocumentInfo => {
  if (!isObject(data)) {
    return { title: '', description: '', version: '', info: {}, externalDocs: {}, tags: [] }
  }

  const { title = '', version = '', description = '', externalDocs = {}, tags = [] } = data?.info || {}

  const getStringValue = (value: unknown): string => (typeof (<unknown>value) === 'string' ? <string>value : '')

  const info: Partial<AsyncAPIV3.InfoObject> = { ...data?.info }
  delete info?.title
  delete info?.description
  delete info?.version
  delete info?.externalDocs
  delete info?.tags

  return {
    title: getStringValue(title),
    description: getStringValue(description),
    version: getStringValue(version),
    info: Object.keys(info).length ? info : undefined,
    externalDocs: externalDocs,
    tags: tags as AsyncAPIV3.TagObject[] ?? [],
  }
}

export const buildAsyncApiDocument: DocumentBuilder<AsyncAPIV3.AsyncAPIObject> = async (parsedFile, file, ctx): Promise<VersionDocument> => {
  const { fileId, slug = '', publish = true, apiKind, ...fileMetadata } = file

  const {
    data,
    dependencies,
  } = await getBundledFileDataWithDependencies(fileId, ctx.parsedFileResolver, createBundlingErrorHandler(ctx, fileId))

  const bundledFileData = data as AsyncAPIV3.AsyncAPIObject

  const documentApiKind = getApiKindProperty(bundledFileData?.info) || apiKind

  const { description, title, version, info, externalDocs, tags } = asyncApiDocumentMeta(bundledFileData)
  const metadata = {
    ...fileMetadata,
    info,
    externalDocs,
    tags,
  }
  const { type, fileId: parsedFileId, source, errors } = parsedFile
  return {
    fileId: parsedFileId,
    type,
    format: FILE_FORMAT.JSON,
    apiKind: documentApiKind,
    data: bundledFileData,
    slug, // unique slug should be already generated
    filename: `${slug}.${FILE_FORMAT.JSON}`,
    title: title || getDocumentTitle(fileId),
    operationIds: [],
    dependencies,
    description,
    version,
    metadata,
    publish,
    source,
    errors: errors?.length ?? 0,
    versionInternalDocument: createVersionInternalDocument(slug),
  }
}

export const dumpAsyncApiDocument: DocumentDumper<AsyncAPIV3.AsyncAPIObject> = (document, format) => {
  return new Blob(...dump(document.data, format ?? FILE_FORMAT.JSON))
}

// TODO support export
export async function createAsyncExportDocument(
  filename: string,
  data: string,
  format: ExportFormat,
  packageName: string,
  version: string,
  templateResolver: _TemplateResolver,
  allowedOasExtensions?: OpenApiExtensionKey[],
  generatedHtmlExportDocuments?: ExportDocument[],
): Promise<ExportDocument> {
  const exportFilename = `${getDocumentTitle(filename)}.${format}`
  const [[document], blobProperties] = dump(removeOasExtensions(JSON.parse(data), allowedOasExtensions), EXPORT_FORMAT_TO_FILE_FORMAT.get(format)!)

  if (format === FILE_FORMAT_HTML) {
    const htmlExportDocument = {
      data: await generateHtmlPage(
        document,
        getDocumentTitle(filename),
        packageName,
        version,
        templateResolver,
      ),
      filename: exportFilename,
    }
    generatedHtmlExportDocuments?.push(htmlExportDocument)
    return htmlExportDocument
  }

  return {
    data: new Blob([document], blobProperties),
    filename: exportFilename,
  }
}
