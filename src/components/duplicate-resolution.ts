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
 * A claimant is graded against the worst of the others, and never harsher than its own grading (`Error` is 0,
 * `Warning` is 1). With three or more claimants that is not one severity per id: a REST document colliding
 * with two AsyncAPI ones is a `Warning`, while those two are an `Error` with each other.
 */
export function reportCollisions<T extends { documentId: string }>(
  claims: Claims<T>,
  notifications: NotificationMessage[],
  category: MessageCategory,
  severityOf: (claimant: T) => MessageSeverity,
  describe: (key: string, documentIds: string[]) => string,
): void {
  for (const [key, claimants] of claims) {
    const distinct = [...new Map(claimants.map(claimant => [claimant.documentId, claimant])).values()]
    if (distinct.length < 2) { continue }

    const documentIds = distinct.map(({ documentId }) => documentId).sort()
    const message = describe(key, documentIds)
    for (const claimant of distinct) {
      // the worst of the others, never harsher than the claimant's own grading
      const others = distinct.filter(other => other !== claimant).map(severityOf)
      const severity = Math.max(severityOf(claimant), Math.min(...others)) as MessageSeverity
      notifications.push({ category, severity, message, documentId: claimant.documentId })
    }
  }
}

/** `'a' and 'b'` for a pair, `'a', 'b', 'c'` beyond it. */
export function listDocuments(documentIds: string[]): string {
  const quoted = documentIds.map(documentId => `'${documentId}'`)
  return quoted.length === 2 ? `${quoted[0]} and ${quoted[1]}` : quoted.join(', ')
}
