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

import { Diff, DiffAction, DiffType, risky } from '@netcracker/qubership-apihub-api-diff'
import { calculateObjectHash } from './hashes'
import { ArrayType, isEmpty } from './arrays'
import {
  ChangeMessage, ChangeSummary,
  DiffTypeDto,
  OperationChanges,
  OperationChangesDto, OperationType,
  SEMI_BREAKING_CHANGE_TYPE,
  VersionsComparison,
  VersionsComparisonDto,
} from '../types'

export function toChangeMessage(diff: ArrayType<Diff[]>, logError: (message: string) => void): ChangeMessage<DiffTypeDto> {
  const newDiff: ArrayType<Diff<DiffTypeDto>[]> = {
    ...diff,
    type: replaceStringDiffType(diff.type, { origin: risky, override: SEMI_BREAKING_CHANGE_TYPE }) as DiffTypeDto,
  }

  const {
    description,
    action,
    type: severity,
    scope,
  } = newDiff

  const commonChangeProps = {
    description,
    severity,
    scope,
  }

  switch (action) {
    case DiffAction.add: {
      const {
        afterDeclarationPaths,
        afterNormalizedValue,
      } = newDiff
      if (afterNormalizedValue === undefined) {
        logError('Add diff has undefined afterNormalizedValue')
      }
      if (isEmpty(afterDeclarationPaths)) {
        logError('Add diff has empty afterDeclarationPaths')
      }
      return {
        ...commonChangeProps,
        action,
        currentDeclarationJsonPaths: afterDeclarationPaths,
        currentValueHash: afterNormalizedValue !== undefined ? calculateObjectHash(afterNormalizedValue) : '',
      }
    }
    case DiffAction.remove: {
      const {
        beforeDeclarationPaths,
        beforeNormalizedValue,
      } = newDiff
      if (beforeNormalizedValue === undefined) {
        logError('Remove diff has undefined beforeNormalizedValue')
      }
      if (isEmpty(beforeDeclarationPaths)) {
        logError('Remove diff has empty beforeDeclarationPaths')
      }
      return {
        ...commonChangeProps,
        action,
        previousDeclarationJsonPaths: beforeDeclarationPaths,
        previousValueHash: beforeNormalizedValue !== undefined ? calculateObjectHash(beforeNormalizedValue) : '',
      }
    }
    case DiffAction.replace: {
      const {
        beforeDeclarationPaths,
        afterDeclarationPaths,
        beforeNormalizedValue,
        afterNormalizedValue,
      } = newDiff
      if (afterNormalizedValue === undefined && beforeNormalizedValue === undefined) {
        logError('Replace diff has undefined beforeNormalizedValue and afterNormalizedValue')
      }
      if (isEmpty(afterDeclarationPaths) && isEmpty(beforeDeclarationPaths)) {
        logError('Replace diff has empty afterDeclarationPaths and beforeDeclarationPaths')
      }
      return {
        ...commonChangeProps,
        action,
        currentDeclarationJsonPaths: afterDeclarationPaths,
        previousDeclarationJsonPaths: beforeDeclarationPaths,
        currentValueHash: afterNormalizedValue !== undefined ? calculateObjectHash(afterNormalizedValue) : '',
        previousValueHash: beforeNormalizedValue !== undefined ? calculateObjectHash(beforeNormalizedValue) : '',
      }
    }
    case DiffAction.rename: {
      const {
        beforeDeclarationPaths,
        afterDeclarationPaths,
        beforeKey,
        afterKey,
      } = newDiff
      if (isEmpty(afterDeclarationPaths) && isEmpty(beforeDeclarationPaths)) {
        logError('Rename diff has empty afterDeclarationPaths and beforeDeclarationPaths')
      }
      if (afterKey === undefined && beforeKey === undefined) {
        logError('Rename diff has empty beforeKey and afterKey')
      }
      return {
        ...commonChangeProps,
        action,
        currentDeclarationJsonPaths: afterDeclarationPaths,
        previousDeclarationJsonPaths: beforeDeclarationPaths,
        currentKey: afterKey,
        previousKey: beforeKey,
      }
    }
  }
}

export function toOperationChangesDto({
  diffs,
  impactedSummary,
  ...rest
}: OperationChanges, logError: (message: string) => void): OperationChangesDto {
  return {
    ...rest,
    changeSummary: replacePropertyInChangesSummary(rest.changeSummary, {
      origin: risky,
      override: SEMI_BREAKING_CHANGE_TYPE,
    }),
    changes: diffs?.map(diff => toChangeMessage(diff, logError)),
  }
}

export function toVersionsComparisonDto({
  data,
  ...rest
}: VersionsComparison, logError: (message: string) => void): VersionsComparisonDto<DiffTypeDto> {

  console.log(JSON.stringify(rest))
  return {
    ...rest,
    operationTypes: convertDtoFieldOperationTypes(rest.operationTypes),
    data: data?.map(data => toOperationChangesDto(data, logError)),
  }
}

export function convertDtoFieldOperationTypes(operationTypes: ReadonlyArray<OperationType>): OperationType<DiffTypeDto>[] {
  return operationTypes.map((type) => {
    return {
      ...type,
      changesSummary: replacePropertyInChangesSummary(type.changesSummary, {
        origin: risky,
        override: SEMI_BREAKING_CHANGE_TYPE,
      }),
      numberOfImpactedOperations: replacePropertyInChangesSummary(type.numberOfImpactedOperations, {
        origin: risky,
        override: SEMI_BREAKING_CHANGE_TYPE,
      }),
    }
  })
}

export function replacePropertyInChangesSummary(obj: ChangeSummary, {
  origin,
  override,
}: OptionDiffReplacer = {
  origin: SEMI_BREAKING_CHANGE_TYPE,
  override: risky,
}): ChangeSummary<DiffTypeDto | DiffTypeDto> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  obj[override] = obj[origin]
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete obj[origin]
  return obj as ChangeSummary<DiffTypeDto>
}

export type DiffTypeCompare = DiffType | DiffTypeDto
export type OptionDiffReplacer = {
  origin: DiffTypeCompare
  override: DiffTypeCompare
}

export function replaceStringDiffType(value: DiffTypeCompare,
  {
    origin,
    override,
  }: OptionDiffReplacer = { origin: SEMI_BREAKING_CHANGE_TYPE, override: risky }): DiffTypeCompare {
  return value === origin ? override : value
}
