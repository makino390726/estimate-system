-- Add price_rate to case_details for storing rate-based pricing.
ALTER TABLE case_details
ADD COLUMN price_rate numeric;
