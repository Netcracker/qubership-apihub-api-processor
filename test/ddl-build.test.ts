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
import { Editor, LocalRegistry, VERSIONS_PATH, loadFileAsStringFromRegistry } from './helpers'
import { BUILD_TYPE, VERSION_STATUS } from '../src/consts'
import { DdlEntity, DdlEntityIndex, PackageDdlEntity, PackageDdlFile } from '../src/types/package/ddl'

const PACKAGE_ID = 'ddl-build'

function createDdlEditor(registry?: LocalRegistry): Editor {
  const reg = registry ?? LocalRegistry.openPackage(PACKAGE_ID)
  return new Editor(PACKAGE_ID, {
    packageId: PACKAGE_ID,
    version: 'v1',
    status: VERSION_STATUS.RELEASE,
    buildType: BUILD_TYPE.BUILD,
    files: [],
  }, {}, reg)
}

const entityById = (entities: DdlEntityIndex, id: string): DdlEntity | undefined => entities.get(id)

describe('DDL Build', () => {
  test('builds DDL entities from a multi-table .sql with schema defaulting and comments', async () => {
    const editor = createDdlEditor()
    const result = await editor.run({ files: [{ fileId: 'shop.sql' }] })

    // one document, no operations, two table entities
    expect(result.documents.size).toBe(1)
    expect(result.operations.size).toBe(0)
    expect(result.ddlEntities.size).toBe(2)

    // unqualified table → schema defaults to `public`; qualified table keeps its schema
    const users = entityById(result.ddlEntities, 'public-table-users')
    const products = entityById(result.ddlEntities, 'shop-table-products')

    expect(users).toMatchObject({
      ddlEntityId: 'public-table-users',
      kind: 'table',
      name: 'users',
      schemaName: 'public',
      description: 'Registered users', // from COMMENT ON TABLE
      search: { useEntityDataAsSearchText: true },
      documentId: 'shop.sql',
      versionInternalDocumentId: 'shop',
    })
    expect(products).toMatchObject({
      ddlEntityId: 'shop-table-products',
      kind: 'table',
      name: 'products',
      schemaName: 'shop',
      description: '', // no COMMENT ON → empty
      search: { useEntityDataAsSearchText: true },
      documentId: 'shop.sql',
      versionInternalDocumentId: 'shop',
    })
  })

  test('publishes ddl.json (index, payload stripped) + ddl/<id> SQL files', async () => {
    const registry = LocalRegistry.openPackage(PACKAGE_ID)
    const editor = createDdlEditor(registry)

    const result = await editor.run({ files: [{ fileId: 'shop.sql' }] })
    await registry.publishPackage(result, editor.builder.builderContext(editor.config), editor.config)

    // ddl.json — grouped by kind, index rows without `data`
    const index: PackageDdlFile = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, `${PACKAGE_ID}/v1`, 'ddl.json'))!)
    expect(index.tables).toHaveLength(2)
    const usersIndex = index.tables.find((t: PackageDdlEntity) => t.ddlEntityId === 'public-table-users')
    expect(usersIndex).toMatchObject({
      ddlEntityId: 'public-table-users',
      kind: 'table',
      name: 'users',
      schemaName: 'public',
      description: 'Registered users',
      documentId: 'shop.sql',
      versionInternalDocumentId: 'shop',
    })
    expect(usersIndex).not.toHaveProperty('data')

    // the qualified, comment-less second table is indexed too (schema kept, description '')
    const productsIndex = index.tables.find((t: PackageDdlEntity) => t.ddlEntityId === 'shop-table-products')
    expect(productsIndex).toMatchObject({
      ddlEntityId: 'shop-table-products',
      kind: 'table',
      name: 'products',
      schemaName: 'shop',
      description: '',
      documentId: 'shop.sql',
      versionInternalDocumentId: 'shop',
    })
    expect(productsIndex).not.toHaveProperty('data')

    // ddl/<ddlEntityId> — per-entity SQL (no extension), equal to the stub extractTableStatements output
    const usersSql = await loadFileAsStringFromRegistry(VERSIONS_PATH, `${PACKAGE_ID}/v1/ddl`, 'public-table-users')
    expect(usersSql).toBeTruthy()
    expect(usersSql).toContain('users')

    const productsSql = await loadFileAsStringFromRegistry(VERSIONS_PATH, `${PACKAGE_ID}/v1/ddl`, 'shop-table-products')
    expect(productsSql).toBeTruthy()
    expect(productsSql).toContain('products')

    // documents.json back-link: the entity references the document, the document carries no ddlEntityIds
    const documents = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, `${PACKAGE_ID}/v1`, 'documents.json'))!)
    const ddlDoc = documents.documents.find((d: { fileId: string }) => d.fileId === 'shop.sql')
    expect(ddlDoc).toMatchObject({ type: 'ddl', format: 'sql', operationIds: [] })
    expect(ddlDoc).not.toHaveProperty('ddlEntityIds')
  }, 30000)

  test('rejects two tables that collide on ddlEntityId within the same document (D10)', async () => {
    const editor = createDdlEditor()
    // `"user name"` and `"user-name"` are distinct tables to Postgres but both slugify to the same id
    // `public-table-user-name` (slugify preserves case but maps space → hyphen)
    await expect(editor.run({ files: [{ fileId: 'duplicate.sql' }] })).rejects.toThrow(/Duplicate DDL entity ID/)
  })

  test('rejects a ddlEntityId collision across documents (Task 6)', async () => {
    const editor = createDdlEditor()
    // both files define public.users → same id from different documents
    await expect(
      editor.run({ files: [{ fileId: 'shop.sql' }, { fileId: 'dup-users.sql' }] }),
    ).rejects.toThrow(/Duplicate DDL entity ID .* found in different documents/)
  })
})
