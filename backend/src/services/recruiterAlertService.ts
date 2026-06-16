import { randomUUID } from 'node:crypto'
import { supabase } from '../lib/supabase.js'
import {
  createOrchestratorTemplate,
  getOrchestratorTemplates,
  sendOrchestratorNotification,
} from '../lib/notificationOrchestrator.js'

type RecruiterAlertCampaign = {
  id: string
  name: string
  opportunity_title?: string | null
  opportunity_desc?: string | null
  worker_type?: string | null
  target_region?: string | null
  mode?: string | null
  compensation_model?: string | null
  compensation_details?: { raw?: string } | Record<string, unknown> | null
  owner_id?: string | null
  recruiter_alert_email_template_id?: string | null
}

type RecruiterIdentity = {
  fullName?: string | null
  mobile?: string | null
  email?: string | null
}

type RecruiterAlertOptions = {
  applicationId: string
  submissionId?: string | null
  candidate: RecruiterIdentity
  sourceChannel?: string | null
  frontendOrigin?: string
}

type RecruiterProfile = {
  full_name?: string | null
  email?: string | null
}

function buildRecruiterAlertData(
  campaign: RecruiterAlertCampaign,
  recruiterName: string,
  candidate: RecruiterIdentity,
  options: RecruiterAlertOptions,
) {
  const frontendOrigin = options.frontendOrigin || process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
  const reviewLink = `${frontendOrigin}/campaigns/${campaign.id}/applicants/${options.applicationId}`
  const listLink = `${frontendOrigin}/campaigns/${campaign.id}/applicants`

  return {
    recruiter_name: recruiterName,
    campaign_name: campaign.name || 'Campaign',
    campaign_title: campaign.opportunity_title || campaign.name || 'Campaign',
    candidate_name: candidate.fullName || 'Candidate',
    candidate_mobile: candidate.mobile || 'Not provided',
    candidate_email: candidate.email || 'Not provided',
    source_channel: options.sourceChannel || 'direct',
    application_id: options.applicationId,
    submission_id: options.submissionId || '',
    review_link: reviewLink,
    list_link: listLink,
    current_location: campaign.target_region || 'Not provided',
    opportunity_type: campaign.worker_type || 'Opportunity',
    compensation: campaign.compensation_details && typeof campaign.compensation_details === 'object' && 'raw' in campaign.compensation_details
      ? String(campaign.compensation_details.raw ?? '')
      : campaign.compensation_model || 'Not provided',
  }
}

async function resolveRecruiterProfile(ownerId: string): Promise<RecruiterProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('full_name,email')
    .eq('id', ownerId)
    .maybeSingle()

  if (error) {
    console.warn(`[recruiter-alert] Unable to load recruiter profile for ${ownerId}:`, error.message)
    return null
  }

  return (data as RecruiterProfile | null) ?? null
}

async function resolveOrchestratorTemplate(
  campaign: RecruiterAlertCampaign,
  mergeFields: Record<string, unknown>,
) {
  let templateId = campaign.recruiter_alert_email_template_id ?? null

  if (templateId) {
    return templateId
  }

  const templateName = `recruiter_alert_email_${campaign.id}_v1`
  const defaultSubject = 'New application received: {{campaign_title}}'
  const defaultBody = [
    '<p>Hello {{recruiter_name}},</p>',
    '<p>A new candidate has submitted an application for <strong>{{campaign_title}}</strong>.</p>',
    '<p>',
    '  <strong>Candidate:</strong> {{candidate_name}}<br />',
    '  <strong>Mobile:</strong> {{candidate_mobile}}<br />',
    '  <strong>Email:</strong> {{candidate_email}}<br />',
    '  <strong>Source:</strong> {{source_channel}}<br />',
    '  <strong>Location:</strong> {{current_location}}',
    '</p>',
    '<p>',
    '  <a href="{{review_link}}" style="color: #6366f1; text-decoration: underline;">Review application</a><br />',
    '  <a href="{{list_link}}" style="color: #6366f1; text-decoration: underline;">Open applicant queue</a>',
    '</p>',
    '<p>Application ID: {{application_id}}</p>',
  ].join('\n')

  try {
    const createdTemplate: any = await createOrchestratorTemplate({
      name: templateName,
      channel: 'email',
      language: 'en',
      subject: defaultSubject,
      body: defaultBody,
      variables: Object.keys(mergeFields),
    })

    templateId =
      createdTemplate?.id ??
      createdTemplate?.template_id ??
      createdTemplate?.data?.id ??
      null
  } catch (error: any) {
    if (error?.status === 409) {
      const listRes: any = await getOrchestratorTemplates()
      const existing = listRes?.templates?.find(
        (template: any) =>
          template.name === templateName &&
          template.channel === 'email' &&
          template.language === 'en',
      )

      templateId = existing?.id ?? existing?.template_id ?? null
    } else {
      throw error
    }
  }

  if (templateId) {
    await supabase
      .from('campaigns')
      .update({ recruiter_alert_email_template_id: templateId })
      .eq('id', campaign.id)
  }

  return templateId
}

