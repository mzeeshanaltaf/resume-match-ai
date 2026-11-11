"""Reshape the resume_match app tables for the FastAPI backend (master plan, Part 2).

Revision ID: 0002_reshape_for_fastapi
Revises: 0001_legacy_baseline
Create Date: 2026-11-11

DESTRUCTIVE: truncates the five app tables (approved: they only hold dummy data).
Better Auth tables are not touched.

  * user_resume / user_jds: checksum uniqueness becomes (user_id, checksum)
  * user_resume: drop file_binary_data, add storage_key NOT NULL (object storage)
  * job_match_summary: real FKs to resume and JD (ON DELETE CASCADE), (user_id, created_at) index
  * user_credit_transactions: type CHECK extended with match_analysis / screening / cover_letter
  * new tables: deleted_accounts, jobs, generated_documents
"""

from alembic import op

revision = "0002_reshape_for_fastapi"
down_revision = "0001_legacy_baseline"
branch_labels = None
depends_on = None

S = "resume_match"

APP_TABLES = (
    f"{S}.job_match_summary, {S}.user_resume, {S}.user_jds, "
    f"{S}.user_credit_transactions, {S}.user_credit_accounts"
)

OLD_TYPES = "'signup_bonus', 'resume_processing', 'jd_processing', 'refund', 'manual_adjustment'"
NEW_TYPES = OLD_TYPES + ", 'match_analysis', 'screening', 'cover_letter'"


def upgrade() -> None:
    # 1. Dummy data goes; later steps (NOT NULL column, FKs, unique keys) rely on empty tables.
    op.execute(f"TRUNCATE TABLE {APP_TABLES}")

    # 2. user_resume: storage_key replaces the bytea column; uniqueness per user.
    op.execute(f"ALTER TABLE {S}.user_resume DROP COLUMN IF EXISTS file_binary_data")
    op.execute(f"ALTER TABLE {S}.user_resume ADD COLUMN storage_key text NOT NULL")
    op.execute(f"DROP INDEX IF EXISTS {S}.idx_user_resume_checksum")
    op.execute(
        f"ALTER TABLE {S}.user_resume "
        "ADD CONSTRAINT uq_user_resume_user_id_checksum UNIQUE (user_id, checksum)"
    )

    # 3. user_jds: uniqueness per user.
    op.execute(f"DROP INDEX IF EXISTS {S}.idx_user_jds_checksum")
    op.execute(
        f"ALTER TABLE {S}.user_jds "
        "ADD CONSTRAINT uq_user_jds_user_id_checksum UNIQUE (user_id, checksum)"
    )

    # 4. job_match_summary: real foreign keys + ordered-history index.
    op.execute(
        f"ALTER TABLE {S}.job_match_summary "
        "ADD CONSTRAINT fk_job_match_summary_file_id FOREIGN KEY (file_id) "
        f"REFERENCES {S}.user_resume (file_id) ON DELETE CASCADE"
    )
    op.execute(
        f"ALTER TABLE {S}.job_match_summary "
        "ADD CONSTRAINT fk_job_match_summary_url_id FOREIGN KEY (url_id) "
        f"REFERENCES {S}.user_jds (url_id) ON DELETE CASCADE"
    )
    op.execute(f"DROP INDEX IF EXISTS {S}.idx_job_match_summary_user_id")
    op.execute(
        "CREATE INDEX ix_job_match_summary_user_id_created_at "
        f"ON {S}.job_match_summary (user_id, created_at)"
    )

    # 5. Extend the ledger's transaction-type CHECK.
    op.execute(
        f"ALTER TABLE {S}.user_credit_transactions "
        "DROP CONSTRAINT IF EXISTS user_credit_transactions_transaction_type_check"
    )
    op.execute(
        f"ALTER TABLE {S}.user_credit_transactions "
        "ADD CONSTRAINT user_credit_transactions_transaction_type_check "
        f"CHECK (transaction_type IN ({NEW_TYPES}))"
    )

    # 6. New tables.
    op.execute(
        f"""
        CREATE TABLE {S}.deleted_accounts (
            email_hash text PRIMARY KEY,
            deleted_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE {S}.jobs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id text NOT NULL,
            kind text NOT NULL,
            status text NOT NULL DEFAULT 'queued',
            steps jsonb NOT NULL DEFAULT '[]'::jsonb,
            result jsonb,
            error jsonb,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,
            CONSTRAINT jobs_status_check
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
        )
        """
    )
    op.execute(f"CREATE INDEX ix_jobs_user_id_created_at ON {S}.jobs (user_id, created_at)")
    op.execute(f"CREATE INDEX ix_jobs_status ON {S}.jobs (status)")
    op.execute(
        f"""
        CREATE TABLE {S}.generated_documents (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            match_id uuid NOT NULL,
            kind text NOT NULL,
            content jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_generated_documents_match_id FOREIGN KEY (match_id)
                REFERENCES {S}.job_match_summary (summary_id) ON DELETE CASCADE,
            CONSTRAINT generated_documents_kind_check
                CHECK (kind IN ('tailored_bullets', 'cover_letter'))
        )
        """
    )
    op.execute(f"CREATE INDEX ix_generated_documents_match_id ON {S}.generated_documents (match_id)")


def downgrade() -> None:
    # Restores the old *shape*. Data cannot be restored (the original files lived in
    # bytea and were never migrated), so the app tables are emptied again, which also
    # guarantees the restored constraints (global checksum uniqueness, narrower type
    # CHECK) can be re-created.
    op.execute(f"DROP TABLE IF EXISTS {S}.generated_documents")
    op.execute(f"DROP TABLE IF EXISTS {S}.jobs")
    op.execute(f"DROP TABLE IF EXISTS {S}.deleted_accounts")

    op.execute(f"TRUNCATE TABLE {APP_TABLES}")

    op.execute(
        f"ALTER TABLE {S}.user_credit_transactions "
        "DROP CONSTRAINT IF EXISTS user_credit_transactions_transaction_type_check"
    )
    op.execute(
        f"ALTER TABLE {S}.user_credit_transactions "
        "ADD CONSTRAINT user_credit_transactions_transaction_type_check "
        f"CHECK (transaction_type IN ({OLD_TYPES}))"
    )

    op.execute(f"DROP INDEX IF EXISTS {S}.ix_job_match_summary_user_id_created_at")
    op.execute(f"ALTER TABLE {S}.job_match_summary DROP CONSTRAINT IF EXISTS fk_job_match_summary_url_id")
    op.execute(f"ALTER TABLE {S}.job_match_summary DROP CONSTRAINT IF EXISTS fk_job_match_summary_file_id")
    op.execute(f"CREATE INDEX idx_job_match_summary_user_id ON {S}.job_match_summary (user_id)")

    op.execute(f"ALTER TABLE {S}.user_jds DROP CONSTRAINT IF EXISTS uq_user_jds_user_id_checksum")
    op.execute(f"CREATE UNIQUE INDEX idx_user_jds_checksum ON {S}.user_jds (checksum)")

    op.execute(f"ALTER TABLE {S}.user_resume DROP CONSTRAINT IF EXISTS uq_user_resume_user_id_checksum")
    op.execute(f"CREATE UNIQUE INDEX idx_user_resume_checksum ON {S}.user_resume (checksum)")
    op.execute(f"ALTER TABLE {S}.user_resume DROP COLUMN IF EXISTS storage_key")
    op.execute(f"ALTER TABLE {S}.user_resume ADD COLUMN file_binary_data bytea")
