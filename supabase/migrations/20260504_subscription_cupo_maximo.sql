-- Add spot limit column to subscription plans
ALTER TABLE subscription_planes
  ADD COLUMN IF NOT EXISTS cupo_maximo integer DEFAULT NULL;

COMMENT ON COLUMN subscription_planes.cupo_maximo IS 'Max active+pending subscribers allowed. NULL = unlimited.';
