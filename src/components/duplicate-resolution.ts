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

import { MessageCategory, MessageSeverity, NotificationMessage } from '../types/package/notifications'

/** Everything that claimed one id, keyed by it. A document claiming an id twice is its own diagnostic. */
export type Claims<T> = Map<string, T[]>

export function collectClaim<T>(claims: Claims<T>, key: string, claimant: T): void {
  const claimants = claims.get(key)
  if (claimants) { claimants.push(claimant) } else { claims.set(key, [claimant]) }
}

/**
 * Report every id two or more documents claimed, one message per document.
 *
 * One message naming them all would leave every document but one unflagged, so each claimant gets its own,
 * carrying the same text. A document claiming one id twice is its own diagnostic, not a collision.
 *
 * The severity belongs to the collision, not to a claimant: `severityOf` is asked once per contested id, with
 * one of its claimants. A caller whose severity depends on the claimant must key so that every claimant of a
 * key agrees on it, or the answer would follow whichever document `config.files` listed first.
 */
export function reportCollisions<T extends { documentId: string }>(
  claims: Claims<T>,
  notifications: NotificationMessage[],
  category: MessageCategory,
  severityOf: (claimant: T) => MessageSeverity,
  describe: (key: string, documentIds: string[]) => string,
): void {
  for (const [key, claimants] of claims) {
    const [first] = claimants
    const documentIds = [...new Set(claimants.map(({ documentId }) => documentId))].sort()
    if (!first || documentIds.length < 2) { continue }

    const severity = severityOf(first)
    const message = describe(key, documentIds)
    for (const documentId of documentIds) {
      notifications.push({ category, severity, message, documentId })
    }
  }
}

/** `'a' and 'b'` for a pair, `'a', 'b', 'c'` beyond it. */
export function listDocuments(documentIds: string[]): string {
  const quoted = documentIds.map(documentId => `'${documentId}'`)
  return quoted.length === 2 ? `${quoted[0]} and ${quoted[1]}` : quoted.join(', ')
}
