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

import { describe, expect, test } from '@jest/globals'
import { calculateRestOperationId, calculateNormalizedRestOperationId } from '../src/utils/operations.utils'

describe('Operation ID collisions', () => {
  describe('operationID and normalizedOperationId calculation', () => {
    const testData = [
      {
        name: 'empty path parameter name',
        basePath: '/v1',
        path: '/res/data/{}',
        method: 'post',
        operationId: 'v1-res-data-%7B%7D-post',
        normalizedOperationId: 'v1-res-data-%2A-post',
      },
      {
        name: 'double slash in path',
        basePath: '/v1',
        path: '/path/v1//path',
        method: 'get',
        operationId: 'v1-path-v1--path-get',
        normalizedOperationId: 'v1-path-v1--path-get',
      },
      {
        name: 'wildcard path with **',
        basePath: '/v1',
        path: '/path/**',
        method: 'get',
        operationId: 'v1-path-%2A%2A-get',
        normalizedOperationId: 'v1-path-%2A%2A-get',
      },
      {
        name: 'wildcard and path parameter combination',
        basePath: '/v1',
        path: '/path/*/{*id}',
        method: 'put',
        operationId: 'v1-path-%2A-%7B%2Aid%7D-put',
        normalizedOperationId: 'v1-path-%2A-%2A-put',
      },
      {
        name: 'standard path parameter',
        basePath: '/v1',
        path: '/path/{id}',
        method: 'delete',
        operationId: 'v1-path-%7Bid%7D-delete',
        normalizedOperationId: 'v1-path-%2A-delete',
      },
      {
        name: 'path parameter with trailing slash',
        basePath: '/v1',
        path: '/path/{id}/',
        method: 'patch',
        operationId: 'v1-path-%7Bid%7D--patch',
        normalizedOperationId: 'v1-path-%2A--patch',
      },
      {
        name: 'path parameter named entities',
        basePath: '/v1',
        path: '/api/provider/{entities}',
        method: 'get',
        operationId: 'v1-api-provider-%7Bentities%7D-get',
        normalizedOperationId: 'v1-api-provider-%2A-get',
      },
      {
        name: 'static path named entities',
        basePath: '/v1',
        path: '/api/provider/entities',
        method: 'get',
        operationId: 'v1-api-provider-entities-get',
        normalizedOperationId: 'v1-api-provider-entities-get',
      },
      {
        name: 'operation id is case sensitive',
        basePath: '/v1',
        path: '/getProvider',
        method: 'get',
        operationId: 'v1-getProvider-get',
        normalizedOperationId: 'v1-getProvider-get',
      },
    ]

    testData.forEach((data) => {
      test(`${data.name}`, () => {
        const actualOperationId = calculateRestOperationId(data.basePath, data.path, data.method)
        const actualNormalizedOperationId = calculateNormalizedRestOperationId(data.basePath, data.path, data.method)

        expect(actualOperationId).toBe(data.operationId)
        expect(actualNormalizedOperationId).toBe(data.normalizedOperationId)
      })
    })
  })
})
