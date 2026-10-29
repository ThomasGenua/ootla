-- Migration 018 was published in the saved-work release. Preserve its checksum.
-- Rotate bounded batches so old rules and active runs cannot starve later work.
ALTER TABLE followup_rules ADD COLUMN last_checked_at timestamptz;
ALTER TABLE followup_runs ADD COLUMN last_checked_at timestamptz;
CREATE INDEX followup_rules_processing_idx ON followup_rules(last_checked_at NULLS FIRST,id);
CREATE INDEX followup_runs_processing_idx ON followup_runs(rule_id,last_checked_at NULLS FIRST,id) WHERE status='created';
