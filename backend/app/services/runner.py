"""Builds the app's :class:`JobRunner` with the credit-refund recovery handlers registered.

Used by ``create_app`` and by the test fixtures, so a runner always refunds the jobs it
inherits from a crashed process (``recover_interrupted`` runs at startup).
"""

from __future__ import annotations

from app.config import Settings
from app.services.generation import COVER_LETTER_JOB_KIND
from app.services.jobs import JobRunner, SessionMakerProvider
from app.services.matching import MATCH_JOB_KIND, SCREENING_JOB_KIND
from app.services.reservations import refund_interrupted

# Job kinds that reserve credits. (Tailored bullets are free; resume/JD jobs are free.)
CREDIT_SPENDING_JOB_KINDS = (MATCH_JOB_KIND, SCREENING_JOB_KIND, COVER_LETTER_JOB_KIND)


def build_runner(provider: SessionMakerProvider, settings: Settings) -> JobRunner:
    runner = JobRunner(provider, settings)
    for kind in CREDIT_SPENDING_JOB_KINDS:
        runner.register_recovery(kind, refund_interrupted)
    return runner
