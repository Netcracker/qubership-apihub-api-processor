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
import { publishDocumentTypeCase } from './helpers'
import { DOCUMENT_TYPE } from '../src/consts'
import { REST_DOCUMENT_TYPE } from '../src/apitypes/rest/rest.consts'

// The per-type tables compare whole results, so they hold only if the helper reads both fields off a real build.
describe('publishDocumentTypeCase', () => {
  const openapi = '{"openapi": "3.0.0", "info": {"title": "t", "version": "1"}, "paths": {}}'

  test('should read the type of a document that built', async () => {
    const published = await publishDocumentTypeCase('helper', {
      name: 'built', fileId: 'spec.json', content: openapi, type: '', errored: false,
    })

    expect(published).toEqual({ type: REST_DOCUMENT_TYPE.OAS3, errored: false })
  }, 30000)

  test('should read the error flag of a document that did not parse', async () => {
    const published = await publishDocumentTypeCase('helper', {
      name: 'unparsable', fileId: 'spec.json', content: '{"title": ', type: '', errored: false,
    })

    expect(published).toEqual({ type: DOCUMENT_TYPE.UNKNOWN, errored: true })
  }, 30000)
})
