import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import type { TemplateChannel, TemplateGenerationResponse } from '../../../shared/template.js'
import type { CampaignRecord } from '../../../shared/campaign.js'

type TemplateDraftInput = {
  campaign: CampaignRecord
  channel: TemplateChannel
  language?: string
  currentTemplateName?: string
  currentMessageBody?: string
}

type DraftJson = TemplateGenerationResponse

let client: BedrockRuntimeClient | null = null

function getClient() {
  if (client) return client

  const region = process.env.AWS_DEFAULT_REGION
  if (!region) {
    throw new Error('AWS_DEFAULT_REGION must be set')
  }

  client = new BedrockRuntimeClient({ region })
  return client
}

function buildCampaignSnapshot(campaign: CampaignRecord) {
  const compensationValue =
    campaign.compensation_details && typeof campaign.compensation_details.raw === 'string'
      ? campaign.compensation_details.raw
      : campaign.compensation_model

  return {
    campaign_title: campaign.name,
    campaign_name: campaign.name,
    opportunity_title: campaign.opportunity_title,
    opportunity_type: campaign.opportunity_title,
    opportunity_description: campaign.opportunity_desc,
    city: campaign.target_region,
    worker_type: campaign.worker_type,
    skills_required: Array.isArray(campaign.skills_required) ? campaign.skills_required.join(', ') : '',
    earning_range: compensationValue,
    shift_model: campaign.mode,
    target_channels: Array.isArray(campaign.target_channels) ? campaign.target_channels.join(', ') : '',
  }
}

function extractJsonText(responseText: string) {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  return jsonMatch?.[0]?.trim() ?? responseText.trim()
}

function ensureTemplateDraft(
  draft: Partial<DraftJson>,
  channel: TemplateChannel,
  preferredLanguage = 'English',
): DraftJson {
  const normalizedChannel = channel

  return {
    channel: normalizedChannel,
    template_name:
      typeof draft.template_name === 'string' && draft.template_name.trim()
        ? draft.template_name.trim()
        : `${channel} outreach template`,
    message_body:
      typeof draft.message_body === 'string' && draft.message_body.trim()
        ? draft.message_body.trim()
        : 'Hi {{candidate_name}} 👋\n\nWe have a new opportunity in {{city}} for a {{worker_type}}!\n\nApply here: {{form_link}}\n\nRegards,\n{{recruiter_name}}',
    language:
      typeof draft.language === 'string' && draft.language.trim()
        ? draft.language.trim()
        : preferredLanguage,
    media_attachment_url:
      typeof draft.media_attachment_url === 'string' ? draft.media_attachment_url.trim() : '',
  }
}

export async function generateTemplateDraft(input: TemplateDraftInput): Promise<DraftJson> {
  const modelId = process.env.BEDROCK_MODEL_ID
  if (!modelId) {
    throw new Error('BEDROCK_MODEL_ID must be set')
  }

  const campaignContext = buildCampaignSnapshot(input.campaign)
  const prompt = [
    'Write a channel-specific outreach draft for recruiters to attract gig workers.',
    'Use the campaign data exactly as provided.',
    'Do not add unsupported benefits, locations, salaries, or promises.',
    'The message must feel natural, human, and easy to read on mobile.',
    'Return only valid JSON with these exact keys: template_name, message_body, language, media_attachment_url.',
    'Do not include markdown, code fences, or commentary.',
    'Use merge fields exactly as provided if dynamic values are needed.',
    'If some data is missing, omit that part instead of guessing.',
    'Do not use {{recruiter_name}} in the greeting or salutation.',
    'Use a neutral opener like "Hi there" or no salutation if that feels more natural for the channel.',
    'If the channel is formal, you may sign off with {{recruiter_name}} at the end, but keep the opening candidate-focused or neutral.',
    'The message should include a clear CTA with the form link naturally woven into the copy.',
    'Keep the message short for WhatsApp/social and fuller for portal descriptions.',
    'Match the selected channel style:',
    '- WhatsApp / SMS: short, direct, conversational.',
    '- LinkedIn InMail: slightly more formal, still human.',
    '- Social post: engaging and concise.',
    '- Portal description: clearer, more descriptive, and structured.',
    'Supported merge fields: {{campaign_title}}, {{campaign_name}}, {{recruiter_name}}, {{opportunity_type}}, {{city}}, {{earning_range}}, {{shift_model}}, {{form_link}}.',
    'If asked to improve a draft, preserve the merge fields and make the copy better rather than replacing it with generic text.',
    '',
    `Selected channel: ${input.channel}`,
    `Requested language: ${input.language || 'English'}`,
    `Current template name: ${input.currentTemplateName || ''}`,
    `Current message body: ${input.currentMessageBody || ''}`,
    `Campaign data: ${JSON.stringify(campaignContext)}`,
  ].join('\n')

  const response = await getClient().send(
    new ConverseCommand({
      modelId,
      system: [
        {
          text: 'You are an expert recruiter copywriter. Return only JSON that conforms to the requested template shape and never invent facts.',
        },
      ],
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 1200,
        temperature: 0.7,
      },
    }),
  )

  const outputText =
    response.output?.message?.content
      ?.map((part) => ('text' in part ? part.text : ''))
      .join('\n')
      .trim() || ''

  const jsonText = extractJsonText(outputText)

  try {
    const parsed = JSON.parse(jsonText) as Partial<DraftJson>
    return ensureTemplateDraft(parsed, input.channel, input.language || 'English')
  } catch {
    return ensureTemplateDraft(
      {
        template_name: `${input.channel} outreach template`,
        message_body: outputText || undefined,
        language: input.language || 'English',
        media_attachment_url: '',
      },
      input.channel,
      input.language || 'English',
    )
  }
}
