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
  FileFormat,
  ReducedSourceSpecificationsBuildConfig,
  ResolvedGroupDocument,
  ResolvedReferenceMap,
  VersionDocument,
} from '../types'
import { REST_API_TYPE } from '../apitypes'
import {
  EXPORT_FORMAT_TO_FILE_FORMAT,
  fromBase64,
  getParentValueByRef,
  getValueByRefAndUpdate,
  removeFirstSlash,
  slugify,
  toVersionDocument,
} from '../utils'
import { OpenAPIV3 } from 'openapi-types'
import { getOperationBasePath } from '../apitypes/rest/rest.utils'
import { VersionRestDocument } from '../apitypes/rest/rest.types'
import { FILE_FORMAT_JSON, INLINE_REFS_FLAG, NORMALIZE_OPTIONS } from '../consts'
import { normalize } from '@netcracker/qubership-apihub-api-unifier'
import { calculateSpecRefs, extractCommonPathItemProperties } from '../apitypes/rest/rest.operation'

function getTransformedDocument(document: ResolvedGroupDocument, format: FileFormat, packages: ResolvedReferenceMap): VersionRestDocument {
  const versionDocument = toVersionDocument(document, format)

  const sourceDocument = extractDocumentData(versionDocument)
  versionDocument.data = transformDocumentData(versionDocument)
  const normalizedDocument = normalizeOpenApi(versionDocument.data, sourceDocument)
  versionDocument.publish = true

  calculateSpecRefs(sourceDocument, normalizedDocument, versionDocument.data)

  // dashboard case
  if (document.packageRef) {
    const { refId } = packages[document.packageRef]
    versionDocument.fileId = `${refId}_${versionDocument.fileId}`
    versionDocument.filename = `${refId}_${versionDocument.filename}`
  }

  return versionDocument
}

export class DocumentGroupStrategy implements BuilderStrategy {
  async execute(config: ReducedSourceSpecificationsBuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    const { builderContext } = contexts
    const { packageId, version, groupName, apiType, format = FILE_FORMAT_JSON } = config

    if (!groupName) {
      throw new Error('No group to transform documents for provided')
    }

    if (apiType !== REST_API_TYPE) {
      throw new Error(`API type is not supported: ${apiType}`)
    }

    const documentFormat = EXPORT_FORMAT_TO_FILE_FORMAT.get(format)
    if (!documentFormat) {
      throw new Error(`Export format is not supported: ${format}`)
    }

    const builderContextObject = builderContext(config)

    const { documents, packages } = await builderContextObject.groupDocumentsResolver(
      REST_API_TYPE,
      version,
      packageId,
      groupName,
    ) ?? { documents: [], packages: {} }

    for (const document of documents) {
      const transformedDocument = getTransformedDocument(document, documentFormat, packages)
      buildResult.documents.set(transformedDocument.fileId, transformedDocument)
    }

    return buildResult
  }
}

function parseBase64String(value: string): unknown {
  return JSON.parse(fromBase64(value))
}

function extractDocumentData(versionDocument: VersionDocument): OpenAPIV3.Document {
  try {
    return parseBase64String(versionDocument.data) as OpenAPIV3.Document
  } catch (e) {
    throw new Error(`Cannot parse data of ${versionDocument.slug} from base64-encoded string`)
  }
}

function transformDocumentData(versionDocument: VersionDocument): OpenAPIV3.Document {
  const sourceDocument = extractDocumentData(versionDocument)
  const normalizedDocument = normalizeOpenApi(sourceDocument)
  const { paths: sourcePaths, components: sourceComponents, ...restOfSource } = sourceDocument
  const { paths: normalizedPaths } = normalizedDocument

  const resultDocument: OpenAPIV3.Document = {
    ...restOfSource,
    paths: {},
  }

  for (const path of Object.keys(normalizedPaths)) {
    const sourcePathItem = sourcePaths[path]
    const normalizedPathItem = normalizedPaths[path]

    if (!isNonNullObject(sourcePathItem) || !isNonNullObject(normalizedPathItem)) {
      continue
    }

    const commonProps = extractCommonPathItemProperties(sourcePathItem)

    for (const method of Object.keys(normalizedPathItem)) {
      const httpMethod = method as OpenAPIV3.HttpMethods
      if (!isValidHttpMethod(httpMethod)) continue

      const methodData = normalizedPathItem[httpMethod]
      const basePath = getOperationBasePath(
        methodData?.servers ||
        sourcePathItem?.servers ||
        sourceDocument?.servers ||
        [],
      )

      const operationPath = basePath + path
      const operationId = slugify(`${removeFirstSlash(operationPath)}-${method}`)

      if (!versionDocument.operationIds.includes(operationId)) {
        continue
      }

      const pathData = sourceDocument.paths[path]!
      if (sourcePathItem?.$ref) {
        handleRefPathItem(
          resultDocument,
          sourceDocument,
          path,
          pathData,
          httpMethod,
        )
      } else {
        handleInlinePathItem(
          resultDocument,
          path,
          pathData,
          httpMethod,
          commonProps,
        )
      }

      if (sourceComponents?.securitySchemes) {
        resultDocument.components = {
          ...resultDocument.components,
          securitySchemes: sourceComponents.securitySchemes,
        }
      }
    }
  }

  return resultDocument
}

function handleRefPathItem(
  resultDocument: OpenAPIV3.Document,
  sourceDocument: OpenAPIV3.Document,
  path: string,
  pathData: OpenAPIV3.PathItemObject | OpenAPIV3.ReferenceObject,
  method: OpenAPIV3.HttpMethods,
): void {
  const ref = pathData.$ref ?? ''
  const operationsFormResult = getParentValueByRef(ref, resultDocument)

  const clearedDocument = getValueByRefAndUpdate(ref, sourceDocument, (pathItemObject: OpenAPIV3.PathItemObject) => ({
    ...operationsFormResult,
    ...extractCommonPathItemProperties(pathItemObject),
    [method]: { ...pathItemObject[method] },
  }))

  resultDocument.paths[path] = pathData

  if (clearedDocument.components) {
    resultDocument.components = {
      ...resultDocument.components,
      ...clearedDocument.components,
    }
  }
}

function handleInlinePathItem(
  resultDoc: OpenAPIV3.Document,
  path: string,
  pathData: OpenAPIV3.PathItemObject,
  method: OpenAPIV3.HttpMethods,
  commonProps: Partial<OpenAPIV3.PathItemObject>,
): void {
  const existingPath = resultDoc.paths[path]

  resultDoc.paths[path] = {
    ...existingPath,
    ...commonProps,
    [method]: { ...pathData[method] },
  }
}

function normalizeOpenApi(document: OpenAPIV3.Document, source?: OpenAPIV3.Document): OpenAPIV3.Document {
  return normalize(
    document,
    {
      ...NORMALIZE_OPTIONS,
      inlineRefsFlag: INLINE_REFS_FLAG,
      ...(source ? { source } : {}),
    },
  ) as OpenAPIV3.Document
}

function isValidHttpMethod(method: string): method is OpenAPIV3.HttpMethods {
  return (Object.values(OpenAPIV3.HttpMethods) as string[]).includes(method)
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
