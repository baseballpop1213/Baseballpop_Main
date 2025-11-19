// speedMetricIds.ts

export type AgeGroupLabel =
  | "5U"
  | "6U"
  | "7U"
  | "8U"
  | "9U"
  | "10U"
  | "11U"
  | "12U"
  | "13U"
  | "14U"
  | "HS";

export interface SpeedDistanceMetricIds {
  athleticTemplateId: number;
  timedRun1BDistanceFtMetricId: number;
  timedRun4BDistanceFtMetricId: number;
}

// NOTE: template_id => age group mapping is inferred from your DB pattern:
//  5U: 1, 6U: 16, 7U: 21, 8U: 26, 9U: 31,
//  10U: 36, 11U: 43, 12U: 50, 13U: 57, 14U: 64, HS: 71.
// Adjust any of these if your template IDs differ.

export const SPEED_DISTANCE_METRIC_IDS: Record<AgeGroupLabel, SpeedDistanceMetricIds> = {
  "5U": {
    athleticTemplateId: 1,
    timedRun1BDistanceFtMetricId: 724,
    timedRun4BDistanceFtMetricId: 734,
  },
  "6U": {
    athleticTemplateId: 16,
    timedRun1BDistanceFtMetricId: 725,
    timedRun4BDistanceFtMetricId: 735,
  },
  "7U": {
    athleticTemplateId: 21,
    timedRun1BDistanceFtMetricId: 726,
    timedRun4BDistanceFtMetricId: 736,
  },
  "8U": {
    athleticTemplateId: 26,
    timedRun1BDistanceFtMetricId: 727,
    timedRun4BDistanceFtMetricId: 737,
  },
  "9U": {
    athleticTemplateId: 31,
    timedRun1BDistanceFtMetricId: 728,
    timedRun4BDistanceFtMetricId: 738,
  },
  "10U": {
    athleticTemplateId: 36,
    timedRun1BDistanceFtMetricId: 729,
    timedRun4BDistanceFtMetricId: 739,
  },
  "11U": {
    athleticTemplateId: 43,
    timedRun1BDistanceFtMetricId: 730,
    timedRun4BDistanceFtMetricId: 740,
  },
  "12U": {
    athleticTemplateId: 50,
    timedRun1BDistanceFtMetricId: 731,
    timedRun4BDistanceFtMetricId: 741,
  },
  "13U": {
    athleticTemplateId: 57,
    timedRun1BDistanceFtMetricId: 732,
    timedRun4BDistanceFtMetricId: 742,
  },
  "14U": {
    athleticTemplateId: 64,
    timedRun1BDistanceFtMetricId: 733,
    timedRun4BDistanceFtMetricId: 743,
  },
  HS: {
    athleticTemplateId: 71,
    // From your earlier HS dump:
    timedRun1BDistanceFtMetricId: 648,
    timedRun4BDistanceFtMetricId: 649,
  },
};
