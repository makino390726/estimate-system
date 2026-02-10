-- Add display order for case_details and backfill existing rows
ALTER TABLE case_details
ADD COLUMN IF NOT EXISTS display_order integer;

-- Backfill in case_id + id order
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY id) AS rn
  FROM case_details
)
UPDATE case_details AS cd
SET display_order = ranked.rn
FROM ranked
WHERE cd.id = ranked.id
  AND cd.display_order IS NULL;
