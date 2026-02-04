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

import { buildPackage } from './helpers'

describe('AsyncAPI 3.0 Deprecated tests', () => {

  test('channel', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/channel')
    const deprecatedItems = Array.from(result.operations.values()).flatMap(operation => operation.deprecatedItems)

    expect(deprecatedItems.length).toBeGreaterThan(0)
    expect(deprecatedItems[0]).toHaveProperty(['description'], '[Deprecated] channel \'userSignedUp\'')
  })
  test('messages', async ()=> {
    const result = await buildPackage('asyncapi/deprecated/messages')
    const deprecatedItems = Array.from(result.operations.values()).flatMap(operation => operation.deprecatedItems)

    expect(deprecatedItems.length).toBeGreaterThan(0)
    expect(deprecatedItems[0]).toHaveProperty(['description'], '[Deprecated] channel \'User Signed Up\'')
  })

    // todo need tests for deprecated schemas inside message payloads
    // todo need tests for 'description' field in DeprecateItem
})
