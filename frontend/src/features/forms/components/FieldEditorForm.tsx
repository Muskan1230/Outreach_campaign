import { useWatch } from 'react-hook-form'
import {
  applicationFieldTypes,
  visibilityOperators,
  type ApplicationFieldRecord,
} from '../../../../../shared/applicationForm'

interface FieldEditorFormProps {
  fieldForm: any
  fields: ApplicationFieldRecord[]
  editingField: ApplicationFieldRecord | null
}

export function FieldEditorForm({ fieldForm, fields, editingField }: FieldEditorFormProps) {
  const fieldType = useWatch({
    control: fieldForm.control,
    name: 'field_type',
  })

  const isTextLike = fieldType === 'Text' || fieldType === 'Email' || fieldType === 'Phone'
  const isNumber = fieldType === 'Number'
  const hasOptions = fieldType === 'Select' || fieldType === 'Radio' || fieldType === 'Checkbox'

  const labelLower = editingField?.label.toLowerCase() || ''
  const isSystemField = ['consent', 'full name', 'mobile number'].includes(labelLower)

  return (
    <div className="form-grid">
      <label className="field">
        <span>Field Type</span>
        <select {...fieldForm.register('field_type')} disabled={isSystemField}>
          {applicationFieldTypes.map((fieldTypeOption: string) => (
            <option key={fieldTypeOption} value={fieldTypeOption}>
              {fieldTypeOption}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Label</span>
        <input {...fieldForm.register('label')} placeholder="Full Name" disabled={isSystemField} />
      </label>

      {fieldType !== 'Checkbox' && fieldType !== 'File Upload' && (
        <label className="field field-wide">
          <span>Placeholder</span>
          <input {...fieldForm.register('placeholder')} placeholder="Enter candidate info" />
        </label>
      )}

      <label className="field">
        <span>Required</span>
        <select {...fieldForm.register('required')} disabled={isSystemField}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>

      <label className="field field-wide">
        <span>Help Text</span>
        <textarea {...fieldForm.register('help_text')} rows={2} placeholder="Tell candidates why this field matters." />
      </label>

      {hasOptions && (
        <label className="field field-wide">
          <span>Options</span>
          <textarea {...fieldForm.register('options')} rows={2} placeholder="Option 1, Option 2, Option 3" />
          <small>Comma-separated list of values.</small>
        </label>
      )}

      {isTextLike && (
        <>
          <label className="field">
            <span>Min Length</span>
            <input type="number" {...fieldForm.register('min_length')} placeholder="e.g. 3" />
          </label>
          <label className="field">
            <span>Max Length</span>
            <input type="number" {...fieldForm.register('max_length')} placeholder="e.g. 100" />
          </label>
          <label className="field field-wide">
            <span>Regex Pattern</span>
            <input {...fieldForm.register('pattern')} placeholder="e.g. ^[A-Za-z ]+$" />
          </label>
        </>
      )}

      {isNumber && (
        <>
          <label className="field">
            <span>Min Value</span>
            <input type="number" {...fieldForm.register('min_value')} placeholder="e.g. 1" />
          </label>
          <label className="field">
            <span>Max Value</span>
            <input type="number" {...fieldForm.register('max_value')} placeholder="e.g. 100" />
          </label>
        </>
      )}

      <label className="field">
        <span>Visibility Controller Field</span>
        <select {...fieldForm.register('controller_field_id')}>
          <option value="">-- Always Visible --</option>
          {fields
            .filter((f) => !editingField || f.id !== editingField.id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.field_type})
              </option>
            ))}
        </select>
      </label>

      <label className="field">
        <span>Visibility Operator</span>
        <select {...fieldForm.register('visibility_operator')}>
          {visibilityOperators.map((operator: string) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-wide">
        <span>Visibility Value</span>
        <input {...fieldForm.register('visibility_value')} placeholder="Yes" />
      </label>

      <label className="field">
        <span>Sort Order</span>
        <input type="number" {...fieldForm.register('sort_order')} placeholder="0" />
      </label>
    </div>
  )
}
