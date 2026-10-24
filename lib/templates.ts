import type { Challenge } from "@/types";
import { toLocalDate } from "./date-utils";

export type Template = Pick<Challenge, "name" | "activityName" | "activityLabelPlural" | "unitLabel" | "targetMode" | "targetReps" | "defaultRepsPerSet" | "quickSetSizes"> & { glyph: string; cadence?: number };

/** Starting points for the challenge builder. `cadence` seeds the timer's auto-count (reps per minute). */
export const TEMPLATES: Record<string, Template> = {
  pushups: { glyph: "💪", name: "10K Push-Up Challenge", activityName: "Push-up", activityLabelPlural: "Push-ups", unitLabel: "reps", targetMode: "total", targetReps: 10000, defaultRepsPerSet: 10, quickSetSizes: [5, 20, 25] },
  squats: { glyph: "🦵", name: "10K Squat Challenge", activityName: "Squat", activityLabelPlural: "Squats", unitLabel: "reps", targetMode: "total", targetReps: 10000, defaultRepsPerSet: 25, quickSetSizes: [10, 50, 100] },
  rope: { glyph: "〰", name: "Daily Rope Reps", activityName: "Jump rope", activityLabelPlural: "Rope reps", unitLabel: "reps", targetMode: "daily", targetReps: 500, defaultRepsPerSet: 100, quickSetSizes: [50, 200, 250], cadence: 120 },
  pullups: { glyph: "🧗", name: "1,000 Pull-Up Club", activityName: "Pull-up", activityLabelPlural: "Pull-ups", unitLabel: "reps", targetMode: "total", targetReps: 1000, defaultRepsPerSet: 5, quickSetSizes: [3, 8, 10] },
  burpees: { glyph: "🔥", name: "Burpee Gauntlet", activityName: "Burpee", activityLabelPlural: "Burpees", unitLabel: "reps", targetMode: "total", targetReps: 2500, defaultRepsPerSet: 10, quickSetSizes: [5, 15, 20] },
  situps: { glyph: "🌀", name: "Daily Core 100", activityName: "Sit-up", activityLabelPlural: "Sit-ups", unitLabel: "reps", targetMode: "daily", targetReps: 100, defaultRepsPerSet: 20, quickSetSizes: [10, 25, 50] },
  lunges: { glyph: "🚶", name: "5K Lunge Quest", activityName: "Lunge", activityLabelPlural: "Lunges", unitLabel: "reps", targetMode: "total", targetReps: 5000, defaultRepsPerSet: 20, quickSetSizes: [10, 30, 40] },
  running: { glyph: "🏃", name: "100 Running Minutes", activityName: "Running", activityLabelPlural: "Running minutes", unitLabel: "minutes", targetMode: "total", targetReps: 100, defaultRepsPerSet: 20, quickSetSizes: [10, 30, 45] },
  plank: { glyph: "⏱", name: "Plank Minutes", activityName: "Plank", activityLabelPlural: "Plank seconds", unitLabel: "seconds", targetMode: "daily", targetReps: 180, defaultRepsPerSet: 60, quickSetSizes: [30, 45, 90] },
  custom: { glyph: "✳️", name: "My Challenge", activityName: "", activityLabelPlural: "", unitLabel: "reps", targetMode: "total", targetReps: 1000, defaultRepsPerSet: 10, quickSetSizes: [5, 20, 25] },
};

export const glyphFor = (c: Pick<Challenge, "activityName">) => Object.values(TEMPLATES).find((t) => t.activityName && t.activityName === c.activityName)?.glyph || "🏋️";
export const cadenceFor = (c: Pick<Challenge, "activityName">) => Object.values(TEMPLATES).find((t) => t.activityName === c.activityName)?.cadence;
/** Time-based units let the timer record elapsed time directly. */
export const timeUnit = (c: Pick<Challenge, "unitLabel">): "seconds" | "minutes" | null => /^sec/i.test(c.unitLabel) ? "seconds" : /^min/i.test(c.unitLabel) ? "minutes" : null;

export function makeChallenge(t: Template, userId: string, defaultReps?: number): Challenge {
  const iso = new Date().toISOString();
  const end = new Date();
  end.setDate(end.getDate() + 89);
  const { glyph: _glyph, cadence: _cadence, ...fields } = t;
  void _glyph; void _cadence;
  return { id: crypto.randomUUID(), userId, ...fields, defaultRepsPerSet: t.activityName ? fields.defaultRepsPerSet : defaultReps || fields.defaultRepsPerSet, activeWeekdays: [0, 1, 2, 3, 4, 5, 6], startDate: toLocalDate(), endDate: toLocalDate(end), openingReps: 0, status: "active", createdAt: iso, updatedAt: iso };
}

/** Returns a user-facing error for an invalid challenge, or null. */
export function validateChallenge(c: Challenge): string | null {
  if (!c.name.trim()) return "Give your challenge a name.";
  if (!c.activityName.trim() || !c.activityLabelPlural.trim()) return "Name the movement (e.g. Push-up / Push-ups).";
  if (!Number.isInteger(c.targetReps) || c.targetReps < 1) return "The target must be at least 1.";
  if (!Number.isInteger(c.defaultRepsPerSet) || c.defaultRepsPerSet < 1) return "Reps per tap must be at least 1.";
  if (!c.startDate) return "Pick a start date.";
  if (c.endDate && c.endDate < c.startDate) return "The end date must be after the start date.";
  if (c.targetMode === "daily" && !c.activeWeekdays.length) return "Choose at least one training day.";
  if (c.quickSetSizes.some((n) => !Number.isInteger(n) || n < 1)) return "Quick sets must be whole numbers above 0.";
  return null;
}
