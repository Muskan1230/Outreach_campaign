import { request } from '../../../services/apiClient'
import type {
  ApplicationFieldPayload,
  ApplicationFieldRecord,
  ApplicationFormListItem,
  ApplicationFormPayload,
  ApplicationFormRecord,
  ApplicationFormWithFields,
} from '../../../../../shared/applicationForm'

export function listForms() {
  return request<{ data: ApplicationFormListItem[] }>('/api/forms')
}

export function createForm(payload: ApplicationFormPayload) {
  return request<ApplicationFormRecord>('/api/forms', {
    method: 'POST',
    body: payload,
  })
}

export function getForm(id: string) {
  return request<ApplicationFormWithFields>(`/api/forms/${id}`)
}

export function updateForm(id: string, payload: ApplicationFormPayload) {
  return request<ApplicationFormRecord>(`/api/forms/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export function createFormField(formId: string, payload: ApplicationFieldPayload) {
  return request<ApplicationFieldRecord>(`/api/forms/${formId}/fields`, {
    method: 'POST',
    body: payload,
  })
}

export function updateFormField(fieldId: string, payload: ApplicationFieldPayload) {
  return request<ApplicationFieldRecord>(`/api/fields/${fieldId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteFormField(fieldId: string) {
  return request<void>(`/api/fields/${fieldId}`, {
    method: 'DELETE',
  })
}
