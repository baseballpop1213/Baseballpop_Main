// src/config/metricMeta.ts

// You can keep this as plain `string` so we don't fight TS
export type MetricKey = string;

export interface MetricMeta {
  /** Short technical code like 1BSPEED, HPTEV, H10FAST, etc. */
  code?: string;
  /** Coach-facing name to show as the main label */
  displayName?: string;
  /** Optional shorter nickname */
  shortLabel?: string;
  /** Logical group for UX (Speed, Strength, Power, Balance, Mobility, Hitting, Pitching, etc.) */
  group?: string;
  /** Short instructions on how to run / score this test */
  instructions?: string;
  /** Extra notes if we ever want them */
  notes?: string;

  /** How this metric should be entered in the UI */
  inputType?: "number" | "select" | "text";

  /** Numeric guardrails for number inputs */
  min?: number;
  max?: number;
  step?: number;
  /** Optional formatting / UI hint */
  decimals?: number;
  unitHint?: string;
  placeholder?: string;

  /** For select-style metrics (optional, future use) */
  options?: { value: number | string; label: string }[];
}

/**
 * Registry of nicer labels + instructions keyed by `assessment_metrics.metric_key`.
 *
 * For now:
 * - Focused on 10U+ ATHLETIC SKILLS metrics (timed runs, SLS, MSR, toe touch, deep squat).
 * - Plus core hitting / pitching metrics we’ve already identified.
 *
 * Any metric not listed here will just fall back to the DB `label` + `unit`.
 */
