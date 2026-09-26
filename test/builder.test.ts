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

import { jest } from '@jest/globals'
import { BUILD_TYPE, VERSION_STATUS } from '../src'
import { ANY_REST_CHANGE, contentEditor, documentOf, Editor, LocalRegistry, publishChangeFromContent } from './helpers'

const apiAudiencePackage = LocalRegistry.openPackage('api-audience')

describe('Editor scenarios', () => {
  describe('Update version', () => {
    test('clean cache and change version', async () => {
      const packageId = 'update-version/clean-cache'
      const registry = await publishChangeFromContent(packageId, ANY_REST_CHANGE)
      // the editor takes the registry's resolvers when it is created, so the spy has to be there first
      const resolveVersion = jest.spyOn(registry, 'versionResolver')
      const editor = contentEditor(
        { packageId, version: 'v3', previousVersion: 'v1', buildType: BUILD_TYPE.BUILD },
        { 'after.yaml': ANY_REST_CHANGE.after },
        registry,
      )
      const result = await editor.run({ version: 'v3' })
      resolveVersion.mockClear()

      // a changed file makes the update compare again; the previous version comes from the version cache unless
      // the update cleans it
      const resultUpdate = await editor.update(
        { version: 'v4' },
        ['after.yaml'],
        { cleanCache: true },
      )

      expect(resolveVersion).toHaveBeenCalledWith(packageId, 'v1', true)
      const expectConfig = {
        ...result.config,
        version: 'v4',
      }
      // checks only the keys the updated config keeps
      expect(expectConfig).toMatchObject(resultUpdate.config)
    })
  })

  describe('APIHUB: path with parameters', () => {
    test('build result should include only rest operations with inlined parameters', async () => {
      const editor = await Editor.openProject('apihub')
      const result = await editor.run({ version: 'v1' })

      const operations = [...result.operations.values()]

      expect(operations.some(({ operationId }) => operationId.endsWith('-parameters'))).toEqual(false)
      expect(operations.every(({ title }) => title)).toEqual(true)
      expect(operations.every(({ search }) => search && search.useOperationDataAsSearchText !== undefined)).toEqual(true)
    })

    test('document has info and externalDocs', async () => {
      const editor = await Editor.openProject('apihub')
      const result = await editor.run({
        version: 'v1',
        files: [
          {
            fileId: 'docs/API-HUB_09.03.22.yaml',
            publish: true,
            labels: [
              '123',
            ],
            commitId: 'k123jkqlwe1',
          },
          {
            fileId: 'OpenApi 3.1.yaml',
            publish: true,
            labels: [
              '444',
            ],
            commitId: 'k123jkqlwe2',
          },
          {
            fileId: 'Swagger 2.0.yaml',
            publish: true,
            labels: [
              '4444',
            ],
            commitId: 'k123jkqlwe25',
          },
        ],
      })

      const document = documentOf(result, 'docs/API-HUB_09.03.22.yaml')
      expect(document.title).toBeDefined()
      expect(document.description).toBeDefined()
      expect(document.version).toBeDefined()
      expect((document.metadata as any).info).toBeDefined()
      expect((document.metadata as any).externalDocs).toBeDefined()
    })
  })

  describe('AGENT test cases', () => {
    test('build result should include only rest operations with inlined parameters', async () => {
      const editor = await Editor.openProject('agent')
      const result = await editor.run({ version: 'v1' })

      const documents = [...result.documents.values()]
      const operations = [...result.operations.values()]

      expect(documents.every(({ slug }) => slug)).toEqual(true)
      expect(operations.every(({ title }) => title)).toEqual(true)
      expect(operations.every(({ search }) => search && search.useOperationDataAsSearchText !== undefined)).toEqual(true)
    })
  })

  describe('api audience test', () => {
    test('comparison must have two type of api audience transition with 3 operations', async () => {
      await apiAudiencePackage.publish('api-audience', {
        packageId: 'api-audience',
        version: 'v1',
        files: [{ fileId: 'spec-1-v1.yaml' }, { fileId: 'spec-2-v1.yaml' }],
      })
      await apiAudiencePackage.publish('api-audience', {
        packageId: 'api-audience',
        version: 'v2',
        previousVersion: 'v1',
        files: [{ fileId: 'spec-1-v2.yaml' }, { fileId: 'spec-2-v2.yaml' }],
      })

      const editor = new Editor('api-audience', {
        packageId: 'api-audience',
        version: 'v2',
        previousVersion: 'v1',
        status: VERSION_STATUS.RELEASE,
        files: [{ fileId: 'spec-1-v2.yaml' }, { fileId: 'spec-2-v2.yaml' }],
        buildType: BUILD_TYPE.BUILD,
      }, {}, apiAudiencePackage)

      const result = await editor.run()
      const [{ operationTypes: [{ apiAudienceTransitions }] }] = result.comparisons
      expect(apiAudienceTransitions.length).toBe(2)
      const [firstTransition, secondTransition] = apiAudienceTransitions
      expect(firstTransition).toEqual({
        currentAudience: 'internal',
        previousAudience: 'external',
        operationsCount: 3,
      })
      expect(secondTransition).toEqual({
        currentAudience: 'external',
        previousAudience: 'unknown',
        operationsCount: 3,
      })
    })
  })

  describe('PathItems build', () => {
    const COMPONENTS_ITEM_1_PATH = ['components', 'pathItems', 'componentsPathItem1']
    test('should have separate operations with pathitems', async () => {
      // This fixture carries no config.json, so the build config lives here.
      const files = [{ fileId: '1.yaml' }]
      const pkg = LocalRegistry.openPackage('builder/define-pathitems-via-reference-object-chain')
      const editor = await Editor.openProject(pkg.packageId, pkg)

      await pkg.publish(pkg.packageId, { packageId: pkg.packageId, version: 'v1', files })
      const result = await editor.run({
        version: 'v1',
        status: VERSION_STATUS.RELEASE,
        buildType: BUILD_TYPE.BUILD,
        files,
      })

      const resultOperations = Array.from(result.operations.values())
      expect(resultOperations.length).toEqual(2)

      const [postOperation, getOperation] = resultOperations
      // check that we have only path operation in componentsPathItem1 for path1-post
      expect(postOperation.operationId).toEqual('path1-post')
      expect(postOperation.data).toHaveProperty([...COMPONENTS_ITEM_1_PATH, 'post'])
      expect(postOperation.data).not.toHaveProperty([...COMPONENTS_ITEM_1_PATH, 'get'])

      // check that we have only get operation in componentsPathItem1 for path1-get
      expect(getOperation.operationId).toEqual('path1-get')
      expect(getOperation.data).not.toHaveProperty([...COMPONENTS_ITEM_1_PATH, 'post'])
      expect(getOperation.data).toHaveProperty([...COMPONENTS_ITEM_1_PATH, 'get'])
    })
  })
})
