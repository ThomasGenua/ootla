-- Read-only Ask conversations can cover an authorized organization/task scope without inventing a property.
-- Existing property-required public/AI APIs and all organization/actor foreign keys remain enforced.
ALTER TABLE ai_requests ALTER COLUMN property_id DROP NOT NULL;
