import type { components } from "./generated/openapi.js";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type ApiError = components["schemas"]["ApiError"];
export type RegionCandidate = components["schemas"]["RegionCandidate"];
export type RegionSearchResponse =
  components["schemas"]["RegionSearchResponse"];
export type RegionResolveRequest =
  components["schemas"]["RegionResolveRequest"];
export type RegionResolveResponse =
  components["schemas"]["RegionResolveResponse"];
export type RepresentativeReservoir =
  components["schemas"]["RepresentativeReservoir"];
export type DroughtStage = components["schemas"]["DroughtStage"];
export type DroughtStageCode = DroughtStage["code"];
export type StatusResponse = components["schemas"]["StatusResponse"];
