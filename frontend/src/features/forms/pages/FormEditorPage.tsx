import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  applicationFieldTypes,
  visibilityOperators,
  type ApplicationFieldPayload,
  type ApplicationFieldRecord,
  type ApplicationFormPayload,
  type ApplicationFormRecord,
  type ApplicationFormWithFields,
  type VisibilityCondition,
} from '../../../../../shared/applicationForm'
import {
  createForm,
  createFormField,
  deleteFormField,
  getForm,
  updateForm,
  updateFormField,
} from '../services/formService'
import { formMetaSchema, type FormMetaValues, type FieldEditorValues } from '../types'
import { FieldPreview } from '../components/FieldPreview'
import { useWatch } from 'react-hook-form'

/* ─────────────────────── helpers ─────────────────────── */
function toFormMetaValues(form?: ApplicationFormRecord | null): FormMetaValues {
  return {
    name: form?.name ?? '',
    description: form?.description ?? '',
    supported_languages: Array.isArray(form?.supported_languages)
      ? form?.supported_languages?.join(', ') ?? ''
      : '',
  }
}
function parseLanguages(v: string) {
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}
function toFieldEditorValues(field?: ApplicationFieldRecord | null): FieldEditorValues {
  return {
    field_type: field?.field_type ?? 'Text',
    label: field?.label ?? '',
    placeholder: field?.placeholder ?? '',
    required: field?.required ? 'true' : 'false',
    help_text: field?.help_text ?? '',
    options: (field?.options ?? []).join(', '),
    min_length: String(field?.validation_rules?.minLength ?? ''),
    max_length: String(field?.validation_rules?.maxLength ?? ''),
    min_value: String(field?.validation_rules?.min ?? ''),
    max_value: String(field?.validation_rules?.max ?? ''),
    pattern: String(field?.validation_rules?.pattern ?? ''),
    controller_field_id: field?.visibility_condition?.field_id ?? '',
    visibility_operator: field?.visibility_condition?.operator ?? 'equals',
    visibility_value: field?.visibility_condition?.value ?? '',
    sort_order: String(field?.sort_order ?? ''),
  }
}
function parseNumber(v: string) {
  const t = v.trim()
  if (!t) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
function parseOptions(v: string) {
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}
function toFieldPayload(values: FieldEditorValues): ApplicationFieldPayload {
  const validation_rules: Record<string, string | number | boolean | string[] | null> = {}
  const minLength = parseNumber(values.min_length)
  const maxLength = parseNumber(values.max_length)
  const minValue = parseNumber(values.min_value)
  const maxValue = parseNumber(values.max_value)
  if (minLength !== undefined) validation_rules.minLength = minLength
  if (maxLength !== undefined) validation_rules.maxLength = maxLength
  if (minValue !== undefined) validation_rules.min = minValue
  if (maxValue !== undefined) validation_rules.max = maxValue
  if (values.pattern.trim()) validation_rules.pattern = values.pattern.trim()

  const visibility_condition: VisibilityCondition | null =
    values.controller_field_id.trim() &&
    (values.visibility_value.trim() || values.visibility_operator === 'is_empty')
      ? {
          field_id: values.controller_field_id.trim(),
          operator: values.visibility_operator,
          value: values.visibility_operator === 'is_empty' ? '' : values.visibility_value.trim(),
        }
      : null

  let isRequired = values.required === 'true'
  const labelLower = values.label.trim().toLowerCase()
  if (labelLower === 'consent' || labelLower === 'full name' || labelLower === 'mobile number') {
    isRequired = true
  }

  return {
    field_type: values.field_type,
    label: values.label.trim(),
    placeholder: values.placeholder.trim(),
    required: isRequired,
    help_text: values.help_text.trim(),
    options: parseOptions(values.options),
    validation_rules,
    visibility_condition,
    sort_order: parseNumber(values.sort_order),
  }
}
function ruleSummary(field: ApplicationFieldRecord) {
  const rules = field.validation_rules ?? {}
  const parts: string[] = []
  if (typeof rules.minLength === 'number') parts.push(`Min ${rules.minLength} chars`)
  if (typeof rules.maxLength === 'number') parts.push(`Max ${rules.maxLength} chars`)
  if (typeof rules.min === 'number') parts.push(`Min ${rules.min}`)
  if (typeof rules.max === 'number') parts.push(`Max ${rules.max}`)
  if (typeof rules.pattern === 'string') parts.push(`Pattern`)
  return parts.length ? parts.join(' · ') : null
}
const SYSTEM_FIELDS = ['consent', 'full name', 'mobile number']
const isSystemField = (label: string) => SYSTEM_FIELDS.includes(label.toLowerCase())

/* ─────────────────────── Field type icons ─────────────────────── */
const TYPE_ICON: Record<string, React.ReactNode> = {
  Text: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  Email: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  ),
  Phone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  Number: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  ),
  Date: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Select: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Radio: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  ),
  Checkbox: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  'File Upload': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
}


