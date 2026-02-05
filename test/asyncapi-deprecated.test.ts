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
import { buildPackage, deprecatedItemDescriptionMatcher } from './helpers'

describe('AsyncAPI 3.0 Deprecated tests', () => {

  test('should detect deprecated channel', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/channel')
    const deprecatedItems = Array.from(result.operations.values()).flatMap(operation => operation.deprecatedItems ?? [])

    expect(deprecatedItems.length).toBeGreaterThan(0)
    expect(deprecatedItems[0]).toEqual(deprecatedItemDescriptionMatcher('[Deprecated] channel \'userSignedUp\''))
  })

  test('should detect deprecated messages', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/messages')
    const deprecatedItems = Array.from(result.operations.values()).flatMap(operation => operation.deprecatedItems ?? [])

    expect(deprecatedItems.length).toBeGreaterThan(0)
    expect(deprecatedItems[0]).toEqual(deprecatedItemDescriptionMatcher('[Deprecated] message \'User Signed Up\''))
  })

  test('should mark apihub operation is deprecated if message deprecated', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/messages')
    const operations = Array.from(result.operations.values())

    const [operation] = operations
    expect(operation.deprecated).toBe(true)
  })

  test('should detect deprecated schemas (deprecated flag in payload schema)', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/schemas')
    const deprecatedItems = Array.from(result.operations.values()).flatMap(operation => operation.deprecatedItems ?? [])
    expect(deprecatedItems.length).toBeGreaterThan(0)

    const [deprecatedItem] = deprecatedItems
    expect(deprecatedItem).toEqual(deprecatedItemDescriptionMatcher('[Deprecated] schema in \'components.schemas.DeprecatedEmail\''))

    expect(deprecatedItem).toHaveProperty('hash')
    expect(deprecatedItem).toHaveProperty('tolerantHash')

    expect(deprecatedItem.declarationJsonPaths.some(path => path.at(-1) === 'deprecated')).toBe(true)
  })

    // todo need tests for 'description' field in DeprecateItem
})
