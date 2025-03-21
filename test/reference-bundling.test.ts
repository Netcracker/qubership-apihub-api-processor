import { LocalRegistry } from './helpers'

describe('Reference bundling test', () => {
  test('external references should be bundled', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case1')
    const result = await pkg.publish(pkg.packageId, { packageId: pkg.packageId })

    expect(result.documents.get('openapi.yaml')?.dependencies).toEqual(['reference.yaml'])
  })

  test('should throw on missing external reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case2')

    await expect(pkg.publish(pkg.packageId)).rejects.toThrow(/Cannot resolve/)
  })

  test('should not throw on missing external reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case2')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      strictValidation: false,
    })

    expect(result.operations.size).toBe(1)
    expect(result.documents.get('openapi.yaml')?.dependencies.length).toBe(0)
  })

  test('transitive external references should be bundled', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case3')
    const result = await pkg.publish(pkg.packageId, { packageId: pkg.packageId })

    expect(result.documents.get('openapi.yaml')?.dependencies).toEqual([
      'reference.yaml',
      'transitive-reference.yaml',
    ])
  })

  test('should throw on missing transitive external reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case4')

    await expect(pkg.publish(pkg.packageId)).rejects.toThrow(/Cannot resolve/)
  })

  test('should not throw on missing transitive external reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case4')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      strictValidation: false,
    })

    expect(result.operations.size).toBe(1)
    expect(result.documents.get('openapi.yaml')?.dependencies).toEqual(['reference.yaml'])
  })

  test('should throw on missing internal reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case5')

    await expect(pkg.publish(pkg.packageId)).rejects.toThrow(/\$ref can't be resolved/)
  })

  test('should not throw on missing internal reference', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case5')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      strictValidation: false,
    })

    expect(result.operations.size).toBe(1)
  })
})
