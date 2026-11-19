-- Milestone 1B: Initial internal operational foundation schema.
-- Contains only migration tracking and the default-disabled external source registry.
-- No user data, observations, problem clusters, or evaluations are stored yet.

CREATE SCHEMA IF NOT EXISTS kopi_internal;

CREATE TABLE IF NOT EXISTS kopi_internal.schema_migrations (
  version TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum_sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_schema_migrations_version_nonempty CHECK (btrim(version) <> ''),
  CONSTRAINT chk_schema_migrations_checksum_hex CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS kopi_internal.data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_category TEXT NOT NULL,
  access_mechanism TEXT NOT NULL,
  license_or_terms_ref TEXT,
  terms_verified_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  rate_limit_rpm INTEGER,
  retention_days INTEGER,
  attribution_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_data_sources_id_nonempty CHECK (btrim(id) <> ''),
  CONSTRAINT chk_data_sources_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT chk_data_sources_category CHECK (
    source_category IN ('forum_api', 'open_dataset', 'research_feed', 'user_submitted')
  ),
  CONSTRAINT chk_data_sources_rate_limit_positive CHECK (
    rate_limit_rpm IS NULL OR rate_limit_rpm > 0
  ),
  CONSTRAINT chk_data_sources_retention_positive CHECK (
    retention_days IS NULL OR retention_days > 0
  ),
  CONSTRAINT chk_data_sources_enable_requires_verified_terms CHECK (
    NOT is_enabled OR (
      license_or_terms_ref IS NOT NULL
      AND btrim(license_or_terms_ref) <> ''
      AND terms_verified_at IS NOT NULL
    )
  )
);

-- Restrict internal schema access from public/unprivileged roles by default.
REVOKE ALL ON SCHEMA kopi_internal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA kopi_internal FROM PUBLIC;
