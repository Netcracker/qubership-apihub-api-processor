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
  ASYNCAPI_API_TYPE,
  BuildResult,
  GRAPHQL_API_TYPE,
  MESSAGE_CATEGORY,
  MESSAGE_SEVERITY,
  NotificationMessage,
  OperationType,
  REST_API_TYPE,
} from '../src'
import {
  buildPackageFromContent,
  documentOf,
  errorsOf,
  inCategory,
  operationOf,
  operationTypeOf,
  warningsOf,
} from './helpers'

// Its own packageId. In disk mode the version directory is shared by every suite that lands in the same
// jest worker, so two suites publishing under one name overwrite each other. This suite never reads back
// from the registry, so it is hygiene rather than a live hazard.
const PACKAGE_ID = 'accessors-of'
const FILE_ID = 'spec.yaml'

const SPEC = `
openapi: "3.0.0"
info: { title: test, version: 0.1.0 }
paths:
  /path1: { get: { responses: { '200': { description: OK } } } }
  /path2: { post: { responses: { '200': { description: OK } } } }
`

// The message is the whole point of these two: an accessor that throws without naming what was there is
// no better than the `?.` it replaces, which reports the field instead of the missing id.
describe('Build result accessors', () => {
  let result: BuildResult

  beforeAll(async () => {
    result = await buildPackageFromContent(PACKAGE_ID, FILE_ID, SPEC)
  })

  describe('operationOf', () => {
    test('should return the operation and default the api type to rest', () => {
      expect(operationOf(result, 'path1-get').operationId).toBe('path1-get')
    })

    test('should name the operations that were there when the id does not match', () => {
      // one assertion per key: nothing guarantees the order the map hands them back in
      expect(() => operationOf(result, 'path3-delete')).toThrow('rest:path1-get')
      expect(() => operationOf(result, 'path3-delete')).toThrow('rest:path2-post')
    })

    test('should report the key it looked for, api type included', () => {
      // A right id under the wrong api type is the miss that `?.` explains worst of all
      expect(() => operationOf(result, 'path1-get', GRAPHQL_API_TYPE))
        .toThrow('Build result has no operation graphql:path1-get')
    })
  })

  test('should say so when there is nothing to name at all', () => {
    const empty = { operations: new Map(), documents: new Map() } as BuildResult
    expect(() => operationOf(empty, 'path1-get')).toThrow('Operations: (none)')
    expect(() => documentOf(empty, FILE_ID)).toThrow('Documents: (none)')
  })

  describe('documentOf', () => {
    test('should return the document by fileId', () => {
      expect(documentOf(result, FILE_ID).fileId).toBe(FILE_ID)
    })

    test('should name the documents that were there when the fileId does not match', () => {
      expect(() => documentOf(result, 'other.yaml'))
        .toThrow(`Build result has no document other.yaml. Documents: ${FILE_ID}`)
    })

    test('should not accept the slug, which is not what the map is keyed by', () => {
      const { slug } = documentOf(result, FILE_ID)
      expect(slug).not.toBe(FILE_ID)
      expect(() => documentOf(result, slug)).toThrow(/has no document/)
    })
  })
})

// These three select rather than look up, so they take a hand-written list: a real build would add a minute
// to the suite and prove nothing the filter does not. What is worth pinning is that the two severity
// selectors are not each other — `MESSAGE_SEVERITY.Error` is 0 and `Warning` is 1, so a swap is silent.
describe('Notification selectors', () => {
  const NOTIFICATIONS = [
    { severity: MESSAGE_SEVERITY.Error, category: MESSAGE_CATEGORY.ParseFile, message: 'broken' },
    { severity: MESSAGE_SEVERITY.Warning, category: MESSAGE_CATEGORY.ParseFile, message: 'odd' },
    { severity: MESSAGE_SEVERITY.Information, category: MESSAGE_CATEGORY.BuildOperations, message: 'fyi' },
  ] as NotificationMessage[]

  test('errorsOf should return the errors and nothing else', () => {
    expect(errorsOf(NOTIFICATIONS).map(({ message }) => message)).toEqual(['broken'])
  })

  test('warningsOf should return the warnings and nothing else', () => {
    expect(warningsOf(NOTIFICATIONS).map(({ message }) => message)).toEqual(['odd'])
  })

  test('inCategory should select across severities, not within one', () => {
    // the two ParseFile rows differ in severity on purpose: a category selector that quietly filtered
    // by severity too would return one of them and still look right
    expect(inCategory(NOTIFICATIONS, MESSAGE_CATEGORY.ParseFile).map(({ message }) => message))
      .toEqual(['broken', 'odd'])
  })

  test('should return an empty list rather than throw when nothing matches', () => {
    // the case that actually occurs is a full list with no match, not an empty one
    expect(inCategory(NOTIFICATIONS, MESSAGE_CATEGORY.RefNotFound)).toEqual([])
    expect(errorsOf([])).toEqual([])
  })
})

describe('operationTypeOf', () => {
  const comparisonOver = (...apiTypes: OperationType['apiType'][]): BuildResult =>
    ({ comparisons: [{ operationTypes: apiTypes.map(apiType => ({ apiType })) }] } as BuildResult)

  test('should default the api type to rest', () => {
    expect(operationTypeOf(comparisonOver(REST_API_TYPE)).apiType).toBe(REST_API_TYPE)
  })

  test('should say which api types were there when the one asked for is absent', () => {
    expect(() => operationTypeOf(comparisonOver(REST_API_TYPE), GRAPHQL_API_TYPE))
      .toThrow("Comparison carries no 'graphql' operation type. API types: rest")
  })

  test('should select by api type when a comparison carries more than one', () => {
    // the shape of asyncapi-changes.test.ts: one changelog over a REST and an AsyncAPI document
    const mixed = comparisonOver(REST_API_TYPE, ASYNCAPI_API_TYPE)

    expect(operationTypeOf(mixed, ASYNCAPI_API_TYPE).apiType).toBe(ASYNCAPI_API_TYPE)
    expect(operationTypeOf(mixed).apiType).toBe(REST_API_TYPE)
  })

  test('should say how many comparisons there were rather than search for one', () => {
    expect(() => operationTypeOf({ comparisons: [] } as unknown as BuildResult))
      .toThrow('Expected the build to carry one comparison, found 0')
  })
})
