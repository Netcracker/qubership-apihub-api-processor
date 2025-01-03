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

import { OpenAPIV3 } from 'openapi-types'
import { CustomTags } from './rest.types'
import { API_AUDIENCE_EXTERNAL, API_AUDIENCE_INTERNAL, API_AUDIENCE_UNKNOWN, ApiAudience } from '../../types'
import { isObject } from '@netcracker/qubership-apihub-json-crawl'
import { CUSTOM_PARAMETER_API_AUDIENCE } from '../../consts'

export const getOperationBasePath = (servers?: OpenAPIV3.ServerObject[]): string => {
  if (!Array.isArray(servers) || !servers.length) { return '' }

  try {
    const [firstServer] = servers
    let serverUrl = firstServer.url
    const { variables = {} } = firstServer

    for (const param of Object.keys(variables)) {
      serverUrl = serverUrl.replace(new RegExp(`{${param}}`, 'g'), variables[param].default)
    }

    const { pathname } = new URL(serverUrl, 'https://localhost')
    return pathname.slice(-1) === '/' ? pathname.slice(0, -1) : pathname
  } catch (error) {
    return ''
  }
}

export function getCustomTags(data: object): CustomTags {
  const initialValue: CustomTags = {}
  if (!data || typeof data !== 'object') {
    return initialValue
  }

  return Object.entries(data)
    .filter(([key]) => key.startsWith('x-'))
    .reduce((acc, [key, value]) => {
      acc[key] = value

      return acc
    }, { ...initialValue })
}

export const resolveApiAudience = (info: unknown): ApiAudience => {
  if (!isObject(info)) {
    return API_AUDIENCE_EXTERNAL
  }
  if (!(CUSTOM_PARAMETER_API_AUDIENCE in info)) {
    return API_AUDIENCE_EXTERNAL
  }
  let apiAudience = Object.entries(info).find(([key, _]) => key === CUSTOM_PARAMETER_API_AUDIENCE)!.pop() as ApiAudience
  apiAudience = [API_AUDIENCE_INTERNAL, API_AUDIENCE_EXTERNAL].includes(apiAudience) ? apiAudience : API_AUDIENCE_UNKNOWN
  return apiAudience
}
