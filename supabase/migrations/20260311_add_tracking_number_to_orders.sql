-- Migration: Add tracking_number column to orders table
-- Run this in Supabase SQL Editor or via supabase db push

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

COMMENT ON COLUMN orders.tracking_number IS 'Shipping carrier tracking number (UPS, FedEx, USPS, etc.)';
