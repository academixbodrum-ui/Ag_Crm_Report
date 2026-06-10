-- Adds the missing consultant/deposit bonus fields to existing Supabase projects.
-- Run this once in the Supabase SQL Editor for the connected project.

ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS manual_net_commission NUMERIC DEFAULT 0;
ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS deposit_bonus NUMERIC DEFAULT 0;
ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS deposit_bonus_status TEXT DEFAULT '';
ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS consultant_bonus NUMERIC DEFAULT 0;
ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS consultant_bonus_status TEXT DEFAULT '';
ALTER TABLE crm_tracking ADD COLUMN IF NOT EXISTS remaining_bonus NUMERIC DEFAULT 0;
