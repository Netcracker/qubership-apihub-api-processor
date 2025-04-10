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

import type { OpenAPIV2, OpenAPIV3 } from 'openapi-types'
import { convertObj } from 'swagger2openapi'

import { REST_DOCUMENT_TYPE, REST_KIND_KEY } from './rest.consts'
import type { RestDocumentInfo } from './rest.types'

import { DocumentBuilder, DocumentDumper, YAML_EXPORT_GROUP_FORMAT } from '../../types'
import { FILE_FORMAT } from '../../consts'
import { createBundlingErrorHandler, getBundledFileDataWithDependencies, getDocumentTitle } from '../../utils'
import YAML from 'js-yaml'

const openApiDocumentMeta = (data: OpenAPIV3.Document): RestDocumentInfo => {
  if (typeof data !== 'object' || !data) {
    return { title: '', description: '', version: '', info: {}, externalDocs: {}, tags: [] }
  }

  const { title = '', version = '', description = '' } = data?.info || {}

  const getStringValue = (value: unknown): string => (typeof (<unknown>value) === 'string' ? <string>value : '')

  const info: Partial<OpenAPIV3.InfoObject> = { ...data?.info }
  delete info?.title
  delete info?.description
  delete info?.version

  return {
    title: getStringValue(title),
    description: getStringValue(description),
    version: getStringValue(version),
    info: Object.keys(info).length ? info : undefined,
    externalDocs: data?.externalDocs,
    tags: data?.tags ?? [],
  }
}

export const buildRestDocument: DocumentBuilder<OpenAPIV3.Document> = async (parsedFile, file, ctx) => {
  const { fileId, slug = '', publish = true, apiKind, ...fileMetadata } = file

  const {
    data,
    dependencies,
  } = await getBundledFileDataWithDependencies(fileId, ctx.parsedFileResolver, createBundlingErrorHandler(ctx, fileId))

  let bundledFileData = data

  const documentKind = bundledFileData?.info?.[REST_KIND_KEY] || apiKind

  if (parsedFile.type === REST_DOCUMENT_TYPE.SWAGGER) {
    try {
      const { openapi } = await convertObj(<OpenAPIV2.Document>bundledFileData, { patch: true })
      bundledFileData = openapi
    } catch (e) {
      throw new Error(`Cannot transform document '${slug}' from swagger to openapi 3.0`)
    }
  }

  const { description, title, version, info, externalDocs, tags } = openApiDocumentMeta(bundledFileData)
  const metadata = {
    ...fileMetadata,
    info,
    externalDocs,
    tags,
  }

  return {
    fileId: parsedFile.fileId,
    type: parsedFile.type,
    format: FILE_FORMAT.JSON,
    apiKind: documentKind,
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
    source: parsedFile.source,
    errors: parsedFile.errors?.length ?? 0,
  }
}

export const dumpRestDocument: DocumentDumper<OpenAPIV3.Document> = (document, format) => {
  if (format === YAML_EXPORT_GROUP_FORMAT) {
    return new Blob([YAML.dump(document.data)], { type: 'application/yaml' })
  }
  return new Blob([JSON.stringify(document.data, undefined, 2)], { type: 'application/json' })
}
