-- Add client signature field to delivery log (safe, idempotent)
alter table subscription_entregas
  add column if not exists firma text; -- base64 PNG data URL
