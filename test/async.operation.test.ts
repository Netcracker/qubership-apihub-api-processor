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

import { describe, expect, it, test } from '@jest/globals'
import * as fs from 'fs/promises'
import * as path from 'path'
import YAML from 'js-yaml'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/cjs/spec-types'
import { createSingleOperationSpec } from '../src/apitypes/async/async.operation'
import { calculateAsyncOperationId } from '../src/utils'
import { buildPackage } from './helpers'
import { extractProtocol } from '../src/apitypes/async/async.utils'

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

  describe('operationId', () => {
    it('unit unique values', () => {
      const data = [
        ['channel1', 'message1', 'send', 'result1'],
        ['channel1', 'message1', 'receive', 'result2'],
        ['channel2', 'message1', 'send', 'result3'],
      ]
      data.forEach(([data1, data2, data3, expected]) => {
        const result = calculateAsyncOperationId(data1, data2, data3)
        expect(result).toBe(expected)
      })
    })

    it('e2e', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      expect(operation.operationId).toBe('id')
    })
  })

  describe('operation title', () => {
    it('unit unique values', () => {
      const data = [
        ['channel1', 'message1', 'send', 'result1'],
        ['channel1', 'message1', 'receive', 'result2'],
        ['channel2', 'message1', 'send', 'result3'],
      ]
      data.forEach(([data1, data2, data3, expected]) => {
        const result = calculateAsyncOperationId(data1, data2, data3)
        expect(result).toBe(expected)
      })
    })

    it('e2e', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      expect(operation.title).toBe('id')
    })
  })

  describe('protocol', () => {
    it('should uses the (first) server protocol when supported', () => {
      const channel = {
        title: 'channel1',
        servers: [
          { protocol: 'amqp' },
          { protocol: 'kafka' },
        ],
      } as unknown as AsyncAPIV3.ChannelObject

      expect(extractProtocol(channel)).toBe('amqp')
    })

    it('should returns unknown for unsupported protocol', () => {
      const channel = {
        title: 'channel1',
        servers: [
          { protocol: 'mqtt' },
          { protocol: 'amqp' },
        ],
      } as unknown as AsyncAPIV3.ChannelObject

      expect(extractProtocol(channel)).toBe('unknown')
    })

    it('should returns first server with protocol', () => {
      const channel = {
        title: 'channel1',
        servers: [
          { $ref: '#/servers/amqp1' },
          { protocol: 'amqp' },
        ],
      } as unknown as AsyncAPIV3.ChannelObject

      expect(extractProtocol(channel)).toBe('unknown')
    })

    it('should returns unknown when servers are missing or empty', () => {
      expect(extractProtocol({ title: 'no-servers' } as unknown as AsyncAPIV3.ChannelObject)).toBe('unknown')
      expect(extractProtocol({ title: 'empty-servers', servers: [] } as unknown as AsyncAPIV3.ChannelObject)).toBe('unknown')
    })

    it('e2e', async () => {
      const result = await buildPackage('asyncapi/operations/single-operation')
      const operations = Array.from(result.operations.values())
      const [operation] = operations
      // In test spec, channel's first server is amqp.
      expect(operation.metadata.protocol).toBe('amqp')
    })
  })

  // todo need to check
  describe('createSingleOperationSpec', () => {
    const TEST_OPERATION_KEY = 'onReceive'

    const createTestSingleOperationSpec = (
      document: AsyncAPIV3.AsyncAPIObject,
      servers?: AsyncAPIV3.ServersObject,
      components?: AsyncAPIV3.ComponentsObject,
    ): ReturnType<typeof createSingleOperationSpec> => {
      return createSingleOperationSpec(document, TEST_OPERATION_KEY, servers, components)
    }

    test('should keep only the requested operation and preserve channels', async () => {
      const document = await loadYamlFile('asyncapi/operations/base.yaml')
      // const result1 = await buildPackage('asyncapi/operations')
      const result = createTestSingleOperationSpec(document, document.servers, document.components)

      expect(Object.keys(result.operations || {})).toEqual([TEST_OPERATION_KEY])
      expect(result.operations?.[TEST_OPERATION_KEY]).toEqual(document.operations?.[TEST_OPERATION_KEY])
      expect(result.channels).toEqual(document.channels)
    })

    test('should include provided servers and components', async () => {
      const document = await loadYamlFile('asyncapi/operations/base.yaml')
      const servers: AsyncAPIV3.ServersObject = {
        staging: {
          host: 'staging.example.com',
          protocol: 'amqp',
        } as AsyncAPIV3.ServerObject,
      }
      const components: AsyncAPIV3.ComponentsObject = {
        messages: {
          customMessage: {
            payload: { type: 'string' },
          },
        },
      } as AsyncAPIV3.ComponentsObject

      const result = createTestSingleOperationSpec(document, servers, components)

      expect(result.servers).toEqual(servers)
      expect(result.components).toEqual(components)
    })

    test('should default asyncapi version to 3.0.0 when missing', async () => {
      const document = await loadYamlFile('asyncapi/operations/base.yaml')

      const result = createTestSingleOperationSpec(document)

      expect(result.asyncapi).toBe('3.0.0')
    })

    test('should throw when the operation is not found', async () => {
      const document = await loadYamlFile('asyncapi/operations/base.yaml')

      expect(() => createSingleOperationSpec(document, 'missing-operation')).toThrow(
        'Operation missing-operation not found in document',
      )
    })
  })
})
