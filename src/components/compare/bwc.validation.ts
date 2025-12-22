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
import { isObject, isValidHttpMethod } from '../../utils'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import {
  ApiCompatibilityKind,
  ApiCompatibilityScope,
  ApiCompatibilityScopeFunction,
} from '@netcracker/qubership-apihub-api-diff'
import { Labels } from '../../types'
import { findApiKindLabel, getApiKind } from '../document'
import { OpenAPIV3 } from 'openapi-types'

export const getApiCompatibilityKind = (beforeJson: unknown, afterJson: unknown): ApiCompatibilityKind | undefined => {
  const beforeApiKind = getApiKind(beforeJson)?.toLowerCase() ?? ''
  const afterApiKind = getApiKind(afterJson)?.toLowerCase() ?? ''

  if (beforeApiKind === API_KIND.NO_BWC || afterApiKind === API_KIND.NO_BWC) {
    return ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
  }

  if (beforeApiKind === API_KIND.BWC || afterApiKind === API_KIND.BWC) {
    return ApiCompatibilityKind.BACKWARD_COMPATIBLE
  }

  return undefined
}

export const getMethodsApiCompatibilityKind = (obj: unknown): ApiCompatibilityKind | undefined => {
  if (checkAllMethodsHaveSameApiKind(obj, API_KIND.NO_BWC)) {
    return ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
  }

  if (checkAllMethodsHaveSameApiKind(obj, API_KIND.BWC)) {
    return ApiCompatibilityKind.BACKWARD_COMPATIBLE
  }

  return undefined
}

const hasApiKind = (obj: unknown, apiKind: string): boolean => {
  return getApiKind(obj) === apiKind
}

// If a path object is removed/added, we must ensure every HTTP method under it
// is explicitly marked NO_BWC before treating the change as risky.
const checkAllMethodsHaveSameApiKind = (obj: unknown, apiKind: string): boolean => {
  if (!isObject(obj)) {
    return false
  }

  if (hasApiKind(obj, apiKind)) {
    return true
  }
  const entries = Object.entries(obj)

  return entries.length > 0 &&
    entries.every(([key, value]) =>
      isValidHttpMethod(key) &&
      isObject(value) &&
      hasApiKind(value, apiKind),
    )
}

const ROOT_PATH_LENGTH = 0
const PATH_ITEM_PATH_LENGTH = 2
const MAX_BWC_FLAG_PATH_LENGTH = 3

export const checkApiKind = (
  prevApiKind: string = API_KIND.BWC,
  currApiKind: string = API_KIND.BWC,
): ApiCompatibilityScopeFunction => {
  const defaultApiCompatibilityKind = (prevApiKind === API_KIND.NO_BWC || currApiKind === API_KIND.NO_BWC)
    ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
    : undefined

  return (
    path?: JsonPath,
    beforeJson?: unknown,
    afterJson?: unknown,
  ): ApiCompatibilityScope | undefined => {
    const pathLength = path?.length ?? 0
    /*
     * Calculating Api Kind for the entire document as the default
     * If there is a NO_BWC marker on:
     * - Publish label
     * - Document API info section
     */
    if (pathLength === ROOT_PATH_LENGTH) {
      return defaultApiCompatibilityKind
    }
    /*
    * We check paths at level 2: paths/<path> and operation level 3: paths/<path>/<method>
    * Level 2: When an entire path item is deleted/added
    * Level 3: When individual operations are deleted/added
     */
    const isFirstPathSegmentPaths = path?.[0] === 'paths'
    if (!isFirstPathSegmentPaths || pathLength < PATH_ITEM_PATH_LENGTH || pathLength > MAX_BWC_FLAG_PATH_LENGTH) {
      return undefined
    }

    const beforeExists = isObject(beforeJson)
    const afterExists = isObject(afterJson)

    if (!beforeExists && !afterExists) {
      return undefined
    }

    if (beforeExists && afterExists) {
      return getApiCompatibilityKind(beforeJson, afterJson)
    }

    // case remove: when a node disappears, api-diff emits REMOVE diffs for each
    // operation. We only mark the deletion as NO_BWC if all removed methods were
    // explicitly flagged NO_BWC, keeping deletions consistent with declared scope.
    if (beforeExists && !afterExists) {
      return getMethodsApiCompatibilityKind(beforeJson)
    }

    // case add: additions are checked the same way. A new path or operation is
    // considered NO_BWC only when every contained method declares NO_BWC.
    if (afterExists && !beforeExists) {
      return getMethodsApiCompatibilityKind(afterJson)
    }

    return undefined
  }
}

export const getApiKindFormLabels = (
  info?: OpenAPIV3.InfoObject,
  fileLabels?: Labels,
  versionLabels?: Labels,
): string | undefined => {
  const infoApiKind = getApiKind(info)
  if (infoApiKind) {
    return infoApiKind.toLowerCase()
  }

  const apiKind = findApiKindLabel(fileLabels, versionLabels)
  return apiKind?.toLowerCase()
}
