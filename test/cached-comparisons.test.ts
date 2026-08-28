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

import JSZip from 'jszip'
import { describe, expect, it, jest } from '@jest/globals'
import { Editor, publishDashboardWithTwoRefs } from './helpers'
import {
  BUILD_TYPE,
  ComparisonKey,
  PACKAGE,
  PackageCachedComparisons,
  PackageComparisons,
  VERSION_STATUS,
} from '../src'
import { PackageVersionBuilder } from '../src/processor'
import { ResolvedComparisonSummary } from '../src/types/external/comparison'

describe('Comparisons reused from the host', () => {
  const REF_CACHED = 'dashboards/pckg1'
  const REF_CALCULATED = 'dashboards/pckg2'
  const DASHBOARD = 'dashboards/dashboard'

  const readJsonFromZip = async <T>(zip: JSZip, name: string): Promise<T> => {
    const entry = zip.file(name)
    if (!entry) {
      throw new Error(`Cannot find ${name} in the build result`)
    }
    return JSON.parse(await entry.async('string')) as T
  }

  /** What the host answers for a pair it already holds. An empty `operationTypes` is still an answer. */
  const storedComparison = (refId: string): ResolvedComparisonSummary => ({
    packageId: refId,
    version: 'v2',
    revision: 1,
    previousVersion: 'v1',
    previousVersionPackageId: refId,
    previousVersionRevision: 1,
    operationTypes: [],
  })

  const changelogEditor = (): Editor => new Editor(DASHBOARD, {
    packageId: DASHBOARD,
    version: 'v2',
    previousVersionPackageId: DASHBOARD,
    previousVersion: 'v1',
    buildType: BUILD_TYPE.CHANGELOG,
    status: VERSION_STATUS.RELEASE,
  })

  /**
   * Build the dashboard changelog with the host answering for `cachedRefIds` and refusing for the rest.
   * Both dashboard versions carry both references, so every reference is a pair with two sides - which is
   * what makes it a candidate for reuse in the first place.
   */
  const buildDashboardChangelog = async (cachedRefIds: string[]): Promise<JSZip> => {
    await publishDashboardWithTwoRefs(REF_CACHED, REF_CALCULATED, DASHBOARD)

    const editor = changelogEditor()
    jest.spyOn(editor.builder as PackageVersionBuilder, 'versionComparisonResolver')
      .mockImplementation(async (_version, packageId) => (
        cachedRefIds.includes(packageId) ? storedComparison(packageId) : null
      ))

    await editor.run()
    return await JSZip.loadAsync(await editor.createVersionPackage())
  }

  const readCachedComparisons = async (zip: JSZip): Promise<ComparisonKey[]> =>
    (await readJsonFromZip<PackageCachedComparisons>(zip, PACKAGE.CACHED_COMPARISONS_FILE_NAME)).cachedComparisons

  it('should record every reused pair and no others', async () => {
    const zip = await buildDashboardChangelog([REF_CACHED])

    const cached = await readCachedComparisons(zip)
    expect(cached.map(({ packageId }) => packageId)).toEqual([REF_CACHED])
  })

  // The build's own pair is what the build exists to produce, so it is always calculated. It also reaches the
  // host under a version and revision taken from the build config rather than from the row, so a key naming
  // it would match nothing there.
  it('should never record the pair the build was started for', async () => {
    const zip = await buildDashboardChangelog([REF_CACHED, REF_CALCULATED])

    const cached = await readCachedComparisons(zip)
    expect(cached.map(({ packageId }) => packageId)).not.toContain(DASHBOARD)
    expect(cached).toHaveLength(2)
  })

  // The guarantee the host depends on: a key and the comparison it names describe one pair field for field.
  // A revision written as 0 or null on one side and omitted on the other would pass a looser check and then
  // match no row at publish time.
  it('should key every record exactly as the matching comparison keys itself', async () => {
    const zip = await buildDashboardChangelog([REF_CACHED])

    const cached = await readCachedComparisons(zip)
    const { comparisons } = await readJsonFromZip<PackageComparisons>(zip, PACKAGE.COMPARISONS_FILE_NAME)
    expect(cached).not.toHaveLength(0)

    for (const key of cached) {
      const matching = comparisons.filter(comparison =>
        comparison.packageId === key.packageId &&
        comparison.version === key.version &&
        comparison.revision === key.revision &&
        comparison.previousVersionPackageId === key.previousVersionPackageId &&
        comparison.previousVersion === key.previousVersion &&
        comparison.previousVersionRevision === key.previousVersionRevision)
      expect(matching).toHaveLength(1)
    }
  })

  // Recorded once for the pair and nowhere else. A pair's operation and DDL comparisons reach one row in the
  // host's store, and a copy on each of them is how the two would come to disagree about that row.
  it('should not be marked on the comparisons themselves', async () => {
    const zip = await buildDashboardChangelog([REF_CACHED])

    const { comparisons } = await readJsonFromZip<PackageComparisons>(zip, PACKAGE.COMPARISONS_FILE_NAME)
    expect(comparisons).not.toHaveLength(0)
    expect(comparisons.flatMap(comparison => Object.keys(comparison))).not.toContain('fromCache')
  })

  // A missing file has to mean "built before this file existed", so a build that reused nothing still writes
  // one. Otherwise the host cannot tell an empty result from an old builder.
  it('should write an empty list when nothing was reused', async () => {
    const zip = await buildDashboardChangelog([])

    expect(await readCachedComparisons(zip)).toEqual([])
  })
})
