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

import { GraphApiOperation } from '@netcracker/qubership-apihub-graphapi'

const extractTypeName = (typeDef: unknown): string | undefined => {
  if (!typeDef || typeof typeDef !== 'object') { return undefined }
  const ref = (typeDef as Record<string, unknown>).$ref
  if (typeof ref !== 'string') { return undefined }
  const segments = ref.split('/')
  return segments[segments.length - 1]
}

export const buildGraphQLSearchText = (
  method: string,
  operation: GraphApiOperation | undefined,
): string => {
  const parts: string[] = [method]

  if (operation?.description) {
    parts.push(operation.description)
  }

  if (operation?.args) {
    for (const [argName, arg] of Object.entries(operation.args)) {
      parts.push(argName)
      const typeName = extractTypeName(arg.typeDef)
      if (typeName) {
        parts.push(typeName)
      }
    }
  }

  const returnTypeName = extractTypeName(operation?.output?.typeDef)
  if (returnTypeName) {
    parts.push(returnTypeName)
  }

  return parts.join(' ')
}
