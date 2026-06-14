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
import { LocalRegistry } from './helpers'
import { BUILD_TYPE, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import { BuildResult } from '../src/types'

const PACKAGE_ID = 'ddl-validation'

const build = (sql: string): Promise<BuildResult> => {
  const registry = LocalRegistry.openPackage(PACKAGE_ID)
  return registry.publishFromContent(
    { 'shop.sql': sql },
    { packageId: PACKAGE_ID, version: 'v1', status: VERSION_STATUS.RELEASE, buildType: BUILD_TYPE.BUILD, files: [{ fileId: 'shop.sql' }] },
  )
}

describe('DDL validation (Task 12)', () => {
  test('invalid SQL breaks the publish (DdlParseError propagates)', async () => {
    await expect(build('CREATE TABLE ( ;')).rejects.toBeDefined()
  })

  test('a within-file duplicate object is an Error that breaks the publish', async () => {
    // two CREATE TABLE users in one file → buildFromDdl emits duplicate-object
    await expect(build('CREATE TABLE users (id bigint PRIMARY KEY);\nCREATE TABLE users (id bigint PRIMARY KEY);'))
      .rejects.toThrow(/duplicate object/i)
  })

  test('out-of-scope statements emit one Warning per statement and do not abort', async () => {
    const result = await build(
      'CREATE TABLE users (id bigint PRIMARY KEY);\nALTER TABLE users ADD COLUMN x int;\nDROP TABLE old;',
    )
    const warnings = result.notifications.filter(n => n.severity === MESSAGE_SEVERITY.Warning)
    // one warning per out-of-scope statement (ALTER + DROP) — D7
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    expect(result.notifications.every(n => n.fileId === 'shop.sql')).toBe(true)
    // the table was still built
    expect(result.ddlEntities.size).toBe(1)
  })

  test('an unresolved reference is a Warning; the partial entity is still built (no incomplete flag)', async () => {
    const result = await build('CREATE TABLE orders (id bigint PRIMARY KEY, uid bigint REFERENCES missing(id));')
    const warnings = result.notifications.filter(n => n.severity === MESSAGE_SEVERITY.Warning)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.ddlEntities.size).toBe(1)
    const [entity] = result.ddlEntities.values()
    expect(entity).not.toHaveProperty('incomplete')
    expect(entity).not.toHaveProperty('partial')
  })

  test('a clean DDL build produces no notifications', async () => {
    const result = await build('CREATE TABLE users (id bigint PRIMARY KEY, email text NOT NULL);')
    expect(result.notifications).toHaveLength(0)
  })
})
