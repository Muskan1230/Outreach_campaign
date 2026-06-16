/**
 * acknowledgmentService.ts
 *
 * Service for building candidate acknowledgment email merge fields and payloads.
 */

export interface AcknowledgmentCampaign {
  id: string
  name?: string
  opportunity_title?: string
  worker_type?: string
  target_region?: string
  compensation_details?: { raw?: string }
  compensation_model?: string
  mode?: string
  shift_model?: string
  owner_id?: string | null
  owner_name?: string
  recruiter_name?: string
  company_name?: string
}

export interface AcknowledgmentIdentity {
  fullName?: string | null
  mobile?: string | null
  email?: string | null
}

export interface AcknowledgmentOptions {
  recruiterName?: string
  statusCheckLink: string
}

export interface AcknowledgmentData {
  candidate_name: string
  campaign_title: string
  opportunity_type: string
  city: string
  earning_range: string
  shift_model: string
  recruiter_name: string
  status_check_link: string
  company_name: string
}

/**
 * Builds candidate acknowledgment template merge fields with mapped human-readable values.
 */
export function buildAcknowledgmentData(
  campaign: AcknowledgmentCampaign,
  identity: AcknowledgmentIdentity,
  options: AcknowledgmentOptions
): AcknowledgmentData {
  const shiftMap: Record<string, string> = {
    'direct_sourcing': 'Day Shift',
    'contract_based': 'Contract Shift',
    'flexible': 'Flexible Shift',
    'night_shift': 'Night Shift',
    'morning': 'Morning Shift (6 AM - 2 PM)',
    'afternoon': 'Afternoon Shift (2 PM - 10 PM)',
    'night': 'Night Shift (10 PM - 6 AM)'
  }

  // Get raw value from shift_model or mode
  const rawShift = campaign.shift_model || campaign.mode || ''
  const shiftModel = shiftMap[rawShift] || rawShift || 'Mixed Shift'

  const candidateName = identity.fullName || 'Candidate'
  const recruiterName = campaign.owner_name || campaign.recruiter_name || options.recruiterName || 'Recruitment Team'
  const companyName = campaign.company_name || 'Your Company Name'

  return {
    candidate_name: candidateName,
    campaign_title: campaign.name || 'Opportunity',
    opportunity_type: campaign.opportunity_title || campaign.worker_type || 'Opportunity',
    city: campaign.target_region || 'Selected Locations',
    earning_range: campaign.compensation_details?.raw || campaign.compensation_model || 'Competitive',
    shift_model: shiftModel,
    recruiter_name: recruiterName,
    status_check_link: options.statusCheckLink,
    company_name: companyName
  }
}
