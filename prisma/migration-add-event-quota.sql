-- ============================================================================
-- Migration: Add max_rsvp column to community_events
-- Run this in Neon SQL Editor
-- ============================================================================

ALTER TABLE community_events ADD COLUMN IF NOT EXISTS max_rsvp INTEGER DEFAULT NULL;

-- NULL means unlimited, a number means max attendees allowed
-- Verify
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'community_events' AND column_name = 'max_rsvp';
