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

import { APIHUB_API_COMPATIBILITY_KIND_BWC, isNoBwcLike } from '../../consts'
import {
  API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE,
  API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE,
} from '@netcracker/qubership-apihub-api-diff'
import { ApiCompatibilityScopeFunctionFactory } from './bwc.validation.types'

const ROOT_PATH_LENGTH = 0

/**
 * DDL backward-compatibility scope (D4 — analog of `createRestApiCompatibilityScopeFunction`).
 *
 * DDL apiKind is per **document** (D9 — sourced from file metadata; SQL has no native api-kind), so —
 * unlike REST, which has per-operation granularity — a single document-level scope at the realm root is
 * sufficient: a `no-bwc`/`experimental` document marks the whole realm NOT_BACKWARD_COMPATIBLE, which
 * softens every breaking change under it to risky (→ semi-breaking in the DTO). A `bwc` document keeps
 * the default backward-compatible classification.
 */
export const createDdlApiCompatibilityScopeFunction: ApiCompatibilityScopeFunctionFactory = (
  prevDocumentApiKind = APIHUB_API_COMPATIBILITY_KIND_BWC,
  currDocumentApiKind = APIHUB_API_COMPATIBILITY_KIND_BWC,
) => {
  const defaultApiCompatibilityKind = (isNoBwcLike(prevDocumentApiKind) || isNoBwcLike(currDocumentApiKind))
    ? API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE
    : API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE

  return (path) => {
    // mark the whole realm at the root; every node inherits this scope (undefined elsewhere)
    if ((path?.length ?? 0) === ROOT_PATH_LENGTH) {
      return defaultApiCompatibilityKind
    }
    return undefined
  }
}
