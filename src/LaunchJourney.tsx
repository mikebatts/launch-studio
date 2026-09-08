import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  LoaderCircle,
  Sparkles,
  Send,
  BookOpen,
} from "lucide-react";
import type {
  DocumentId,
  Field,
  Fields,
  Receipt,
  WorkspaceState,
} from "../shared/types";
import type { Command } from "./App";
import { Eligibility, MessagePreview } from "./ui";
import { WorkspaceNav } from "./components/WorkspaceNav";
import {
  ReviewQueue,
  ReviewAcknowledge,
  reviewedCount,
  documentLabel,
} from "./components/ReviewQueue";
import { RevisionComparison } from "./components/ReviewPatterns";

const sampleId: DocumentId = "email-sample";
const stages = ["Invitation", "Learners", "Changes", "Review"];
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
type Props = {
  state: WorkspaceState;
  fields: Fields;
  dirty: boolean;
  unsaved: boolean;
  busy: boolean;
  error: string;
  onEdit: (field: Field, value: string) => void;
  onSave: () => Promise<boolean>;
  command: Command;
  onWorkspace: (tab?: "Compose" | "Review" | "Delivery") => void;
  onSources: () => void;
  onRuns: () => void;
  onAbout: () => void;
  onDestination: (receipt?: Receipt, playerId?: string) => void;
};

