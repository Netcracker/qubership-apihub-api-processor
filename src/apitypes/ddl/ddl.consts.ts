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

import { DDL_CONTRACT_API_TYPE, FILE_FORMAT_DDL, FILE_FORMAT_SQL } from '../../consts'

export const DDL_API_TYPE = DDL_CONTRACT_API_TYPE

export const DDL_DOCUMENT_TYPE = {
  DDL: 'ddl',
} as const

export const DDL_FILE_FORMATS = [FILE_FORMAT_DDL, FILE_FORMAT_SQL] as const
