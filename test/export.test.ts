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

import { Editor, loadFileAsString, LocalRegistry, VERSIONS_PATH } from './helpers'
import { BUILD_TYPE } from '../src'
import { load } from 'js-yaml'
import fs from 'fs/promises'

const EXPECTED_RESULT_FILE = 'result.yaml'

describe('Export test', () => {
  test('should export rest document to html', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'html',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/html-${result.exportFileName}`, packageZip)
    // todo check zip content
    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  test('should export rest document to json', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'json',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/json-${result.exportFileName}`, packageZip)
    // todo check zip content
    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  test('should export rest document to yaml', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      buildType: BUILD_TYPE.EXPORT_REST_DOCUMENT,
      documentId: '1',
      format: 'yaml',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/yaml-${result.exportFileName}`, packageZip)
    // todo check zip content
    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  test('should export version to html', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      packageId: pkg.packageId,
      // version: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'html',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/export-result-html.zip`, packageZip)

    // todo check zip content

    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  test('should export version to json', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      packageId: pkg.packageId,
      // version: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'json',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/export-result-json.zip`, packageZip)

    // todo check zip content

    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  test('should export version to yaml', async () => {
    const pkg = LocalRegistry.openPackage('export')
    const editor = await Editor.openProject(pkg.packageId, pkg)
    await pkg.publish(pkg.packageId)

    const result = await editor.run({
      packageId: pkg.packageId,
      // version: pkg.packageId,
      buildType: BUILD_TYPE.EXPORT_VERSION,
      format: 'yaml',
    })
    const packageZip = await editor.createVersionPackage()
    await fs.writeFile(`${VERSIONS_PATH}/export-result-yaml.zip`, packageZip)

    // todo check zip content

    const expectedResult = load((await loadFileAsString(pkg.projectsDir, pkg.packageId, EXPECTED_RESULT_FILE))!)
    expect(result.merged?.data).toEqual(expectedResult)
  })

  // todo check case with single file in version

  // todo same 3 tests but without extensions?
})
