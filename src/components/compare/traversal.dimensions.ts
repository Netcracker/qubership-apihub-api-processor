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
  breaking,
  DiffClassificationRule,
  DiffType,
  risky,
} from '@netcracker/qubership-apihub-api-diff'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import { ApihubApiCompatibilityKind, isNoBwcLike } from '../../consts'

/** Api kind a node was reached under. */
export const DIMENSION_API_KIND = 'apiKind'

/** Group of operations a removal of a long-deprecated element was reached from. */
export const DIMENSION_DEPRECATION = 'deprecation'

export type ApiKindValueAt = (
  path?: JsonPath,
  beforeJso?: unknown,
  afterJso?: unknown,
) => ApihubApiCompatibilityKind | undefined

export const apiKindClassificationRule: DiffClassificationRule = ({ type, dimensions }): DiffType | undefined => (
  type === breaking && isNoBwcLike(dimensions[DIMENSION_API_KIND] as ApihubApiCompatibilityKind | undefined)
    ? risky
    : undefined
)