const METRIC_META: Record<string, MetricMeta> = {
  /* ---------------------------------------------------------------------- */
  /*                         ATHLETIC SKILLS (10U+)                         */
  /* ---------------------------------------------------------------------- */

  // Speed: 1B sprint
  timed_run_1b: {
    code: "1BSPEED",
    group: "Speed",
    shortLabel: "1B Speed",
    displayName: "Timed Run to 1B (time)",
    instructions:
      "Have the player run from home plate straight through 1st base. " +
      "Use a stopwatch and enter the time in seconds to the hundredth.",
    inputType: "number",
    min: 0,
    max: 10,
    step: 0.01,
    decimals: 2,
    unitHint: "seconds",
    placeholder: "e.g. 4.32",
  },
  timed_run_1b_distance_ft: {
    code: "1BSPEED",
    group: "Speed",
    shortLabel: "1B Distance",
    displayName: "1B Base Path Distance (ft)",
    instructions:
      "Enter the distance from home plate to 1st base in feet (typically 40–90 ft).",
    inputType: "number",
    min: 40,
    max: 90,
    step: 5,
    unitHint: "feet",
    placeholder: "e.g. 60",
  },

  // Speed: 4-base sprint
  timed_run_4b: {
    code: "4BSPEED",
    group: "Speed",
    shortLabel: "4B Time",
    displayName: "Timed Run 4 Bases (time)",
    instructions:
      "Have the player run home-to-home around all four bases. Enter the total time in seconds.",
    inputType: "number",
    min: 0,
    max: 30,
    step: 0.01,
    decimals: 2,
    unitHint: "seconds",
    placeholder: "e.g. 18.75",
  },
  timed_run_4b_distance_ft: {
    code: "4BSPEED",
    group: "Speed",
    shortLabel: "4B Distance",
    displayName: "4B Base Path Distance (ft)",
    instructions:
      "Enter the total distance of the base path in feet (typically 4 × base distance).",
    inputType: "number",
    min: 120,
    max: 360,
    step: 5,
    unitHint: "feet",
    placeholder: "e.g. 240",
  },

  // Strength: 30-second push-ups / sit-ups
  apush_30: {
    code: "APUSH30",
    group: "Strength",
    shortLabel: "Push-ups (30s)",
    displayName: "Push-ups in 30 seconds",
    instructions:
      "Record the total number of good push-ups completed in 30 seconds.",
    notes: "Higher count = higher strength score.",
    inputType: "number",
    min: 0,
    max: 60,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 15",
  },
  asit_30: {
    code: "ASIT30",
    group: "Strength",
    shortLabel: "Sit-ups (30s)",
    displayName: "Sit-ups in 30 seconds",
    instructions:
      "Record the total number of good sit-ups completed in 30 seconds.",
    notes: "Higher count = higher core strength score.",
    inputType: "number",
    min: 0,
    max: 60,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 18",
  },

  // TODO (when those templates are wired): APUSH60, ASIT60, PULL60, etc.
  // apush_60, asit_60, pull_60 can be added here once we confirm metric_key names.

  // Power: vertical jump
  asp_jump_inches: {
    code: "ASPJUMP",
    group: "Power",
    shortLabel: "Vertical Jump",
    displayName: "Vertical Jump (inches)",
    instructions:
      "Player performs 3 max-effort vertical jumps. Enter the best jump height in inches (to the 0.25 if possible).",
    inputType: "number",
    min: 0,
    max: 60,
    step: 0.25,
    decimals: 2,
    unitHint: "inches",
    placeholder: "e.g. 19.5",
  },

  // Balance: single-leg stance, eyes open
  sls_eyes_open_right: {
    code: "BSLEO",
    group: "Balance",
    shortLabel: "SLS Eyes Open – R",
    displayName: "Single-leg Balance (eyes open, right)",
    instructions:
      "Player stands on right leg, eyes open, hands on hips. " +
      "Time until they lose balance or come out of the test position. Enter seconds (0–30).",
    inputType: "number",
    min: 0,
    max: 30,
    step: 0.1,
    decimals: 1,
    unitHint: "seconds",
    placeholder: "e.g. 18.5",
  },
  sls_eyes_open_left: {
    code: "BSLEO",
    group: "Balance",
    shortLabel: "SLS Eyes Open – L",
    displayName: "Single-leg Balance (eyes open, left)",
    instructions:
      "Player stands on left leg, eyes open, hands on hips. " +
      "Time until they lose balance or come out of the test position. Enter seconds (0–30).",
    inputType: "number",
    min: 0,
    max: 30,
    step: 0.1,
    decimals: 1,
    unitHint: "seconds",
    placeholder: "e.g. 22.1",
  },

  // Balance: single-leg stance, eyes closed
  sls_eyes_closed_right: {
    code: "BSLEC",
    group: "Balance",
    shortLabel: "SLS Eyes Closed – R",
    displayName: "Single-leg Balance (eyes closed, right)",
    instructions:
      "Same setup as eyes-open test but with eyes closed. Enter balance time in seconds (0–30).",
    inputType: "number",
    min: 0,
    max: 30,
    step: 0.1,
    decimals: 1,
    unitHint: "seconds",
    placeholder: "e.g. 9.7",
  },
  sls_eyes_closed_left: {
    code: "BSLEC",
    group: "Balance",
    shortLabel: "SLS Eyes Closed – L",
    displayName: "Single-leg Balance (eyes closed, left)",
    instructions:
      "Same setup as eyes-open test but with eyes closed. Enter balance time in seconds (0–30).",
    inputType: "number",
    min: 0,
    max: 30,
    step: 0.1,
    decimals: 1,
    unitHint: "seconds",
    placeholder: "e.g. 7.3",
  },

  // Mobility: multi-segment rotation
  msr_right: {
    code: "MSR",
    group: "Mobility",
    shortLabel: "MSR – Right",
    displayName: "Multi-segment Rotation – Right",
    instructions:
      "Player stands tall and rotates like a backswing to the right. " +
      "Enter their MSR score or angle based on your BPOP rubric (higher is better; typical total range up to 6 points).",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "score (0–6)",
    placeholder: "0–6",
  },
  msr_left: {
    code: "MSR",
    group: "Mobility",
    shortLabel: "MSR – Left",
    displayName: "Multi-segment Rotation – Left",
    instructions:
      "Player rotates through to the left side. Enter the MSR score/angle using the same rubric as the right side.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "score (0–6)",
    placeholder: "0–6",
  },

  // Mobility: toe touch
  toe_touch: {
    code: "MTT",
    group: "Mobility",
    shortLabel: "Toe Touch",
    displayName: "Toe Touch Mobility",
    instructions:
      "Use the BPOP Toe Touch scoring key (e.g. poor/average/good/excellent) and enter the numeric score (0–6).",
    notes: "Higher score = better hamstring/hip mobility.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "score (0–6)",
    placeholder: "0–6",
  },

  // Mobility: deep squat
  deep_squat: {
    code: "MDS",
    group: "Mobility",
    shortLabel: "Deep Squat",
    displayName: "Deep Squat Quality",
    instructions:
      "Assess deep squat pattern quality using the BPOP deep squat rubric and enter the numeric score (0–9).",
    notes: "Higher score = better movement quality and mobility.",
    inputType: "number",
    min: 0,
    max: 9,
    step: 1,
    unitHint: "score (0–9)",
    placeholder: "0–9",
  },

  /* ---------------------------------------------------------------------- */
  /*                        HITTING (10U+ core tests)                       */
  /* ---------------------------------------------------------------------- */

  // Tee Line Drive Test – 10 swings off tee, count line drives
  tee_line_drive_test_10: {
    code: "HC10LD",
    group: "Hitting – Contact",
    shortLabel: "Tee Line Drive Test",
    displayName: "Tee Line Drive Test (10 swings)",
    instructions:
      "Have the player hit off a tee and count how many true line drives they hit in a row, up to 10. " +
      "Enter the number of successful line drives (0–10).",
    inputType: "number",
    min: 0,
    max: 10,
    step: 1,
    unitHint: "line drives (0–10)",
    placeholder: "0–10",
  },

  // Max exit velocity off tee
  max_exit_velo_tee: {
    code: "HPTEV",
    group: "Hitting – Power",
    shortLabel: "Max Exit Velo (tee)",
    displayName: "Max Exit Velocity off Tee",
    instructions:
      "Player gets 3 attempts to max their exit velo off a tee. Enter the best exit velocity in MPH.",
    inputType: "number",
    min: 0,
    max: 130,
    step: 0.1,
    decimals: 1,
    unitHint: "mph",
    placeholder: "e.g. 72.4",
  },

  // 10-pitch fastball quality → Hitting Matrix
  m_10_fastball_quality: {
    code: "H10FAST",
    group: "Hitting – Contact & Power",
    shortLabel: "Hitting Matrix",
    displayName: "Hitting Matrix (10-pitch fastball test)",
    instructions:
      "With live pitching or a machine, have the player take 10 game-like swings at fastballs. " +
      "Score each swing based on contact quality (miss, foul, weak contact, hard line drive, HR, etc.) using the BPOP matrix " +
      "and enter the total Hitting Matrix score (0–50).",
    notes: "This replaces the more technical label '10-Pitch Fastball Quality' in the UI.",
    inputType: "number",
    min: 0,
    max: 50,
    step: 1,
    unitHint: "matrix score (0–50)",
    placeholder: "0–50",
  },

  // Max bat speed
  max_bat_speed: {
    code: "HPBS",
    group: "Hitting – Power",
    shortLabel: "Max Bat Speed",
    displayName: "Max Bat Speed",
    instructions:
      "Have the player take dry swings with their game bat in front of a bat sensor. " +
      "Enter the best bat speed in MPH (from 3 attempts).",
    inputType: "number",
    min: 0,
    max: 130,
    step: 0.1,
    decimals: 1,
    unitHint: "mph",
    placeholder: "e.g. 67.8",
  },

  /* ---------------------------------------------------------------------- */
  /*                        THROWING / PITCHING TESTS                       */
  /* ---------------------------------------------------------------------- */

  m_10_throw_test_50ft: {
    code: "TPITCH1050",
    group: "Pitching – Command",
    shortLabel: "10 Pitch Command Test (50 ft)",
    displayName: "10 Pitch Target Test (50 ft)",
    instructions:
      "From 50 ft, pitch 10 balls at a 9-square target. Score each pitch per the BPOP rubric " +
      "(miss, hit target, hit called section) and enter the total command score.",
    inputType: "number",
    min: 0,
    max: 50,
    step: 1,
    unitHint: "score",
    placeholder: "e.g. 32",
  },
  max_throwing_speed: {
    code: "TSPEED",
    group: "Pitching – Velocity",
    shortLabel: "Max Throwing Velo",
    displayName: "Max Throwing Velocity",
    instructions:
      "Have the player throw 5 pitches from mound distance or 50 ft trying to max out velocity. " +
      "Enter the best pitch velocity in MPH.",
    inputType: "number",
    min: 0,
    max: 130,
    step: 0.1,
    decimals: 1,
    unitHint: "mph",
    placeholder: "e.g. 63.2",
  },
};

/** Helper to get metadata for a given metric_key (or undefined if we haven't customized it yet). */
export function getMetricMeta(metricKey: MetricKey): MetricMeta | undefined {
  return METRIC_META[metricKey];
}
