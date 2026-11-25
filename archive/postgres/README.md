# Archived PostgreSQL Foundation (Milestone 1B/1C)

Historical SQL migrations (`migrations/0001_initial_foundation.sql`) from Kopi's
pre-Firebase PostgreSQL foundation are preserved here for auditability.

Upon completion of Milestone F2 (live Cloud Firestore integration and verification
against `gen-lang-client-0653252950` / `ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372`),
runtime `pg` dependencies, scripts, and `server/db/` were retired cleanly without
modifying any external database resources. Full pre-retirement module backup is
stored in `.checkpoints/legacy-postgres-db-archive.tar.gz`.