export function LaunchJourney({
  state,
  fields,
  dirty,
  unsaved,
  busy,
  error,
  onEdit,
  onSave,
  command,
  onWorkspace,
  onSources,
  onRuns,
  onAbout,
  onDestination,
}: Props) {
  const [step, setStep] = useState(() => {
    if (!state.demoReview && state.role === "reviewer") return 4;
    try {
      const value = Number(
        sessionStorage.getItem(`launch-journey:${state.id}`),
      );
      return Number.isInteger(value) && value >= 0 && value <= 4 ? value : 0;
    } catch {
      return 0;
    }
  });
  const [person, setPerson] = useState("sam");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [headlineInstruction, setHeadlineInstruction] = useState("");
  const [reviewId, setReviewId] = useState<DocumentId>(sampleId);
  const [openedReceipt, setOpenedReceipt] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [nextDate, setNextDate] = useState(() =>
    new Date(new Date(state.course.availability).getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const actionLock = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(`launch-journey:${state.id}`, String(step));
    } catch {}
    heading.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, [step, state.id]);
  const locked = busy || working;
  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setWorking(true);
    try {
      await action();
    } finally {
      actionLock.current = false;
      setWorking(false);
    }
  }
  const samplePlayer = state.players.find((p) => p.id === "sam")!;
  const player = state.players.find((p) => p.id === person) ?? samplePlayer;
  const evaluation = state.audience.players.find(
    (p) => p.playerId === player.id,
  );
  const chosenId: DocumentId = `email-${evaluation?.variant ?? "sample"}`;
  const chosenDoc = state.documents[chosenId];
  const chosenFields = chosenId === sampleId ? fields : chosenDoc.fields;
  const pending = state.proposals.filter((p) => p.status === "pending");
  const dateProposals = pending.filter(
    (p) => p.origin === "source revision" && p.field === "dateLine",
  );
  const dateConflict = dateProposals.some(
    (p) => state.documents[p.documentId].fields[p.field] !== p.baseValue,
  );
  const modelProposals = pending.filter(
    (p) => p.documentId === sampleId && p.origin !== "source revision",
  );
  const activeRun = [...state.runs]
    .reverse()
    .find((r) => r.targets.includes(sampleId));
  const generating = state.runs.some(
    (r) => r.status === "queued" || r.status === "running",
  );
  const headlinePending = modelProposals.some((p) => p.field === "headline");
  const candidate = state.candidate;
  const receipts = state.receipts.filter(
    (r) => r.releaseId === candidate?.id && r.status === "delivered",
  );
  const receipt = receipts.find((r) => r.id === openedReceipt);
  const preferredReceipt =
    receipts.find((r) => r.playerId === "sam" && r.channel === "email") ??
    receipts[0];
  // A delivered receipt remains historical. New edits need a new release.
  const releaseMatches =
    candidate &&
    candidate.sourceRevision === state.course.sourceRevision &&
    Object.values(state.documents).every(
      (doc) => candidate.documents[doc.id].revision === doc.revision,
    ) &&
    state.rules.every(
      (rule) => candidate.ruleRevisions[rule.id] === rule.revision,
    );
  const delivered =
    candidate?.status === "delivered" && releaseMatches && !unsaved;
  const hasRelease =
    candidate &&
    !["paused", "cancelled"].includes(candidate.status) &&
    (candidate.status !== "delivered" || delivered);
  const frozenDoc = hasRelease
    ? candidate.documents[reviewId]
    : state.documents[reviewId];
  const returning =
    state.course.sourceRevision > 1 ||
    state.documents[sampleId].revision > 1 ||
    !!candidate;
  const primary = (label: string, action: () => void, disabled = false) => (
    <button
      className="journey-primary"
      disabled={locked || disabled}
      onClick={action}
    >
      {working ? <LoaderCircle className="journey-spin" size={18} /> : null}
      {label}
      <ArrowRight size={17} />
    </button>
  );
  const go = (next: number) => {
    if (!locked) setStep(next);
  };

  return (
    <div className="launch-journey">
      <WorkspaceNav
        mode="guided"
        onAbout={onAbout}
        disabled={locked}
        onHome={() => go(0)}
        onChange={(mode) => {
          if (mode === "workspace") onWorkspace();
        }}
      />
      {state.role === "reviewer" && step < 4 && (
        <div className="journey-role-note">
          <span>
            {state.demoReview
              ? "You’re in the demo reviewer role. Switch to operator to edit this launch."
              : "Reviewer session. Editing stays with the operator."}
          </span>
          {state.demoReview && (
            <button
              className="journey-text"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  await command({ type: "switchRole", role: "operator" });
                })
              }
            >
              Return to operator <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="journey-error" role="alert">
          {error}
          <button onClick={() => onWorkspace("Review")}>
            Inspect workspace
          </button>
        </div>
      )}
      {step === 0 ? (
        <main className="journey-start">
          <div className="journey-introduction">
            <p className="journey-eyebrow">AN AI-ASSISTED COURSE LAUNCH</p>
            <h1 ref={heading} tabIndex={-1}>
              From course brief
              <br />
              to player inbox.
            </h1>
            <p className="journey-lead">
              Prepare an invitation, check who should receive it, and keep it
              accurate when the plan changes.
            </p>
            {primary(
              returning ? "Continue this launch" : "Start this launch",
              () => go(1),
            )}
            <p className="journey-small">
              {returning
                ? "Your saved work is still here."
                : "A prepared, editable example. No setup needed."}
            </p>
          </div>
          <article className="journey-brief">
            <img
              src="/course-art.svg"
              alt="A knight threatening two pieces in Spot the Fork"
            />
            <div>
              <p className="journey-eyebrow">YOUR BRIEF</p>
              <h2>Launch {state.course.title}.</h2>
              <p>
                Introduce a tactics course to 800–1200 rapid players. Diamond
                learners get included access; others can try the free sample.
              </p>
              <dl>
                <div>
                  <dt>Course opens</dt>
                  <dd>{dateLabel(state.course.availability)}</dd>
                </div>
                <div>
                  <dt>Channels</dt>
                  <dd>Email & in-app</dd>
                </div>
              </dl>
            </div>
          </article>
        </main>
      ) : (
        <main className="journey-main">
          <div className="journey-position">
            <button
              className="journey-text"
              disabled={locked}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <span>
              {step} of 4 <i>·</i> {stages[step - 1]}
            </span>
            <div className="journey-progress" aria-hidden="true">
              {stages.map((s, i) => (
                <span key={s} className={i < step ? "reached" : ""} />
              ))}
            </div>
          </div>
          {step === 1 && (
            <>
              <header className="journey-heading">
                <h1 ref={heading} tabIndex={-1}>
                  Prepare the invitation.
                </h1>
                <p>
                  Start with Sam’s free-sample email. Make the copy yours, or
                  ask AI for a new headline.
                </p>
              </header>
              <div className="journey-columns">
                <section
                  className="journey-editor"
                  aria-label="Edit Sam's invitation"
                >
                  <div className="journey-note">
                    <BookOpen size={18} />
                    <span>
                      {state.course.title} · Course opens{" "}
                      {dateLabel(state.course.availability)}. The free sample is
                      available now.
                    </span>
                  </div>
                  <fieldset disabled={state.role !== "operator" || locked}>
                    <label htmlFor="journey-headline">Headline</label>
                    <textarea
                      id="journey-headline"
                      rows={2}
                      value={fields.headline}
                      onChange={(e) => onEdit("headline", e.target.value)}
                    />
                    <label htmlFor="journey-body">Message</label>
                    <textarea
                      id="journey-body"
                      rows={5}
                      value={fields.body}
                      onChange={(e) => onEdit("body", e.target.value)}
                    />
                  </fieldset>
                  <div className="journey-edit-status">
                    <span role="status">
                      {dirty
                        ? "Unsaved edits"
                        : state.documents[sampleId].origin === "supplied sample"
                          ? "Prepared sample copy"
                          : "Saved to this launch"}
                    </span>
                    <button
                      className="journey-text"
                      disabled={locked || !dirty}
                      onClick={() =>
                        void run(async () => {
                          await onSave();
                        })
                      }
                    >
                      Save changes
                    </button>
                  </div>
                  <div className="journey-ai decision-card">
                    <header className="decision-card-header">
                      <div>
                        <span className="decision-card-icon">
                          <Sparkles size={18} />
                        </span>
                        <h2>
                          {headlinePending
                            ? "Choose your headline"
                            : "Headline assistant"}
                        </h2>
                      </div>
                      <span className="decision-badge">
                        {headlinePending ? "Ready to review" : "Optional"}
                      </span>
                    </header>
                    {!headlinePending && (
                      <div className="decision-card-content">
                        <label
                          className="journey-small"
                          htmlFor="headline-direction"
                        >
                          Give the headline a direction <span>(optional)</span>
                        </label>
                        <input
                          id="headline-direction"
                          className="journey-direction"
                          type="text"
                          maxLength={300}
                          placeholder="e.g. Make it more playful"
                          value={headlineInstruction}
                          onChange={(event) =>
                            setHeadlineInstruction(event.target.value)
                          }
                        />
                        <button
                          className="journey-secondary"
                          disabled={
                            locked ||
                            generating ||
                            headlinePending ||
                            state.role !== "operator" ||
                            !state.model.available
                          }
                          onClick={() =>
                            void run(async () => {
                              if (await onSave())
                                await command({
                                  type: "startGeneration",
                                  targets: [sampleId],
                                  fields: ["headline"],
                                  instructions:
                                    "Write a NEW concise headline inviting a beginner to try the knight-fork sample. Use different wording from the current headline. No promises about rating gains. Preserve the supplied course facts. " +
                                    headlineInstruction.trim(),
                                });
                            })
                          }
                        >
                          <Sparkles size={16} />
                          {generating
                            ? "Drafting a headline…"
                            : headlinePending
                              ? "Review the suggestion below"
                              : dirty
                                ? "Save & suggest a headline"
                                : "Suggest a headline"}
                        </button>
                        <p className="journey-small">
                          {!state.model.available
                            ? "AI is unavailable. You can keep editing the prepared copy."
                            : "A new suggestion won’t replace your saved copy."}
                        </p>
                      </div>
                    )}
                    {activeRun &&
                      !headlinePending &&
                      activeRun.status !== "completed" && (
                        <div className="journey-run" role="status">
                          <span>
                            {generating ? (
                              <LoaderCircle
                                className="journey-spin"
                                size={14}
                              />
                            ) : null}
                            {activeRun.status === "queued"
                              ? "Waiting for the writer…"
                              : activeRun.status === "running"
                                ? "Writing your suggestion…"
                                : activeRun.status === "failed" ||
                                    activeRun.status === "partial"
                                  ? "No new headline yet"
                                  : activeRun.status === "cancelled"
                                    ? "Drafting stopped. Your copy is unchanged."
                                    : headlinePending
                                      ? "Suggestion ready to review"
                                      : "Suggestion reviewed"}
                          </span>
                          {generating && (
                            <button
                              className="journey-text"
                              disabled={locked || state.role !== "operator"}
                              onClick={() =>
                                void command({
                                  type: "cancelGeneration",
                                  runId: state.runs.find(
                                    (r) =>
                                      r.status === "queued" ||
                                      r.status === "running",
                                  )!.id,
                                })
                              }
                            >
                              Stop drafting
                            </button>
                          )}
                        </div>
                      )}
                    {activeRun &&
                      ["failed", "partial"].includes(activeRun.status) && (
                        <p className="journey-ai-error" role="alert">
                          {activeRun.error ||
                            "The writer couldn't finish. Your copy is unchanged."}{" "}
                          You can adjust the direction above and suggest again.
                        </p>
                      )}
                    {modelProposals.map((p) => (
                      <div className="journey-proposal" key={p.id}>
                        <RevisionComparison
                          current={
                            state.documents[p.documentId].fields[p.field]
                          }
                          proposed={p.proposedValue}
                          provenance="AI SUGGESTION"
                        />
                        <div className="journey-inline-actions decision-card-actions">
                          <button
                            className="journey-primary"
                            disabled={
                              locked || dirty || state.role !== "operator"
                            }
                            onClick={() =>
                              void run(async () => {
                                await command({
                                  type: "applyProposal",
                                  proposalId: p.id,
                                  expectedRevision:
                                    state.documents[p.documentId].revision,
                                  resolution: "use-proposal",
                                });
                              })
                            }
                          >
                            Use this {p.field}
                          </button>
                          <button
                            className="journey-text"
                            disabled={locked || state.role !== "operator"}
                            onClick={() =>
                              void command({
                                type: "rejectProposal",
                                proposalId: p.id,
                              })
                            }
                          >
                            Keep current copy
                          </button>
                        </div>
                        {dirty && (
                          <p className="journey-small">
                            Save your edits before reviewing this suggestion.
                          </p>
                        )}
                      </div>
                    ))}
                    <footer className="decision-card-meta">
                      <span>
                        {headlinePending
                          ? "Only the headline changes."
                          : "Uses the confirmed course brief."}
                      </span>
                      <button className="journey-text" onClick={onRuns}>
                        Drafting details <ChevronRight size={14} />
                      </button>
                    </footer>
                  </div>
                </section>
                <button
                  className="journey-mobile-preview journey-text"
                  aria-expanded={previewExpanded}
                  onClick={() => setPreviewExpanded(!previewExpanded)}
                >
                  {previewExpanded
                    ? "Hide email preview"
                    : "Preview Sam’s email"}
                  <ChevronRight size={14} />
                </button>
                <section
                  className={`journey-preview draft-preview ${previewExpanded ? "expanded" : ""}`}
                >
                  <p className="journey-preview-label">
                    EMAIL FOR SAM <span>Basic · Free sample</span>
                  </p>
                  <MessagePreview
                    fields={fields}
                    channel="email"
                    variant="sample"
                    player={samplePlayer}
                    template={state.documents[sampleId].template}
                    onCta={() => onDestination()}
                  />
                </section>
              </div>
              <footer className="journey-next">
                <span>Your edits carry into the next step.</span>
                {primary(
                  dirty ? "Save & check the learners" : "Check the learners",
                  () =>
                    void run(async () => {
                      if (await onSave()) setStep(2);
                    }),
                )}
              </footer>
            </>
          )}
          {step === 2 && (
            <>
              <header className="journey-heading">
                <h1 ref={heading} tabIndex={-1}>
                  Same course. Different invitations.
                </h1>
                <p>
                  Access determines the message. Ownership determines whether
                  someone needs one at all.
                </p>
              </header>
              <div className="journey-columns journey-audience">
                <section className="journey-people">
                  <div className="journey-player-list">
                    {["sam", "alex", "casey"].map((id) => {
                      const p = state.players.find((p) => p.id === id)!;
                      const result = state.audience.players.find(
                        (e) => e.playerId === id,
                      );
                      return (
                        <button
                          key={id}
                          aria-pressed={person === id}
                          className={person === id ? "selected" : ""}
                          onClick={() => setPerson(id)}
                        >
                          <span className="journey-person-mark">
                            {p.name[0]}
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.ownsCourse
                                ? "Already owns the course"
                                : p.membership + " member"}
                            </small>
                          </span>
                          <span className="journey-outcome">
                            {!result?.email
                              ? "No email"
                              : result.variant === "included"
                                ? "Included"
                                : "Free sample"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Eligibility
                    player={player}
                    evaluation={evaluation}
                    channel="email"
                  />
                  <p className="journey-small">
                    These are sample players. Switching previews does not change
                    the launch’s audience.
                  </p>
                  <button
                    className="journey-text"
                    onClick={() => onWorkspace()}
                  >
                    Inspect channels & audience rules <ChevronRight size={14} />
                  </button>
                </section>
                <section className="journey-preview" key={person}>
                  <p className="journey-preview-label">
                    {evaluation?.email
                      ? `EMAIL FOR ${player.name.toUpperCase()}`
                      : "EXCLUDED FROM THIS LAUNCH"}
                  </p>
                  {evaluation?.email ? (
                    <MessagePreview
                      fields={chosenFields}
                      channel="email"
                      variant={evaluation.variant}
                      player={player}
                      template={chosenDoc.template}
                      onCta={() => onDestination(undefined, player.id)}
                    />
                  ) : (
                    <div className="journey-no-message">
                      <Check size={30} />
                      <h2>No invitation for {player.name}.</h2>
                      <p>
                        {player.ownsCourse
                          ? "They already own the course. There’s no need to sell it to them again."
                          : "This player does not meet the current email audience rules."}
                      </p>
                      <span>No message will be sent under these rules.</span>
                    </div>
                  )}
                </section>
              </div>
              <footer className="journey-next">
                <span>Next: the course date changes after you’ve edited.</span>
                {primary("Review a change", () => go(3))}
              </footer>
            </>
          )}
          {step === 3 && (
            <>
              <header className="journey-heading">
                <h1 ref={heading} tabIndex={-1}>
                  Update the date. Keep your copy.
                </h1>
                <p>
                  Move the course date, then review only the affected copy. Your
                  headline and message stay in place.
                </p>
              </header>
              <section
                className={`journey-change decision-card ${dateProposals.length ? "has-updates" : ""}`}
              >
                <header className="decision-card-header">
                  <div>
                    <h2>Course availability</h2>
                  </div>
                  <span className="decision-badge">
                    Source revision {state.course.sourceRevision}
                  </span>
                </header>
                <div className="journey-change-input">
                  <div className="date-summary">
                    <span>Confirmed date</span>
                    <strong>{dateLabel(state.course.availability)}</strong>
                    <span className="preserved-note">
                      <Check size={14} /> Your headline and message are
                      preserved
                    </span>
                  </div>
                  {!dateProposals.length && (
                    <div className="journey-date-input">
                      <label htmlFor="journey-date">New date</label>
                      <input
                        id="journey-date"
                        disabled={locked || state.role !== "operator"}
                        type="date"
                        value={nextDate}
                        onChange={(e) => setNextDate(e.target.value)}
                      />
                      {primary(
                        "Review date change",
                        () =>
                          void run(async () => {
                            await command({
                              type: "reviseSource",
                              expectedRevision: state.course.sourceRevision,
                              availability: `${nextDate}T13:00:00.000Z`,
                            });
                          }),
                        !nextDate ||
                          nextDate === state.course.availability.slice(0, 10) ||
                          state.role !== "operator",
                      )}
                    </div>
                  )}
                </div>
                <div className="journey-change-result">
                  {dateProposals.length ? (
                    <>
                      <div className="change-impact">
                        <strong>
                          {dateProposals.length} drafts need a date correction
                        </strong>
                        <span>Email and in-app · date line only</span>
                      </div>
                      <RevisionComparison
                        current={
                          state.documents[dateProposals[0].documentId].fields
                            .dateLine
                        }
                        proposed={dateProposals[0].proposedValue}
                        provenance="NEW DATE"
                      />
                      <ul
                        className="affected-documents"
                        aria-label="Affected messages"
                      >
                        {dateProposals.map((p) => (
                          <li key={p.id}>{documentLabel(p.documentId)}</li>
                        ))}
                      </ul>
                      <div className="decision-card-actions">
                        {dateConflict ? (
                          <>
                            <p className="journey-warning">
                              A date line was edited separately. Compare that
                              change before applying it.
                            </p>
                            <button
                              className="journey-secondary"
                              onClick={onSources}
                            >
                              Compare competing edits
                            </button>
                          </>
                        ) : (
                          primary(
                            "Apply date corrections",
                            () =>
                              void run(async () => {
                                for (const p of dateProposals) {
                                  if (
                                    !(await command({
                                      type: "applyProposal",
                                      proposalId: p.id,
                                      expectedRevision:
                                        state.documents[p.documentId].revision,
                                    }))
                                  )
                                    break;
                                }
                              }),
                            unsaved || state.role !== "operator",
                          )
                        )}
                        <button className="journey-text" onClick={onSources}>
                          Inspect individual updates <ChevronRight size={14} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="journey-eyebrow">YOUR SAVED HEADLINE</p>
                      <blockquote>
                        {state.documents[sampleId].fields.headline}
                      </blockquote>
                      <p>
                        {state.course.sourceRevision > 1
                          ? "The current source revision is saved. Review any remaining suggestions before preparing the launch."
                          : "The date is linked to the course brief. Editing the brief creates proposals—not replacements."}
                      </p>
                    </>
                  )}
                  {unsaved && (
                    <p className="journey-warning">
                      You have unsaved edits. Return to the invitation or full
                      workspace to save them first.
                    </p>
                  )}
                  {!dateProposals.length && (
                    <button className="journey-text" onClick={onSources}>
                      Inspect source history <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </section>
              <footer className="journey-next">
                <span>
                  {pending.length
                    ? `${pending.length} suggestions still need a decision.`
                    : "Next: approve the version that will be delivered."}
                </span>
                {primary(
                  "Review the launch",
                  () => go(4),
                  pending.length > 0 || unsaved,
                )}
              </footer>
            </>
          )}
          {step === 4 && (
            <>
              <header className="journey-heading">
                <h1 ref={heading} tabIndex={-1}>
                  {delivered
                    ? "The invitation arrived."
                    : "Review it. Then send it."}
                </h1>
                <p>
                  {delivered
                    ? "Open the delivered message and follow it into the course sample."
                    : "Check the copy and audience together. Delivery uses the exact version approved here."}
                </p>
              </header>
              {delivered ? (
                <section className="journey-delivered">
                  {receipt ? (
                    <>
                      <p className="journey-preview-label">
                        DELIVERED TO {receipt.playerName.toUpperCase()} ·{" "}
                        {receipt.channel.toUpperCase()}
                      </p>
                      <MessagePreview
                        fields={receipt.fields}
                        channel={receipt.channel}
                        variant={receipt.variant}
                        template={receipt.template}
                        player={state.players.find(
                          (p) => p.id === receipt.playerId,
                        )}
                        receipt
                        onCta={() => onDestination(receipt)}
                      />
                    </>
                  ) : (
                    <div className="journey-delivery-summary">
                      <span className="journey-success">
                        <Check size={30} />
                      </span>
                      <h2>{receipts.length} messages delivered.</h2>
                      <p>
                        Saved in this launch’s demo inbox—not sent to real
                        players.
                      </p>
                      {preferredReceipt ? (
                        primary(
                          `Open ${preferredReceipt.playerName}’s ${preferredReceipt.channel === "email" ? "email" : "in-app message"}`,
                          () =>
                            void run(async () => {
                              if (
                                await command({
                                  type: "trackEvent",
                                  eventType: "inbox_opened",
                                  playerId: preferredReceipt.playerId,
                                  receiptId: preferredReceipt.id,
                                })
                              )
                                setOpenedReceipt(preferredReceipt.id);
                            }),
                        )
                      ) : (
                        <p>
                          No deliverable messages matched this release. Inspect
                          the delivery log for suppression reasons.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="journey-finish">
                    <strong>One launch, followed through.</strong>
                    <p>
                      Your edits, source changes and approval led to this saved
                      message.
                    </p>
                    <button
                      className="journey-text"
                      onClick={() => onWorkspace("Delivery")}
                    >
                      Inspect delivery records <ChevronRight size={14} />
                    </button>
                    <button className="journey-text" onClick={onAbout}>
                      How it’s built <ChevronRight size={14} />
                    </button>
                  </div>
                </section>
              ) : (
                <div className="journey-columns journey-review">
                  <ReviewQueue
                    state={state}
                    selected={reviewId}
                    onSelect={setReviewId}
                    command={command}
                    disabled={locked}
                  />
                  <section className="journey-preview review-message-preview">
                    <header
                      className="review-preview-heading"
                      data-review-heading
                      tabIndex={-1}
                    >
                      <strong>{documentLabel(reviewId)}</strong>
                      <span>Copy revision {frozenDoc.revision}</span>
                    </header>
                    <MessagePreview
                      fields={frozenDoc.fields}
                      channel={frozenDoc.channel}
                      variant={frozenDoc.variant}
                      template={frozenDoc.template}
                      player={
                        frozenDoc.variant === "sample"
                          ? samplePlayer
                          : state.players.find((p) => p.id === "alex")
                      }
                      inertCta
                      onCta={() => {}}
                    />
                    <ReviewAcknowledge
                      state={state}
                      selected={reviewId}
                      onSelect={setReviewId}
                      command={command}
                      disabled={locked || unsaved}
                    />
                  </section>
                  <section className="journey-release">
                    <p className="journey-eyebrow">
                      {hasRelease ? "RELEASE SUMMARY" : "LAUNCH SUMMARY"}
                    </p>
                    <h2>
                      {hasRelease
                        ? {
                            "needs-review": "Review in progress",
                            approved: "Approved for delivery",
                            queued: "Delivery queued",
                            delivering: "Delivering…",
                            delivered: "Delivered",
                            paused: "Changes need review",
                            cancelled: "Cancelled",
                          }[candidate.status]
                        : "Ready for review?"}
                    </h2>
                    <dl>
                      <div>
                        <dt>Messages</dt>
                        <dd>
                          {hasRelease
                            ? candidate.bindings.length
                            : state.audience.players.reduce(
                                (n, p) => n + Number(p.email) + Number(p.inapp),
                                0,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt>Course opens</dt>
                        <dd>
                          {dateLabel(
                            hasRelease
                              ? candidate.destination.availability
                              : state.course.availability,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Delivery</dt>
                        <dd>
                          {hasRelease && candidate.plan.mode === "scheduled"
                            ? "Scheduled · " + dateLabel(candidate.plan.at)
                            : "Now · demo inbox only"}
                        </dd>
                      </div>
                    </dl>
                    {candidate?.reason && (
                      <p className="journey-warning">{candidate.reason}</p>
                    )}
                    {(unsaved || pending.length > 0) && (
                      <p className="journey-warning">
                        {unsaved ? "Save your local edits. " : ""}
                        {pending.length
                          ? `${pending.length} suggestions need a decision.`
                          : ""}
                        <button className="journey-text" onClick={onSources}>
                          Review suggestions
                        </button>
                      </p>
                    )}
                    {!hasRelease &&
                      primary(
                        "Prepare this version",
                        () =>
                          void run(async () => {
                            await command({
                              type: "prepareCandidate",
                              mode: "immediate",
                            });
                          }),
                        unsaved ||
                          pending.length > 0 ||
                          state.role !== "operator",
                      )}
                    {candidate?.status === "needs-review" &&
                      state.role === "operator" && (
                        <>
                          <p className="journey-small">
                            Review the four messages before signing off. In this
                            sample, you’ll act as the reviewer yourself.
                          </p>
                          {state.demoReview ? (
                            primary(
                              "Begin message review",
                              () =>
                                void run(async () => {
                                  if (await command({ type: "requestReview" }))
                                    await command({
                                      type: "switchRole",
                                      role: "reviewer",
                                    });
                                }),
                            )
                          ) : (
                            <button
                              className="journey-secondary"
                              onClick={() => onWorkspace("Review")}
                            >
                              Invite a reviewer
                            </button>
                          )}
                        </>
                      )}
                    {candidate?.status === "needs-review" &&
                      state.role === "reviewer" && (
                        <>
                          <p className="journey-small">
                            {state.demoReview
                              ? "Demo reviewer · controlled by you"
                              : "Reviewer session"}
                            . {reviewedCount(candidate)} of 4 messages reviewed.
                            Approval covers the complete version and recipient
                            list.
                          </p>
                          {primary(
                            "Approve this version",
                            () =>
                              void run(async () => {
                                await command({
                                  type: "approveCandidate",
                                  candidateId: candidate.id,
                                  expectedRevision: candidate.revision,
                                });
                              }),
                            pending.length > 0 ||
                              unsaved ||
                              reviewedCount(candidate) < 4,
                          )}
                        </>
                      )}
                    {candidate?.status === "approved" && (
                      <>
                        <p className="journey-small">
                          {candidate.approvalKind === "guest demo review"
                            ? "Approved by the demo reviewer (you)."
                            : "Approved by the reviewer."}{" "}
                          {state.role === "reviewer"
                            ? state.demoReview
                              ? "Next, deliver the approved messages to the demo inbox."
                              : "The operator can now send this approved version."
                            : ""}
                        </p>
                        {state.role === "operator"
                          ? primary(
                              "Send approved launch",
                              () =>
                                void run(async () => {
                                  await command({
                                    type: "enqueue",
                                    candidateId: candidate.id,
                                    expectedRevision: candidate.revision,
                                  });
                                }),
                              unsaved,
                            )
                          : state.demoReview
                            ? primary(
                                "Send approved launch",
                                () =>
                                  void run(async () => {
                                    if (
                                      await command({
                                        type: "switchRole",
                                        role: "operator",
                                      })
                                    )
                                      await command({
                                        type: "enqueue",
                                        candidateId: candidate.id,
                                        expectedRevision: candidate.revision,
                                      });
                                  }),
                              )
                            : null}
                      </>
                    )}
                    {(candidate?.status === "queued" ||
                      candidate?.status === "delivering") && (
                      <div className="journey-run" role="status">
                        <LoaderCircle className="journey-spin" size={18} />
                        Delivering to the demo inbox…
                      </div>
                    )}
                    <button
                      className="journey-text"
                      onClick={() => onWorkspace("Review")}
                    >
                      Comments, scheduling & detailed review{" "}
                      <ChevronRight size={14} />
                    </button>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      )}
      <footer className="journey-byline">
        <span>
          Built by Michael Battaglia · Independent exploration, not a Chess.com
          product.
        </span>
        <button className="journey-text" onClick={onAbout}>
          About this build
        </button>
      </footer>
    </div>
  );
}
