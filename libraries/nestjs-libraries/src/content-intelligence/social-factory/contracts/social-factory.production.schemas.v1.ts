import { SourceArtifactRefSchemaV1 } from './source-artifact.v1';
import { helixaFeedbackEvidenceSchema } from '../attribution/helixa-exchange.v1';
import { z } from 'zod';
import { socialId } from './social-factory.schemas.v1';
import { ProductionManifestSchemaV1 } from '../../../videos/production/video-production.v1';
import { PersonalProductionFundingSchemaV2, PersonalProductionManifestSchemaV2, PersonalProductionPreflightSchemaV2 } from '../../../videos/production/video-production.personal.v2';
const override=z.object({audioMode:z.enum(['silent','narrated']).optional(),sourceArtifact:SourceArtifactRefSchemaV1.optional(),instruction:z.string().trim().min(1).max(20000).optional(),language:z.string().min(2).max(80).optional(),lengthChoiceId:socialId.optional(),lengthGuidance:z.string().max(2000).optional(),targetSeconds:z.number().positive().max(600).optional()}).strict();
export const campaignPreparationSchema=override.extend({campaignId:socialId,requestId:socialId,instruction:z.string().trim().min(1).max(20000),allowWebSearch:z.boolean().optional(),sourceIds:z.array(socialId).max(20).optional(),itemIds:z.array(socialId).min(1).max(500).optional(),itemOverrides:z.record(socialId,override).optional(),visuals:z.object({background:z.string().regex(/^#[a-fA-F0-9]{6}$/),foreground:z.string().regex(/^#[a-fA-F0-9]{6}$/),imageMediaIds:z.array(socialId.nullable()).max(20).optional()}).strict().optional()}).strict();
export const videoRevisionSchema=z.object({manifest:ProductionManifestSchemaV1,intentId:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),parentId:socialId.optional()}).strict();
export const campaignVideoBindSchema=videoRevisionSchema.extend({operationId:socialId});
export const videoPreflightSchema=z.object({maxTotalUsd:z.number().finite().positive().max(100000)}).strict();
// Keep the V1 exports strict and unchanged for their existing consumers.
export const videoRevisionInputSchema=videoRevisionSchema.extend({manifest:z.union([ProductionManifestSchemaV1,PersonalProductionManifestSchemaV2]),funding:PersonalProductionFundingSchemaV2.optional()}).strict();
export const campaignVideoBindInputSchema=videoRevisionInputSchema.extend({operationId:socialId});
export const videoPreflightInputSchema=z.union([videoPreflightSchema,PersonalProductionPreflightSchemaV2]);
// Native tool providers require a root object. Both runtime doors validate the
// same exclusive union before invoking the versioned production dispatcher.
export const videoPreflightToolSchema=z.object({productionId:socialId,maxTotalUsd:videoPreflightSchema.shape.maxTotalUsd.optional(),creditLimits:PersonalProductionPreflightSchemaV2.shape.creditLimits.optional()}).strict();
export const videoLaunchSchema=z.object({approvalId:socialId,digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const optionalAnalyticsSchema=z.object({channelId:socialId,sourceIds:z.array(socialId).max(20),connectorId:z.literal('licensed_registry_export_v1').optional()}).strict();
export const attributionLinkSchema=z.object({campaignId:socialId,channelId:socialId,itemId:socialId.optional(),surface:z.enum(['post','bio','story','description','related_video']),targetUrl:z.string().url().max(2048),requestId:socialId}).strict();
export const campaignTextEditSchema=z.object({campaignId:socialId,itemId:socialId,expectedContentRevision:z.number().int().positive(),body:z.string().trim().min(1).max(100000),postIndex:z.number().int().nonnegative().optional()}).strict();
export const sourcePermissionSchema=z.object({sourceId:socialId,expectedRevision:z.number().int().nonnegative(),purposes:z.array(z.enum(['discovery','editorial','licensed_registry_export_v1'])).min(1).max(3),basis:z.enum(['owned','licensed','consented']),expiresAt:z.string().datetime({offset:true}),origin:z.enum(['first_party','web','telegram','youtube','other']).default('other'),acquisition:z.enum(['first_party','upload','url','rss','search','licensed']),sourceContext:z.string().min(1).max(2000),channelIds:z.array(socialId).min(1).max(100),telegramConsent:z.object({evidenceId:socialId,context:z.string().min(1).max(2000),allRelevantUsers:z.boolean(),explicitInformedAffirmative:z.boolean(),continued:z.boolean()}).strict().optional()}).strict();
const experimentGroup=z.object({label:z.string().min(1).max(300),itemIds:z.array(socialId).min(3).max(20)}).strict();
export const campaignExperimentSchema=z.object({channelId:socialId,dimension:z.enum(['topic','hook','format','length','timing','cta']),metric:z.string().min(1).max(100),objective:z.enum(['maximize','minimize']),baseline:experimentGroup,candidate:experimentGroup,comparisonWindowHours:z.number().positive(),endsAt:z.string().datetime({offset:true})}).strict();
export const findingProposalSchema=z.object({findingId:socialId,projectId:socialId,commandId:socialId,occurredAt:z.string().datetime({offset:true}),basedOn:z.object({claimId:socialId,revision:z.number().int().positive()}).strict(),feedbackEvidence:z.array(z.object({id:socialId,sourceDomain:z.literal('content'),sourceId:socialId,sourceRevisionId:socialId,artifactId:socialId,evidenceHash:z.string().regex(/^[a-f0-9]{64}$/),policyRevision:socialId,providerPermissionRequired:z.literal(false),governanceSourceId:socialId.optional(),fragmentId:socialId.optional()}).strict()).min(1).max(10),sensitive:z.boolean()}).strict();
export const helixaReadSchema=z.object({operation:z.enum(['knowledge.read','crm.outcomes.read']),projectId:socialId.optional(),resourceIds:z.array(socialId).min(1).max(50),attributionLinkId:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export const helixaReadRequestSchema=helixaReadSchema.superRefine((input,context)=>{
  if(input.operation==='crm.outcomes.read'&&!input.projectId)context.addIssue({code:'custom',path:['projectId'],message:'CRM read requires an explicit project.'});
  if(input.attributionLinkId&&input.operation!=='crm.outcomes.read')context.addIssue({code:'custom',path:['attributionLinkId'],message:'Tracking links apply only to CRM outcomes.'});
});
export const productionReinspectSchema=z.object({operationId:socialId,expectedContentRevision:z.number().int().positive()}).strict();
export const campaignReviseSchema=campaignPreparationSchema.omit({campaignId:true,itemIds:true,itemOverrides:true,allowWebSearch:true}).extend({campaignId:socialId,itemId:socialId,expectedContentRevision:z.number().int().positive(),instruction:z.string().trim().min(1).max(12000)}).strict();
