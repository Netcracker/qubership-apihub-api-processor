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

import { NotificationsError } from '../../src/errors'

/**
 * Wait for a promise that must reject and return what it rejected with. A promise that resolves fails here,
 * instead of at a later assertion that would report the resolved value as the wrong error.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => { throw new Error('Expected the promise to reject, but it resolved') },
    (reason: unknown) => reason,
  )
}

/** Wait for a build that must fail with a `NotificationsError` and return the error. */
export async function notificationsErrorOf(promise: Promise<unknown>): Promise<NotificationsError> {
  const error = await rejectionOf(promise)
  expect(error).toBeInstanceOf(NotificationsError)
  return error as NotificationsError
}
