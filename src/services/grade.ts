export type IntelligenceGrade =
  | 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export function gradeScore(score: number): IntelligenceGrade {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 97) return 'A+';
  if (s >= 93) return 'A';
  if (s >= 90) return 'A-';
  if (s >= 87) return 'B+';
  if (s >= 83) return 'B';
  if (s >= 80) return 'B-';
  if (s >= 77) return 'C+';
  if (s >= 73) return 'C';
  if (s >= 70) return 'C-';
  if (s >= 67) return 'D+';
  if (s >= 63) return 'D';
  if (s >= 60) return 'D-';
  return 'F';
}
