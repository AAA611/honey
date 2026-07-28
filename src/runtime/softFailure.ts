/**
 * Actionable Soft failure Tool result content (ADR-0014).
 * Shape: what failed / why / what to try next — free text, not recovery codes.
 */
export function formatSoftFailure(what: string, why: string, next: string): string {
  return `Soft failure: ${what}. ${why}. Next: ${next}`;
}
