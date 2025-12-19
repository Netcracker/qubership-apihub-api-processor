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

import { API_KIND } from '../../consts'
import { calculateNormalizedRestOperationId, isObject, isValidHttpMethod } from '../../utils'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import {
  ApiCompatibilityKind,
  ApiCompatibilityScope,
  ApiCompatibilityScopeFunction,
  extractOperationBasePath,
} from '@netcracker/qubership-apihub-api-diff'
import { OperationsMap } from './compare.utils'
import { OpenAPIV3 } from 'openapi-types'

const ROOT_PATH_LENGTH = 0
const PATHS_ROOT_LENGTH = 1
const PATH_ITEM_PATH_LENGTH = 2
const OPERATION_PATH_LENGTH = 3

const isNoBwc = (kind?: string): boolean =>
  kind?.toLowerCase() === API_KIND.NO_BWC

const getApiKindFromCache = (
  obj: object,
  hash: WeakMap<object, string>,
  operationsMap: OperationsMap,
): boolean => {
  const operationId = hash.get(obj)
  if (!operationId) {
    return false
  }
  const { previous, current } = operationsMap[operationId]
  const prevApiKind = previous?.apiKind === API_KIND.NO_BWC
  const currApiKind = current?.apiKind === API_KIND.NO_BWC

  return prevApiKind || currApiKind
}

const allOperationsAreNoBwc = (
  obj: unknown,
  hash: WeakMap<object, string>,
  operationsMap: OperationsMap,
): boolean => {
  if (!isObject(obj)) return false

  const entries = Object.entries(obj).filter(([key]) =>
    isValidHttpMethod(key as OpenAPIV3.HttpMethods),
  )

  if (entries.length === 0) {
    return false
  }

  return entries.every(([method, value]) => getApiKindFromCache(value as object, hash, operationsMap))
}

export const checkApiKind = (
  prevApiKind: string = API_KIND.BWC,
  currApiKind: string = API_KIND.BWC,
  prevDocData: OpenAPIV3.Document,
  currDocData: OpenAPIV3.Document,
  operationsMap: OperationsMap,
): ApiCompatibilityScopeFunction => {

  const defaultCompatibility =
    isNoBwc(prevApiKind) || isNoBwc(currApiKind)
      ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
      : undefined

  let prevOperationsIdHash = new WeakMap<object, string>()
  let currOperationsIdHash = new WeakMap<object, string>()

  return (
    path?: JsonPath,
    prevJson?: unknown,
    currJson?: unknown,
  ): ApiCompatibilityScope | undefined => {
    const pathLength = path?.length ?? 0

    // We are at the document root: apply only the global default compatibility.
    if (pathLength === ROOT_PATH_LENGTH) {
      return defaultCompatibility
    }

    const beforeExists = isObject(prevJson)
    const afterExists = isObject(currJson)

    if (!beforeExists && !afterExists) {
      return undefined
    }

    // We only process changes that are under the OpenAPI `paths` section.
    const isFirstPathSegmentPaths = path?.[0] === 'paths'
    if (!isFirstPathSegmentPaths) {
      return undefined
    }

    if (pathLength === PATHS_ROOT_LENGTH) {
      prevOperationsIdHash = calculateOperationsIdHash(prevJson as OpenAPIV3.Document, prevDocData?.servers)
      currOperationsIdHash = calculateOperationsIdHash(currJson as OpenAPIV3.Document, currDocData?.servers)
      return undefined
    }

    // Deleting or adding path items
    if (pathLength === PATH_ITEM_PATH_LENGTH && beforeExists !== afterExists) {
      /*
       * case remove: when a node disappears, api-diff emits REMOVE diffs for each
       * operation. We only mark the deletion as NO_BWC if all removed methods were
       * explicitly flagged NO_BWC, keeping deletions consistent with declared scope.
       */
      if (beforeExists && !afterExists) {
        return allOperationsAreNoBwc(prevJson, prevOperationsIdHash, operationsMap)
          ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
          : undefined
      }
      /*
       * case add: additions are checked the same way. A new path or operation is
       * considered NO_BWC only when every contained method declares NO_BWC.
       */
      if (afterExists && !beforeExists) {
        return allOperationsAreNoBwc(currJson, currOperationsIdHash, operationsMap)
          ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
          : undefined
      }

      return undefined
    }

    /*
    * The remaining NO_BWC markers can only be on operations.
    * Operation entry (paths/<path>/<method>), which is at most three segments deep
    * Anything deeper cannot legally carry BWC metadata, so we skip validation there.
     */
    if (pathLength !== OPERATION_PATH_LENGTH) {
      return undefined
    }

    const prevOperationId =
      beforeExists ? prevOperationsIdHash.get(prevJson) : undefined
    const currOperationId =
      afterExists ? currOperationsIdHash.get(currJson) : undefined

    const prevApiKind =
      prevOperationId
        ? operationsMap[prevOperationId]?.previous?.apiKind
        : undefined

    const currApiKind =
      currOperationId
        ? operationsMap[currOperationId]?.current?.apiKind
        : undefined

    return isNoBwc(prevApiKind) || isNoBwc(currApiKind)
      ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
      : undefined
  }
}

export function calculateOperationsIdHash(
  data: OpenAPIV3.Document,
  servers?: OpenAPIV3.ServerObject[],
): WeakMap<object, string> {

  const hash = new WeakMap<object, string>()

  if (!isObject(data)) {
    return hash
  }

  for (const path of Object.keys(data)) {
    const pathItem = data[path] as OpenAPIV3.PathItemObject
    if (!isObject(pathItem)) continue

    for (const method of Object.keys(pathItem)) {
      if (!isValidHttpMethod(method as OpenAPIV3.HttpMethods)) continue

      const operation = pathItem[method as OpenAPIV3.HttpMethods]
      if (!isObject(operation)) continue

      const basePath = extractOperationBasePath(
        operation.servers ?? pathItem.servers ?? servers,
      )

      hash.set(
        operation,
        calculateNormalizedRestOperationId(
          basePath,
          path,
          method as OpenAPIV3.HttpMethods,
        ),
      )
    }
  }

  return hash
}
