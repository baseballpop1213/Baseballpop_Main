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

  // Strength: 60-second push-ups / sit-ups / pull-ups (older ages / Pro)
  apush_60: {
    code: "APUSH60",
    group: "Strength",
    shortLabel: "Push-ups (60s)",
    displayName: "Push-ups in 60 seconds",
    instructions:
      "Record the total number of good push-ups completed in 60 seconds.",
    notes: "Higher count = higher strength score.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 30",
  },
  asit_60: {
    code: "ASIT60",
    group: "Strength",
    shortLabel: "Sit-ups (60s)",
    displayName: "Sit-ups in 60 seconds",
    instructions:
      "Record the total number of good sit-ups completed in 60 seconds.",
    notes: "Higher count = higher core strength score.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 30",
  },
  // Strength: 60-second pull-ups (older ages / Pro)
  apull_60: {
    code: "APULL60",
    group: "Strength",
    shortLabel: "Pull-ups (60s)",
    displayName: "Pull-ups in 60 seconds",
    instructions:
      "Have the player do as many pull-ups as they can in 60 seconds and record the total number of good reps.",
    notes: "Higher count = higher upper-body pulling strength score.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 10",
  },
  // Optional alias in case your metric_key is just "pull_60"
  pull_60: {
    code: "APULL60",
    group: "Strength",
    shortLabel: "Pull-ups (60s)",
    displayName: "Pull-ups in 60 seconds",
    instructions:
      "Have the player do as many pull-ups as they can in 60 seconds and record the total number of good reps.",
    notes: "Higher count = higher upper-body pulling strength score.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 1,
    unitHint: "reps",
    placeholder: "e.g. 10",
  },


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

  // Power: Seated chest pass (medicine ball) – distance in feet
  aspscp_distance_ft: {
    code: "SCP",
    group: "Power",
    shortLabel: "Seated Chest Pass",
    displayName: "Seated Chest Pass (med ball)",
    instructions:
      "Sitting in a chair with the back touching the chair, have the player throw a medicine ball as far as possible. Measure the distance in feet.",
    notes:
      "Use a medicine ball of ~1 lb per 20 lbs of body weight, rounding down. If unknown, default to 8 lb. Record the ball weight used with your measurement.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 0.1,
    unitHint: "feet",
    placeholder: "e.g. 18.5",
  },

  // Power: Sit-up and throw (medicine ball) – distance in feet
  aspsup_distance_ft: {
    code: "SUT",
    group: "Power",
    shortLabel: "Sit-up & Throw",
    displayName: "Sit-up and Throw (med ball)",
    instructions:
      "From a hook-lying position with a medicine ball above the head, have the player sit up and throw the ball as far as possible. Measure the distance in feet.",
    notes:
      "Use ~1 lb per 20 lbs of body weight, rounding down. If unknown, default to 8 lb. Record the ball weight used with your measurement.",
    inputType: "number",
    min: 0,
    max: 100,
    step: 0.1,
    unitHint: "feet",
    placeholder: "e.g. 20.0",
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

  // Mobility: multi-segment rotation (MSR) – Right
  msr_right: {
    code: "MSR",
    group: "Mobility",
    shortLabel: "MSR – Right",
    displayName: "Multi-segment Rotation – Right",
    instructions:
      "Have the player stand tall with a bat across the shoulders and rotate as far as possible to the right. Select the option that best matches how far they turn.",
    notes:
      "Selection is converted to a 0–3 point score; right + left together give up to 6 total points.",
    inputType: "select",
    options: [
      { value: 3, label: "Turns more than 180° (3 points)" },
      { value: 1, label: "Turns equal to 180° (1 point)" },
      { value: 0, label: "Turns less than 180° (0 points)" },
    ],
    unitHint: "points (0–3)",
  },

  // Mobility: multi-segment rotation (MSR) – Left
  msr_left: {
    code: "MSR",
    group: "Mobility",
    shortLabel: "MSR – Left",
    displayName: "Multi-segment Rotation – Left",
    instructions:
      "Repeat MSR to the left side and select the option that best matches how far they turn.",
    notes:
      "Selection is converted to a 0–3 point score; right + left together give up to 6 total points.",
    inputType: "select",
    options: [
      { value: 3, label: "Turns more than 180° (3 points)" },
      { value: 1, label: "Turns equal to 180° (1 point)" },
      { value: 0, label: "Turns less than 180° (0 points)" },
    ],
    unitHint: "points (0–3)",
  },

  // Mobility: Toe Touch (selection → 0/3/6 points)
  toe_touch: {
    code: "MTT",
    group: "Mobility",
    shortLabel: "Toe Touch",
    displayName: "Toe Touch Mobility",
    instructions:
      "Have the player reach toward their toes with knees straight and select the best description of how far they can reach.",
    notes:
      "Selection is converted to a 0–6 point score for BPOP mobility.",
    inputType: "select",
    options: [
      { value: 0, label: "Cannot touch toes (0 points)" },
      { value: 3, label: "Touches toes (3 points)" },
      { value: 6, label: "Touches ground (6 points)" },
    ],
    unitHint: "points (0–6)",
  },

  // Mobility: Full Overhead Deep Squat (selection → points)
  deep_squat: {
    code: "FODS",
    group: "Mobility",
    shortLabel: "Overhead Deep Squat",
    displayName: "Full Overhead Deep Squat",
    instructions:
      "Have the player stand with feet shoulder-width apart and arms straight overhead. Have them perform a deep squat, trying to get the pelvis below the knees without the arms moving forward or the ankles flaring.",
    notes:
      "Selection is converted to a 0–9 point score. Full overhead deep squat = 9 points. If not full, select one or more of the compensation patterns.",
    // We'll render this with custom UI in AssessmentSessionPage
    inputType: "select",
    options: [
      { value: "full", label: "Full overhead deep squat" },
      { value: "arms", label: "Arms move forward" },
      { value: "pelvis", label: "Pelvis not below the knees" },
      { value: "ankles", label: "Ankles flare" },
    ],
    unitHint: "points (0–9)",
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
