export type OfficialStage = "정상" | "관심" | "주의" | "경계" | "심각";
export type Season = "봄" | "여름" | "가을" | "겨울";
export type ReachBucket = "none" | "within_7d" | "within_14d" | "within_30d";
export type TrendBucket = "rising" | "stable" | "falling";
export type ApprovedOutlookCode = string & {
  readonly __brand: "ApprovedOutlookCode";
};

export type ApprovedAction = {
  id: string;
  approvedTitle: string;
  approvedRationale: string;
};

export type CoachFactPacket = {
  factSchemaVersion: "1";
  officialStage: OfficialStage;
  season: Season;
  reachBucket: ReachBucket;
  trendBucket: TrendBucket;
  highWaterNotice: boolean;
  officialOutlookCode: ApprovedOutlookCode | null;
  actions: ApprovedAction[];
};

export type GeneratedCoachCopy = {
  headline: string;
  summary: string;
  actions: Array<{ id: string; reason: string }>;
};

export interface CoachProvider {
  generate(facts: CoachFactPacket): Promise<GeneratedCoachCopy>;
}
