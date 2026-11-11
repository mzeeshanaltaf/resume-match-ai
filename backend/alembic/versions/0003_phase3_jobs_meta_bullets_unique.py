"""Phase 3 additions: jobs.meta and one tailored-bullets document per match.

Revision ID: 0003_phase3_jobs_meta
Revises: 0002_reshape_for_fastapi
Create Date: 2026-11-11

  * jobs.meta (jsonb, nullable): internal bookkeeping that is never returned by the API.
    Jobs that spend credits record their reservations here, so the failure hook and the
    startup recovery can refund exactly what a job did not deliver.
  * partial unique index: a match has at most one ``tailored_bullets`` document (they are
    included in the match credit, so they may be generated once; cover letters are paid and
    can be generated repeatedly).

Additive and non-destructive (no data is touched).
"""

from alembic import op

revision = "0003_phase3_jobs_meta"
down_revision = "0002_reshape_for_fastapi"
branch_labels = None
depends_on = None

S = "resume_match"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {S}.jobs ADD COLUMN meta jsonb")
    op.execute(
        "CREATE UNIQUE INDEX uq_generated_documents_bullets_per_match "
        f"ON {S}.generated_documents (match_id) WHERE kind = 'tailored_bullets'"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {S}.uq_generated_documents_bullets_per_match")
    op.execute(f"ALTER TABLE {S}.jobs DROP COLUMN IF EXISTS meta")
