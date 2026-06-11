import { useEffect, useState } from 'react'
import type { ApplicationFieldRecord } from '../../../../../shared/applicationForm'
import { isFieldVisible } from '../utils/visibility'

interface FieldPreviewProps {
  fields: ApplicationFieldRecord[]
  title: string
}

export function FieldPreview({ fields, title }: FieldPreviewProps) {
  const [values, setValues] = useState<Record<string, string | string[]>>({})

  useEffect(() => {
    const initialValues: Record<string, string | string[]> = {}
    fields.forEach((field) => {
      if (field.field_type === 'Checkbox') {
        initialValues[field.id] = []
      } else {
        initialValues[field.id] = ''
      }
    })
    setValues(initialValues)
  }, [fields])

  const updateValue = (fieldId: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [fieldId]: value }))
  }

  const renderField = (field: ApplicationFieldRecord) => {
    const currentValue = values[field.id]

    if (!isFieldVisible(field, values)) return null

    const sharedLabel = (
      <div className="preview-field-label">
        <span>
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        {field.help_text ? <small>{field.help_text}</small> : null}
      </div>
    )

    switch (field.field_type) {
      case 'Text':
      case 'Email':
      case 'Phone':
      case 'Number':
      case 'Date':
        return (
          <label className="preview-field" key={field.id}>
            {sharedLabel}
            <input
              type={
                field.field_type === 'Email'
                  ? 'email'
                  : field.field_type === 'Phone'
                    ? 'tel'
                    : field.field_type === 'Number'
                      ? 'number'
                      : field.field_type === 'Date'
                        ? 'date'
                        : 'text'
              }
              placeholder={field.placeholder || field.label}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(event) => updateValue(field.id, event.target.value)}
            />
          </label>
        )
      case 'File Upload':
        return (
          <label className="preview-field" key={field.id}>
            {sharedLabel}
            <input type="file" disabled />
          </label>
        )
      case 'Select':
        return (
          <label className="preview-field" key={field.id}>
            {sharedLabel}
            <select
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(event) => updateValue(field.id, event.target.value)}
            >
              <option value="">Select an option</option>
              {(field.options ?? []).map((option: string) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )
      case 'Radio':
        return (
          <fieldset className="preview-field" key={field.id}>
            {sharedLabel}
            <div className="preview-options">
              {(field.options ?? []).map((option: string) => (
                <label key={option} className="preview-option">
                  <input
                    type="radio"
                    name={field.id}
                    value={option}
                    checked={currentValue === option}
                    onChange={(event) => updateValue(field.id, event.target.value)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      case 'Checkbox':
        return (
          <fieldset className="preview-field" key={field.id}>
            {sharedLabel}
            <div className="preview-options">
              {(field.options ?? []).map((option: string) => {
                const selected = Array.isArray(currentValue) ? currentValue : []
                return (
                  <label key={option} className="preview-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(option)}
                      onChange={(event) => {
                        const next = new Set(selected)
                        if (event.target.checked) next.add(option)
                        else next.delete(option)
                        updateValue(field.id, Array.from(next))
                      }}
                    />
                    <span>{option}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      default:
        return null
    }
  }

  return (
    <section className="preview-card">
      <div className="preview-card-head">
        <div>
          <span className="eyebrow">Form Preview</span>
          <h2>{title}</h2>
        </div>
        <p>
          {fields.length} field{fields.length === 1 ? '' : 's'}
        </p>
      </div>
      {fields.length === 0 ? (
        <div className="empty-preview">
          <span>👁️</span>
          <p>Add fields to see a live preview</p>
        </div>
      ) : (
        <div className="preview-form">{fields.map((field) => renderField(field))}</div>
      )}
    </section>
  )
}
