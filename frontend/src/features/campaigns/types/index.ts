import { z } from 'zod'
import {
  campaignModes,
  splitCsvValue,
  normalizeCampaignMode,
  normalizeOutreachChannel,
  normalizeWorkerCategory,
  normalizeCompensationModel,
  buildCompensationDetails,
  joinCsvValue,
  formatOutreachChannel,
  type CampaignRecord,
  type CampaignPayload,
  type CampaignStatus,
} from '../../../../../shared/campaign'

export const formSchema = z
  .object({
    name: z.string().trim().min(2, 'Campaign name is required'),
    opportunity_title: z.string().trim().min(2, 'Opportunity title is required'),
    opportunity_desc: z
      .string()
      .trim()
      .min(20, 'Opportunity description must be at least 20 characters'),
    mode: z.enum(campaignModes),
    worker_type: z.string().trim().min(2, 'Worker type is required'),
    target_region: z.string().trim().min(2, 'Target region is required'),
    skills_required: z.string().trim().min(1, 'Add at least one skill'),
    target_channels: z.string().trim().min(1, 'Add at least one channel'),
    compensation_model: z.string().trim().min(2, 'Compensation model is required'),
    start_date: z.string().trim().min(1, 'Start date is required'),
    end_date: z.string().trim().min(1, 'End date is required'),
  })
  .refine(
    (value) => {
      const start = new Date(value.start_date)
      const end = new Date(value.end_date)
      return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end >= start
    },
    {
      path: ['end_date'],
      message: 'End date must be on or after the start date',
    },
  )

export type CampaignFormValues = z.infer<typeof formSchema>

export function toFormValues(campaign?: CampaignRecord | null): CampaignFormValues {
  if (!campaign) {
    return {
      name: '',
      opportunity_title: '',
      opportunity_desc: '',
      mode: 'direct_sourcing',
      worker_type: '',
      target_region: '',
      skills_required: '',
      target_channels: '',
      compensation_model: '',
      start_date: '',
      end_date: '',
    }
  }

  return {
    name: campaign.name,
    opportunity_title: campaign.opportunity_title,
    opportunity_desc: campaign.opportunity_desc,
    mode: campaign.mode,
    worker_type: campaign.worker_type,
    target_region: campaign.target_region,
    skills_required: joinCsvValue(campaign.skills_required),
    target_channels: joinCsvValue(
      campaign.target_channels.map((channel: string) => formatOutreachChannel(channel)),
    ),
    compensation_model:
      typeof campaign.compensation_details?.raw === 'string'
        ? campaign.compensation_details.raw
        : campaign.compensation_model,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
  }
}

export function toPayload(values: CampaignFormValues, status?: CampaignStatus): CampaignPayload {
  return {
    name: values.name.trim(),
    opportunity_title: values.opportunity_title.trim(),
    opportunity_desc: values.opportunity_desc.trim(),
    mode: normalizeCampaignMode(values.mode),
    worker_type: normalizeWorkerCategory(values.worker_type.trim()),
    target_region: values.target_region.trim(),
    skills_required: splitCsvValue(values.skills_required),
    target_channels: splitCsvValue(values.target_channels).map((channel: string) =>
      normalizeOutreachChannel(channel),
    ),
    compensation_model: normalizeCompensationModel(values.compensation_model.trim()),
    compensation_details: buildCompensationDetails(values.compensation_model),
    start_date: values.start_date,
    end_date: values.end_date,
    status,
  }
}
