"""Legacy baseline: the five n8n-era app tables, exactly as they exist in production.

Revision ID: 0001_legacy_baseline
Revises:
Create Date: 2026-11-11

Production already has these tables (created by hand for the n8n workflows), so every
statement is ``IF NOT EXISTS`` and the revision is a no-op there. A fresh dev/test
database gets the same starting point, which lets ``alembic upgrade head`` work from
nothing and lets 0002 be tested against the real "before" shape.

Better Auth's tables are not created here (the frontend owns them).
"""

from alembic import op

revision = "0001_legacy_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS resume_match")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resume_match.user_resume (
            file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id text NOT NULL,
            file_name text,
            file_size bigint,
            mime_type text,
            num_pages integer,
            num_characters integer,
            num_words integer,
            is_scanned boolean DEFAULT false,
            is_resume boolean DEFAULT true,
            is_candidate boolean,
            reasoning text,
            file_binary_data bytea,
            file_text text,
            checksum text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_resume_checksum "
        "ON resume_match.user_resume (checksum)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_resume_user_id ON resume_match.user_resume (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resume_match.user_jds (
            url_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            jd_url text,
            user_id text NOT NULL,
            is_candidate boolean,
            is_jd boolean DEFAULT true,
            validation_note text,
            jd_object jsonb,
            checksum text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_jds_checksum ON resume_match.user_jds (checksum)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_jds_user_id ON resume_match.user_jds (user_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resume_match.job_match_summary (
            summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            url_id uuid,
            user_id text NOT NULL,
            file_id uuid NOT NULL,
            is_candidate boolean,
            job_match_summary jsonb,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_match_summary_user_id "
        "ON resume_match.job_match_summary (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resume_match.user_credit_accounts (
            user_id text PRIMARY KEY,
            current_balance integer NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT user_credit_accounts_current_balance_check CHECK (current_balance >= 0)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_credit_accounts_user_id "
        "ON resume_match.user_credit_accounts (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resume_match.user_credit_transactions (
            transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id text NOT NULL,
            transaction_type text NOT NULL,
            credits_delta integer NOT NULL,
            reference_id uuid,
            name_snapshot text,
            description text,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT fk_credit_user FOREIGN KEY (user_id)
                REFERENCES resume_match.user_credit_accounts (user_id) ON DELETE CASCADE,
            CONSTRAINT user_credit_transactions_credits_delta_check CHECK (credits_delta <> 0),
            CONSTRAINT user_credit_transactions_transaction_type_check CHECK (
                transaction_type IN
                ('signup_bonus', 'resume_processing', 'jd_processing', 'refund', 'manual_adjustment')
            )
        )
        """
    )


def downgrade() -> None:
    # Deliberately a no-op: these tables pre-date Alembic and hold production data.
    pass
