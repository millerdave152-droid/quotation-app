-- Migration 202: Add EHF (Environmental Handling Fee) column to quotations
-- EHF applies to TVs, Blu-ray/DVD players, and Projectors in Ontario
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS ehf_cents INTEGER DEFAULT 0;
