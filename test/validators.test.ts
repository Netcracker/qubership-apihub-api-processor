import { validateApiProcessorVersion } from '../src/validators'
import { VersionCache, VersionValidationLevel } from '../src'
import { buildChangelogWithVersionOverrides } from './helpers'

let mockVersion = '1.0.0'
jest.mock('../package.json', () => ({
  get version() { return mockVersion },
}))

function createVersionCache(overrides: Partial<VersionCache> = {}): VersionCache {
  return {
    packageId: 'test-package',
    version: 'v1',
    apiProcessorVersion: '1.0.0',
    ...overrides,
  }
}

type ValidationCase = [
  expectation: 'throw' | 'pass',
  description: string,
  level: VersionValidationLevel,
  current: string,
  resolved: string | null,
]

// null resolved = resolvedVersion is null (no version data)
const validationCases: ValidationCase[] = [
  // strict mode — exact string match required
  ['pass',  'exact match',                  'strict', '1.0.0', '1.0.0'],
  ['throw', 'different major',              'strict', '1.0.0', '2.0.0'],
  ['throw', 'different minor',              'strict', '1.0.0', '1.1.0'],
  ['throw', 'different patch',              'strict', '1.0.0', '1.0.1'],
  ['throw', 'completely different',         'strict', '1.0.0', '9.9.9'],
  ['throw', 'unparseable resolved',         'strict', '1.0.0', 'invalid'],
  ['throw', 'resolved has prerelease',      'strict', '1.0.0', '1.0.0-feature-branch.202605'],
  ['throw', 'current has prerelease',       'strict', '1.0.0-feature-branch.202605', '1.0.0'],
  ['throw', 'both have different suffixes', 'strict', '1.0.0-bugfix.1', '1.0.0-bugfix.2'],
  ['pass',  'null version',                 'strict', '1.0.0', null],

  // major mode — only major part compared
  ['pass',  'exact match',                  'major', '1.0.0', '1.0.0'],
  ['pass',  'different minor',              'major', '1.0.0', '1.1.0'],
  ['pass',  'different patch',              'major', '1.0.0', '1.0.1'],
  ['pass',  'same major, max minor/patch',  'major', '1.0.0', '1.999.999'],
  ['pass',  'resolved has prerelease',      'major', '1.0.0', '1.0.0-feature-branch.202605'],
  ['pass',  'current has prerelease',       'major', '1.0.0-feature-branch.202605', '1.0.0'],
  ['pass',  'both have different suffixes', 'major', '1.0.0-bugfix.1', '1.0.0-bugfix.2'],
  ['pass',  'unparseable resolved',         'major', '1.0.0', 'invalid'],
  ['pass',  'unparseable current',          'major', 'garbage', '1.0.0'],
  ['pass',  'current without dot',          'major', '1', '1.2.3'],
  ['pass',  'null version',                 'major', '1.0.0', null],
  ['throw', 'higher major',                 'major', '1.0.0', '2.0.0'],
  ['throw', 'lower major',                  'major', '1.0.0', '0.0.0'],
  ['throw', 'both have suffixes, different major', 'major', '1.0.0-bugfix.1', '2.0.0-bugfix.2'],
]

describe('validateApiProcessorVersion', () => {
  afterEach(() => {
    mockVersion = '1.0.0'
  })

  it.each(validationCases)(
    'should %s for %s (%s, current=%s resolved=%s)',
    (expectation, _desc, level, current, resolved) => {
      mockVersion = current
      const cache = resolved !== null ? createVersionCache({ apiProcessorVersion: resolved }) : null
      if (expectation === 'throw') {
        expect(() => validateApiProcessorVersion(cache, undefined, level)).toThrow()
      } else {
        expect(() => validateApiProcessorVersion(cache, undefined, level)).not.toThrow()
      }
    },
  )

  it('should default to strict mode when level is omitted', () => {
    const cache = createVersionCache({ apiProcessorVersion: '1.0.1' })
    expect(() => validateApiProcessorVersion(cache)).toThrow()
  })

  it('should include error prefix in strict mode (default)', () => {
    const cache = createVersionCache({ apiProcessorVersion: '0.0.1' })
    expect(() => validateApiProcessorVersion(cache, 'Prefix.')).toThrow(/^Prefix\./)
  })

  it('should include error prefix in strict mode (explicit)', () => {
    const cache = createVersionCache({ apiProcessorVersion: '0.0.1' })
    expect(() => validateApiProcessorVersion(cache, 'Prefix.', 'strict')).toThrow(/^Prefix\./)
  })

  it('should include error prefix in major mode', () => {
    const cache = createVersionCache({ apiProcessorVersion: '2.0.0' })
    expect(() => validateApiProcessorVersion(cache, 'Prefix.', 'major')).toThrow(/^Prefix\./)
  })
})

describe('validateApiProcessorVersion e2e through builder', () => {
  const packageId = 'test-version-validation-e2e'

  it('should pass in strict mode when versions match', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, {}, 'strict')).resolves.toBeDefined()
  })

  it('should throw in strict mode when previous version has different minor', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, { v1: '1.1.0' }, 'strict'))
      .rejects.toThrow(/previous version was built using an outdated api-processor/)
  })

  it('should throw in strict mode when current version has different patch', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, { v2: '1.0.1' }, 'strict'))
      .rejects.toThrow(/current version was built using an outdated api-processor/)
  })

  it('should pass in major mode when only minor differs', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, { v1: '1.1.0' }, 'major')).resolves.toBeDefined()
  })

  it('should throw in major mode when previous version has different major', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, { v1: '2.0.0' }, 'major'))
      .rejects.toThrow(/previous version was built using an outdated api-processor/)
  })

  it('should throw in major mode when current version has different major', async () => {
    await expect(buildChangelogWithVersionOverrides(packageId, { v2: '2.0.0' }, 'major'))
      .rejects.toThrow(/current version was built using an outdated api-processor/)
  })
})

describe('Builder version info in changelog result', () => {
  const packageId = 'test-builder-version-info'

  it('should set previousVersionBuilderVersion when previous version has different apiProcessorVersion', async () => {
    const result = await buildChangelogWithVersionOverrides(packageId, { v1: '1.1.0' })
    expect(result.config.previousVersionBuilderVersion).toBe('1.1.0')
    expect(result.config).not.toHaveProperty('currentVersionBuilderVersion')
  })

  it('should set currentVersionBuilderVersion when current version has different apiProcessorVersion', async () => {
    const result = await buildChangelogWithVersionOverrides(packageId, { v2: '1.1.0' })
    expect(result.config).not.toHaveProperty('previousVersionBuilderVersion')
    expect(result.config.currentVersionBuilderVersion).toBe('1.1.0')
  })

  it('should set both when both versions differ from current', async () => {
    const result = await buildChangelogWithVersionOverrides(packageId, {
      v1: '1.1.0',
      v2: '1.0.1',
    })
    expect(result.config.previousVersionBuilderVersion).toBe('1.1.0')
    expect(result.config.currentVersionBuilderVersion).toBe('1.0.1')
  })

  it('should not set either when both versions match current apiProcessorVersion', async () => {
    const result = await buildChangelogWithVersionOverrides(packageId, {})
    expect(result.config).not.toHaveProperty('previousVersionBuilderVersion')
    expect(result.config).not.toHaveProperty('currentVersionBuilderVersion')
  })
})
