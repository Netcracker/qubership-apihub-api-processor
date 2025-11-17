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
  changesSummaryMatcher,
  Editor,
  LocalRegistry,
  notificationMatcher,
  notificationsMatcher,
  numberOfImpactedOperationsMatcher,
} from './helpers'
import { describe, expect, test } from '@jest/globals'
import { calculateRestOperationId, calculateNormalizedRestOperationId } from '../src/utils/operations.utils'
import { BUILD_TYPE, MESSAGE_SEVERITY, VERSION_STATUS } from '../src'

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

  describe('Path validation', () => {

    test('Should report error notification if path parameter name is empty', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/empty-path-parameter-name')

      const result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })

      expect(result).toEqual(notificationsMatcher([
        notificationMatcher(MESSAGE_SEVERITY.Error, 'Invalid path \'/res/data/{}\': path parameter name could not be empty'),
      ]))
    })

    test('Should throw error if there is a double slash in the path', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/double-slash-in-path')

      await expect(pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })).rejects.toThrow('Path \'/res//data\' contains double slash sequence')
    })

    test('Should build specification containing wildcard and param paths', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/path-wildcards')

      const result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json', publish: true },
        ],
      })

      expect(result.operations.size).toEqual(4)
    })

    test('Should build operations if there is a path parameter path collision', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/path-parameter-path-collision')

      const result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })

      expect(result.operations.size).toEqual(2)
    })
  })



  describe('Duplicated operationId in the same document', () => {
    test('Should throw error if duplicated operation is found within document', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-same-document')

      await expect(pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })).rejects.toThrow('Duplicated operationIds found:\n- operationId "api-v1-resource-get": found 2 operations: GET /api/v1/resource, GET /api-v1-resource')
    })

    test('Should throw error for duplication within document even if second document has same operationId', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-same-and-other-document')

      await expect(pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec1.json' },
          { fileId: 'spec2.json' },
        ],
      })).rejects.toThrow('Duplicated operationIds found:\n- operationId "api-v1-resource-get": found 2 operations: GET /api/v1/resource, GET /api-v1-resource')
    })

    test('Should detect all duplicate operationIds within document', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/several-duplicate-operationId-same-document')

      await expect(pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })).rejects.toThrow('Duplicated operationIds found:\n- operationId "api-v1-resource-get": found 2 operations: GET /api/v1/resource, GET /api-v1-resource\n- operationId "api-v1-user-post": found 2 operations: POST /api/v1/user, POST /api-v1-user')
    })

    test('Should detect three or more operations with same operationId', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-many-operations-same-document')

      await expect(pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec.json' },
        ],
      })).rejects.toThrow(
        'Duplicated operationIds found:\n- operationId "api-v1-resource-get": found 3 operations: GET /api/v1/resource, GET /api-v1-resource, GET /api/v1-resource',
      )
    })
  })

  describe('Duplicated operations in different documents', () => {

    test('Should report error notification if duplicated operation is found in different documents', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')

      const result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'spec1.json' },
          { fileId: 'spec2.json' },
        ],
      })

      expect(result).toEqual(notificationsMatcher([
        notificationMatcher(MESSAGE_SEVERITY.Error, 'Duplicated operationId \'res-data-post\' found in different documents: \'spec1\' and \'spec2\''),
      ]))
    })

    // Ideally we want to avoid situation when operationIds are duplicated across documents
    // and throw error when publishing such version.
    // We decided to move to this target gradually to avoid breaking existing published versions.
    // So, for now we want to be able to build changelog and other build results in this case.
    test('Should build changelog when duplicated operations exist across documents', async () => {
      const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents-changelog')

      const v1Result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v1',
        files: [
          { fileId: 'v1/spec1.json' },
          { fileId: 'v1/spec2.json' },
        ],
      })

      expect(v1Result).toEqual(notificationsMatcher([
        notificationMatcher(MESSAGE_SEVERITY.Error, 'Duplicated operationId \'res-data-post\' found in different documents: \'v1-spec1\' and \'v1-spec2\''),
      ]))

      const v2Result = await pkg.publish(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v2',
        files: [
          { fileId: 'v2/spec1.json' },
          { fileId: 'v2/spec2.json' },
        ],
      })

      expect(v2Result).toEqual(notificationsMatcher([
        notificationMatcher(MESSAGE_SEVERITY.Error, 'Duplicated operationId \'res-data-post\' found in different documents: \'v2-spec1\' and \'v2-spec2\''),
      ]))

      const editor = new Editor(pkg.packageId, {
        packageId: pkg.packageId,
        version: 'v2',
        previousVersion: 'v1',
        previousVersionPackageId: pkg.packageId,
        buildType: BUILD_TYPE.CHANGELOG,
        status: VERSION_STATUS.RELEASE,
      })

      const changelogResult = await editor.run()

      expect(changelogResult.notifications).toEqual([])
      expect(changelogResult).toEqual(changesSummaryMatcher({ annotation: 1 }))
      expect(changelogResult).toEqual(numberOfImpactedOperationsMatcher({ annotation: 1 }))
      expect(changelogResult.comparisons?.[0]?.data?.[0]?.diffs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          beforeValue: 's2v1 description',
          afterValue: 's2v2 description',
          action: 'replace',
          scope: 'response',
          type: 'annotation',
        }),
      ]))
    })
  })
})
