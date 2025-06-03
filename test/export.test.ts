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

import { Editor, LocalRegistry } from './helpers'
import { BUILD_TYPE, TRANSFORMATION_KIND_REDUCED } from '../src'
import fs from 'fs/promises'

const VERSIONS_PATH = 'test/versions/temp'

let pkg: LocalRegistry
let editor: Editor
const GROUP_NAME = 'manualGroup'
const groupToOperationIdsMap2 = {
  [GROUP_NAME]: [
    'some-path1-get',
    'another-path1-put',
    'some-path2-post',
  ],
}

describe('Export test', () => {
  beforeAll(async () => {
    pkg = LocalRegistry.openPackage('export')
    editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)
  })

  test('should export rest document to html', async () => {
    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'html',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.zip')
    // todo check zip content
  })

  test('should export rest document to json', async () => {
    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'json',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.json')
    // todo check zip content
  })

  test('should export rest document to yaml', async () => {
    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'yaml',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.yaml')
    // todo check zip content
  })

  test('should export version to html', async () => {
    const result = await editor.run({
      packageId: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'html',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.zip')
    // todo check zip content
  })

  test('should export version to json', async () => {
    const result = await editor.run({
      packageId: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'json',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.json')
    // todo check zip content
  })

  test('should export version to yaml', async () => {
    const result = await editor.run({
      packageId: pkg.packageId,
      // version: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'yaml',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}${result.exportFileName}`, packageZip)
    expect(result.exportFileName).toEqual('export_v1_1.yaml')
    // todo check zip content
  })

  // todo check case with single file in version

  // todo same 3 tests but without extensions?
})
