-- Add exclude_from_total to case_details for rows that should not affect customer totals.
ALTER TABLE case_details
ADD COLUMN exclude_from_total boolean DEFAULT false;
