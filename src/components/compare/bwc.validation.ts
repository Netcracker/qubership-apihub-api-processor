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
import { REST_KIND_KEY } from '../../apitypes'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import { ApiCompatibilityKind, BwcState } from '@netcracker/qubership-apihub-api-diff'

const getKind = (obj: unknown): string | undefined => {
  if (!isObject(obj)) return undefined
  const value = (obj as Record<string, unknown>)[REST_KIND_KEY]
  return typeof value === 'string' ? value.toLowerCase() : undefined
}

const hasNoBWC = (obj: unknown): boolean => {
  return getKind(obj) === API_KIND.NO_BWC
}

const hasNoBWCInMethods = (obj: unknown): boolean => {
  if (!isObject(obj)) return false

  if (hasNoBWC(obj)) return true

  return Object.entries(obj).some(([key, value]) =>
    isValidHttpMethod(key) &&
    isObject(value) &&
    hasNoBWC(value),
  )
}

const isValidPathLength = (path: JsonPath | undefined): boolean => {
  const pathLength = path?.length ?? 0
  return pathLength >= 1 && pathLength <= 3
}

export const checkNoApiBackwardCompatibility = (
  path?: JsonPath,
  beforeJson?: unknown,
  afterJson?: unknown,
): BwcState | undefined => {
  if (!isValidPathLength(path)) {
    return undefined
  }

  const beforeExists = isObject(beforeJson)
  const afterExists = isObject(afterJson)

  if (!beforeExists && !afterExists) {
    return undefined
  }

  if (beforeExists && afterExists) {
    return hasNoBWC(beforeJson) || hasNoBWC(afterJson)
      ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
      : undefined
  }

  if (beforeExists && !afterExists) {
    return hasNoBWCInMethods(beforeJson)
      ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
      : undefined
  }

  if (afterExists && !beforeExists) {
    return hasNoBWCInMethods(afterJson)
      ? ApiCompatibilityKind.NOT_BACKWARD_COMPATIBLE
      : undefined
  }

  return undefined
}
