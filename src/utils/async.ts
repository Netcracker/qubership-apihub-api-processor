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
import { normalize } from '@netcracker/qubership-apihub-api-unifier'
import { INLINE_REFS_FLAG } from '../consts'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

export async function asyncFunction(fun: () => void): Promise<null> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        fun()
        resolve(null)
      } catch (error) {
        reject(error)
      }
    }),
  )
}

export function normalizeAsyncApi(sourceDocument: AsyncAPIV3.AsyncAPIObject): AsyncAPIV3.AsyncAPIObject {
  return normalize(
    sourceDocument,
    {
      mergeAllOf: false,
      inlineRefsFlag: INLINE_REFS_FLAG,
      source: sourceDocument,
    },
  ) as AsyncAPIV3.AsyncAPIObject
}
