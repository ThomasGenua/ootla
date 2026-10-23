-- Staff self-service accounts. Existing staff, memberships and credentials are preserved.
ALTER TABLE users
  ADD COLUMN staff_phone text CHECK (staff_phone IS NULL OR (char_length(staff_phone) BETWEEN 1 AND 40 AND staff_phone !~ '[[:cntrl:]]')),
  ADD COLUMN staff_job_title text CHECK (staff_job_title IS NULL OR (char_length(staff_job_title) BETWEEN 1 AND 120 AND staff_job_title !~ '[[:cntrl:]]')),
  ADD COLUMN profile_version integer NOT NULL DEFAULT 1 CHECK (profile_version > 0);

ALTER TABLE organization_memberships ADD CONSTRAINT memberships_staff_preference_scope_key
  UNIQUE (id, user_id, organization_id);

-- Preferences belong to this exact staff membership; team/organization settings
-- and authority are never stored here. Absence means the shared UI defaults.
CREATE TABLE staff_user_preferences (
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  default_page text NOT NULL DEFAULT '/admin' CHECK (default_page IN ('/admin','/admin/leads','/admin/tasks')),
  lead_view text NOT NULL DEFAULT 'list' CHECK (lead_view IN ('list','board')),
  motion text NOT NULL DEFAULT 'system' CHECK (motion IN ('system','reduce')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id),
  UNIQUE (membership_id),
  FOREIGN KEY (membership_id, user_id, organization_id)
    REFERENCES organization_memberships(id, user_id, organization_id) ON DELETE CASCADE
);

-- Bound attempts across sessions and API restarts, without storing passwords,
-- IP addresses or other credential material. A row is created only on an
-- explicit password-change attempt, never while viewing a profile or settings.
CREATE TABLE staff_password_attempt_limits (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 5)
);
