import { createHash, randomUUID } from "node:crypto";
import {
  DOCUMENT_IDS,
  type WorkspaceState,
  type Player,
  type AudienceRule,
  type AudienceResult,
  type LaunchDocument,
  type Action,
  type Proposal,
  type Fields,
  type DocumentId,
  type ModelStatus,
} from "../shared/types.ts";
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "INVALID_ACTION",
  ) {
    super(message);
  }
}
export const uid = () => randomUUID();
export const iso = (now = Date.now()) => new Date(now).toISOString();
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
export const availabilityDefault = "2026-09-21T13:00:00.000Z";
export function players(now: number): Player[] {
  const make = (i: number): Player => ({
    id: `player-${i + 1}`,
    name: `Learner ${String(i + 1).padStart(3, "0")}`,
    membership: i % 3 === 0 ? "Diamond" : i % 3 === 1 ? "Basic" : "Gold",
    rating: i % 19 === 0 ? null : 700 + ((i * 37) % 800),
    ratingPool: "rapid",
    ratingUpdatedAt: iso(now - (i % 17 === 0 ? 150 : 12) * 86400000),
    interests: i % 5 === 0 ? ["openings"] : ["tactics"],
    ownsCourse: i % 13 === 0,
    locale: i % 11 === 0 ? "es" : "en",
    emailOptIn: i % 7 !== 0,
    inappOptIn: i % 23 !== 0,
  });
  const result = Array.from({ length: 250 }, (_, i) => make(i));
  const base = {
    rating: 1050,
    ratingUpdatedAt: iso(now - 7 * 86400000),
    interests: ["tactics"],
    ownsCourse: false,
    locale: "en",
    emailOptIn: true,
    inappOptIn: true,
  };
  result[0] = {
    ...result[0],
    ...base,
    id: "alex",
    name: "Alex",
    membership: "Diamond",
  };
  result[1] = {
    ...result[1],
    ...base,
    id: "sam",
    name: "Sam",
    membership: "Basic",
  };
  result[2] = {
    ...result[2],
    ...base,
    id: "casey",
    name: "Casey",
    membership: "Gold",
    ownsCourse: true,
  };
  result[3] = {
    ...result[3],
    ...base,
    id: "jules",
    name: "Jules",
    membership: "Diamond",
    emailOptIn: false,
  };
  return result;
}
export function evaluate(
  players: Player[],
  rules: AudienceRule[],
  now: number,
): AudienceResult {
  const evaluated = players.map((p) => {
    const matches = rules
      .filter((r) => r.enabled)
      .map((r) => {
        const why: string[] = [];
        if (p.rating === null) why.push("No rapid rating");
        else if (p.rating < r.minRating || p.rating > r.maxRating)
          why.push(`Rapid rating outside ${r.minRating}–${r.maxRating}`);
        if (now - Date.parse(p.ratingUpdatedAt) > r.maxRatingAgeDays * 86400000)
          why.push("Rapid rating is stale");
        if (!p.interests.includes(r.interest))
          why.push(`No ${r.interest} interest`);
        if (!r.memberships.includes(p.membership))
          why.push("Membership outside segment");
        if (p.locale !== r.locale || p.locale !== "en")
          why.push("Unsupported locale — English only");
        if (p.ownsCourse)
          why.push("Already owns this course — acquisition suppressed");
        return { r, why };
      });
    const segmentIds = matches.filter((m) => !m.why.length).map((m) => m.r.id);
    const eligible = segmentIds.length > 0;
    const reasons = eligible
      ? [
          `${p.membership === "Diamond" ? "Diamond included-access" : "Free-sample access"} · matches ${segmentIds.length} segment${segmentIds.length === 1 ? "" : "s"}`,
        ]
      : [...new Set(matches.flatMap((m) => m.why))];
    if (!matches.length) reasons.push("No enabled segments");
    return {
      playerId: p.id,
      segmentIds,
      variant: (p.membership === "Diamond" ? "included" : "sample") as
        "included" | "sample",
      eligible,
      email: eligible && p.emailOptIn,
      inapp: eligible && p.inappOptIn,
      reasons,
      emailReasons: [
        ...(!eligible ? reasons : []),
        ...(!p.emailOptIn ? ["Email opted out"] : []),
      ],
      inappReasons: [
        ...(!eligible ? reasons : []),
        ...(!p.inappOptIn ? ["In-app disabled"] : []),
      ],
    };
  });
  return {
    total: players.length,
    eligible: evaluated.filter((p) => p.eligible).length,
    email: evaluated.filter((p) => p.email).length,
    inapp: evaluated.filter((p) => p.inapp).length,
    overlap: evaluated.filter((p) => p.segmentIds.length > 1).length,
    excluded: evaluated.filter((p) => !p.eligible).length,
    players: evaluated,
    segments: rules.map((r) => ({
      id: r.id,
      name: r.name,
      count: evaluated.filter((p) => p.segmentIds.includes(r.id)).length,
    })),
    evaluatedAt: iso(now),
  };
}
export function initialState(
  id: string,
  now: number,
  model: ModelStatus,
): WorkspaceState {
  const docs = Object.fromEntries(
    DOCUMENT_IDS.map((id) => {
      const [channel, variant] = id.split("-") as [
        "email" | "inapp",
        "included" | "sample",
      ];
      return [
        id,
        {
          id,
          channel,
          variant,
          revision: 1,
          template: "editorial",
          sourceRevision: 1,
          origin: "supplied sample",
          fields: {
            subject:
              variant === "included"
                ? "A sharper eye for your next game"
                : "Find two threats in one move",
            headline: "One move. Two possibilities.",
            body:
              channel === "email"
                ? "A knight can turn a quiet position into a double threat. Explore Spot the Fork, an original tactics course for returning learners, and try a short practice position today."
                : "See the fork before your opponent does. Try an original, bite-sized tactics position.",
            dateLine: `Course available ${dateLabel(availabilityDefault)}. The free sample is ready now.`,
            cta:
              variant === "included" ? "Explore course" : "Try the free sample",
          },
        } satisfies LaunchDocument,
      ];
    }),
  ) as Record<DocumentId, LaunchDocument>;
  const ps = players(now);
  const rules: AudienceRule[] = [
    {
      id: "returning",
      name: "Returning tacticians",
      revision: 1,
      enabled: true,
      minRating: 800,
      maxRating: 1200,
      interest: "tactics",
      memberships: ["Basic", "Gold", "Diamond"],
      locale: "en",
      excludeOwners: true,
      maxRatingAgeDays: 90,
    },
    {
      id: "developing",
      name: "Building confidence",
      revision: 1,
      enabled: true,
      minRating: 1000,
      maxRating: 1300,
      interest: "tactics",
      memberships: ["Basic", "Gold", "Diamond"],
      locale: "en",
      excludeOwners: true,
      maxRatingAgeDays: 90,
    },
  ];
  return {
    id,
    revision: 1,
    role: "operator",
    demoReview: true,
    createdAt: iso(now),
    expiresAt: iso(now + 7 * 86400000),
    course: {
      title: "Spot the Fork",
      availability: availabilityDefault,
      timeZone: "America/New_York",
      sourceRevision: 1,
      sampleAvailable: true,
    },
    documents: docs,
    sources: [
      {
        id: "launch-brief",
        title: "Spot the Fork · launch brief",
        revision: 1,
        text: `Spot the Fork is an original introductory tactics course. Course available ${dateLabel(availabilityDefault)} at 9:00 a.m. America/New_York. The free sample is available now. Diamond access is included; other members may try the free sample. Existing owners are excluded from acquisition. No rating-gain guarantees.`,
        createdAt: iso(now),
        status: "confirmed",
      },
      {
        id: "catalog",
        title: "Fictional course catalog",
        revision: 1,
        text: "Diamond members and existing owners have included course access at availability. The original free sample is available immediately to everyone. Only the sample is implemented in this prototype.",
        createdAt: iso(now),
        status: "confirmed",
      },
    ],
    facts: [
      {
        id: "availability",
        type: "availability",
        value: availabilityDefault,
        sourceId: "launch-brief",
        sourceRevision: 1,
        excerpt: `Course available ${dateLabel(availabilityDefault)} at 9:00 a.m. America/New_York.`,
        confirmed: true,
        timeZone: "America/New_York",
      },
      {
        id: "access",
        type: "access",
        value:
          "Diamond included; Basic/Gold free sample; existing owners excluded from acquisition",
        sourceId: "catalog",
        sourceRevision: 1,
        excerpt:
          "Diamond members and existing owners have included course access at availability.",
        confirmed: true,
      },
    ],
    rules,
    players: ps,
    previewPlayerIds: ["alex", "sam", "casey", "jules"],
    audience: evaluate(ps, rules, now),
    proposals: [],
    runs: [],
    comments: [],
    reviewRequested: false,
    candidate: null,
    receipts: [],
    events: [],
    model,
    generationBudget: { used: 0, limit: 12 },
  };
}
export function fingerprint(s: WorkspaceState): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        docs: s.documents,
        course: s.course,
        rules: s.rules,
        facts: s.facts.filter((f) => f.confirmed),
        schema: 1,
        renderer: 1,
      }),
    )
    .digest("hex");
}
export function invalidate(s: WorkspaceState, reason: string) {
  if (
    s.candidate &&
    s.candidate.status !== "delivered" &&
    s.candidate.status !== "cancelled"
  ) {
    s.candidate.status = "paused";
    s.candidate.reason = reason;
    s.candidate.fence++;
    s.candidate.revision++;
    delete s.candidate.approvedAt;
  }
}
const assert = (
  condition: unknown,
  message: string,
  status = 400,
  code = "INVALID_ACTION",
) => {
  if (!condition) throw new DomainError(status, message, code);
};
export function proposal(
  s: WorkspaceState,
  doc: LaunchDocument,
  field: keyof Fields,
  value: string,
  origin: Proposal["origin"],
  base = doc,
) {
  s.proposals.push({
    id: uid(),
    documentId: doc.id,
    field,
    baseRevision: base.revision,
    baseValue: base.fields[field],
    proposedValue: value,
    sourceRevision: s.course.sourceRevision,
    status: "pending",
    origin,
    conflict: doc.fields[field] !== base.fields[field],
    note:
      origin === "source revision"
        ? "A confirmed availability fact changed. Your current copy is preserved."
        : "Proposed language only. Review factual claims before applying.",
  });
}
export function applyAction(
  s: WorkspaceState,
  a: Action,
  now = Date.now(),
): WorkspaceState {
  const operatorActions = [
    "editDocument",
    "updateRule",
    "reviseSource",
    "confirmSource",
    "applyProposal",
    "rejectProposal",
    "startGeneration",
    "retryGeneration",
    "cancelGeneration",
    "requestReview",
    "prepareCandidate",
    "enqueue",
    "cancelSchedule",
  ];
  if (operatorActions.includes(a.type))
    assert(
      s.role === "operator",
      "Switch to the operator persona to make this change.",
      403,
      "FORBIDDEN",
    );
  switch (a.type) {
    case "switchRole":
      s.role = a.role;
      break;
    case "resolveComment": {
      const c = s.comments.find((c) => c.id === a.commentId);
      assert(c, "Unknown comment");
      c!.resolved = a.resolved;
      break;
    }
    case "editDocument": {
      const d = s.documents[a.documentId];
      assert(d, "Unknown document");
      assert(
        d.revision === a.expectedRevision,
        "This document changed. Reload the saved version; your local edit has not been applied.",
        409,
        "VERSION_CONFLICT",
      );
      if (a.fields)
        for (const [k, v] of Object.entries(a.fields)) {
          assert(
            ["subject", "headline", "body", "dateLine", "cta"].includes(k) &&
              typeof v === "string" &&
              v.length <= 8000,
            "Invalid document field",
          );
          d.fields[k as keyof Fields] = v;
        }
      if (a.template) d.template = a.template;
      d.revision++;
      d.origin = "edited";
      invalidate(s, "Document changed after candidate preparation");
      break;
    }
    case "updateRule": {
      const r = s.rules.find((r) => r.id === a.ruleId);
      assert(r, "Unknown segment");
      assert(
        r!.revision === a.expectedRevision,
        "Audience rule changed; reload before saving.",
        409,
        "VERSION_CONFLICT",
      );
      Object.assign(r!, a.patch, { id: r!.id, revision: r!.revision + 1 });
      assert(
        r!.minRating >= 0 &&
          r!.maxRating <= 4000 &&
          r!.minRating <= r!.maxRating,
        "Use a valid rapid rating range",
      );
      assert(r!.locale === "en", "Only reviewed English copy is available");
      assert(
        r!.excludeOwners,
        "This bounded acquisition launch always excludes owners.",
      );
      invalidate(s, "Audience policy changed");
      break;
    }
    case "reviseSource": {
      assert(
        a.expectedRevision === s.course.sourceRevision,
        "The source changed; review its latest revision.",
        409,
        "VERSION_CONFLICT",
      );
      const old = s.course.availability;
      const availability = a.availability ?? "2026-09-28T13:00:00.000Z";
      assert(
        Number.isFinite(Date.parse(availability)),
        "A valid availability timestamp is required",
      );
      s.course.availability = new Date(availability).toISOString();
      s.course.sourceRevision++;
      for (const fact of s.facts)
        if (fact.type === "availability" && fact.confirmed) {
          fact.confirmed = false;
          fact.superseded = true;
        }
      for (const pending of s.proposals)
        if (pending.status === "pending") {
          pending.status = "rejected";
          pending.note =
            "Superseded by a newer authoritative source revision; no copy was changed.";
        }
      const text =
        a.text ??
        `Course available ${dateLabel(availability)} at 9:00 a.m. America/New_York. Free sample remains available now.`;
      s.sources.push({
        id: "launch-brief",
        title: "Spot the Fork · revised launch brief",
        revision: s.course.sourceRevision,
        text,
        createdAt: iso(now),
        status: "confirmed",
      });
      s.facts.push({
        id: "availability",
        type: "availability",
        value: s.course.availability,
        sourceId: "launch-brief",
        sourceRevision: s.course.sourceRevision,
        excerpt: text,
        confirmed: true,
        timeZone: s.course.timeZone,
      });
      for (const d of Object.values(s.documents)) {
        const base = {
          ...d,
          fields: {
            ...d.fields,
            dateLine: `Course available ${dateLabel(old)}. The free sample is ready now.`,
          },
        };
        proposal(
          s,
          d,
          "dateLine",
          `Course available ${dateLabel(availability)}. The free sample is ready now.`,
          "source revision",
          base,
        );
      }
      invalidate(
        s,
        "Release-critical source changed. Dispatch time was not moved.",
      );
      break;
    }
    case "confirmSource": {
      const source = s.sources.find(
        (x) => x.id === a.sourceId && x.status === "unconfirmed",
      );
      assert(source, "No unconfirmed source found");
      assert(
        a.availability,
        "Confirm an explicit availability fact before making this source authoritative",
      );
      source!.status = "confirmed";
      applyAction(
        s,
        {
          type: "reviseSource",
          expectedRevision: s.course.sourceRevision,
          availability: a.availability,
          text: source!.text,
        },
        now,
      );
      break;
    }
    case "applyProposal": {
      const p = s.proposals.find((p) => p.id === a.proposalId);
      assert(p && p.status === "pending", "Proposal is no longer pending");
      const d = s.documents[p!.documentId];
      assert(
        d.revision === a.expectedRevision,
        "Document changed; compare against the current copy.",
        409,
        "VERSION_CONFLICT",
      );
      assert(
        p!.sourceRevision === s.course.sourceRevision,
        "This proposal uses an older source. Review the latest proposal.",
        409,
        "STALE_PROPOSAL",
      );
      p!.conflict = d.fields[p!.field] !== p!.baseValue;
      if (p!.conflict)
        assert(
          a.resolution || a.mergedValue !== undefined,
          "Choose the proposal, keep your edit, or supply a merged value.",
          409,
          "PROPOSAL_CONFLICT",
        );
      if (a.resolution !== "keep-current") {
        d.fields[p!.field] = a.mergedValue ?? p!.proposedValue;
        d.revision++;
        d.sourceRevision = p!.sourceRevision;
        d.origin = "edited";
      }
      p!.status = "applied";
      invalidate(s, "A proposal was resolved after candidate preparation");
      break;
    }
    case "rejectProposal": {
      const p = s.proposals.find((p) => p.id === a.proposalId);
      assert(p && p.status === "pending", "Proposal is no longer pending");
      p!.status = "rejected";
      break;
    }
    case "startGeneration":
      assert(
        s.generationBudget.used < s.generationBudget.limit,
        "This sample has reached its 12-run generation budget. Reset the sample to start again.",
        429,
        "BUDGET_LIMIT",
      );
      assert(
        !s.runs.some((r) => r.status === "running" || r.status === "queued"),
        "A generation run is already active.",
        409,
      );
      assert(
        s.model.available,
        s.model.reason ??
          "Local Ollama is unavailable. Supplied sample remains editable.",
        503,
        "MODEL_UNAVAILABLE",
      );
      s.generationBudget.used++;
      s.runs.push({
        id: uid(),
        attempt: 1,
        status: "queued",
        mode: "live",
        instructions: a.instructions ?? "Draft clear, concise launch copy.",
        targets: [...new Set(a.targets ?? DOCUMENT_IDS)],
        fields: a.fields ? [...new Set(a.fields)] : undefined,
        completedTargets: [],
        failedTargets: [],
        events: [
          {
            seq: 1,
            at: iso(now),
            type: "queued",
            message: "Generation queued on local Ollama.",
          },
        ],
        createdAt: iso(now),
        capturedDocuments: structuredClone(s.documents),
        sourceRevision: s.course.sourceRevision,
      });
      break;
    case "cancelGeneration": {
      const r = s.runs.find((r) => r.id === a.runId);
      assert(r, "Unknown run");
      r!.status = "cancelled";
      r!.attempt++;
      r!.events.push({
        seq: r!.events.length + 1,
        at: iso(now),
        type: "cancelled",
        message:
          "Cancelled. Late model output cannot be accepted; completed proposals remain.",
      });
      break;
    }
    case "retryGeneration": {
      const r = s.runs.find((r) => r.id === a.runId);
      assert(
        r && ["partial", "failed", "cancelled"].includes(r.status),
        "Only failed, partial or cancelled work can retry",
      );
      assert(s.model.available, "Local Ollama is unavailable", 503);
      assert(
        !s.runs.some((x) => x.status === "running" || x.status === "queued"),
        "Another generation is active",
        409,
      );
      assert(
        s.generationBudget.used < s.generationBudget.limit,
        "Generation budget reached",
        429,
      );
      s.generationBudget.used++;
      r!.attempt++;
      r!.status = "queued";
      r!.targets = r!.targets.filter((id) => !r!.completedTargets.includes(id));
      r!.failedTargets = [];
      r!.error = undefined;
      r!.sourceRevision = s.course.sourceRevision;
      r!.capturedDocuments = structuredClone(s.documents);
      r!.events.push({
        seq: r!.events.length + 1,
        at: iso(now),
        type: "retry",
        message: "Retry queued only for unfinished documents.",
      });
      break;
    }
    case "addComment":
      assert(
        a.text.trim().length > 0 && a.text.length <= 2000,
        "Comment must contain 1–2000 characters",
      );
      assert(s.documents[a.documentId], "Unknown document");
      if (a.parentId)
        assert(
          s.comments.some((c) => c.id === a.parentId),
          "Unknown parent comment",
        );
      s.comments.push({
        id: uid(),
        documentId: a.documentId,
        field: a.field,
        documentRevision: s.documents[a.documentId].revision,
        text: a.text,
        actor: s.role,
        parentId: a.parentId,
        createdAt: iso(now),
      });
      break;
    case "requestReview":
      s.reviewRequested = true;
      break;
    case "requestChanges":
      assert(
        s.role === "reviewer",
        "Only the reviewer persona can request changes.",
        403,
      );
      invalidate(s, a.reason ?? "Reviewer requested changes");
      s.reviewRequested = false;
      break;
    case "prepareCandidate": {
      assert(
        !s.proposals.some(
          (p) =>
            p.status === "pending" &&
            p.sourceRevision === s.course.sourceRevision,
        ),
        "Resolve current source and model proposals before review.",
        409,
        "UNRESOLVED_PROPOSALS",
      );
      const latest = dateLabel(s.course.availability);
      const superseded = s.facts
        .filter(
          (f) => f.type === "availability" && f.value !== s.course.availability,
        )
        .flatMap((f) => {
          const d = new Date(f.value);
          const long = dateLabel(f.value);
          const short = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: s.course.timeZone,
          }).format(d);
          return [
            long,
            short,
            long.replace(/, \d{4}$/, ""),
            short.replace(/, \d{4}$/, ""),
            f.value.slice(0, 10),
            `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`,
          ];
        });
      for (const d of Object.values(s.documents)) {
        const requiredFields: [keyof Fields, string][] = [
          ...(d.channel === "email"
            ? ([["subject", "subject line"]] as [keyof Fields, string][])
            : []),
          ["headline", "headline"],
          ["body", "body"],
          ["dateLine", "date line"],
          ["cta", "call to action"],
        ];
        for (const [field, label] of requiredFields) {
          // Ignore the inline bold/italic markers supported by the preview.
          const copy = d.fields[field]
            .replace(
              /\*\*([^*]+)\*\*|_([^_]+)_/g,
              (_match, bold, italic) => bold ?? italic,
            )
            .trim();
          assert(
            copy.length > 0,
            `${d.channel === "email" ? "Email" : "In-app"} · ${d.variant === "included" ? "included access" : "free sample"}: add a ${label} before preparing release.`,
            400,
            "MISSING_COPY",
          );
        }
        assert(
          !superseded.some((old) =>
            Object.values(d.fields).join(" ").includes(old),
          ),
          `${d.id}: copy still contains a superseded course date.`,
          409,
          "STALE_DATE",
        );
        assert(
          d.fields.dateLine.includes(latest),
          `${d.id}: date line must match the confirmed availability (${latest}).`,
          409,
          "STALE_DATE",
        );
        if (d.variant === "included" && now < Date.parse(s.course.availability))
          assert(
            d.fields.cta.trim().replace(/\s+/g, " ").toLowerCase() !==
              "start learning",
            `${d.id}: use Explore course before availability.`,
          );
        if (d.variant === "sample")
          assert(
            !/included with (your|the) membership/i.test(
              Object.values(d.fields).join(" "),
            ),
            `${d.id}: Basic/Gold access is the free sample, not included course access.`,
          );
      }
      const at = a.mode === "immediate" ? iso(now) : a.at;
      assert(
        at && Number.isFinite(Date.parse(at)),
        "A valid dispatch timestamp is required",
      );
      if (a.mode === "scheduled")
        assert(Date.parse(at!) > now + 1000, "Choose a future dispatch time");
      try {
        new Intl.DateTimeFormat("en", {
          timeZone: a.timeZone ?? "America/New_York",
        });
      } catch {
        throw new DomainError(400, "Choose a valid IANA time zone");
      }
      s.audience = evaluate(s.players, s.rules, now);
      const bindings = s.audience.players.flatMap((p) =>
        (["email", "inapp"] as const)
          .filter((ch) => p[ch])
          .map((ch) => ({
            playerId: p.playerId,
            channel: ch,
            variant: p.variant,
            documentId: `${ch}-${p.variant}` as DocumentId,
          })),
      );
      assert(bindings.length, "No eligible channel recipients");
      if (s.candidate) invalidate(s, "Replaced with a new candidate");
      s.candidate = {
        id: uid(),
        revision: 1,
        fingerprint: fingerprint(s),
        status: "needs-review",
        reviewChecks: {},
        plan: {
          mode: a.mode,
          at: at!,
          timeZone: a.timeZone ?? "America/New_York",
        },
        createdAt: iso(now),
        documents: structuredClone(s.documents),
        bindings,
        sourceRevision: s.course.sourceRevision,
        ruleRevisions: Object.fromEntries(
          s.rules.map((r) => [r.id, r.revision]),
        ),
        fence: 1,
        rendererVersion: 1,
        schemaVersion: 1,
        destination: {
          title: s.course.title,
          availability: s.course.availability,
          sampleAvailable: true,
          policy: "Diamond included; others free sample; owners excluded",
        },
      };
      break;
    }
    case "reviewDocument": {
      assert(
        s.role === "reviewer",
        "Only the reviewer can mark messages reviewed.",
        403,
      );
      const c = s.candidate;
      assert(c && c.id === a.candidateId, "Unknown candidate");
      assert(
        c!.revision === a.expectedRevision,
        "Candidate changed before review.",
        409,
        "VERSION_CONFLICT",
      );
      assert(
        c!.status === "needs-review" && c!.fingerprint === fingerprint(s),
        "Candidate is stale; prepare a new version.",
        409,
        "STALE_APPROVAL",
      );
      assert(c!.documents[a.documentId], "Unknown document");
      c!.reviewChecks ??= {};
      c!.reviewChecks[a.documentId] = {
        documentRevision: c!.documents[a.documentId].revision,
        reviewedAt: iso(now),
      };
      c!.revision++;
      break;
    }
    case "approveCandidate": {
      assert(
        s.role === "reviewer",
        "Only the server-scoped reviewer persona can approve.",
        403,
        "FORBIDDEN",
      );
      const c = s.candidate;
      assert(c && c.id === a.candidateId, "Unknown candidate");
      assert(
        c!.revision === a.expectedRevision,
        "Candidate changed before approval.",
        409,
        "VERSION_CONFLICT",
      );
      assert(
        c!.status === "needs-review" && c!.fingerprint === fingerprint(s),
        "Candidate is stale; operator must prepare it again.",
        409,
        "STALE_APPROVAL",
      );
      if (c!.plan.mode === "scheduled")
        assert(
          Date.parse(c!.plan.at) > now,
          "Dispatch time passed. Prepare a new plan.",
          409,
        );
      assert(
        !c!.reviewChecks ||
          DOCUMENT_IDS.every(
            (id) =>
              c!.reviewChecks![id]?.documentRevision ===
              c!.documents[id].revision,
          ),
        "Review all four messages before approving this version.",
        409,
        "REVIEW_INCOMPLETE",
      );
      c!.status = "approved";
      c!.approvedAt = iso(now);
      c!.approvedBy = s.demoReview
        ? "Guest reviewer persona (not an independent person)"
        : "Separate invited reviewer session (identity not verified)";
      c!.approvalKind = s.demoReview
        ? "guest demo review"
        : "separate reviewer session";
      c!.revision++;
      break;
    }
    case "enqueue": {
      const c = s.candidate;
      assert(c && c.id === a.candidateId, "Unknown candidate");
      assert(
        c!.revision === a.expectedRevision,
        "Candidate changed.",
        409,
        "VERSION_CONFLICT",
      );
      assert(
        c!.status === "approved" && c!.fingerprint === fingerprint(s),
        "Approval is missing or stale.",
        409,
        "STALE_APPROVAL",
      );
      if (c!.plan.mode === "scheduled")
        assert(
          Date.parse(c!.plan.at) > now,
          "Dispatch time passed. Prepare a new plan.",
          409,
        );
      c!.status = "queued";
      c!.revision++;
      break;
    }
    case "cancelSchedule": {
      const c = s.candidate;
      assert(c && c.id === a.candidateId, "Unknown candidate");
      assert(
        c!.status !== "delivered",
        "Already delivered messages cannot be recalled.",
        409,
      );
      c!.status = "cancelled";
      c!.fence++;
      c!.revision++;
      c!.reason =
        "Cancelled. Any already committed messages remain in the sandbox.";
      break;
    }
    case "trackEvent": {
      assert(
        a.eventType !== "message_written",
        "Message written events are server-owned",
      );
      assert(
        s.players.some((p) => p.id === a.playerId),
        "Unknown player",
      );
      if (a.receiptId)
        assert(
          s.receipts.some(
            (r) =>
              r.id === a.receiptId &&
              r.playerId === a.playerId &&
              r.status === "delivered",
          ),
          "Unknown delivered receipt",
        );
      if (["inbox_opened", "cta_followed"].includes(a.eventType))
        assert(a.receiptId, "A delivered receipt is required");
      if (
        !s.events.some(
          (e) =>
            e.type === a.eventType &&
            e.receiptId === a.receiptId &&
            e.playerId === a.playerId,
        )
      )
        s.events.push({
          id: uid(),
          receiptId: a.receiptId,
          playerId: a.playerId,
          type: a.eventType,
          at: iso(now),
        });
      break;
    }
    case "reset":
      break;
    default:
      throw new DomainError(400, "Unknown action");
  }
  s.revision++;
  s.audience = evaluate(s.players, s.rules, now);
  for (const p of s.proposals)
    if (p.status === "pending")
      p.conflict = s.documents[p.documentId].fields[p.field] !== p.baseValue;
  return s;
}
