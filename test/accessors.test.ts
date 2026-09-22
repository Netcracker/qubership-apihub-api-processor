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

import { BuildResult, GRAPHQL_API_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, NotificationMessage } from '../src'
import { buildPackageFromContent, documentOf, errorsOf, notificationsOf, operationOf, warningsOf } from './helpers'

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
  const result = {
    notifications: [
      { severity: MESSAGE_SEVERITY.Error, category: MESSAGE_CATEGORY.ParseFile, message: 'broken' },
      { severity: MESSAGE_SEVERITY.Warning, category: MESSAGE_CATEGORY.ParseFile, message: 'odd' },
      { severity: MESSAGE_SEVERITY.Information, category: MESSAGE_CATEGORY.BuildOperations, message: 'fyi' },
    ] as NotificationMessage[],
  } as BuildResult

  test('errorsOf should return the errors and nothing else', () => {
    expect(errorsOf(result).map(({ message }) => message)).toEqual(['broken'])
  })

  test('warningsOf should return the warnings and nothing else', () => {
    expect(warningsOf(result).map(({ message }) => message)).toEqual(['odd'])
  })

  test('notificationsOf should select by category across severities', () => {
    expect(notificationsOf(result, MESSAGE_CATEGORY.ParseFile).map(({ message }) => message))
      .toEqual(['broken', 'odd'])
  })

  test('should return an empty list rather than throw when nothing matches', () => {
    expect(errorsOf({ notifications: [] } as unknown as BuildResult)).toEqual([])
  })
})
