// HS template IDs (from your last insert)
export const HS_ATHLETIC_TEMPLATE_ID = 71;
export const HS_HITTING_TEMPLATE_ID = 72;
export const HS_CATCHER_TEMPLATE_ID = 74;
export const HS_FIRST_BASE_TEMPLATE_ID = 75;
export const HS_INFIELD_TEMPLATE_ID = 76;
export const HS_OUTFIELD_TEMPLATE_ID = 77;

/**
 * HS Athletic Skills (template_id = 71)
 */
export const HS_ATHLETIC_METRIC_IDS: Record<string, number> = {
  timed_run_1b: 630,
  timed_run_4b: 631,
  apush_60: 632,
  asit_60: 633,
  apull_60: 634,
  aspscp_distance_ft: 635,
  aspscp_med_ball_weight_lbs: 636,
  aspsup_distance_ft: 637,
  aspsup_med_ball_weight_lbs: 638,
  asp_jump_inches: 639,
  sls_eyes_open_right: 640,
  sls_eyes_open_left: 641,
  sls_eyes_closed_right: 642,
  sls_eyes_closed_left: 643,
  msr_right: 644,
  msr_left: 645,
  toe_touch: 646,
  deep_squat: 647,
  timed_run_1b_distance_ft: 648,
  timed_run_4b_distance_ft: 649,
};

/**
 * HS Hitting Skills (template_id = 72)
 */
export const HS_HITTING_METRIC_IDS: Record<string, number> = {
  m_10_fastball_quality: 650,
  tee_line_drive_test_10: 651,
  max_exit_velo_tee: 652,
  max_bat_speed: 653,
  m_5_varied_speed_quality: 654,
  m_5_curveball_quality: 655,
};

/**
 * HS Catcher Eval (template_id = 74)
 */
export const HS_CATCHER_METRIC_IDS: Record<string, number> = {
  ct2bt_seconds: 656,
  c20pcs_points: 657,
  cttt2b_points: 658,
};

/**
 * HS First Base Eval (template_id = 75)
 */
export const HS_FIRST_BASE_METRIC_IDS: Record<string, number> = {
  c101b_catching_test: 660,
  c1bst_scoops_test: 661,
  rlc1b_grounder_1_direction: 662,
  rlc1b_grounder_1_points: 663,
  rlc1b_grounder_2_direction: 664,
  rlc1b_grounder_2_points: 665,
  rlc1b_grounder_3_direction: 666,
  rlc1b_grounder_3_points: 667,
  rlc1b_grounder_4_direction: 668,
  rlc1b_grounder_4_points: 669,
  rlc1b_grounder_5_direction: 670,
  rlc1b_grounder_5_points: 671,
  rlc1b_grounder_6_direction: 672,
  rlc1b_grounder_6_points: 673,
  fbfly_points: 674,
  fbld_points: 675,
};

/**
 * HS Infield Eval (template_id = 76)
 */
export const HS_INFIELD_METRIC_IDS: Record<string, number> = {
  ifss1bt_seconds: 677,
  rlc2b_grounder_1_direction: 678,
  rlc2b_grounder_1_points: 679,
  rlc2b_grounder_2_direction: 680,
  rlc2b_grounder_2_points: 681,
  rlc2b_grounder_3_direction: 682,
  rlc2b_grounder_3_points: 683,
  rlc2b_grounder_4_direction: 684,
  rlc2b_grounder_4_points: 685,
  rlc2b_grounder_5_direction: 686,
  rlc2b_grounder_5_points: 687,
  rlc2b_grounder_6_direction: 688,
  rlc2b_grounder_6_points: 689,
  rlc3b_grounder_1_direction: 690,
  rlc3b_grounder_1_points: 691,
  rlc3b_grounder_2_direction: 692,
  rlc3b_grounder_2_points: 693,
  rlc3b_grounder_3_direction: 694,
  rlc3b_grounder_3_points: 695,
  rlc3b_grounder_4_direction: 696,
  rlc3b_grounder_4_points: 697,
  rlc3b_grounder_5_direction: 698,
  rlc3b_grounder_5_points: 699,
  rlc3b_grounder_6_direction: 700,
  rlc3b_grounder_6_points: 701,
  rlcss_grounder_1_direction: 702,
  rlcss_grounder_1_points: 703,
  rlcss_grounder_2_direction: 704,
  rlcss_grounder_2_points: 705,
  rlcss_grounder_3_direction: 706,
  rlcss_grounder_3_points: 707,
  rlcss_grounder_4_direction: 708,
  rlcss_grounder_4_points: 709,
  rlcss_grounder_5_direction: 710,
  rlcss_grounder_5_points: 711,
  rlcss_grounder_6_direction: 712,
  rlcss_grounder_6_points: 713,
  infield_fly_2b: 714,
  infield_fly_3b: 715,
  infield_fly_ss: 716,
  infield_ld_2b: 717,
  infield_ld_3b: 718,
  infield_ld_ss: 719,
};

/**
 * HS Outfield Eval (template_id = 77)
 */
export const HS_OUTFIELD_METRIC_IDS: Record<string, number> = {
  c30x30m_points: 721,
  throw_120ft_target: 722,
  ofgbht_seconds: 723,
};
