export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "Duration unavailable";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  return `${(durationMs / 1000).toFixed(2)} s`;
}
