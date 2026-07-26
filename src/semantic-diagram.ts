import {
  buildC4DiagramSpec,
  validateC4DiagramSpec,
} from "./semantic-c4.js";
import type {
  DiagramBuildMetadata,
  DiagramContainerSpec,
  DiagramRelationshipSpec,
  DiagramSpec,
  DiagramSpecBuildResult,
  DiagramSpecValidationResult,
  DiagramSystemSpec,
  NormalizedDiagramSpec,
} from "./semantic-c4.js";
import {
  buildSequenceDiagramSpec,
  validateSequenceDiagramSpec,
} from "./semantic-sequence.js";
import {
  buildSwimlaneDiagramSpec,
  validateSwimlaneDiagramSpec,
} from "./semantic-swimlane.js";
import type {
  NormalizedSwimlaneActivitySpec,
  NormalizedSwimlaneFlowSpec,
  SwimlaneActivitySpec,
  SwimlaneActivityType,
  SwimlaneDiagramBuildMetadata,
  SwimlaneDiagramBuildResult,
  SwimlaneDiagramValidationResult,
  SwimlaneFlowSpec,
  SwimlaneLaneSpec,
  SwimlaneTransitionSpec,
} from "./semantic-swimlane.js";
import type {
  NormalizedSequenceInteractionSpec,
  SequenceDiagramBuildMetadata,
  SequenceDiagramBuildResult,
  SequenceDiagramValidationResult,
  SequenceInteractionSpec,
  SequenceMessageKind,
  SequenceMessageSpec,
  SequenceNoteSpec,
  SequenceParticipantSpec,
} from "./semantic-sequence.js";
import { isPlainObject } from "./semantic-schema.js";
import { buildBandFlowSpec, validateBandFlowSpec } from "./semantic-band-build-entry.js";
import type {
  BandDiagramBuildResult,
  BandDiagramValidationResult,
  BandFlowSpec,
} from "./semantic-band-build-entry.js";
import type {
  DiagramDiagnostic,
  DiagramDiagnosticCode,
  DiagramSpecOptions,
} from "./semantic-schema.js";

export type {
  SemanticPaletteName,
  SemanticStatus,
} from "./semantic-palette.js";
export type {
  DiagramBuildMetadata,
  DiagramContainerSpec,
  DiagramDiagnostic,
  DiagramDiagnosticCode,
  DiagramRelationshipSpec,
  DiagramSpec,
  DiagramSpecBuildResult,
  DiagramSpecOptions,
  DiagramSpecValidationResult,
  DiagramSystemSpec,
  NormalizedDiagramSpec,
  NormalizedSequenceInteractionSpec,
  SequenceDiagramBuildMetadata,
  SequenceDiagramBuildResult,
  SequenceDiagramValidationResult,
  SequenceInteractionSpec,
  SequenceMessageKind,
  SequenceMessageSpec,
  SequenceNoteSpec,
  SequenceParticipantSpec,
  NormalizedSwimlaneActivitySpec,
  NormalizedSwimlaneFlowSpec,
  SwimlaneActivitySpec,
  SwimlaneActivityType,
  SwimlaneDiagramBuildMetadata,
  SwimlaneDiagramBuildResult,
  SwimlaneDiagramValidationResult,
  SwimlaneFlowSpec,
  SwimlaneLaneSpec,
  SwimlaneTransitionSpec,
};

export type SemanticDiagramSpec =
  | DiagramSpec
  | SequenceInteractionSpec
  | SwimlaneFlowSpec
  | BandFlowSpec;

export type NormalizedSemanticDiagramSpec =
  | NormalizedDiagramSpec
  | NormalizedSequenceInteractionSpec
  | NormalizedSwimlaneFlowSpec;

export type SemanticDiagramValidationResult =
  | DiagramSpecValidationResult
  | SequenceDiagramValidationResult
  | SwimlaneDiagramValidationResult
  | BandDiagramValidationResult;

export type SemanticDiagramBuildResult =
  | DiagramSpecBuildResult
  | SequenceDiagramBuildResult
  | SwimlaneDiagramBuildResult
  | BandDiagramBuildResult;

export function validateDiagramSpec(
  value: DiagramSpec,
  options?: DiagramSpecOptions,
): DiagramSpecValidationResult;
export function validateDiagramSpec(
  value: SequenceInteractionSpec,
  options?: DiagramSpecOptions,
): SequenceDiagramValidationResult;
export function validateDiagramSpec(
  value: SwimlaneFlowSpec,
  options?: DiagramSpecOptions,
): SwimlaneDiagramValidationResult;
export function validateDiagramSpec(
  value: BandFlowSpec,
  options?: DiagramSpecOptions,
): BandDiagramValidationResult;
export function validateDiagramSpec(
  value: unknown,
  options?: DiagramSpecOptions,
): SemanticDiagramValidationResult;
export function validateDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SemanticDiagramValidationResult {
  if (isSequenceInteraction(value)) {
    return validateSequenceDiagramSpec(value, options);
  }
  if (isBandFlow(value)) {
    return validateBandFlowSpec(value, options);
  }
  return isSwimlaneFlow(value)
    ? validateSwimlaneDiagramSpec(value, options)
    : validateC4DiagramSpec(value, options);
}

export function buildDiagramSpec(
  value: DiagramSpec,
  options?: DiagramSpecOptions,
): DiagramSpecBuildResult;
export function buildDiagramSpec(
  value: SequenceInteractionSpec,
  options?: DiagramSpecOptions,
): SequenceDiagramBuildResult;
export function buildDiagramSpec(
  value: SwimlaneFlowSpec,
  options?: DiagramSpecOptions,
): SwimlaneDiagramBuildResult;
export function buildDiagramSpec(
  value: BandFlowSpec,
  options?: DiagramSpecOptions,
): BandDiagramBuildResult;
export function buildDiagramSpec(
  value: unknown,
  options?: DiagramSpecOptions,
): SemanticDiagramBuildResult;
export function buildDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SemanticDiagramBuildResult {
  if (isSequenceInteraction(value)) {
    return buildSequenceDiagramSpec(value, options);
  }
  if (isBandFlow(value)) {
    return buildBandFlowSpec(value, options);
  }
  return isSwimlaneFlow(value)
    ? buildSwimlaneDiagramSpec(value, options)
    : buildC4DiagramSpec(value, options);
}

function isSequenceInteraction(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && value.template === "sequence.interaction";
}

function isSwimlaneFlow(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && value.template === "flow.swimlane";
}

function isBandFlow(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && value.template === "flow.band";
}
