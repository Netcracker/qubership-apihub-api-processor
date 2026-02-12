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

import { beforeAll, describe, expect, it, test } from '@jest/globals'
import * as fs from 'fs/promises'
import * as path from 'path'
import YAML from 'js-yaml'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/cjs/spec-types'
import { createOperationSpec } from '../src/apitypes/async/async.operation'
import { calculateAsyncOperationId } from '../src/utils'
import { buildPackage, cloneDocument } from './helpers'
import { extractProtocol } from '../src/apitypes/async/async.utils'
import { INLINE_REFS_FLAG } from '../src/consts'

// Helper function to load YAML test files
const loadYamlFile = async (relativePath: string): Promise<AsyncAPIV3.AsyncAPIObject> => {
  const filePath = path.join(process.cwd(), 'test/projects', relativePath)
  const content = await fs.readFile(filePath, 'utf8')
  return YAML.load(content) as AsyncAPIV3.AsyncAPIObject
}

describe('AsyncAPI 3.0 Operation Tests', () => {

  describe('Building Package with Operations', () => {
    test('should ignore operation without message', async () => {
      const result = await buildPackage('asyncapi/operations/broken-operation')
      expect(Array.from(result.operations.values())).toHaveLength(0)
    })

    test('should extract single operation from package', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      expect(Array.from(result.operations.values())).toHaveLength(1)
    })

    test('should extract multiple operations from package', async () => {
      const result = await buildPackage('asyncapi/operations/multiple-operations')
      expect(Array.from(result.operations.values())).toHaveLength(3)
    })
  })

  describe('OperationId Tests', () => {
    it('should generate unique operationIds (unit)', () => {
      const data = [
        ['channel1', 'message1', 'send', 'channel1message1-send'],
        ['channel1', 'message1', 'receive', 'channel1message1-receive'],
        ['channel2', 'message1', 'send', 'channel2message1-send'],
      ]
      data.forEach(([data1, data2, data3, expected]) => {
        const result = calculateAsyncOperationId(data1, data2, data3)
        expect(result).toBe(expected)
      })
    })

    it('should set operationId in built package (e2e)', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      expect(operation.operationId).toBe(
        calculateAsyncOperationId('User Signed Up', 'sendUserSignedup', 'send'),
      )
    })
  })

  describe('Operation title test', () => {
    it('should set operation title in built package (e2e)', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      expect(operation.title).toBe('User Signed Up')
    })
  })

  describe('Operation protocol tests', () => {
    it('should uses the (first) server protocol when supported', () => {
      const channel = {
        title: 'channel1',
        servers: [
          { protocol: 'amqp' },
          { protocol: 'kafka' },
        ],
      } as AsyncAPIV3.ChannelObject

      expect(extractProtocol(channel)).toBe('amqp')
    })

    it('should skip $ref servers and return first server with protocol', () => {
      const channel = {
        title: 'channel1',
        servers: [
          { $ref: '#/servers/amqp1' },
          { protocol: 'amqp' },
        ],
      } as AsyncAPIV3.ChannelObject

      expect(extractProtocol(channel)).toBe('amqp')
    })

    it('should returns unknown when servers are missing or empty', () => {
      expect(extractProtocol({ title: 'no-servers' } as unknown as AsyncAPIV3.ChannelObject)).toBe('unknown')
      expect(extractProtocol({ title: 'empty-servers', servers: [] } as unknown as AsyncAPIV3.ChannelObject)).toBe('unknown')
    })

    it('should operation has protocol', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      // In test spec, channel's first server is amqp.
      expect(operation.metadata.protocol).toBe('amqp')
    })
  })

  describe('Create operation spec tests', () => {
    const OPERATION_1 = 'sendUserSignedUp'
    const OPERATION_2 = 'sendUserSignedOut'
    let baseDocument: AsyncAPIV3.AsyncAPIObject

    beforeAll(async () => {
      baseDocument = await loadYamlFile('asyncapi/operations/base.yaml')
    })

    test('should select a single operation by key', async () => {
      const result = createOperationSpec(baseDocument, OPERATION_1)

      expect(Object.keys(result.operations || {})).toEqual([OPERATION_1])
      expect(result.operations?.[OPERATION_1]).toEqual(baseDocument.operations?.[OPERATION_1])
    })

    test('should preserve asyncapi and info', async () => {
      const result = createOperationSpec(baseDocument, OPERATION_1)

      expect(result.asyncapi).toBe(baseDocument.asyncapi)
      expect(result.info).toEqual(baseDocument.info)
    })

    test('should not include channels/servers/components by default', async () => {
      const result = createOperationSpec(baseDocument, OPERATION_1)

      expect(result.channels).toBeUndefined()
      expect(result.servers).toBeUndefined()
      expect(result.components).toBeUndefined()
    })

    test('should select multiple operations by keys (array) and preserve requested order', async () => {
      const result = createOperationSpec(baseDocument, [OPERATION_1, OPERATION_2])

      expect(Object.keys(result.operations || {})).toEqual([OPERATION_1, OPERATION_2])
      expect(result.operations?.[OPERATION_1]).toEqual(baseDocument.operations?.[OPERATION_1])
      expect(result.operations?.[OPERATION_2]).toEqual(baseDocument.operations?.[OPERATION_2])
    })

    test('should accept duplicated requested keys (same operation) without duplicating output', async () => {
      const result = createOperationSpec(baseDocument, [OPERATION_1, OPERATION_1, OPERATION_2, OPERATION_1])

      expect(Object.keys(result.operations || {})).toEqual([OPERATION_1, OPERATION_2])
      expect(result.operations?.[OPERATION_1]).toEqual(baseDocument.operations?.[OPERATION_1])
      expect(result.operations?.[OPERATION_2]).toEqual(baseDocument.operations?.[OPERATION_2])
    })

    test('defaults asyncapi version to 3.0.0 when missing', async () => {
      const document = cloneDocument(baseDocument)
      delete (document as Partial<AsyncAPIV3.AsyncAPIObject>).asyncapi

      const result = createOperationSpec(document, OPERATION_1)
      expect(result.asyncapi).toBe('3.0.0')
    })

    test('throws when document has no operations', async () => {
      const document = cloneDocument(baseDocument)
      delete document.operations

      expect(() => createOperationSpec(document, OPERATION_1)).toThrow(
        'AsyncAPI document has no operations. Expected a non-empty "operations" object at document.operations.',
      )
    })

    test('throws when operation keys array is empty', async () => {
      expect(() => createOperationSpec(baseDocument, [])).toThrow(
        'No operation keys provided. Pass a non-empty operation key string or a non-empty array of operation keys.',
      )
    })

    test('throws when the requested operation key is not found (string)', async () => {
      expect(() => createOperationSpec(baseDocument, 'missing-operation')).toThrow('Operation "missing-operation" not found in document.operations')
    })

    test('throws when one or more requested operation keys are not found (array)', async () => {
      expect(() => createOperationSpec(baseDocument, [OPERATION_1, 'missing-1', 'missing-2'])).toThrow(
        'Operations not found in document.operations: missing-1, missing-2',
      )
    })

    test('should inline referenced channels/servers/components when refsOnlyDocument has inline refs (manual refs)', async () => {
      const refsOnlyDocument = {
        operations: { [OPERATION_1]: {} },
        [INLINE_REFS_FLAG]: [
          '#/servers/amqp1',
          '#/channels/userSignedUp',
          '#/channels/userSignedUp/messages/UserSignedUp',
          '#/components/messages/UserSignedUp',
          '#/info/title', // should be ignored by patterns
        ],
      } as unknown as AsyncAPIV3.AsyncAPIObject

      const result = createOperationSpec(baseDocument, OPERATION_1, refsOnlyDocument)

      expect(baseDocument).toHaveProperty(['servers', 'amqp1'], result?.servers?.amqp1)
      expect(baseDocument).toHaveProperty(['channels', 'userSignedUp'], result?.channels?.userSignedUp)
      expect(baseDocument).toHaveProperty(['channels', 'userSignedUp',  'messages', 'UserSignedUp'], (result?.channels?.userSignedUp as AsyncAPIV3.ChannelObject)?.messages?.UserSignedUp)
      expect(baseDocument).toHaveProperty(['components', 'messages', 'UserSignedUp'], result?.components?.messages?.UserSignedUp)
    })

    test('should skip inlining when refsOnlyDocument does not contain all requested operations', async () => {
      const document = baseDocument

      const refsOnlyDocument = {
        operations: { [OPERATION_1]: {} },
        [INLINE_REFS_FLAG]: ['#/servers/amqp1', '#/channels/userSignedUp', '#/components/messages/UserSignedUp'],
      } as unknown as AsyncAPIV3.AsyncAPIObject

      const result = createOperationSpec(document, [OPERATION_1, OPERATION_2], refsOnlyDocument)

      expect(result.channels).toBeUndefined()
      expect(result.servers).toBeUndefined()
      expect(result.components).toBeUndefined()
    })
  })
})
