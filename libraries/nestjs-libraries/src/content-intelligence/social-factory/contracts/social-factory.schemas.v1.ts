import { z } from 'zod';
export const socialId = z.string().min(1).max(200);
export const socialFormat = z.enum(['post','thread','carousel','story','reel','short','long_video']);
export const socialPlatform = z.enum(['telegram','instagram','youtube','threads','tiktok']);
export const autonomyMode = z.enum(['collaborative','prepare_approve','autopilot']);
export const campaignCreateSchema = z.object({
  requestId: socialId, name: z.string().trim().min(1).max(300), timeZone: z.string().min(1).max(100),
  startsAt:z.string().min(10).max(64), endsAt:z.string().min(10).max(64), mode:autonomyMode.optional(), grantId:socialId.optional(),
  researchIds:z.array(socialId).max(100).optional(), findingIds:z.array(socialId).max(100).optional(),
  allocations:z.array(z.object({channelId:socialId,platform:socialPlatform,format:socialFormat,count:z.number().int().min(1).max(1000),slideCount:z.number().int().min(2).max(10).optional(),sequenceId:socialId.optional()}).strict()).min(1).max(100),
}).strict();
const budget = z.object({currency:z.string().regex(/^[A-Z]{3}$/),maximum:z.number().finite().nonnegative()}).strict();
export const grantSchema=z.object({
  requestId:socialId,campaignId:socialId.optional(),channelIds:z.array(socialId).min(1).max(100),
  actions:z.array(z.enum(['prepare','editorial_decide','schedule','publish','generate_paid'])).min(1).max(5),
  mode:autonomyMode,expiresAt:z.string().datetime({offset:true}),budget:budget.optional(),
  formats:z.array(socialFormat).min(1).max(7).optional(), timeZone:z.string().max(100).optional(),
  postingWindows:z.array(z.object({daysOfWeek:z.array(z.number().int().min(0).max(6)).min(1).max(7),start:z.string().regex(/^\d\d:\d\d$/),end:z.string().regex(/^\d\d:\d\d$/)}).strict()).max(50).optional(),
  exclusions:z.array(z.string().min(1).max(500)).max(100).optional(),
  providerBudget:budget.extend({provider:socialId,payer:socialId}).optional(),platformConsentIds:z.array(socialId).max(100),
}).strict();
export const deliverySchema=z.object({requestId:socialId,action:z.enum(['schedule','publish']),expectedContentRevision:z.number().int().min(1),approvalDigest:z.string().min(1).max(128).optional(),grantId:socialId.optional(),requiredConsentId:socialId.optional()}).strict();
export const approvalSchema=z.object({expectedContentRevision:z.number().int().min(1),digest:z.string().min(1).max(128)}).strict();
export const modeSchema=z.object({mode:autonomyMode,grantId:socialId.optional()}).strict();
export const retrySchema=z.object({itemIds:z.array(socialId).max(1000).optional()}).strict();