export async function sendRecruiterNewApplicationAlert(
  campaign: RecruiterAlertCampaign,
  options: RecruiterAlertOptions,
) {
  if (!campaign.owner_id) {
    console.warn(`[recruiter-alert] Skipping alert for campaign ${campaign.id}: missing owner_id`)
    return
  }

  const recruiter = await resolveRecruiterProfile(campaign.owner_id)
  const recruiterName = recruiter?.full_name || 'Recruiter'
  const recruiterEmail = recruiter?.email || null
  const mergeFields = buildRecruiterAlertData(campaign, recruiterName, options.candidate, options)
  const notificationTitle = `New application for ${campaign.name || campaign.opportunity_title || 'your campaign'}`
  const notificationMessage = `${mergeFields.candidate_name} submitted a new application for ${mergeFields.campaign_title}.`
  const notificationId = randomUUID()

  const { error: insertError } = await supabase
    .from('recruiter_notifications')
    .insert({
      id: notificationId,
      recruiter_id: campaign.owner_id,
      campaign_id: campaign.id,
      application_id: options.applicationId,
      notification_type: 'new_application',
      title: notificationTitle,
      message: notificationMessage,
      payload: {
        ...mergeFields,
        recruiter_email: recruiterEmail,
      },
      is_read: false,
      delivery_status: recruiterEmail ? 'pending' : 'in_app_only',
      email_status: recruiterEmail ? 'pending' : 'skipped',
    })

  if (insertError) {
    throw insertError
  }

  if (!recruiterEmail) {
    await supabase
      .from('recruiter_notifications')
      .update({
        delivery_status: 'in_app_only',
        email_status: 'skipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId)

    console.warn(`[recruiter-alert] Skipping email for campaign ${campaign.id}: recruiter email missing`)
    return
  }

  let templateId: string | null = null
  try {
    templateId = await resolveOrchestratorTemplate(campaign, mergeFields)
  } catch (error) {
    await supabase
      .from('recruiter_notifications')
      .update({
        delivery_status: 'in_app_only',
        email_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId)

    console.warn(`[recruiter-alert] Template resolution failed for campaign ${campaign.id}:`, error instanceof Error ? error.message : error)
    return
  }

  if (!templateId) {
    await supabase
      .from('recruiter_notifications')
      .update({
        delivery_status: 'in_app_only',
        email_status: 'skipped',
      })
      .eq('id', notificationId)
    console.warn(`[recruiter-alert] Skipping email for campaign ${campaign.id}: template could not be resolved`)
    return
  }

  try {
    await sendOrchestratorNotification({
      recipient: {
        user_id: campaign.owner_id,
        email: recruiterEmail,
      },
      notification: {
        type: 'recruiter_new_application',
        priority: 'high',
        channels: ['email'],
        template_id: templateId,
        data: mergeFields,
      },
    })

    await supabase
      .from('recruiter_notifications')
      .update({
        delivery_status: 'sent',
        email_status: 'sent',
        email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
  } catch (error) {
    await supabase
      .from('recruiter_notifications')
      .update({
        delivery_status: 'failed',
        email_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId)

    console.warn(`[recruiter-alert] Email send failed for campaign ${campaign.id}:`, error instanceof Error ? error.message : error)
  }
}
