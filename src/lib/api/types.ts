/**
 * Types for the FastAPI backend (`backend/openapi.json` is the contract).
 * Hand-written; keep in step with that file.
 */

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Every non-2xx response from the backend. */
export type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

// ─── Match report (same shapes the UI has always used) ──────────────────────

export type CriticalGap = {
  gap: string;
  impact_level: string;
  jd_requirement: string;
  remediation_difficulty: string;
};

export type KeyStrength = {
  strength: string;
  evidence: string;
  jd_alignment: string;
};

export type MatchSummary = {
  overall_score_percent: number;
  score_confidence: string;
  /** Recruiter-mode reports carry a rationale instead of strengths/gaps. */
  rationale?: string;
  critical_gaps?: CriticalGap[];
  key_strengths?: KeyStrength[];
};

export type KeywordToAdd = {
  keyword: string;
  context_suggestion: string;
  frequency_recommendation: string;
};

export type SkillToRephrase = {
  current_phrase: string;
  suggested_rephrase: string;
  reason: string;
};

export type SectionRecommendation = {
  section: string;
  recommendation: string;
  rationale: string;
};

export type AtsOptimization = {
  keywords_to_add: KeywordToAdd[];
  skills_to_rephrase: SkillToRephrase[];
  section_recommendations: SectionRecommendation[];
};

export type RequirementMet = {
  jd_requirement: string;
  resume_evidence: string;
  match_quality: string;
  notes?: string | null;
  requirement_type: string;
};

export type GapWeakMatch = {
  jd_requirement: string;
  current_status: string;
  impact_level: string;
  requirement_type: string;
  suggested_action: string;
};

export type DetailedAnalysis = {
  requirements_met: RequirementMet[];
  gaps_and_weak_matches: GapWeakMatch[];
};

export type ImprovementSuggestion = {
  suggestion: string;
  effort_required: string;
  expected_impact: string;
  example_phrasing?: string | null;
};

export type ImprovementSuggestions = {
  high_priority: ImprovementSuggestion[];
  medium_priority: ImprovementSuggestion[];
  nice_to_have: ImprovementSuggestion[];
};

/**
 * `MatchOut.report`. Candidate reports have every section; recruiter reports
 * only `match_summary` (with `rationale`).
 */
export type JobMatchSummaryData = {
  match_summary: MatchSummary;
  ats_optimization?: AtsOptimization;
  detailed_analysis?: DetailedAnalysis;
  improvement_suggestions?: ImprovementSuggestions;
};

// ─── Documents ──────────────────────────────────────────────────────────────

/** `candidate` = Job Fit; `recruiter` = Resume Screener. */
export type Mode = "candidate" | "recruiter";

export type ResumeOut = {
  id: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  num_pages: number | null;
  num_characters: number | null;
  num_words: number | null;
  is_scanned: boolean;
  mode: Mode;
  created_at: string | null;
};

/** The structured job fields extracted from a posting. */
export type JobDescription = {
  job_title?: string;
  company_name?: string;
  location?: string;
  employment_type?: string;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  validation_note?: string;
  is_job_description?: boolean;
};

export type JobDescriptionOut = {
  id: string;
  jd_url: string | null;
  mode: Mode;
  validation_note: string | null;
  jd_object: JobDescription | null;
  created_at: string | null;
};

export type JobDescriptionCreate =
  | { url: string; mode: Mode }
  | { text: string; mode: Mode };

// ─── Matches, generated documents ───────────────────────────────────────────

export type TailoredBullet = {
  original?: string | null;
  rewritten: string;
  why: string;
};

export type TailoredBulletsContent = {
  summary: string;
  experience: { heading: string; bullets: TailoredBullet[] }[];
  skills_to_emphasize: string[];
  notes?: string | null;
};

export type CoverLetterContent = {
  salutation: string;
  paragraphs: string[];
  closing: string;
  signature: string;
  /** The whole letter, ready to copy. */
  text: string;
};

export type GeneratedDocumentOut = {
  id: string;
  match_id: string;
  kind: "tailored_bullets" | "cover_letter";
  content: TailoredBulletsContent | CoverLetterContent;
  created_at: string;
};

export type MatchListItem = {
  id: string;
  resume_id: string;
  jd_id: string | null;
  mode: Mode;
  resume_file_name: string | null;
  job_title: string | null;
  company_name: string | null;
  jd_url: string | null;
  overall_score_percent: number | null;
  score_confidence: string | null;
  created_at: string | null;
};

export type MatchOut = MatchListItem & {
  report: JobMatchSummaryData;
  documents: GeneratedDocumentOut[];
};

// ─── Credits, overview ──────────────────────────────────────────────────────

export type CreditCosts = {
  match: number;
  cover_letter: number;
  screening_per_resume: number;
};

export type CreditsOut = {
  balance: number;
  costs: CreditCosts;
};

export type CreditTransaction = {
  id: string;
  transaction_type: string;
  credits_delta: number;
  reference_id: string | null;
  name_snapshot: string | null;
  description: string | null;
  created_at: string | null;
};

export type OverviewOut = {
  balance: number;
  counts: { resumes: number; job_descriptions: number; matches: number };
  recent_matches: MatchListItem[];
};

// ─── Jobs ───────────────────────────────────────────────────────────────────

export type JobAccepted = { job_id: string; status?: "queued" | "running" };

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type JobStep = {
  name: string;
  label?: string | null;
  status: "running" | "done" | "failed";
  started_at?: string | null;
  finished_at?: string | null;
};

export type JobOut = {
  id: string;
  kind: string;
  status: JobStatus;
  steps: JobStep[];
  result: Record<string, unknown> | null;
  error: ApiErrorBody | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

/** What a succeeded job leaves in `result`, per job kind. */
export type ResumeJobResult = { resume_id: string; resume: ResumeOut };
export type JobDescriptionJobResult = {
  jd_id: string;
  job_description: JobDescriptionOut;
};
export type MatchJobResult = { match_id: string; match: MatchOut };
export type DocumentJobResult = {
  document_id: string;
  document: GeneratedDocumentOut;
};

export type ScreeningRankedItem = {
  rank: number;
  match_id: string;
  resume_id: string;
  file_name: string | null;
  overall_score_percent: number;
  score_confidence: string;
  rationale: string;
};

export type ScreeningFailedItem = {
  resume_id: string;
  file_name: string | null;
  error: ApiErrorBody;
};

export type ScreeningResult = {
  jd_id: string;
  ranked: ScreeningRankedItem[];
  failed: ScreeningFailedItem[];
  refunded_credits: number;
};

// ─── Server-sent job events ─────────────────────────────────────────────────

export type JobEvent =
  | { type: "step"; step: JobStep }
  | { type: "succeeded"; result: Record<string, unknown> }
  | { type: "failed"; error: ApiErrorBody };
