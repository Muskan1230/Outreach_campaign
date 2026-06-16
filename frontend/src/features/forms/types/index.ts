import { z } from 'zod'
import type {
  ApplicationFieldPayload,
  VisibilityOperator,
} from '../../../../../shared/applicationForm'

export const formMetaSchema = z.object({
  name: z.string().trim().min(2, 'Form name is required'),
  description: z.string().trim(),
  supported_languages: z.string(),
})

export type FormMetaValues = z.infer<typeof formMetaSchema>

export type FieldEditorValues = {
  field_type: ApplicationFieldPayload['field_type']
  label: string
  placeholder: string
  required: string
  help_text: string
  options: string
  min_length: string
  max_length: string
  min_value: string
  max_value: string
  pattern: string
  controller_field_id: string
  visibility_operator: VisibilityOperator
  visibility_value: string
  sort_order: string
}
