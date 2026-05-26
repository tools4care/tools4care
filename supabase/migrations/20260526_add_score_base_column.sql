-- Ensure score_base column exists on clientes table
-- This column stores the calculated credit score (300–850).
-- Default 500 = neutral starting score for new clients.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS score_base INTEGER NOT NULL DEFAULT 500;

-- Set any NULL or 0 scores to 500 (neutral) so they get recalculated properly
UPDATE clientes
SET score_base = 500
WHERE score_base IS NULL OR score_base = 0;
