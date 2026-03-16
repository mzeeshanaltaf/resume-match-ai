// ─── Main Workflow ──────────────────────────────────────────────────────────

export type ProcessResumeResponse = {
  file_id: string;
  file_name: string;
};

export type ScrapeJdResponse = {
  url_id: string;
  jd_url?: string;
};

// ─── Match Summary Sub-types ────────────────────────────────────────────────

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
  notes: string;
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
  example_phrasing: string;
};

export type ImprovementSuggestions = {
  high_priority: ImprovementSuggestion[];
  medium_priority: ImprovementSuggestion[];
  nice_to_have: ImprovementSuggestion[];
};

export type JobMatchSummaryData = {
  match_summary: MatchSummary;
  ats_optimization: AtsOptimization;
  detailed_analysis: DetailedAnalysis;
  improvement_suggestions: ImprovementSuggestions;
};

export type ResumeMatchResponse = {
  summary_id: string;
  url_id: string;
  user_id: string;
  file_id: string;
  is_candidate: boolean;
  job_match_summary: JobMatchSummaryData;
  created_at: string;
  updated_at: string;
};

// ─── Analytics ──────────────────────────────────────────────────────────────

export type UserAnalyticsResponse = {
  total_resume_processed: number;
  total_jds_processed: number;
  total_job_match_summary_processed: number;
};

// ─── Credits ────────────────────────────────────────────────────────────────

export type CreditBalanceResponse = {
  current_balance: number;
};

export type CreditTransaction = {
  transaction_type: string;
  credits_delta: number;
  description: string;
  created_at: string;
};

export type CreditHistoryResponse = CreditTransaction[];

// ─── Data ────────────────────────────────────────────────────────────────────

export type ResumeRecord = {
  file_id: string;
  file_name: string;
  file_size: number;
  file_base64: string;
};

export type JdRecord = {
  url_id: string;
  jd_url: string;
  is_jd: boolean;
  jd_object: Record<string, unknown>;
};

export type JobDescription = {
  job_title: string;
  company_name: string;
  location: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  employment_type: string;
  validation_note: string;
  is_job_description: boolean;
};

export type JobMatchSummary = {
  summary_id: string;
  file_id: string;
  url_id: string;
  user_id: string;
  is_candidate?: boolean;
  job_match_summary: JobMatchSummaryData;
  job_description?: JobDescription;
  created_at: string;
  updated_at: string;
  file_name?: string;
  jd_url?: string;
};

// ─── Delete ──────────────────────────────────────────────────────────────────

export type DeleteResponse = {
  success: boolean;
  message?: string;
};
