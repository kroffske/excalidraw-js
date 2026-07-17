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
import type {
  DiagramDiagnostic,
  DiagramDiagnosticCode,
  DiagramSpecOptions,
} from "./semantic-schema.js";

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
};

export type SemanticDiagramSpec =
  | DiagramSpec
  | SequenceInteractionSpec;

export type NormalizedSemanticDiagramSpec =
  | NormalizedDiagramSpec
  | NormalizedSequenceInteractionSpec;

export type SemanticDiagramValidationResult =
  | DiagramSpecValidationResult
  | SequenceDiagramValidationResult;

export type SemanticDiagramBuildResult =
  | DiagramSpecBuildResult
  | SequenceDiagramBuildResult;

export function validateDiagramSpec(
  value: DiagramSpec,
  options?: DiagramSpecOptions,
): DiagramSpecValidationResult;
export function validateDiagramSpec(
  value: SequenceInteractionSpec,
  options?: DiagramSpecOptions,
): SequenceDiagramValidationResult;
export function validateDiagramSpec(
  value: unknown,
  options?: DiagramSpecOptions,
): SemanticDiagramValidationResult;
export function validateDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SemanticDiagramValidationResult {
  return isSequenceInteraction(value)
    ? validateSequenceDiagramSpec(value, options)
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
  value: unknown,
  options?: DiagramSpecOptions,
): SemanticDiagramBuildResult;
export function buildDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SemanticDiagramBuildResult {
  return isSequenceInteraction(value)
    ? buildSequenceDiagramSpec(value, options)
    : buildC4DiagramSpec(value, options);
}

function isSequenceInteraction(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && value.template === "sequence.interaction";
}
