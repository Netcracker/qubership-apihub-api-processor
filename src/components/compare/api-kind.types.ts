import { ApihubApiCompatibilityKind } from '../../consts'
import { ApiKindValueAt } from './traversal.dimensions'

export type ApiKindDimensionFactory = (
  prevDocumentApiKind?: ApihubApiCompatibilityKind,
  currDocumentApiKind?: ApihubApiCompatibilityKind,
) => ApiKindValueAt
