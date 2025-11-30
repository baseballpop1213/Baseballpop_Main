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
    shortLabel: "4B Speed",
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
  /*                        HITTING (5U+ tests)                             */
  /* ---------------------------------------------------------------------- */

  //
  // Youth (5U–9U) contact tests
  //

  // 10 Swing Tee Contact (H10TEE)
  m_10_swing_tee_contact_test: {
    code: "H10TEE",
    group: "Hitting – Contact",
    shortLabel: "Hitting Contact (Tee)",
    displayName: "Hitting Contact – 10-swing tee test",
    instructions:
      "Have the player take 10 swings off a batting tee. For each swing: " +
      "Miss = 0; foul tip / mishit = 1; good contact = 2. " +
      "Enter the total score across the 10 swings (0–20).",
    notes: "Used for 5U–9U hitting alongside Max Bat Speed.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "matrix score (0–20)",
    placeholder: "0–20",
  },

  // 10 Swing Pitch Matrix (H10PITCH) – youth version of the matrix
  m_10_swing_pitch_matrix: {
    code: "H10PITCH",
    group: "Hitting – Contact",
    shortLabel: "Hitting Matrix – 10 pitch",
    displayName: "Hitting Matrix – 10 pitch (youth)",
    instructions:
      "With live pitching or a machine, have the player choose 10 pitches to swing at. " +
      "For each swing: Miss = 0; foul tip = 1; ball put in play / contact = 2. " +
      "Enter the total score across the 10 swings (0–20).",
    notes: "Used for 5U–6U in place of the full fastball matrix.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "matrix score (0–20)",
    placeholder: "0–20",
  },

  //
  // Shared hitting tests (all/most ages)
  //

  // Tee line drive test – all ages
  tee_line_drive_test_10: {
    code: "HC10LD",
    group: "Hitting – Contact",
    shortLabel: "Tee Line Drive Test",
    displayName: "Tee Line Drive Test (10 swings)",
    instructions:
      "Have the player attempt to hit line drives off a tee. Count how many true line drives " +
      "they hit in a row, up to 10. Enter the number of successful line drives (0–10).",
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
      "Player gets 3 attempts to max their exit velocity off a tee. Enter the best exit velocity in MPH.",
    inputType: "number",
    min: 0,
    max: 130,
    step: 0.1,
    decimals: 1,
    unitHint: "mph",
    placeholder: "e.g. 72.4",
  },

  // Max bat speed – dry swings
  max_bat_speed: {
    code: "HPBS",
    group: "Hitting – Power",
    shortLabel: "Max Bat Speed",
    displayName: "Max Bat Speed",
    instructions:
      "Have the player make dry swings with their game bat in front of a radar. " +
      "They get 3 attempts; enter the highest bat speed in MPH.",
    inputType: "number",
    min: 0,
    max: 130,
    step: 0.1,
    decimals: 1,
    unitHint: "mph",
    placeholder: "e.g. 65.2",
  },

  //
  // Hitting Matrix family (7U+)
  //

  // 10-pitch fastball matrix – 7U+
  m_10_fastball_quality: {
    code: "H10FAST",
    group: "Hitting – Contact & Power",
    shortLabel: "Hitting Matrix – Fastballs",
    displayName: "Hitting Matrix – Fastballs",
    instructions:
      "With live pitching or a machine, have the player take 10 swings at fastballs. " +
      "Each swing is scored for quality of contact (miss, foul, weak contact, hard line drive, HR, etc.) " +
      "using the BPOP hitting matrix. Enter the total matrix score (0–50).",
    notes:
      "Shown in the UI as 'Hitting Matrix – Fastballs' instead of the backend name '10-Pitch Fastball Quality'.",
    inputType: "number",
    min: 0,
    max: 50,
    step: 1,
    unitHint: "matrix score (0–50)",
    placeholder: "0–50",
  },

  // 5-pitch varied speed matrix – 12U+
  m_5_varied_speed_quality: {
    code: "H5VAR",
    group: "Hitting – Contact & Power",
    shortLabel: "Hitting Matrix – Varied Speed",
    displayName: "Hitting Matrix – Varied Speed (5-pitch)",
    instructions:
      "With live pitching or a machine, have the player face 5 pitches with varied speeds. " +
      "Score each swing using the same BPOP hitting matrix as the fastball test and enter the total score.",
    notes: "Scored with the same rules as the fastball matrix; just 5 pitches instead of 10.",
    inputType: "number",
    min: 0,
    max: 25,
    step: 1,
    unitHint: "matrix score (0–25)",
    placeholder: "0–25",
  },

  // 5-pitch curveball matrix – HS/College/Pro
  m_5_curveball_quality: {
    code: "H5CB",
    group: "Hitting – Contact & Power",
    shortLabel: "Hitting Matrix – Curveball",
    displayName: "Hitting Matrix – Curveball (5-pitch)",
    instructions:
      "With live pitching or a machine, have the player face 5 curveballs. " +
      "Score each swing using the same BPOP hitting matrix as the fastball test and enter the total score.",
    notes: "Used for HS, College, and Pro hitting templates.",
    inputType: "number",
    min: 0,
    max: 25,
    step: 1,
    unitHint: "matrix score (0–25)",
    placeholder: "0–25",
  },

  /* ---------------------------------------------------------------------- */
  /*                        THROWING / PITCHING TESTS                       */
  /* ---------------------------------------------------------------------- */

  max_throwing_speed: {
    code: "TSPEED",
    group: "Throwing",
    shortLabel: "Max throwing / pitching velo",
    displayName: "Max Throwing / Pitching Speed",
    instructions:
      "Have the player make 5 throws or pitches as hard as possible from the age-appropriate distance shown in the template label " +
      "(e.g. 20 ft for 5U–7U TSPEED20, 40–45 ft for 8U–9U TSPEED, mound distance in older pitching templates). " +
      "Record the fastest velocity in MPH from the 5 attempts.",
    inputType: "number",
    min: 0,
    max: 120,
    step: 0.1,
    unitHint: "mph",
    placeholder: "e.g. 32.5",
  },


  // 10-pitch command @ 50 ft (10U–11U Pitching Eval)
  m_10_throw_test_50ft: {
    code: "TPITCH1050",
    group: "Pitching – Command",
    shortLabel: "Pitching Matrix",
    displayName: "Pitching Matrix (10 pitches @ 50 ft)",
    instructions:
      "From 50 ft, have the player throw 10 pitches at a 9-slot target. Before each pitch, they call a slot. For each pitch: Miss (0), Hit target (1), Hit called section (3). The matrix UI will total the score.",
    inputType: "number",
    min: 0,
    max: 30, // 10 pitches × max 3 points
    step: 1,
    unitHint: "score",
    placeholder: "0–30",
  },

  // 20-pitch command @ 60'6\" (12U+ Pitching Eval)
  m_20_throw_test_60ft: {
    code: "TPITCH2060",
    group: "Pitching – Command",
    shortLabel: "Pitching Matrix – Fastballs",
    displayName: "Pitching Matrix – Fastballs (20 pitches @ 60'6\")",
    instructions:
      "From 60'6\", have the player throw 20 fastballs at a 9-slot target. Before each pitch, they call a slot. For each pitch: Miss (0), Hit target (1), Hit called section (3). The matrix UI will total the score.",
    inputType: "number",
    min: 0,
    max: 60, // 20 pitches × max 3 points
    step: 1,
    unitHint: "score",
    placeholder: "0–60",
  },

  // Additional pitch matrices (HS / College / Pro) – each 5 pitches
  // These are wired to the “Additional Pitch Matrix” rows in the Pitching Eval UI.
  tpitch5ap1: {
    code: "TPITCH5AP1",
    group: "Pitching – Command",
    shortLabel: "Additional Pitch Matrix",
    displayName: "Additional Pitch Matrix (5 pitches)",
    instructions:
      "For an additional pitch type (curve, slider, change-up, etc.), have the player throw 5 pitches at the 9-slot target. " +
      "For each pitch: Miss (0), Hit target (1), Hit called section (3). The matrix UI will total the score (0–15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "score",
    placeholder: "0–15",
  },
  tpitch5ap2: {
    code: "TPITCH5AP2",
    group: "Pitching – Command",
    shortLabel: "Additional Pitch Matrix",
    displayName: "Additional Pitch Matrix (5 pitches)",
    instructions:
      "Second additional pitch type. Use the 5-pitch matrix: Miss (0), Hit target (1), Hit called section (3). The UI totals the score (0–15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "score",
    placeholder: "0–15",
  },
  tpitch5ap3: {
    code: "TPITCH5AP3",
    group: "Pitching – Command",
    shortLabel: "Additional Pitch Matrix",
    displayName: "Additional Pitch Matrix (5 pitches)",
    instructions:
      "Third additional pitch type. Use the 5-pitch matrix: Miss (0), Hit target (1), Hit called section (3). The UI totals the score (0–15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "score",
    placeholder: "0–15",
  },
  tpitch5ap4: {
    code: "TPITCH5AP4",
    group: "Pitching – Command",
    shortLabel: "Additional Pitch Matrix",
    displayName: "Additional Pitch Matrix (5 pitches)",
    instructions:
      "Fourth additional pitch type. Use the 5-pitch matrix: Miss (0), Hit target (1), Hit called section (3). The UI totals the score (0–15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "score",
    placeholder: "0–15",
  },
  tpitch5ap5: {
    code: "TPITCH5AP5",
    group: "Pitching – Command",
    shortLabel: "Additional Pitch Matrix",
    displayName: "Additional Pitch Matrix (5 pitches)",
    instructions:
      "Fifth additional pitch type. Use the 5-pitch matrix: Miss (0), Hit target (1), Hit called section (3). The UI totals the score (0–15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "score",
    placeholder: "0–15",
  },


  /* ---------------------------------------------------------------------- */
  /*                        THROWING – YOUTH (5U–9U)                        */
  /* ---------------------------------------------------------------------- */

  // TSPEED20 / TSPEED / TSPEED40 / TSPEED45 etc.
  // (same metric_key reused across youth & older pitching templates)

  // TSPDSMALL – Max throwing speed with small ball
  max_throwing_speed_small_ball: {
    code: "TSPDSMALL",
    group: "Throwing",
    shortLabel: "Max speed – small ball",
    displayName: "Max Throwing Speed – Small Ball (TSPDSMALL)",
    instructions:
      "For 5U–7U: have the player throw 5 balls as hard as possible at a ~20 ft target using either a 7.2\" baseball, a tennis ball, a racquetball, or a similar small ball. " +
      "Select the ball type used and record the fastest velocity in MPH.",
    inputType: "number", // we still store the mph as numeric, ball type in value_text
    min: 0,
    max: 120,
    step: 0.1,
    unitHint: "mph",
    placeholder: "e.g. 29.7",
  },

  // T20FT – 10 x 20 ft throws: 0 = miss, 1 = hit target
  m_10_throw_test_20ft: {
    code: "T20FT",
    group: "Throwing",
    shortLabel: "20 ft throw test",
    displayName: "20 ft Throw Accuracy Test (T20FT)",
    instructions:
      "Have the player throw toward a 9-slot target from 20 ft. Before each throw they can call a specific slot if desired. " +
      "Score each attempt: 0 points for a miss, 1 point for any hit on the target. Enter the total points out of 10.",
    inputType: "number",
    min: 0,
    max: 10,
    step: 1,
    unitHint: "points (0–10)",
    placeholder: "0–10",
  },

  // TPITCH2040 / TPITCH1040 – 10-pitch accuracy at 40 ft (5U–8U throwing)
  m_10_throw_test_40ft: {
    code: "TPITCH2040",
    group: "Throwing",
    shortLabel: "10-pitch accuracy (40 ft)",
    displayName: "10-Pitch Accuracy Test – 40 ft (TPITCH2040 / TPITCH1040)",
    instructions:
      "Have the player pitch/throw toward a 9-slot target from 40 ft. Before each pitch they call the slot they are aiming for. " +
      "Score each pitch: 0 = miss, 1 = hit the target but not the called slot, 3 = hit the called slot. Enter the total points out of 30.",
    inputType: "number",
    min: 0,
    max: 30,
    step: 1,
    unitHint: "points (0–30)",
    placeholder: "0–30",
  },

  // TPITCH1045 – 10-pitch accuracy at 45 ft (9U)
  m_10_throw_test_45ft: {
    code: "TPITCH1045",
    group: "Throwing",
    shortLabel: "10-pitch accuracy (45 ft)",
    displayName: "10-Pitch Accuracy Test – 45 ft (TPITCH1045)",
    instructions:
      "Have the player pitch/throw toward a 9-slot target from 45 ft. Before each pitch they call the slot they are aiming for. " +
      "Score each pitch: 0 = miss, 1 = hit the target but not the called slot, 3 = hit the called slot. Enter the total points out of 30.",
    inputType: "number",
    min: 0,
    max: 30,
    step: 1,
    unitHint: "points (0–30)",
    placeholder: "0–30",
  },


  /* ---------------------------------------------------------------------- */
  /*                             CATCHER TESTS                              */
  /* ---------------------------------------------------------------------- */

  // Catcher screen tests – younger (10 pitches)
  c10pcs_points: {
    code: "C10PCS",
    group: "Catcher",
    shortLabel: "Catcher Screens (10)",
    displayName: "10 Pitch Catcher Screens (C10PCS)",
    instructions:
      "Have the catcher receive 10 pitches (live or machine). " +
      "6 should be normal strikes in the zone, 2 should be balls outside the zone, " +
      "and 2 should be balls in the dirt in front of the catcher. " +
      "For each pitch: Miss/passed ball = 0, Block that stays in front = 1, Catch or scoop = 2. " +
      "The grid UI lets you score each pitch and will total the points automatically.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "matrix score (0–20)",
    placeholder: "0–20",
  },

  // Catcher screen tests – older (20 pitches)
  c20pcs_points: {
    code: "C20PCS",
    group: "Catcher",
    shortLabel: "Catcher Screens (20)",
    displayName: "20 Pitch Catcher Screens (C20PCS)",
    instructions:
      "Have the catcher receive 20 pitches (live or machine). " +
      "Mix strikes in the zone with pitches outside the zone and in the dirt. " +
      "For each pitch: Miss/passed ball = 0, Block that stays in front = 1, Catch or scoop = 2. " +
      "The grid UI lets you score each pitch and will total the points automatically.",
    inputType: "number",
    min: 0,
    max: 40,
    step: 1,
    unitHint: "matrix score (0–40)",
    placeholder: "0–40",
  },

  // Catcher Throw to 2B Time (CT2BT)
  ct2bt_seconds: {
    code: "CT2BT",
    group: "Catcher",
    shortLabel: "Throw to 2B Time",
    displayName: "Catcher Throw to 2B Time (CT2BT)",
    instructions:
      "Have the catcher receive a pitch and throw to 2B (target or fielder). " +
      "Start timing when the pitch crosses the plate and stop when the ball reaches 2B. " +
      "Use the built-in stopwatch or enter the time in seconds to the hundredth.",
    inputType: "number",
    min: 0,
    max: 5,
    step: 0.01,
    decimals: 2,
    unitHint: "seconds",
    placeholder: "e.g. 2.05",
  },

  // Target throws to 2B (CTTT2B) – 5 throws
  cttt2b_points: {
    code: "CTTT2B",
    group: "Catcher",
    shortLabel: "Target Throws to 2B",
    displayName: "Target Throws to 2B (CTTT2B)",
    instructions:
      "Have the catcher receive 5 pitches and then throw to 2B each time. " +
      "For each rep: No catch = 0, Missed target = 1, Hit target = 3. " +
      "The grid UI lets you select the outcome for each throw and will total the score.",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "matrix score (0–15)",
    placeholder: "0–15",
  },

  /* ---------------------------------------------------------------------- */
  /*                            FIRST BASE (1B)                             */
  /* ---------------------------------------------------------------------- */

  // 10U–Pro: First Base Catching (C101B)
  c101b_catching_test: {
    code: "C101B",
    group: "First Base \u2013 Catching",
    shortLabel: "1B Catching (10 throws)",
    displayName: "First Base Catching Test (C101B)",
    instructions:
      "Have the player set up at 1B to take 10 throws from SS. 0 points for a missed catch that gets by, 1 point for a blocked ball, and 3 points for a clean catch with the foot on the bag.",
    notes: "Scored with a 10-rep matrix: Miss = 0, Block = 1, Catch = 3.",
    inputType: "number",
    min: 0,
    max: 30,
    step: 1,
    unitHint: "points (0\u201330)",
    placeholder: "0\u201330",
  },

  // 10U–Pro: First Base Scoops (C1BST)
  c1bst_scoops_test: {
    code: "C1BST",
    group: "First Base – Catching",
    shortLabel: "1B Scoops (5 throws)",
    displayName: "First Base Scoops Test (C1BST)",
    instructions:
      "Have the player set up at 1B and throw 5 balls that require scoops. 0 points for a miss that gets by, 1 point for a blocked ball, and 3 points for a scoop/catch with the foot on the bag.",
    notes: "Scored with a 5-rep matrix: Miss = 0, Block = 1, Catch = 3.",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "points (0–15)",
    placeholder: "0–15",
  },


  // 12U–Pro: RLC Grounders – 1B (direction + result per rep)

  rlc1b_grounder_1_direction: {
    code: "RLC1B-G1-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G1 Dir",
    displayName: "RLC Grounder #1 \u2013 Direction",
    instructions:
      "Direction of the first RLC grounder to 1B: Right, Left, or Center. Stored for reporting only.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_1_points: {
    code: "RLC1B-G1",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G1",
    displayName: "RLC Grounder #1 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  rlc1b_grounder_2_direction: {
    code: "RLC1B-G2-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G2 Dir",
    displayName: "RLC Grounder #2 \u2013 Direction",
    instructions:
      "Direction of the second RLC grounder to 1B: Right, Left, or Center.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_2_points: {
    code: "RLC1B-G2",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G2",
    displayName: "RLC Grounder #2 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  rlc1b_grounder_3_direction: {
    code: "RLC1B-G3-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G3 Dir",
    displayName: "RLC Grounder #3 \u2013 Direction",
    instructions:
      "Direction of the third RLC grounder to 1B: Right, Left, or Center.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_3_points: {
    code: "RLC1B-G3",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G3",
    displayName: "RLC Grounder #3 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  rlc1b_grounder_4_direction: {
    code: "RLC1B-G4-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G4 Dir",
    displayName: "RLC Grounder #4 \u2013 Direction",
    instructions:
      "Direction of the fourth RLC grounder to 1B: Right, Left, or Center.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_4_points: {
    code: "RLC1B-G4",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G4",
    displayName: "RLC Grounder #4 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  rlc1b_grounder_5_direction: {
    code: "RLC1B-G5-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G5 Dir",
    displayName: "RLC Grounder #5 \u2013 Direction",
    instructions:
      "Direction of the fifth RLC grounder to 1B: Right, Left, or Center.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_5_points: {
    code: "RLC1B-G5",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G5",
    displayName: "RLC Grounder #5 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  rlc1b_grounder_6_direction: {
    code: "RLC1B-G6-DIR",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G6 Dir",
    displayName: "RLC Grounder #6 \u2013 Direction",
    instructions:
      "Direction of the sixth RLC grounder to 1B: Right, Left, or Center.",
    inputType: "select",
    options: [
      { value: "", label: "— Direction —" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc1b_grounder_6_points: {
    code: "RLC1B-G6",
    group: "First Base \u2013 Fielding",
    shortLabel: "RLC 1B G6",
    displayName: "RLC Grounder #6 \u2013 Result",
    instructions:
      "0 points if the player fails to field the ball. 2 points if they field the ball and run to touch 1B.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0 or 2)",
  },

  // 12U–Pro: First Base Fly Balls (FBFLY)
  fbfly_points: {
    code: "FBFLY",
    group: "First Base \u2013 Fielding",
    shortLabel: "1B Fly Balls (3)",
    displayName: "First Base Fly Balls (FBFLY)",
    instructions:
      "Hit 3 fly balls to the 1B side (foul, behind, or in front of the player). The player gets 2 points for each catch and 0 for each miss.",
    notes: "Scored with a 3-rep matrix: Miss = 0, Catch = 2.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "points (0\u20136)",
    placeholder: "0\u20136",
  },

  // 12U–Pro: First Base Line Drives (FBLD)
  fbld_points: {
    code: "FBLD",
    group: "First Base \u2013 Fielding",
    shortLabel: "1B Line Drives (3)",
    displayName: "First Base Line Drives (FBLD)",
    instructions:
      "Hit 3 line drives to the player at 1B. The player gets 2 points for each catch and 0 for each miss.",
    notes: "Scored with a 3-rep matrix: Miss = 0, Catch = 2.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "points (0\u20136)",
    placeholder: "0\u20136",
  },

  // -------------------------------------------------------------------------
  // INFIELD – 2B / SS / 3B
  // -------------------------------------------------------------------------

  // RLC Grounders – 2B (RLCG2B)
  rlc2b_grounder_1_direction: {
    code: "RLC2B-G1-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G1 Dir",
    displayName: "RLC Grounder #1 – 2B – Direction",
    instructions:
      "Direction of the first RLC ground ball hit to 2B (center, right, or left). Direction is stored for reporting and does not change the score.",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_1_points: {
    code: "RLC2B-G1",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G1",
    displayName: "RLC Grounder #1 – 2B – Result",
    instructions:
      "Score for the first RLC ground ball to 2B: 0 = Didn’t field, 1 = Fielded but missed target, 2 = Fielded and hit target at 1B. Max total for 2B is 12 points (6 reps). 10U–11U ≈45 mph & 10 ft, 12U–14U ≈55 mph & 20 ft, HS–Pro ≈65 mph & 30 ft.",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc2b_grounder_2_direction: {
    code: "RLC2B-G2-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G2 Dir",
    displayName: "RLC Grounder #2 – 2B – Direction",
    instructions:
      "Direction of the second RLC ground ball to 2B (center, right, or left). Direction is stored for reporting only.",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_2_points: {
    code: "RLC2B-G2",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G2",
    displayName: "RLC Grounder #2 – 2B – Result",
    instructions:
      "Score for the second RLC ground ball to 2B (0/1/2 as defined in the test description).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc2b_grounder_3_direction: {
    code: "RLC2B-G3-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G3 Dir",
    displayName: "RLC Grounder #3 – 2B – Direction",
    instructions:
      "Direction of the third RLC ground ball to 2B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_3_points: {
    code: "RLC2B-G3",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G3",
    displayName: "RLC Grounder #3 – 2B – Result",
    instructions: "Score for the third RLC ground ball to 2B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc2b_grounder_4_direction: {
    code: "RLC2B-G4-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G4 Dir",
    displayName: "RLC Grounder #4 – 2B – Direction",
    instructions:
      "Direction of the fourth RLC ground ball to 2B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_4_points: {
    code: "RLC2B-G4",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G4",
    displayName: "RLC Grounder #4 – 2B – Result",
    instructions: "Score for the fourth RLC ground ball to 2B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc2b_grounder_5_direction: {
    code: "RLC2B-G5-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G5 Dir",
    displayName: "RLC Grounder #5 – 2B – Direction",
    instructions:
      "Direction of the fifth RLC ground ball to 2B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_5_points: {
    code: "RLC2B-G5",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G5",
    displayName: "RLC Grounder #5 – 2B – Result",
    instructions: "Score for the fifth RLC ground ball to 2B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc2b_grounder_6_direction: {
    code: "RLC2B-G6-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G6 Dir",
    displayName: "RLC Grounder #6 – 2B – Direction",
    instructions:
      "Direction of the sixth RLC ground ball to 2B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc2b_grounder_6_points: {
    code: "RLC2B-G6",
    group: "Infield – Fielding",
    shortLabel: "RLC 2B G6",
    displayName: "RLC Grounder #6 – 2B – Result",
    instructions: "Score for the sixth RLC ground ball to 2B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  // RLC Grounders – SS (RLCGSS)
  rlcss_grounder_1_direction: {
    code: "RLCSS-G1-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G1 Dir",
    displayName: "RLC Grounder #1 – SS – Direction",
    instructions:
      "Direction of the first RLC ground ball hit to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_1_points: {
    code: "RLCSS-G1",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G1",
    displayName: "RLC Grounder #1 – SS – Result",
    instructions:
      "Score for the first RLC ground ball to SS (0 = Didn’t field, 1 = Fielded but missed target, 2 = Fielded and hit target at 1B).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  // ...repeat the same pattern for rlcss_grounder_2/3/4/5/6_direction + _points
  rlcss_grounder_2_direction: {
    code: "RLCSS-G2-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G2 Dir",
    displayName: "RLC Grounder #2 – SS – Direction",
    instructions:
      "Direction of the second RLC ground ball to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_2_points: {
    code: "RLCSS-G2",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G2",
    displayName: "RLC Grounder #2 – SS – Result",
    instructions: "Score for the second RLC ground ball to SS (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlcss_grounder_3_direction: {
    code: "RLCSS-G3-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G3 Dir",
    displayName: "RLC Grounder #3 – SS – Direction",
    instructions:
      "Direction of the third RLC ground ball to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_3_points: {
    code: "RLCSS-G3",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G3",
    displayName: "RLC Grounder #3 – SS – Result",
    instructions: "Score for the third RLC ground ball to SS (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlcss_grounder_4_direction: {
    code: "RLCSS-G4-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G4 Dir",
    displayName: "RLC Grounder #4 – SS – Direction",
    instructions:
      "Direction of the fourth RLC ground ball to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_4_points: {
    code: "RLCSS-G4",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G4",
    displayName: "RLC Grounder #4 – SS – Result",
    instructions: "Score for the fourth RLC ground ball to SS (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlcss_grounder_5_direction: {
    code: "RLCSS-G5-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G5 Dir",
    displayName: "RLC Grounder #5 – SS – Direction",
    instructions:
      "Direction of the fifth RLC ground ball to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_5_points: {
    code: "RLCSS-G5",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G5",
    displayName: "RLC Grounder #5 – SS – Result",
    instructions: "Score for the fifth RLC ground ball to SS (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlcss_grounder_6_direction: {
    code: "RLCSS-G6-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G6 Dir",
    displayName: "RLC Grounder #6 – SS – Direction",
    instructions:
      "Direction of the sixth RLC ground ball to SS (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlcss_grounder_6_points: {
    code: "RLCSS-G6",
    group: "Infield – Fielding",
    shortLabel: "RLC SS G6",
    displayName: "RLC Grounder #6 – SS – Result",
    instructions: "Score for the sixth RLC ground ball to SS (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  // RLC Grounders – 3B (RLCG3B)
  rlc3b_grounder_1_direction: {
    code: "RLC3B-G1-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G1 Dir",
    displayName: "RLC Grounder #1 – 3B – Direction",
    instructions:
      "Direction of the first RLC ground ball hit to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_1_points: {
    code: "RLC3B-G1",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G1",
    displayName: "RLC Grounder #1 – 3B – Result",
    instructions:
      "Score for the first RLC ground ball to 3B (0 = Didn’t field, 1 = Fielded but missed target, 2 = Fielded and hit target).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  // ...and similarly for rlc3b_grounder_2–6_direction + _points:
  rlc3b_grounder_2_direction: {
    code: "RLC3B-G2-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G2 Dir",
    displayName: "RLC Grounder #2 – 3B – Direction",
    instructions:
      "Direction of the second RLC ground ball to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_2_points: {
    code: "RLC3B-G2",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G2",
    displayName: "RLC Grounder #2 – 3B – Result",
    instructions: "Score for the second RLC ground ball to 3B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc3b_grounder_3_direction: {
    code: "RLC3B-G3-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G3 Dir",
    displayName: "RLC Grounder #3 – 3B – Direction",
    instructions:
      "Direction of the third RLC ground ball to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_3_points: {
    code: "RLC3B-G3",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G3",
    displayName: "RLC Grounder #3 – 3B – Result",
    instructions: "Score for the third RLC ground ball to 3B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc3b_grounder_4_direction: {
    code: "RLC3B-G4-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G4 Dir",
    displayName: "RLC Grounder #4 – 3B – Direction",
    instructions:
      "Direction of the fourth RLC ground ball to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_4_points: {
    code: "RLC3B-G4",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G4",
    displayName: "RLC Grounder #4 – 3B – Result",
    instructions: "Score for the fourth RLC ground ball to 3B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc3b_grounder_5_direction: {
    code: "RLC3B-G5-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G5 Dir",
    displayName: "RLC Grounder #5 – 3B – Direction",
    instructions:
      "Direction of the fifth RLC ground ball to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_5_points: {
    code: "RLC3B-G5",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G5",
    displayName: "RLC Grounder #5 – 3B – Result",
    instructions: "Score for the fifth RLC ground ball to 3B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  rlc3b_grounder_6_direction: {
    code: "RLC3B-G6-DIR",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G6 Dir",
    displayName: "RLC Grounder #6 – 3B – Direction",
    instructions:
      "Direction of the sixth RLC ground ball to 3B (center, right, or left).",
    inputType: "select",
    options: [
      { value: "", label: "—" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  rlc3b_grounder_6_points: {
    code: "RLC3B-G6",
    group: "Infield – Fielding",
    shortLabel: "RLC 3B G6",
    displayName: "RLC Grounder #6 – 3B – Result",
    instructions: "Score for the sixth RLC ground ball to 3B (0/1/2).",
    inputType: "number",
    min: 0,
    max: 2,
    step: 1,
    unitHint: "points (0–2)",
  },

  // Infield Fly Balls (CIFF2B / SS / 3B)
  infield_fly_2b: {
    code: "CIFF2B",
    group: "Infield – Catching",
    shortLabel: "IF Fly – 2B (3 balls)",
    displayName: "Infield Fly Balls to 2B (CIFF2B)",
    instructions:
      "Hit 3 fly balls to 2B within a reasonable radius around the player. 0 points for a miss, 2 points for a catch. 10U–11U ≈10 ft radius, 12U–14U ≈20 ft, HS–Pro ≈30 ft. Max score is 6.",
    notes:
      "UI records each of the 3 reps as 0 or 2 and totals automatically to a maximum of 6 points.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },
  infield_fly_ss: {
    code: "CIFFSS",
    group: "Infield – Catching",
    shortLabel: "IF Fly – SS (3 balls)",
    displayName: "Infield Fly Balls to SS (CIFFSS)",
    instructions:
      "Hit 3 fly balls to SS within a reasonable radius around the player. 0 points for a miss, 2 points for a catch.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },
  infield_fly_3b: {
    code: "CIFF3B",
    group: "Infield – Catching",
    shortLabel: "IF Fly – 3B (3 balls)",
    displayName: "Infield Fly Balls to 3B (CIFF3B)",
    instructions:
      "Hit 3 fly balls to 3B within a reasonable radius around the player. 0 points for a miss, 2 points for a catch.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },

  // Infield Line Drives (CLD2B / SS / 3B)
  infield_ld_2b: {
    code: "CLD2B",
    group: "Infield – Catching",
    shortLabel: "IF Line Drive – 2B",
    displayName: "Infield Line Drives to 2B (CLD2B)",
    instructions:
      "Hit 3 line drives to 2B that require the player to move within a radius around their starting spot. 0 points for a miss, 2 points for a catch. 10U–11U ≈5 ft radius, 12U–14U ≈10 ft, HS–Pro ≈20 ft. Max score 6.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },
  infield_ld_ss: {
    code: "CLDSS",
    group: "Infield – Catching",
    shortLabel: "IF Line Drive – SS",
    displayName: "Infield Line Drives to SS (CLDSS)",
    instructions:
      "Hit 3 line drives to SS inside the target radius. 0 points for a miss, 2 points for a catch.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },
  infield_ld_3b: {
    code: "CLD3B",
    group: "Infield – Catching",
    shortLabel: "IF Line Drive – 3B",
    displayName: "Infield Line Drives to 3B (CLD3B)",
    instructions:
      "Hit 3 line drives to 3B inside the target radius. 0 points for a miss, 2 points for a catch.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 2,
    unitHint: "points (0–6)",
  },

  // SS to 1B time – IFSS1BT
  ifss1bt_seconds: {
    code: "IFSS1BT",
    group: "Infield – Fielding",
    shortLabel: "SS–1B throw time",
    displayName: "Infield – SS to 1B Throw Time (IFSS1BT)",
    instructions:
      "Hit a ball or use a machine to send a ground ball to the shortstop at the appropriate exit velocity for the level (10U–11U ≈45 mph, 12U–14U ≈55 mph, HS–Pro ≈65 mph). Time from when the ball leaves the bat/machine until it reaches 1B.",
    inputType: "number",
    min: 0,
    max: 10,
    step: 0.01,
    unitHint: "seconds",
    placeholder: "e.g. 3.25",
  },

  /* ---------------------------------------------------------------------- */
  /*                             OUTFIELD (10U–Pro)                         */
  /* ---------------------------------------------------------------------- */

  // Fly ball coverage matrices
  c20x20m_points: {
    code: "C20X20M",
    group: "Outfield",
    shortLabel: "20×20 OF Matrix",
    displayName: "20×20 Outfield Fly Ball Matrix",
    instructions:
      "Set up about a 20-yard radius around the outfielder and hit 10 fly balls to varied spots in the circle (around 50 yards away). " +
      "Score each rep: 0 points for a miss, 2 points for a catch. Enter the total score out of 20.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
  },

  c30x30m_points: {
    code: "C30X30M",
    group: "Outfield",
    shortLabel: "30×30 OF Matrix",
    displayName: "30×30 Outfield Fly Ball Matrix",
    instructions:
      "Set up about a 30-yard radius around the outfielder and hit 10 fly balls to varied spots in the coverage area (around 50 yards away). " +
      "Score each rep: 0 points for a miss, 2 points for a catch. Enter the total score out of 20.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
  },

  // Distance throw accuracy tests
  throw_80ft_target: {
    code: "T80FT",
    group: "Outfield",
    shortLabel: "80 ft Throw Test",
    displayName: "80 ft Outfield Throw Accuracy",
    instructions:
      "Set up a throwing target 80 ft from the outfielder. The player gets 5 throws and may take a running start as long as they release behind the 80 ft marker. " +
      "Score each throw: 0 = more than 10 ft short; 1 = lands <10 ft short and misses target; 2 = lands <10 ft short and bounces into the target; " +
      "3 = lands at/past the target but misses; 4 = hits the target. Enter the total points out of 20.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
  },

  throw_100ft_target: {
    code: "T100FT",
    group: "Outfield",
    shortLabel: "100 ft Throw Test",
    displayName: "100 ft Outfield Throw Accuracy",
    instructions:
      "Set up a throwing target 100 ft from the outfielder. The player gets 5 throws and may take a running start as long as they release behind the 100 ft marker. " +
      "Score each throw: 0 = more than 10 ft short; 1 = lands <10 ft short and misses target; 2 = lands <10 ft short and bounces into the target; " +
      "3 = lands at/past the target but misses; 4 = hits the target. Enter the total points out of 20.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
  },

  throw_120ft_target: {
    code: "T120FT",
    group: "Outfield",
    shortLabel: "120 ft Throw Test",
    displayName: "120 ft Outfield Throw Accuracy",
    instructions:
      "Set up a throwing target 120 ft from the outfielder. The player gets 5 throws and may take a running start as long as they release behind the 120 ft marker. " +
      "Score each throw: 0 = more than 10 ft short; 1 = lands <10 ft short and misses target; 2 = lands <10 ft short and bounces into the target; " +
      "3 = lands at/past the target but misses; 4 = hits the target. Enter the total points out of 20.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
  },
  
  // Ground ball to home timed test
  ofgbht_seconds: {
    code: "OFGBHT",
    group: "Outfield",
    shortLabel: "OF GB → Home Time",
    displayName: "Outfield Ground Ball to Home – Time",
    instructions:
      "Position the outfielder about 180 ft from home plate in left or right field. Hit or machine a ground ball at roughly 60 mph exit velocity. " +
      "Start the timer when the ball is hit/sent and stop when the ball reaches the area around home plate. Enter the time in seconds to the hundredth.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 0.01,
    decimals: 2,
    unitHint: "seconds",
    placeholder: "e.g. 6.25",
  },

  /* ---------------------------------------------------------------------- */
  /*                         YOUTH CATCHING (5U–9U)                         */
  /* ---------------------------------------------------------------------- */

  // 5U–6U: 20 ft / 40 ft catching tests
  m_20ft_catching_test: {
    code: "C20FT",
    group: "Catching",
    shortLabel: "20 ft Catching (5 throws)",
    displayName: "20 ft Catching Test (C20FT)",
    instructions:
      "Have the player stand 20 ft away and throw 5 balls to them. 0 points for a complete miss, 1 point if the ball touches the glove, and 2 points for a clean catch. The matrix UI lets you score each rep; the total out of 10 is calculated automatically.",
    notes: "Scored per‑rep in the UI: Miss = 0, Glove touched = 1, Catch = 2 (max 10).",
    inputType: "number",
    min: 0,
    max: 10,
    step: 1,
    unitHint: "points (0–10)",
    placeholder: "0–10",
  },

  m_40_ft_catching_test: {
    code: "C40FT",
    group: "Catching",
    shortLabel: "40 ft Catching (5 throws)",
    displayName: "40 ft Catching Test (C40FT)",
    instructions:
      "Have the player stand 40 ft away and throw 5 balls to them. 0 points for a complete miss, 1 point if the ball touches the glove, and 2 points for a clean catch. The matrix UI lets you score each rep; the total out of 10 is calculated automatically.",
    notes: "Scored per‑rep in the UI: Miss = 0, Glove touched = 1, Catch = 2 (max 10).",
    inputType: "number",
    min: 0,
    max: 10,
    step: 1,
    unitHint: "points (0–10)",
    placeholder: "0–10",
  },

  // 7U–9U: 1B catching test (C51B)
  c51b_catching_test: {
    code: "C51B",
    group: "Catching – 1B",
    shortLabel: "1B Catching (5 throws)",
    displayName: "First Base Catching Test (C51B)",
    instructions:
      "Have the player set up at 1B to take 5 throws from SS. 3 should be good throws and 2 should be more challenging (high/low/side). 0 points for a missed catch that gets by, 1 point for a blocked ball, and 3 points for a clean catch with the foot on the bag. The matrix UI lets you score each rep; the total out of 15 is calculated automatically.",
    notes: "Scored per‑rep in the UI: Miss = 0, Blocked = 1, Catch = 3 (max 15).",
    inputType: "number",
    min: 0,
    max: 15,
    step: 1,
    unitHint: "points (0–15)",
    placeholder: "0–15",
  },

  // 7U: Fly/LD combined tests (CIFFLD2B/SS/3B)
  infield_fly_ld_2b: {
    code: "CIFFLD2B",
    group: "Catching – Infield",
    shortLabel: "Fly/LD 2B (3 reps)",
    displayName: "Infield Fly / Light LD – 2B (CIFFLD2B)",
    instructions:
      "Hit 3 infield fly balls or light line drives to 2B within about a 20 ft radius. 0 points for a miss and 2 points for a catch. The matrix UI lets you score each rep; the total out of 6 is calculated automatically.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "points (0–6)",
    placeholder: "0–6",
  },
  infield_fly_ld_ss: {
    code: "CIFFLDSS",
    group: "Catching – Infield",
    shortLabel: "Fly/LD SS (3 reps)",
    displayName: "Infield Fly / Light LD – SS (CIFFLDSS)",
    instructions:
      "Hit 3 infield fly balls or light line drives to SS within about a 20 ft radius. 0 points for a miss and 2 points for a catch. The matrix UI lets you score each rep; the total out of 6 is calculated automatically.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "points (0–6)",
    placeholder: "0–6",
  },
  infield_fly_ld_3b: {
    code: "CIFFLD3B",
    group: "Catching – Infield",
    shortLabel: "Fly/LD 3B (3 reps)",
    displayName: "Infield Fly / Light LD – 3B (CIFFLD3B)",
    instructions:
      "Hit 3 infield fly balls or light line drives to 3B within about a 20 ft radius. 0 points for a miss and 2 points for a catch. The matrix UI lets you score each rep; the total out of 6 is calculated automatically.",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
    unitHint: "points (0–6)",
    placeholder: "0–6",
  },


  // 5×5 Fly Ball Ladder – Level (used in 7U–8U catching)
  c5x5_fly_ball_ladder_level: {
    code: "C5X5",
    displayName: "5×5 Fly Ball Ladder – Level",
    shortLabel: "5×5 Ladder",
    group: "Catching",
    instructions:
      "Set markers every 20 ft back to 120 ft. Start at level 1 (20 ft) and work back as the player successfully catches two balls at each level. Record the highest level reached before they miss 3 total balls.",
    unitHint: "Level 1–6 (0–25 pts)",
    inputType: "number",          // ⬅️ was "integer"
    min: 0,
    max: 25,
    step: 5,
  },

  // 10×10 Fly Ball Ladder – Level (used in 8U–9U catching)
  c10x10_fly_ball_ladder_level: {
    code: "C10X10",
    displayName: "10×10 Fly Ball Ladder – Level",
    shortLabel: "10×10 Ladder",
    group: "Catching",
    instructions:
      "Set markers every 20 ft back to 120 ft. Start at level 1 (20 ft) and work back as the player successfully catches two balls at each level. Record the highest level reached before they miss 3 total balls. At higher levels, force the player to move within a 10-yard radius.",
    unitHint: "Level 1–6 (0–25 pts)",
    inputType: "number",          // ⬅️ was "integer"
    min: 0,
    max: 25,
    step: 5,
  },


  // 9U: 5‑Pitch Catcher Screen & 15×15 matrix
  c5pcs_points: {
    code: "C5PCS",
    group: "Catching – Screens",
    shortLabel: "5 Pitch Catcher Screen",
    displayName: "5 Pitch Catcher Screen (C5PCS)",
    instructions:
      "Have the catcher receive 5 pitches (3 strikes, 1 ball out of the zone, 1 in the dirt). 0 points for a passed ball, 1 point for a blocked ball that stays in front, and 2 points for a catch or scoop. The matrix UI lets you score each rep; the total out of 10 is calculated automatically.",
    inputType: "number",
    min: 0,
    max: 10,
    step: 1,
    unitHint: "points (0–10)",
    placeholder: "0–10",
  },

  c15x15m_points: {
    code: "C15X15M",
    group: "Catching – Matrix",
    shortLabel: "15×15 Matrix (10 reps)",
    displayName: "15×15 Catching Matrix (C15X15M)",
    instructions:
      "Set up a 15‑yard radius around the player and hit 10 fly balls to varied spots in the coverage area from about 80 ft away. 0 points for a miss and 2 points for a catch. The matrix UI lets you score each rep; the total out of 20 is calculated automatically.",
    inputType: "number",
    min: 0,
    max: 20,
    step: 1,
    unitHint: "points (0–20)",
    placeholder: "0–20",
  },

  // 5U–6U Fielding – basic grounders (FG2B, FGSS, FG3B, FGP)
  grounders_2b: {
    code: "FG2B",
    group: "Fielding",
    shortLabel: "Grounders – 2B",
    displayName: "Grounders – 2B (3 reps)",
    instructions:
      "Hit 3 ground balls to the player at 2B. Score each rep: 0 = didn't field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B. Enter the total points (max 6).",
    unitHint: "points (0–6)",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
  },

  grounders_ss: {
    code: "FGSS",
    group: "Fielding",
    shortLabel: "Grounders – SS",
    displayName: "Grounders – Shortstop (3 reps)",
    instructions:
      "Hit 3 ground balls to the player at SS. Score each rep: 0 = didn't field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B. Enter the total points (max 6).",
    unitHint: "points (0–6)",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
  },

  grounders_3b: {
    code: "FG3B",
    group: "Fielding",
    shortLabel: "Grounders – 3B",
    displayName: "Grounders – 3B (3 reps)",
    instructions:
      "Hit 3 ground balls to the player at 3B. Score each rep: 0 = didn't field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B. Enter the total points (max 6).",
    unitHint: "points (0–6)",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
  },

  grounders_pitcher: {
    code: "FGP",
    group: "Fielding",
    shortLabel: "Grounders – P",
    displayName: "Grounders – Pitcher (3 reps)",
    instructions:
      "Hit 3 ground balls to the pitcher. Score each rep: 0 = didn't field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B. Enter the total points (max 6).",
    unitHint: "points (0–6)",
    inputType: "number",
    min: 0,
    max: 6,
    step: 1,
  },

  
};



/** Helper to get metadata for a given metric_key (or undefined if we haven't customized it yet). */
export function getMetricMeta(metricKey: MetricKey): MetricMeta | undefined {
  return METRIC_META[metricKey];
}
