import { describe, expect, test } from '@jest/globals'
import { GraphApiOperation } from '@netcracker/qubership-apihub-graphapi'
import { buildGraphQLSearchText } from '../src/apitypes/graphql/graphql.utils'
import { Editor, LocalRegistry } from './helpers'
import { calculateGraphqlOperationId } from '../src/utils'

describe('buildGraphQLSearchText', () => {

  describe('Searchable content', () => {

    test('should include operation name', () => {
      const operation: GraphApiOperation = {
        output: { typeDef: { $ref: '#/components/scalars/String' } },
      }

      const result = buildGraphQLSearchText('getUser', operation)

      expect(result).toContain('getUser')
    })

    test('should include description text', () => {
      const operation: GraphApiOperation = {
        description: 'The operation allows get a Payment Method',
        output: { typeDef: { $ref: '#/components/scalars/String' } },
      }

      const result = buildGraphQLSearchText('getPaymentMethodCore', operation)

      expect(result).toContain('The operation allows get a Payment Method')
    })

    test('should include argument names', () => {
      const operation: GraphApiOperation = {
        args: {
          id: { typeDef: { $ref: '#/components/scalars/String' } },
          includeDeleteEntities: { typeDef: { $ref: '#/components/scalars/Boolean' } },
        },
        output: { typeDef: { $ref: '#/components/objects/PaymentMethodCore' } },
      }

      const result = buildGraphQLSearchText('getPaymentMethodCore', operation)

      expect(result).toContain('id')
      expect(result).toContain('includeDeleteEntities')
    })

    test('should include argument base types', () => {
      const operation: GraphApiOperation = {
        args: {
          id: { typeDef: { $ref: '#/components/scalars/String' } },
          includeDeleteEntities: { typeDef: { $ref: '#/components/scalars/Boolean' } },
        },
        output: { typeDef: { $ref: '#/components/objects/PaymentMethodCore' } },
      }

      const result = buildGraphQLSearchText('getPaymentMethodCore', operation)

      expect(result).toContain('String')
      expect(result).toContain('Boolean')
    })

    test('should include return type name', () => {
      const operation: GraphApiOperation = {
        output: { typeDef: { $ref: '#/components/objects/PaymentMethodCore' } },
      }

      const result = buildGraphQLSearchText('getPaymentMethodCore', operation)

      expect(result).toContain('PaymentMethodCore')
    })

    test('should produce expected search text for full operation (design doc example)', () => {
      // From the design doc:
      // type Query {
      //   """The operation allows get a Payment Method"""
      //   getPaymentMethodCore(
      //     id: String
      //     includeDeleteEntities: Boolean
      //   ): PaymentMethodCore
      // }
      // Expected: "getPaymentMethodCore The operation allows get a Payment Method id String includeDeleteEntities Boolean PaymentMethodCore"

      const operation: GraphApiOperation = {
        description: 'The operation allows get a Payment Method',
        args: {
          id: { typeDef: { $ref: '#/components/scalars/String' } },
          includeDeleteEntities: { typeDef: { $ref: '#/components/scalars/Boolean' } },
        },
        output: { typeDef: { $ref: '#/components/objects/PaymentMethodCore' } },
      }

      const result = buildGraphQLSearchText('getPaymentMethodCore', operation)

      expect(result).toBe(
        'getPaymentMethodCore The operation allows get a Payment Method id String includeDeleteEntities Boolean PaymentMethodCore',
      )
    })
  })

  describe('Not searchable content', () => {

    test('should not include nested field names from object types', () => {
      // A PaymentMethodCore type with nested fields like zipCode should not appear
      // Only the top-level type name should be in the search text
      const operation: GraphApiOperation = {
        args: {
          input: {
            typeDef: {
              $ref: '#/components/inputObjects/PaymentInput',
            },
          },
        },
        output: {
          typeDef: {
            $ref: '#/components/objects/PaymentMethodCore',
          },
        },
      }

      const result = buildGraphQLSearchText('createPayment', operation)

      // Should contain the type name but not any nested fields
      expect(result).toContain('PaymentInput')
      expect(result).toContain('PaymentMethodCore')
      // Nested fields like zipCode, streetAddress, etc. should NOT be present
      expect(result).not.toContain('zipCode')
      expect(result).not.toContain('streetAddress')
    })

    test('should not include enum values', () => {
      // Even if an arg is an enum type, only the enum type name is included, not its values
      const operation: GraphApiOperation = {
        args: {
          status: { typeDef: { $ref: '#/components/enums/PaymentStatus' } },
        },
        output: { typeDef: { $ref: '#/components/scalars/Boolean' } },
      }

      const result = buildGraphQLSearchText('deletePayment', operation)

      expect(result).toContain('PaymentStatus')
      // Enum values like ACTIVE, INACTIVE, PENDING should NOT be present
      expect(result).not.toContain('ACTIVE')
      expect(result).not.toContain('INACTIVE')
    })

    test('should not include deeply nested types from components', () => {
      // The function only looks at top-level arg typeDef refs and output typeDef ref
      // It does NOT traverse into component definitions
      const operation: GraphApiOperation = {
        output: {
          typeDef: {
            $ref: '#/components/objects/Order',
          },
        },
      }

      const result = buildGraphQLSearchText('getOrder', operation)

      expect(result).toBe('getOrder Order')
      // Nested types like OrderItem, Product, Address should NOT appear
      expect(result).not.toContain('OrderItem')
      expect(result).not.toContain('Product')
    })
  })

  describe('Edge cases', () => {

    test('should handle operation with no args and no description', () => {
      const operation: GraphApiOperation = {
        output: { typeDef: { $ref: '#/components/scalars/String' } },
      }

      const result = buildGraphQLSearchText('healthCheck', operation)

      expect(result).toBe('healthCheck String')
    })

    test('should handle undefined operation', () => {
      const result = buildGraphQLSearchText('missingOp', undefined)

      expect(result).toBe('missingOp')
    })

    test('should handle operation with inline typeDef (no $ref)', () => {
      const operation: GraphApiOperation = {
        args: {
          name: { typeDef: { type: 'string' } as any },
        },
        output: { typeDef: { type: 'string' } as any },
      }

      const result = buildGraphQLSearchText('inlineOp', operation)

      // Only the method name and arg name — no type names extracted from inline defs
      expect(result).toBe('inlineOp name')
    })

    test('should handle operation with empty args object', () => {
      const operation: GraphApiOperation = {
        args: {},
        output: { typeDef: { $ref: '#/components/scalars/Int' } },
      }

      const result = buildGraphQLSearchText('countItems', operation)

      expect(result).toBe('countItems Int')
    })

    test('should handle arg with undefined typeDef', () => {
      const operation: GraphApiOperation = {
        args: {
          filter: { typeDef: undefined as any },
        },
        output: { typeDef: { $ref: '#/components/objects/Result' } },
      }

      const result = buildGraphQLSearchText('search', operation)

      expect(result).toBe('search filter Result')
    })
  })

  describe('E2E: full build pipeline', () => {
    // Uses spec.gql from test/projects/graphql/:
    //   type Query {
    //     """Get list of Pets"""
    //     listPets(listId: String): [Pet!]
    //     """Get Pet by ID"""
    //     getPet(id: String!): Pet
    //     """Get list of Users"""
    //     listUsers(listId: String): [User!]
    //     """Get User by ID"""
    //     getUser(id: String!): User
    //   }
    //   type Mutation {
    //     """Pet availability check"""
    //     petAvailabilityCheck(input: AvailabilityCheckRequest): [AvailabilityCheckResult!]
    //   }

    let pkg: LocalRegistry

    beforeAll(async () => {
      pkg = LocalRegistry.openPackage('graphql')
      await pkg.publish('graphql', {
        packageId: 'graphql',
        version: 'v1',
        files: [{ fileId: 'spec.gql' }],
      })
    })

    test('GraphQL operations should have search with useOperationDataAsSearchText=false and searchTextFilePath', async () => {
      const editor = await Editor.openProject('graphql', pkg)
      const result = await editor.run({
        packageId: 'graphql',
        version: 'v1',
        files: [{ fileId: 'spec.gql' }],
      })

      for (const operation of Array.from(result.operations.values())) {
        expect(operation.search).toEqual({
          useOperationDataAsSearchText: false,
          searchTextFilePath: `search/${operation.operationId}.txt`,
        })
      }
    })

    test('searchText should contain operation name, description, and argument names', async () => {
      const editor = await Editor.openProject('graphql', pkg)
      const result = await editor.run({
        packageId: 'graphql',
        version: 'v1',
        files: [{ fileId: 'spec.gql' }],
      })

      const listPetsId = calculateGraphqlOperationId('query', 'listPets')
      const listPets = result.operations.get(listPetsId)
      expect(listPets).toBeDefined()
      expect(listPets!.searchText).toContain('listPets')
      expect(listPets!.searchText).toContain('Get list of Pets')
      expect(listPets!.searchText).toContain('listId')
    })

    test('searchText should NOT contain nested field names from referenced types', async () => {
      const editor = await Editor.openProject('graphql', pkg)
      const result = await editor.run({
        packageId: 'graphql',
        version: 'v1',
        files: [{ fileId: 'spec.gql' }],
      })

      const getPetId = calculateGraphqlOperationId('query', 'getPet')
      const getPet = result.operations.get(getPetId)
      expect(getPet).toBeDefined()

      // Searchable: operation name, description, arg names/types, return type
      expect(getPet!.searchText).toContain('getPet')
      expect(getPet!.searchText).toContain('Get Pet by ID')
      expect(getPet!.searchText).toContain('id')
      expect(getPet!.searchText).toContain('Pet')

      // NOT searchable: nested fields of Pet type (name, category, status, age)
      expect(getPet!.searchText).not.toContain('category')
      expect(getPet!.searchText).not.toContain('status')
      expect(getPet!.searchText).not.toContain('age')
    })

    test('searchText should NOT contain nested field names from input or output types', async () => {
      const editor = await Editor.openProject('graphql', pkg)
      const result = await editor.run({
        packageId: 'graphql',
        version: 'v1',
        files: [{ fileId: 'spec.gql' }],
      })

      const mutationId = calculateGraphqlOperationId('mutation', 'petAvailabilityCheck')
      const mutation = result.operations.get(mutationId)
      expect(mutation).toBeDefined()

      // Searchable: operation name, description, argument name
      expect(mutation!.searchText).toContain('petAvailabilityCheck')
      expect(mutation!.searchText).toContain('Pet availability check')
      expect(mutation!.searchText).toContain('input')

      // NOT searchable: nested fields of AvailabilityCheckRequest (petId)
      // and AvailabilityCheckResult (petId, availabilityCheckResult, availabilityCheckResultMessage)
      expect(mutation!.searchText).not.toContain('petId')
      expect(mutation!.searchText).not.toContain('availabilityCheckResult')
      expect(mutation!.searchText).not.toContain('availabilityCheckResultMessage')
    })
  })
})
