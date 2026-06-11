export const applicationFieldTypes = [
  'Text',
  'Email',
  'Phone',
  'Number',
  'Select',
  'Radio',
  'Checkbox',
  'Date',
  'File Upload',
] as const

export const visibilityOperators = ['equals', 'not_equals', 'contains', 'is_empty'] as const

export type ApplicationFieldType = (typeof applicationFieldTypes)[number]
export type VisibilityOperator = (typeof visibilityOperators)[number]

export type ApplicationFormPayload = {
  name: string
  description?: string
  campaign_id?: string | null
  supported_languages?: string[]
  is_published?: boolean
}

export type ApplicationFormRecord = ApplicationFormPayload & {
  id: string
  campaign_id: string | null
  job_id: string
  version: number
  allow_save_and_continue: boolean
  is_active: boolean
  is_published: boolean
  created_by?: string | null
  supported_languages: string[]
  created_at: string
  updated_at: string
}

export type ValidationRules = Record<string, string | number | boolean | string[] | null>

export type VisibilityCondition = {
  field_id: string
  operator: VisibilityOperator
  value?: string
}

export type ApplicationFieldPayload = {
  field_type: ApplicationFieldType
  label: string
  placeholder?: string
  required: boolean
  help_text?: string
  options?: string[]
  validation_rules?: ValidationRules
  visibility_condition?: VisibilityCondition | null
  sort_order?: number
}

export type ApplicationFieldRecord = ApplicationFieldPayload & {
  id: string
  form_id: string
  created_at: string
  updated_at: string
}

export type ApplicationFormWithFields = ApplicationFormRecord & {
  fields: ApplicationFieldRecord[]
}

export type ApplicationFormListItem = Pick<
  ApplicationFormRecord,
  | 'id'
  | 'name'
  | 'description'
  | 'campaign_id'
  | 'job_id'
  | 'version'
  | 'allow_save_and_continue'
  | 'is_active'
  | 'is_published'
  | 'supported_languages'
  | 'created_at'
  | 'updated_at'
> & {
  field_count: number
}
