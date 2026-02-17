export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Collector passed to each validator so it can push errors/warnings. */
export interface ValidationCollector {
  errors: string[];
  warnings: string[];
}
