-- Fuzzy sponsor-name suggestions ("possible match") use trigram similarity.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Sponsor_normalizedName_trgm_idx" ON "Sponsor" USING gin ("normalizedName" gin_trgm_ops);
