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
import { normalize } from '@netcracker/qubership-apihub-api-unifier'
import { buildFromSchema, GraphApiSchema } from '@netcracker/qubership-apihub-graphapi'
import { buildSchema } from 'graphql'
import { createSingleOperationSpec } from '../src/apitypes/graphql/graphql.operation'
import { calculateGraphqlOperationId } from '../src/utils'
import { INLINE_REFS_FLAG } from '../src/consts'
import { loadFileAsString } from './helpers'

const SCHEMA_SIMPLE = `
type Query {
  hello: String
  world: Int
}
`

function parseAndNormalize(sdl: string): { source: GraphApiSchema; normalized: GraphApiSchema } {
  const source = buildFromSchema(buildSchema(sdl, { noLocation: true }))
  const normalized = normalize(source, {
    mergeAllOf: false,
    inlineRefsFlag: INLINE_REFS_FLAG,
    source: source,
  }) as GraphApiSchema
  return { source, normalized }
}

describe('GraphQL createSingleOperationSpec', () => {
  let graphql: string

  beforeAll(async () => {
    graphql = await loadFileAsString('test/projects/', 'graphql', 'spec.gql') as string
  })

  describe('Error handling', () => {
    test('should throw when operationsId array is empty', () => {
      const { source, normalized } = parseAndNormalize(SCHEMA_SIMPLE)

      expect(() => createSingleOperationSpec(source, normalized, [])).toThrow(
        'No operations provided',
      )
    })

    test('should throw when requested operation is not found', () => {
      const { source, normalized } = parseAndNormalize(SCHEMA_SIMPLE)

      expect(() =>
        createSingleOperationSpec(source, normalized, ['query-nonExistent']),
      ).toThrow('Operations not found in document: query-nonExistent')
    })

    test('should throw listing all missing operations', () => {
      const { source, normalized } = parseAndNormalize(SCHEMA_SIMPLE)

      expect(() =>
        createSingleOperationSpec(source, normalized, [
          'query-nonExistent1',
          'query-nonExistent2',
        ]),
      ).toThrow(
        'Operations not found in document: query-nonExistent1, query-nonExistent2',
      )
    })
  })

  describe('Single query extraction', () => {
    test('should extract a single query operation', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('query', 'listPets')

      const result = createSingleOperationSpec(source, normalized, [opId])

      expect(result.graphapi).toBeDefined()
      expect(result.queries).toBeDefined()
      expect(Object.keys(result.queries!)).toEqual(['listPets'])
      expect(result.mutations).toBeUndefined()
      expect(result.subscriptions).toBeUndefined()
    })

    test('should include referenced types (Pet, Category) for listPets', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('query', 'listPets')

      const result = createSingleOperationSpec(source, normalized, [opId])

      const components = result.components as Record<string, unknown> | undefined
      expect(components?.types).toBeDefined()
      if (components?.types) {
        const types = components.types as Record<string, unknown>
        expect(types['Pet']).toBeDefined()
        expect(types['Category']).toBeDefined()
        expect(types['User']).toBeUndefined()
      }
    })
  })

  describe('Single mutation extraction', () => {
    test('should extract a single mutation operation', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('mutation', 'petAvailabilityCheck')

      const result = createSingleOperationSpec(source, normalized, [opId])

      expect(result.mutations).toBeDefined()
      expect(Object.keys(result.mutations!)).toEqual(['petAvailabilityCheck'])
      expect(result.queries).toBeUndefined()
      expect(result.subscriptions).toBeUndefined()
    })
  })

  describe('Single subscription extraction', () => {
    test('should extract a single subscription operation', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('subscription', 'onPetAdded')

      const result = createSingleOperationSpec(source, normalized, [opId])

      expect(result.subscriptions).toBeDefined()
      expect(Object.keys(result.subscriptions!)).toEqual(['onPetAdded'])
      expect(result.queries).toBeUndefined()
      expect(result.mutations).toBeUndefined()
    })
  })

  describe('Multiple operations extraction', () => {
    test('should extract multiple queries', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opIds = [
        calculateGraphqlOperationId('query', 'listPets'),
        calculateGraphqlOperationId('query', 'getPet'),
      ]

      const result = createSingleOperationSpec(source, normalized, opIds)

      expect(result.queries).toBeDefined()
      expect(Object.keys(result.queries!)).toEqual(
        expect.arrayContaining(['listPets', 'getPet']),
      )
      expect(result.mutations).toBeUndefined()
    })

    test('should extract operations across different types', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opIds = [
        calculateGraphqlOperationId('query', 'listPets'),
        calculateGraphqlOperationId('mutation', 'petAvailabilityCheck'),
        calculateGraphqlOperationId('subscription', 'onPetAdded'),
      ]

      const result = createSingleOperationSpec(source, normalized, opIds)

      expect(result.queries).toBeDefined()
      expect(Object.keys(result.queries!)).toEqual(['listPets'])
      expect(result.mutations).toBeDefined()
      expect(Object.keys(result.mutations!)).toEqual(['petAvailabilityCheck'])
      expect(result.subscriptions).toBeDefined()
      expect(Object.keys(result.subscriptions!)).toEqual(['onPetAdded'])
    })
  })

  describe('Include RuntimeDirectives flag', () => {
    test('should not include runtime directives by default', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('query', 'listPets')

      const result = createSingleOperationSpec(source, normalized, [opId])

      const directives = (result.components as Record<string, unknown> | undefined)?.directives as Record<string, unknown> | undefined
      expect(directives?.['deprecated']).toBeUndefined()
    })

    test('should include runtime directives when flag is true', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('query', 'listPets')

      const result = createSingleOperationSpec(source, normalized, [opId], true)

      const directives = (result.components as Record<string, unknown> | undefined)?.directives as Record<string, unknown> | undefined
      expect(directives?.['deprecated']).toBeDefined()
    })
  })

  describe('Operation data isolation', () => {
    test('should not modify source document', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const originalQueryKeys = Object.keys(source.queries || {})
      const opId = calculateGraphqlOperationId('query', 'listPets')

      createSingleOperationSpec(source, normalized, [opId])

      expect(Object.keys(source.queries || {})).toEqual(originalQueryKeys)
    })

    test('should create a shallow copy of operation data', () => {
      const { source, normalized } = parseAndNormalize(graphql)
      const opId = calculateGraphqlOperationId('query', 'listPets')

      const result = createSingleOperationSpec(source, normalized, [opId])

      expect(result.queries!['listPets']).not.toBe(source.queries!['listPets'])
      expect(result.queries!['listPets']).toEqual(source.queries!['listPets'])
    })
  })
})