/* ─────────────────────── FieldInspector (tabs) ─────────────────────── */
function FieldInspector({
  fieldForm,
  fields,
  editingField,
  onSave,
  onCancel,
}: {
  fieldForm: any
  fields: ApplicationFieldRecord[]
  editingField: ApplicationFieldRecord | null
  onSave: (v: FieldEditorValues) => void
  onCancel: () => void
}) {
  const [tab, setTab] = useState<'basic' | 'validation' | 'visibility'>('basic')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const fieldType = useWatch({ control: fieldForm.control, name: 'field_type' })
  const isTextLike = fieldType === 'Text' || fieldType === 'Email' || fieldType === 'Phone'
  const isNumber = fieldType === 'Number'
  const hasOptions = fieldType === 'Select' || fieldType === 'Radio' || fieldType === 'Checkbox'
  const showPlaceholder = fieldType !== 'Checkbox' && fieldType !== 'File Upload'
  const isLocked = editingField ? isSystemField(editingField.label) : false

  const hasValidation = isTextLike || isNumber
  const controllerFieldId = useWatch({ control: fieldForm.control, name: 'controller_field_id' })

  return (
    <form
      className="fi-form"
      onSubmit={fieldForm.handleSubmit((v: FieldEditorValues) => onSave(v))}
    >
      {/* Header */}
      <div className="fi-header">
        <div className="fi-header-left">
          <span className="fi-icon">
            {TYPE_ICON[fieldType] ?? 'T'}
          </span>
          <div>
            <div className="fi-title">
              {editingField ? editingField.label || 'Edit Field' : 'New Field'}
            </div>
            <div className="fi-subtitle">{editingField ? 'Edit field settings' : 'Configure new field'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isLocked && <span className="fi-lock-badge">🔒 System</span>}
          {editingField && <span className="status-pill status-active">Editing</span>}
        </div>
      </div>

      {isLocked && (
        <div className="fi-locked-note">
          This is a mandatory system field. Label and type cannot be changed.
        </div>
      )}

      {/* Tabs */}
      <div className="fi-tabs">
        <button
          type="button"
          className={`fi-tab${tab === 'basic' ? ' fi-tab-active' : ''}`}
          onClick={() => setTab('basic')}
        >
          Basic
        </button>
        <button
          type="button"
          className={`fi-tab${tab === 'validation' ? ' fi-tab-active' : ''}`}
          onClick={() => setTab('validation')}
          disabled={!hasValidation}
          title={!hasValidation ? 'No validation rules for this field type' : undefined}
        >
          Validation
        </button>
        <button
          type="button"
          className={`fi-tab${tab === 'visibility' ? ' fi-tab-active' : ''}`}
          onClick={() => setTab('visibility')}
        >
          Visibility
          {controllerFieldId ? <span className="fi-tab-dot" /> : null}
        </button>
      </div>

      {/* Tab content */}
      <div className="fi-body">
        {tab === 'basic' && (
          <div className="fi-section">
            <div className="fi-row-2">
              <div className="fi-field">
                <label className="fi-label">Field Type</label>
                <select
                  {...fieldForm.register('field_type')}
                  className="fi-input fi-select"
                  disabled={isLocked}
                >
                  {applicationFieldTypes.map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="fi-field">
                <label className="fi-label">Required</label>
                <select
                  {...fieldForm.register('required')}
                  className="fi-input fi-select"
                  disabled={isLocked}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div className="fi-field fi-field-full">
              <label className="fi-label">Label</label>
              <input
                {...fieldForm.register('label')}
                className="fi-input"
                placeholder="e.g. Full Name"
                disabled={isLocked}
              />
            </div>

            {showPlaceholder && (
              <div className="fi-field fi-field-full">
                <label className="fi-label">Placeholder</label>
                <input
                  {...fieldForm.register('placeholder')}
                  className="fi-input"
                  placeholder="e.g. Enter your name"
                />
              </div>
            )}

            <div className="fi-field fi-field-full">
              <label className="fi-label">Help Text <span className="fi-label-opt">optional</span></label>
              <textarea
                {...fieldForm.register('help_text')}
                className="fi-input fi-textarea"
                rows={2}
                placeholder="Short hint shown below the input"
              />
            </div>

            {hasOptions && (
              <div className="fi-field fi-field-full">
                <label className="fi-label">Options</label>
                <textarea
                  {...fieldForm.register('options')}
                  className="fi-input fi-textarea"
                  rows={3}
                  placeholder="Option A, Option B, Option C"
                />
                <span className="fi-hint">Comma-separated values</span>
              </div>
            )}

            {/* Advanced toggle */}
            <button
              type="button"
              className="fi-advanced-toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span>{advancedOpen ? '▾' : '▸'} Advanced</span>
              <span className="fi-hint-inline">sort order</span>
            </button>
            {advancedOpen && (
              <div className="fi-field">
                <label className="fi-label">Sort Order</label>
                <input
                  type="number"
                  {...fieldForm.register('sort_order')}
                  className="fi-input"
                  placeholder="0"
                  style={{ maxWidth: 120 }}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'validation' && hasValidation && (
          <div className="fi-section">
            {isTextLike && (
              <>
                <p className="fi-section-note">Set minimum and maximum character lengths, or a regex pattern.</p>
                <div className="fi-row-2">
                  <div className="fi-field">
                    <label className="fi-label">Min Length</label>
                    <input type="number" {...fieldForm.register('min_length')} className="fi-input" placeholder="e.g. 3" />
                  </div>
                  <div className="fi-field">
                    <label className="fi-label">Max Length</label>
                    <input type="number" {...fieldForm.register('max_length')} className="fi-input" placeholder="e.g. 100" />
                  </div>
                </div>
                <div className="fi-field fi-field-full">
                  <label className="fi-label">Regex Pattern <span className="fi-label-opt">optional</span></label>
                  <input {...fieldForm.register('pattern')} className="fi-input" placeholder="^[A-Za-z ]+$" />
                  <span className="fi-hint">Applied on submission</span>
                </div>
              </>
            )}
            {isNumber && (
              <>
                <p className="fi-section-note">Set allowed number range.</p>
                <div className="fi-row-2">
                  <div className="fi-field">
                    <label className="fi-label">Min Value</label>
                    <input type="number" {...fieldForm.register('min_value')} className="fi-input" placeholder="e.g. 0" />
                  </div>
                  <div className="fi-field">
                    <label className="fi-label">Max Value</label>
                    <input type="number" {...fieldForm.register('max_value')} className="fi-input" placeholder="e.g. 99" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'visibility' && (
          <div className="fi-section">
            <p className="fi-section-note">Show this field only when another field has a specific value.</p>
            <div className="fi-field fi-field-full">
              <label className="fi-label">Show when field…</label>
              <select {...fieldForm.register('controller_field_id')} className="fi-input fi-select">
                <option value="">— Always visible —</option>
                {fields
                  .filter((f) => !editingField || f.id !== editingField.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.field_type})
                    </option>
                  ))}
              </select>
            </div>
            {controllerFieldId && (
              <>
                <div className="fi-field fi-field-full">
                  <label className="fi-label">Operator</label>
                  <select {...fieldForm.register('visibility_operator')} className="fi-input fi-select">
                    {visibilityOperators.map((op: string) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div className="fi-field fi-field-full">
                  <label className="fi-label">Value</label>
                  <input {...fieldForm.register('visibility_value')} className="fi-input" placeholder="e.g. Yes" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="fi-footer">
        <button type="submit" className="primary-button" style={{ flex: 1 }}>
          {editingField ? '✓ Update Field' : '+ Add Field'}
        </button>
        {editingField && (
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

/* ─────────────────────── FieldCard ─────────────────────── */
function FieldCard({
  field,
  index,
  total,
  isEditing,
  onEdit,
  onDelete,
  onMove,
}: {
  field: ApplicationFieldRecord
  index: number
  total: number
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const locked = isSystemField(field.label)
  return (
    <div
      className={`fc-card${isEditing ? ' fc-card-active' : ''}${locked ? ' fc-card-locked' : ''}`}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit() }}
    >
      {/* col 1 — type icon, spans both rows */}
      <div className="fc-type-icon">{TYPE_ICON[field.field_type] ?? 'T'}</div>

      {/* col 2 row 1 — label */}
      <div className="fc-label" title={field.label}>{field.label}</div>

      {/* col 2 row 2 — badges */}
      <div className="fc-badges">
        <span className="fc-badge fc-badge-type">{field.field_type}</span>
        {field.required && (
          <span className="fc-badge fc-badge-req">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3 }}>
              <path d="M12 2v20M17 5L7 19M19 17L5 7" />
            </svg>
            Required
          </span>
        )}
        {locked && (
          <span className="fc-badge fc-badge-sys">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            System
          </span>
        )}
        {field.visibility_condition && (
          <span className="fc-badge fc-badge-vis">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3 }}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Cond.
          </span>
        )}
      </div>

      {/* col 3 — actions, spans both rows */}
      <div className="fc-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="fc-action-btn"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          title="Move up"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          className="fc-action-btn"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          title="Move down"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          type="button"
          className="fc-action-btn fc-action-delete"
          onClick={onDelete}
          disabled={locked}
          title={locked ? 'System field — cannot delete' : 'Delete field'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────── Main Page ─────────────────────── */
export function ApplicationFormEditorPage({
  mode,
  campaignId,
  campaignName,
  formId: formIdProp,
}: {
  mode: 'create' | 'edit'
  campaignId?: string | null
  campaignName?: string
  formId?: string | null
}) {
  const navigate = useNavigate()
  const params = useParams()
  const formId = formIdProp === undefined ? params.id : formIdProp
  const [currentForm, setCurrentForm] = useState<ApplicationFormWithFields | null>(null)
  const [fields, setFields] = useState<ApplicationFieldRecord[]>([])
  const [loading, setLoading] = useState(mode === 'edit')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingField, setEditingField] = useState<ApplicationFieldRecord | null>(null)
  const [showMetaPanel, setShowMetaPanel] = useState(false)
  const [justPublished, setJustPublished] = useState(false)

  const [addingDefaults, setAddingDefaults] = useState(false)

  const metaForm = useForm<FormMetaValues>({
    resolver: zodResolver(formMetaSchema),
    defaultValues: toFormMetaValues(),
  })
  const fieldForm = useForm<FieldEditorValues>({
    defaultValues: toFieldEditorValues(),
  })

  const refreshForm = useCallback(
    async (id: string) => {
      const response = await getForm(id)
      setCurrentForm(response)
      setFields(response.fields)
      metaForm.reset(toFormMetaValues(response))
    },
    [metaForm],
  )

  useEffect(() => {
    if (mode === 'create') {
      metaForm.reset(toFormMetaValues())
      setCurrentForm(null)
      setFields([])
      setLoading(false)
      return
    }
    let active = true
    async function load() {
      if (!formId) { setError('Missing form id'); setLoading(false); return }
      try {
        const response = await getForm(formId)
        if (!active) return
        setCurrentForm(response)
        setFields(response.fields)
        metaForm.reset(toFormMetaValues(response))
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Unable to load form')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [formId, metaForm, mode])

  const saveForm = async (values: FormMetaValues) => {
    setError(''); setMessage('')
    try {
      const payload: ApplicationFormPayload = {
        name: values.name.trim(),
        description: values.description.trim(),
        campaign_id: campaignId ?? currentForm?.campaign_id ?? null,
        supported_languages: parseLanguages(values.supported_languages),
      }
      if (mode === 'create' && !currentForm) {
        const created = await createForm(payload)
        await refreshForm(created.id)
        if (!campaignId) navigate(`/forms/${created.id}`, { replace: true })
        setMessage(`Form created (v${created.version}). Add fields below.`)
        setShowMetaPanel(false)
        return
      }
      const id = currentForm?.id ?? formId ?? ''
      if (id) {
        const updated = await updateForm(id, payload)
        await refreshForm(updated.id)
        setMessage('Form details saved.')
        setShowMetaPanel(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save form')
    }
  }

  const handlePublish = async () => {
    const id = getActiveFormId()
    if (!id || !currentForm) return
    setError(''); setMessage('')
    try {
      const payload: ApplicationFormPayload = {
        name: currentForm.name,
        description: currentForm.description,
        campaign_id: currentForm.campaign_id,
        supported_languages: currentForm.supported_languages,
        is_published: true,
      }
      const updated = await updateForm(id, payload)
      await refreshForm(updated.id)
      setMessage('Form has been published successfully!')
      setJustPublished(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish form')
    }
  }

  const startNewField = () => {
    setEditingField(null)
    fieldForm.reset(toFieldEditorValues())
  }

  const editField = (field: ApplicationFieldRecord) => {
    setEditingField(field)
    fieldForm.reset(toFieldEditorValues(field))
  }

  const saveField = async (values: FieldEditorValues) => {
    const resolvedId = currentForm?.id ?? formId
    if (!resolvedId) { setError('Save the form first before adding fields.'); return }
    setError(''); setMessage('')
    try {
      if (editingField) {
        await updateFormField(editingField.id, toFieldPayload(values))
      } else {
        await createFormField(resolvedId, toFieldPayload(values))
      }
      await refreshForm(resolvedId)
      setEditingField(null)
      fieldForm.reset(toFieldEditorValues())
      setMessage(editingField ? 'Field updated.' : 'Field added.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save field')
    }
  }

  const moveField = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= fields.length) return
    const current = [...fields]
    const first = current[index]!
    const second = current[nextIndex]!
    const swapped = current.map((item) => ({ ...item }))
    swapped[index] = { ...second, sort_order: first.sort_order }
    swapped[nextIndex] = { ...first, sort_order: second.sort_order }
    setFields(swapped)
    try {
      await Promise.all([
        updateFormField(first.id, toFieldPayload(toFieldEditorValues(swapped[index]))),
        updateFormField(second.id, toFieldPayload(toFieldEditorValues(swapped[nextIndex]))),
      ])
      await refreshForm(getActiveFormId())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reorder fields')
      await refreshForm(getActiveFormId())
    }
  }

  const deleteField = async (id: string) => {
    setError(''); setMessage('')
    const f = fields.find((item) => item.id === id)
    if (f && isSystemField(f.label)) {
      setError(`"${f.label}" is a mandatory system field and cannot be deleted.`)
      return
    }
    try {
      await deleteFormField(id)
      await refreshForm(getActiveFormId())
      if (editingField?.id === id) { setEditingField(null); fieldForm.reset(toFieldEditorValues()) }
      setMessage('Field deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete field')
    }
  }

  const getActiveFormId = () => currentForm?.id ?? formId ?? ''

  const loadDefaultFields = async () => {
    const resolvedId = getActiveFormId()
    if (!resolvedId) { setError('Save the form first before loading default fields.'); return }
    if (fields.length > 0) {
      const confirmed = window.confirm('This will add the 12 standard fields alongside your existing fields. Continue?')
      if (!confirmed) return
    }
    setError(''); setMessage('')
    if (addingDefaults) return
    setAddingDefaults(true)

    const defaultFields: ApplicationFieldPayload[] = [
      { field_type: 'Text', label: 'Full Name', placeholder: 'Enter your full name', required: true, help_text: 'As it appears on your government ID', sort_order: 1 },
      { field_type: 'Phone', label: 'Mobile Number', placeholder: '10-digit mobile number', required: true, help_text: 'Primary contact — used as your unique ID', sort_order: 2 },
      { field_type: 'Email', label: 'Email Address', placeholder: 'you@example.com', required: false, help_text: 'Optional — if available', sort_order: 3 },
      { field_type: 'Text', label: 'Current Location', placeholder: 'e.g. Dwarka, Delhi', required: true, help_text: 'City or area where you currently live', sort_order: 4 },
      { field_type: 'Text', label: 'Preferred Work Location', placeholder: 'e.g. Gurugram, Noida', required: true, help_text: 'Where you want to work', sort_order: 5 },
      { field_type: 'Select', label: 'Worker Category / Gig Type', placeholder: 'Select your category', required: true, help_text: 'Type of gig work you do', options: ['Delivery Partner', 'Driver', 'Warehouse Helper', 'Field Sales', 'Promoter', 'Other'], sort_order: 6 },
      { field_type: 'Text', label: 'Key Skills', placeholder: 'e.g. two-wheeler license, smartphone', required: true, help_text: 'List your main skills', sort_order: 7 },
      { field_type: 'Number', label: 'Years of Experience', placeholder: '2', required: true, help_text: 'Total years in gig / field work', sort_order: 8 },
      { field_type: 'Select', label: 'Availability / Shift Preference', placeholder: 'Select preference', required: true, help_text: 'When are you available to work?', options: ['Day Shift', 'Night Shift', 'Weekends Only', 'Flexible / Any'], sort_order: 9 },
      { field_type: 'Text', label: 'Resume / Profile Link', placeholder: 'LinkedIn or portfolio URL', required: false, help_text: 'Optional resume or LinkedIn link', sort_order: 10 },
      { field_type: 'Select', label: 'Government ID / Compliance', placeholder: 'Select ID type', required: false, help_text: 'Provide if required by business rules', options: ['Aadhaar Card', 'PAN Card', 'Driving License', 'Voter ID', 'None'], sort_order: 11 },
      { field_type: 'Checkbox', label: 'Consent', placeholder: '', required: true, help_text: 'Mandatory before submission', options: ['I agree to be contacted and my data stored by the platform'], sort_order: 12 },
    ]
    const existingLabels = new Set(fields.map((field) => field.label.trim().toLowerCase()))
    const fieldsToAdd = defaultFields.filter((field) => !existingLabels.has(field.label.trim().toLowerCase()))

    if (fieldsToAdd.length === 0) {
      setMessage('Default fields are already added. No duplicates were created.')
      return
    }

    try {
      for (const payload of fieldsToAdd) await createFormField(resolvedId, payload)
      await refreshForm(resolvedId)
      setMessage(
        fieldsToAdd.length === defaultFields.length
          ? '12 default fields loaded. Review and customise as needed.'
          : 'Default fields added. Existing fields were preserved and duplicates were skipped.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load default fields')
    }
    setAddingDefaults(false)
  }

  const defaultFieldLabels = [
    'Full Name',
    'Mobile Number',
    'Email Address',
    'Current Location',
    'Preferred Work Location',
    'Worker Category / Gig Type',
    'Key Skills',
    'Years of Experience',
    'Availability / Shift Preference',
    'Resume / Profile Link',
    'Government ID / Compliance',
    'Consent',
  ]

  const defaultFieldsLoaded = defaultFieldLabels.every((label) =>
    fields.some((field) => field.label.trim().toLowerCase() === label.toLowerCase()),
  )

  const previewTitle = currentForm?.name || metaForm.getValues('name') || 'Preview'

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel"><div className="empty-state">Loading form builder…</div></section>
      </div>
    )
  }

  const hasForm = Boolean(getActiveFormId())

  return (
    <div className="page-shell">
      {/* ── Top bar ── */}
      <div className="fb-topbar">
        <div className="fb-topbar-left">
          <Link className="ghost-button" to={campaignId ? `/campaigns/${campaignId}/outreach` : '/forms'}>
            ← {campaignId ? 'Outreach' : 'Forms'}
          </Link>
          <div className="fb-topbar-title">
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              {campaignId ? '⚡ Stage 3 — Application Form' : '📝 Form Builder'}
            </span>
            <h1 className="fb-title">
              {campaignId
                ? (currentForm?.name || campaignName || 'Application Form')
                : (mode === 'create' ? 'New Form' : currentForm?.name || 'Edit Form')}
            </h1>
            {campaignId ? (
              <p className="fb-subtitle" style={{ margin: '0.5rem 0 0', color: '#94a3b8' }}>
                Build the application form for {campaignName} and connect it to this campaign.
              </p>
            ) : null}
          </div>
          {campaignId && campaignName &&
            ((currentForm?.name ?? '') !== campaignName ? (
              <span className="status-pill status-active">Campaign: {campaignName}</span>
            ) : null)}
        </div>
        <div className="fb-topbar-right">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowMetaPanel((v) => !v)}
          >
            ⚙ Form Settings
          </button>
          {hasForm && (
            <>
              {currentForm?.is_published ? (
                <span className="status-pill status-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  🟢 Published
                </span>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handlePublish()}
                >
                  🚀 Publish Form
                </button>
              )}
              <button
                type="button"
                className="ghost-button"
                onClick={() => navigate(`/forms/${getActiveFormId()}/preview`)}
              >
                👁 Preview Form
              </button>
            </>
          )}
          {campaignId && (
            <Link
              className="primary-button"
              to={`/campaigns/${campaignId}/distribute`}
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}
            >
              ⚡ Go Live →
            </Link>
          )}
        </div>
      </div>

      {/* ── Form meta drawer ── */}
      {showMetaPanel && (
        <div className="fb-meta-drawer panel">
          <div className="fb-meta-header">
            <h2>Form Settings</h2>
            <button type="button" className="ghost-button" onClick={() => setShowMetaPanel(false)}>✕ Close</button>
          </div>
          <form
            className="fb-meta-form"
            onSubmit={metaForm.handleSubmit((v) => void saveForm(v))}
          >
            <div className="form-grid">
              <label className="field field-wide">
                <span>Form Name</span>
                <input {...metaForm.register('name')} placeholder="General application form" />
                <small>{metaForm.formState.errors.name?.message}</small>
              </label>
              <label className="field field-wide">
                <span>Description</span>
                <textarea {...metaForm.register('description')} rows={2} placeholder="Short description for recruiters." />
              </label>
              <label className="field field-wide">
                <span>Supported Languages</span>
                <input {...metaForm.register('supported_languages')} placeholder="English, Hindi, Tamil" />
                <small style={{ color: '#64748b' }}>Comma-separated</small>
              </label>
            </div>
            <div className="action-row" style={{ marginTop: 16 }}>
              <button className="primary-button" type="submit">💾 Save Settings</button>
            </div>
          </form>
        </div>
      )}

      {error ? <div className="alert error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="alert success" style={{ marginBottom: 12 }}>{message}</div> : null}

      {currentForm?.is_published && (
        <div className={`fb-publish-success-card${justPublished ? ' fb-publish-success-card--fresh' : ''}`}>
          <div className="fb-publish-success-card__header">
            <span className="fb-publish-success-card__badge">🟢 Published</span>
            <p className="fb-publish-success-card__title">Public Application Form is Live!</p>
            <p className="fb-publish-success-card__sub">
              Candidates can apply. Share this link:
            </p>
          </div>
          <div className="fb-publish-success-card__link-row">
            <code className="fb-publish-success-card__link">
              {`${window.location.origin}/apply/${currentForm.id}`}
            </code>
            <button
              type="button"
              className="ghost-button"
              style={{ padding: '6px 12px', minHeight: '32px', fontSize: '0.8rem' }}
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/apply/${currentForm.id}`);
                setMessage('Copied public apply link!');
              }}
            >
              Copy Link
            </button>
          </div>
          {campaignId && (
            <div className="fb-publish-success-card__cta">
              <button
                type="button"
                className="primary-button"
                onClick={() => navigate(`/campaigns/${campaignId}/distribute`)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Continue to Go Live →
              </button>
              <p className="fb-publish-success-card__cta-hint">
                Your form is published. Head to the Distribute page to activate this campaign.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 3-panel layout ── */}
      <div className="fb-layout">
        {/* ── PANEL 1: Field List ── */}
        <div className="fb-panel fb-panel-list">
          <div className="fb-panel-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="fb-panel-title">Form fields</span>
                <span className="fields-count-badge">{fields.length}</span>
              </div>
              <p className="fb-panel-subtitle" style={{ maxWidth: '100%', margin: '4px 0 0' }}>
                Manage fields candidates will fill out.
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              style={{ minHeight: 32, padding: '0 12px', fontSize: '0.8rem', borderRadius: '8px' }}
              onClick={startNewField}
              disabled={!hasForm || defaultFieldsLoaded}
              title={!hasForm ? 'Save form settings first' : defaultFieldsLoaded ? 'All default fields are already loaded' : 'Add a new field'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add field
            </button>
          </div>

          {!hasForm && (
            <div className="fb-empty-hint">
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📋</div>
              <p>Open <strong>Form Settings</strong> to save the form first, then add fields.</p>
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => setShowMetaPanel(true)}
              >
                Open Form Settings
              </button>
            </div>
          )}

          {hasForm && fields.length === 0 && (
            <div className="fb-empty-hint">
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>✨</div>
              <p>No fields yet.</p>
              <button
                type="button"
                className="ghost-button"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => void loadDefaultFields()}
                disabled={defaultFieldsLoaded || addingDefaults}
                title={defaultFieldsLoaded ? 'All default fields are already loaded' : addingDefaults ? 'Adding default fields…' : 'Load the default form fields'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Load 12 Default Fields
              </button>
            </div>
          )}

          {hasForm && fields.length > 0 && (
            <>
              <div className="fc-list">
                {fields.map((field, index) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    total={fields.length}
                    isEditing={editingField?.id === field.id}
                    onEdit={() => editField(field)}
                    onDelete={() => void deleteField(field.id)}
                    onMove={(dir) => void moveField(index, dir)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="ghost-button"
                style={{ width: '100%', marginTop: 12, fontSize: '0.82rem' }}
                onClick={() => void loadDefaultFields()}
                disabled={defaultFieldsLoaded || addingDefaults}
                title={defaultFieldsLoaded ? 'All default fields are already loaded' : addingDefaults ? 'Adding default fields…' : 'Add default fields to this form'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Add Default Fields
              </button>
            </>
          )}
        </div>

        {/* ── PANEL 2: Inspector ── */}
        <div className="fb-panel fb-panel-inspector">
          <FieldInspector
            fieldForm={fieldForm}
            fields={fields}
            editingField={editingField}
            onSave={(v) => void saveField(v)}
            onCancel={() => {
              setEditingField(null)
              fieldForm.reset(toFieldEditorValues())
            }}
          />
        </div>

        {/* ── PANEL 3: Preview ── */}
        <div className="fb-panel fb-panel-preview">
          <FieldPreview fields={fields} title={previewTitle} />
        </div>
      </div>
    </div>
  )
}
