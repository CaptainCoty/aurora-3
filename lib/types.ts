export type CorrectionEntry = {
  previous_final_high_f: number;
  previous_source: string;
  previous_entry_time: string;
  changed_at: string;
};

export type WuOutcome = {
  id: string;
  date: string; // YYYY-MM-DD, America/Los_Angeles calendar date
  final_high_f: number;
  source: string;
  entry_time: string;
  correction_history: CorrectionEntry[];
  is_verified: boolean;
  updated_at: string;
};

export type OutcomeEntryInput = {
  date: string;
  final_high_f: number;
  source?: string;
  is_verified?: boolean;
};
