import type { ApplicationFieldRecord } from '../../../../../shared/applicationForm'

export function isFieldVisible(
  field: ApplicationFieldRecord,
  values: Record<string, string | string[]>,
) {
  const condition = field.visibility_condition
  if (!condition) return true

  const controllerValue = values[condition.field_id]
  const normalized = Array.isArray(controllerValue) ? controllerValue.join(', ') : controllerValue ?? ''
  const comparison = condition.value ?? ''

  switch (condition.operator) {
    case 'equals':
      return normalized === comparison
    case 'not_equals':
      return normalized !== comparison
    case 'contains':
      return normalized.includes(comparison)
    case 'is_empty':
      return normalized.trim().length === 0
    default:
      return true
  }
}
