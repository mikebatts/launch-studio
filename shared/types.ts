export type Channel = "email" | "inapp";
export type Variant = "included" | "sample";
export type DocumentId = `${Channel}-${Variant}`;
export type Fields = {
  subject: string;
  headline: string;
  body: string;
  dateLine: string;
  cta: string;
};
export type Field = keyof Fields;
export interface LaunchDocument {
  id: DocumentId;
  channel: Channel;
  variant: Variant;
  revision: number;
  fields: Fields;
  template: "editorial" | "compact";
  sourceRevision: number;
  origin: "supplied sample" | "edited" | "model proposal";
}
export interface Source {
  id: string;
  title: string;
  revision: number;
  text: string;
  createdAt: string;
  status: "confirmed" | "unconfirmed";
}
export interface Fact {
  superseded?: boolean;
  id: string;
  type: "availability" | "access" | "title";
  value: string;
  sourceId: string;
  sourceRevision: number;
  excerpt: string;
  confirmed: boolean;
  timeZone?: string;
}
export interface Player {
  id: string;
  name: string;
  membership: "Basic" | "Gold" | "Diamond";
  rating: number | null;
  ratingPool: "rapid";
  ratingUpdatedAt: string;
  interests: string[];
  ownsCourse: boolean;
  locale: string;
  emailOptIn: boolean;
  inappOptIn: boolean;
}
export interface AudienceRule {
  id: string;
  name: string;
  revision: number;
  enabled: boolean;
  minRating: number;
  maxRating: number;
  interest: string;
  memberships: Player["membership"][];
  locale: string;
  excludeOwners: boolean;
  maxRatingAgeDays: number;
}
export interface PlayerEvaluation {
  playerId: string;
  segmentIds: string[];
  variant: Variant;
  eligible: boolean;
  email: boolean;
  inapp: boolean;
  reasons: string[];
  emailReasons: string[];
  inappReasons: string[];
}
export interface AudienceResult {
  total: number;
  eligible: number;
  email: number;
  inapp: number;
  overlap: number;
  excluded: number;
  players: PlayerEvaluation[];
  segments: { id: string; name: string; count: number }[];
  evaluatedAt: string;
}
export interface Proposal {
  sourceRefs?: { id: string; revision: number }[];
  id: string;
  documentId: DocumentId;
  field: Field;
  baseRevision: number;
  baseValue: string;
  proposedValue: string;
  sourceRevision: number;
  status: "pending" | "applied" | "rejected";
  origin: "source revision" | "live model" | "test replay";
  conflict: boolean;
  note: string;
}
export interface RunEvent {
  seq: number;
  at: string;
  type: string;
  message: string;
  documentId?: DocumentId;
}
export interface GenerationRun {
  id: string;
  attempt: number;
  status:
    "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  mode: "live" | "test replay";
  instructions: string;
  targets: DocumentId[];
  fields?: Field[];
  completedTargets: DocumentId[];
  failedTargets: DocumentId[];
  events: RunEvent[];
  createdAt: string;
  error?: string;
  capturedDocuments: Partial<Record<DocumentId, LaunchDocument>>;
  sourceRevision: number;
}
export interface Comment {
  id: string;
  documentId: DocumentId;
  field: Field;
  documentRevision: number;
  text: string;
  actor: "operator" | "reviewer";
  parentId?: string;
  createdAt: string;
  resolved?: boolean;
}
export interface RecipientBinding {
  playerId: string;
  channel: Channel;
  variant: Variant;
  documentId: DocumentId;
}
export interface ReleaseCandidate {
  id: string;
  revision: number;
  fingerprint: string;
  status:
    | "needs-review"
    | "approved"
    | "queued"
    | "delivering"
    | "delivered"
    | "paused"
    | "cancelled";
  plan: { mode: "immediate" | "scheduled"; at: string; timeZone: string };
  createdAt: string;
  /** Version-bound acknowledgments, separate from approval of the whole release. */
  reviewChecks?: Partial<
    Record<DocumentId, { documentRevision: number; reviewedAt: string }>
  >;
  approvedAt?: string;
  approvedBy?: string;
  approvalKind?: "guest demo review" | "separate reviewer session";
  documents: Record<DocumentId, LaunchDocument>;
  bindings: RecipientBinding[];
  sourceRevision: number;
  ruleRevisions: Record<string, number>;
  fence: number;
  rendererVersion: 1;
  schemaVersion: 1;
  destination: {
    title: string;
    availability: string;
    sampleAvailable: true;
    policy: string;
  };
  reason?: string;
}
export interface Receipt {
  id: string;
  releaseId: string;
  playerId: string;
  playerName: string;
  channel: Channel;
  variant: Variant;
  documentId: DocumentId;
  documentRevision: number;
  status: "delivered" | "suppressed" | "failed";
  reason?: string;
  createdAt: string;
  fields: Fields;
  template: "editorial" | "compact";
  rendererVersion: 1;
  deliveryKey: string;
}
export interface InteractionEvent {
  id: string;
  receiptId?: string;
  playerId: string;
  type:
    | "message_written"
    | "inbox_opened"
    | "cta_followed"
    | "sample_started"
    | "sample_completed";
  at: string;
}
export interface ModelStatus {
  mode: "live";
  available: boolean;
  provider: "Ollama";
  model: string;
  endpoint: string;
  reason?: string;
}
export interface WorkspaceState {
  id: string;
  revision: number;
  role: "operator" | "reviewer";
  demoReview: boolean;
  createdAt: string;
  expiresAt: string;
  course: {
    title: string;
    availability: string;
    timeZone: string;
    sourceRevision: number;
    sampleAvailable: true;
  };
  documents: Record<DocumentId, LaunchDocument>;
  sources: Source[];
  facts: Fact[];
  rules: AudienceRule[];
  players: Player[];
  previewPlayerIds: string[];
  audience: AudienceResult;
  proposals: Proposal[];
  runs: GenerationRun[];
  comments: Comment[];
  reviewRequested: boolean;
  candidate: ReleaseCandidate | null;
  receipts: Receipt[];
  events: InteractionEvent[];
  model: ModelStatus;
  generationBudget: { used: number; limit: number };
}
export type Action =
  | {
      type: "editDocument";
      documentId: DocumentId;
      expectedRevision: number;
      fields?: Partial<Fields>;
      template?: LaunchDocument["template"];
    }
  | {
      type: "updateRule";
      ruleId: string;
      expectedRevision: number;
      patch: Partial<Omit<AudienceRule, "id" | "revision">>;
    }
  | {
      type: "reviseSource";
      expectedRevision: number;
      availability?: string;
      text?: string;
    }
  | { type: "confirmSource"; sourceId: string; availability?: string }
  | {
      type: "applyProposal";
      proposalId: string;
      expectedRevision: number;
      resolution?: "use-proposal" | "keep-current";
      mergedValue?: string;
    }
  | { type: "rejectProposal"; proposalId: string }
  | {
      type: "startGeneration";
      targets?: DocumentId[];
      instructions?: string;
      fields?: Field[];
    }
  | { type: "cancelGeneration" | "retryGeneration"; runId: string }
  | {
      type: "addComment";
      documentId: DocumentId;
      field: Field;
      text: string;
      parentId?: string;
    }
  | { type: "requestReview" | "requestChanges"; reason?: string }
  | { type: "switchRole"; role: "operator" | "reviewer" }
  | {
      type: "prepareCandidate";
      mode: "immediate" | "scheduled";
      at?: string;
      timeZone?: string;
    }
  | {
      type: "approveCandidate" | "enqueue";
      candidateId: string;
      expectedRevision: number;
    }
  | {
      type: "reviewDocument";
      candidateId: string;
      expectedRevision: number;
      documentId: DocumentId;
    }
  | { type: "cancelSchedule"; candidateId: string }
  | {
      type: "trackEvent";
      eventType: InteractionEvent["type"];
      receiptId?: string;
      playerId: string;
    }
  | { type: "resolveComment"; commentId: string; resolved: boolean }
  | { type: "reset" };
export const DOCUMENT_IDS: DocumentId[] = [
  "email-included",
  "email-sample",
  "inapp-included",
  "inapp-sample",
];
export const SAMPLE_FEN = "5k2/6q1/8/8/3N4/8/8/4K3 w - - 0 1";
export const SAMPLE_MOVE = { from: "d4", to: "e6" } as const;
