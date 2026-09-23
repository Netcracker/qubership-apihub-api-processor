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


import { publishVersion } from './helpers'

// Two small documents no other suite publishes under these versions. Each test takes its own version, so
// nothing here reads what another test wrote.
const PACKAGE_ID = 'list-ordering'

describe('publishVersion', () => {
  test('should publish every file of a list', async () => {
    const result = await publishVersion(PACKAGE_ID, 'publish-version-list', ['alpha.yaml', 'zeta.yaml'])

    expect(Array.from(result.documents.keys())).toIncludeSameMembers(['alpha.yaml', 'zeta.yaml'])
  })

  test('should take a bare file id the way it takes a whole entry', async () => {
    const bare = await publishVersion(PACKAGE_ID, 'publish-version-bare', 'alpha.yaml')
    const entry = await publishVersion(PACKAGE_ID, 'publish-version-entry', [{ fileId: 'alpha.yaml' }])

    expect(Array.from(bare.documents.keys())).toEqual(['alpha.yaml'])
    expect(Array.from(entry.operations.keys())).toEqual(Array.from(bare.operations.keys()))
    expect(bare.operations.size).toBeGreaterThan(0)
  })
})
