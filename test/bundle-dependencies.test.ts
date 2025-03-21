import { LocalRegistry } from './helpers'

describe('Bundle dependencies test', () => {
  test('components external dependencies should be bundled', async () => {
    const pkg = LocalRegistry.openPackage('bundle-dependencies/case1')
    const result = await pkg.publish(pkg.packageId, { packageId: pkg.packageId })

    expect(result.documents.get('main.yaml')?.dependencies).toEqual(['dependency.yaml'])
  })

  // todo test transitive deps bundling (unknown document)

  test('should throw on invalid ref', async () => {
    const pkg = LocalRegistry.openPackage('bundle-dependencies/case2')

    await expect(pkg.publish(pkg.packageId)).rejects.toThrowError(/\$ref can't be resolved/)
  })

  test('should not throw on invalid ref', async () => {
    const pkg = LocalRegistry.openPackage('bundle-dependencies/case2')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      strictValidation: false,
    })

    expect(result.documents.get('main.yaml')?.dependencies.length).toBe(0)
  })
})
