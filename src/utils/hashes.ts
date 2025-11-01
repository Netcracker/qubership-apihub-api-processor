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

import objectHash, { NotUndefined } from 'object-hash'
import { HASH_PROPERTY, SEMANTIC_HASH_PROPERTY } from '../consts'
import { isObject } from '@netcracker/qubership-apihub-json-crawl'
import { Jso } from '@netcracker/qubership-apihub-api-unifier'
import { Hash } from '@netcracker/qubership-apihub-api-unifier'


export function calculateObjectHash(value: NotUndefined): Hash {
  // object hash works only with object keys available in Object.keys() method
  return objectHash(value, { algorithm: 'md5' })
}


/**
 * Retrieves the pre-calculated hash from a given value.
 * Assumes hash is pre-calculated via api-unifier `normalize` call with `hashProperty` option.
 *
 * If the value is not an object, calculates and returns its hash using `object-hash` library.
 * If the value is an object, expects the pre-calculated hash to be present on the object under `HASH_PROPERTY`.
 *
 * @param value - The value to retrieve or calculate the hash from.
 * @returns The hash as a string.
 * @throws Error if called on an object that does not have a pre-calculated hash property.
 */
export function getHash(value: NotUndefined): Hash {
  if (!isObject(value)) {
    return calculateObjectHash(value)
  }
  if (!(HASH_PROPERTY in value)) {
    throw new Error('Missing pre-calculated hash on object value')
  }
  return value[HASH_PROPERTY] as Hash
}

/**
 * Retrieves the pre-calculated semantic hash from a given value.
 * Assumes semantic hash is pre-calculated via api-unifier `normalize` call with `semanticHashProperty` option.
 *
 * If a given value is not an object, the function returns undefined.
 * If the semantic hash is not defined for the given value, an error is thrown.
 *
 * @param value - The value to retrieve the semantic hash from.
 * @returns The semantic hash if present, or undefined if the value is not an object.
 * @throws Error if the semantic hash property is missing in the object.
 */
export function getSemanticHash(value: Jso): Hash | undefined {
  if (!isObject(value)) {
    return undefined
  }
  if (!(SEMANTIC_HASH_PROPERTY in value)) {
    throw new Error('Pre-calculated semantic hash is not defined')
  }
  return value[SEMANTIC_HASH_PROPERTY] as Hash
}
