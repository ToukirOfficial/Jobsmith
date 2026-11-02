-- Fuzzy sponsor-name suggestions ("possible match") use trigram similarity.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Sponsor_normalizedName_trgm_idx" ON "Sponsor" USING gin ("normalizedName" gin_trgm_ops);
