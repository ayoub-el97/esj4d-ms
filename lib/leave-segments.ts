// Demande de congé découpée autour des jours de repos hebdomadaires — module pur.

export type LeaveDay = { day: string; rest: boolean; rest_known: boolean };
export type LeaveSegment = { from: string; to: string; days: number };

const nextDay = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** Périodes de congé (jours consécutifs hors repos), jours de repos exclus, total déduit. */
export function leaveSegments(days: LeaveDay[]): { segments: LeaveSegment[]; restDays: string[]; total: number; restUnknown: boolean } {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const segments: LeaveSegment[] = [];
  for (const d of sorted) {
    if (d.rest) continue;
    const last = segments[segments.length - 1];
    if (last && nextDay(last.to) === d.day) {
      last.to = d.day;
      last.days++;
    } else segments.push({ from: d.day, to: d.day, days: 1 });
  }
  return {
    segments,
    restDays: sorted.filter((d) => d.rest).map((d) => d.day),
    total: segments.reduce((s, x) => s + x.days, 0),
    restUnknown: sorted.some((d) => !d.rest_known),
  };
}
