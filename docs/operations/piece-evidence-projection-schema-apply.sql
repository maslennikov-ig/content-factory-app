-- Additive only. Existing context items retain their v1/v2 rendering.
ALTER TABLE "ContentContextItem" ADD COLUMN     "evidenceProjection" JSONB;
