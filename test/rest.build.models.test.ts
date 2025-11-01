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

import { Editor } from './helpers'
import { describe, test, expect } from '@jest/globals'

describe('REST build models population', () => {
  test('Schemas with the same name but different content should yield different hashes in models object for operations', async () => {
    const editor = await Editor.openProject('rest-build-models/same-name-different-content')
    const result = await editor.run({
      version: 'v1',
      files: [
        { fileId: 'spec1.yaml', publish: true },
        { fileId: 'spec2.yaml', publish: true },
      ],
    })

    // Get operations from both specs
    const operation1 = result.operations.get('api-users-get')
    const operation2 = result.operations.get('api-products-get')

    // Both operations should exist
    expect(operation1).toBeDefined()
    expect(operation2).toBeDefined()

    // Both should have models with the Person schema
    expect(operation1?.models).toHaveProperty('Person')
    expect(operation2?.models).toHaveProperty('Person')

    // The hashes should be different because the Person schema content differs
    const hash1 = operation1?.models?.['Person']
    const hash2 = operation2?.models?.['Person']
    expect(hash1).toBeDefined()
    expect(hash2).toBeDefined()
    expect(hash1).not.toEqual(hash2)
  })

  test('Schemas with the same name and the same content should yield the same hashes in models object for operations', async () => {
    const editor = await Editor.openProject('rest-build-models/same-name-same-content')
    const result = await editor.run({
      version: 'v1',
      files: [
        { fileId: 'spec1.yaml', publish: true },
        { fileId: 'spec2.yaml', publish: true },
      ],
    })

    // Get operations from both specs
    const operation1 = result.operations.get('api-users-get')
    const operation2 = result.operations.get('api-products-get')

    // Both operations should exist
    expect(operation1).toBeDefined()
    expect(operation2).toBeDefined()

    // Both should have models with the Person schema
    expect(operation1?.models).toHaveProperty('Person')
    expect(operation2?.models).toHaveProperty('Person')

    // The hashes should be the same because the Person schema content is identical
    const hash1 = operation1?.models?.['Person']
    const hash2 = operation2?.models?.['Person']
    expect(hash1).toBeDefined()
    expect(hash2).toBeDefined()
    expect(hash1).toEqual(hash2)
  })
})

