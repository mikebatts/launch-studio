import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  GitCompareArrows,
  Link2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  AudienceRule,
  DocumentId,
  Field,
  Fields,
  Proposal,
  Receipt,
  WorkspaceState,
} from "../shared/types";
import {
  ReviewQueue,
  ReviewAcknowledge,
  reviewedCount,
} from "./components/ReviewQueue";
import { DOCUMENT_IDS } from "../shared/types";
import type { Command } from "./App";
import { Avatar, Badge, MessagePreview } from "./ui";
import { RevisionComparison, AsyncActivity } from "./components/ReviewPatterns";
type Props = { state: WorkspaceState; command: Command };
const prettyDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

export function Sources({
  state,
  command,
  documentId,
  focusedField,
  unsavedFields,
  onSave,
}: Props & {
  documentId: DocumentId;
  focusedField: Field;
  unsavedFields?: Fields;
  onSave: () => Promise<void>;
}) {
  const [date, setDate] = useState(state.course.availability.slice(0, 10)),
    [showAll, setShowAll] = useState(false);
  const pending = state.proposals.filter((p) => p.status === "pending");
  const proposals = showAll
    ? pending
    : pending.filter((p) => p.documentId === documentId);
  return (
    <div className="source-content">
      <div className="source-update">
        <div className="source-file-icon">
          <FileText size={25} />
        </div>
        <div>
          <div className="eyebrow">
            {state.course.availability.startsWith("2026-09-21")
              ? "SUPPLIED SOURCE REVISION"
              : "CURRENT COURSE BRIEF"}
          </div>
          <h3>
            {state.course.availability.startsWith("2026-09-21")
              ? "The course needs one more week."
              : `Availability is now ${prettyDate(state.course.availability)}.`}
          </h3>
          <p>
            {state.course.availability.startsWith("2026-09-21")
              ? "Move availability from September 21 to September 28. We’ll propose changes to linked copy, never replace your edits."
              : "Review the suggestions against your current copy. To change the date again, use “Make another source revision” below."}
          </p>
        </div>
        {state.course.availability.startsWith("2026-09-21") && (
          <button
            className="primary"
            onClick={() =>
              void command({
                type: "reviseSource",
                expectedRevision: state.course.sourceRevision,
                availability: "2026-09-28T09:00:00-04:00",
              })
            }
          >
            Review this update
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <div className="fact-grid">
        <div>
          <span className="eyebrow">AUTHORITATIVE AVAILABILITY</span>
          <h3>{prettyDate(state.course.availability)}</h3>
          <p>
            {state.course.timeZone} · source revision{" "}
            {state.course.sourceRevision}
          </p>
        </div>
        <div>
          <span className="eyebrow">YOUR SELECTED FIELD</span>
          <h3>{focusedField === "dateLine" ? "Availability" : focusedField}</h3>
          <p>
            {documentId} · draft v{state.documents[documentId].revision}
          </p>
        </div>
      </div>
      <details className="source-excerpts">
        <summary>
          <Link2 size={15} />
          Inspect confirmed facts and source excerpts
          <ChevronDown size={15} />
        </summary>
        {state.facts.map((f) => (
          <div key={`${f.id}-${f.sourceRevision}`} className="fact">
            <strong>{f.type}</strong>
            <Badge kind={f.confirmed ? "green" : "amber"}>
              {f.superseded
                ? "Superseded"
                : f.confirmed
                  ? "Confirmed"
                  : "Needs confirmation"}
            </Badge>
            <p>{f.value}</p>
            <blockquote>{f.excerpt}</blockquote>
            <small>
              {
                state.sources.find(
                  (s) => s.id === f.sourceId && s.revision === f.sourceRevision,
                )?.title
              }{" "}
              · v{f.sourceRevision}
            </small>
          </div>
        ))}
      </details>
      <div className="section-title">
        <div>
          <h3>
            Proposed changes <span>{pending.length}</span>
          </h3>
          <p>Compare the current message with each suggestion.</p>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          All four documents
        </label>
      </div>
      {unsavedFields && (
        <div className="notice amber">
          <span>
            You have unsaved edits in this document. Save them before resolving
            proposals so the comparison uses your latest copy.
          </span>
          <button className="secondary" onClick={() => void onSave()}>
            Save edits
          </button>
        </div>
      )}
      {proposals.length ? (
        proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            state={state}
            command={command}
            disabled={!!unsavedFields && p.documentId === documentId}
          />
        ))
      ) : (
        <div className="empty-inline">
          <CheckCircle2 size={22} />
          <div>
            <strong>
              {pending.length
                ? "No pending changes in this document."
                : "No pending suggestions."}
            </strong>
            <p>
              {pending.length
                ? "Turn on “All four documents” to review the remaining suggestions."
                : "Your authored edits are preserved. Release preparation separately checks the saved copy against current structured facts."}
            </p>
          </div>
        </div>
      )}
      <details className="source-excerpts">
        <summary>
          <RefreshCw size={15} />
          Make another source revision
          <ChevronDown size={15} />
        </summary>
        <div className="inline-form">
          <label>
            New availability
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={!date}
            onClick={() =>
              void command({
                type: "reviseSource",
                expectedRevision: state.course.sourceRevision,
                availability: `${date}T09:00:00-04:00`,
              })
            }
          >
            Propose date changes
          </button>
        </div>
        <p className="fine-print">
          A source revision pauses a dependent release for review. It does not
          move the delivery schedule.
        </p>
      </details>
    </div>
  );
}
function ProposalCard({
  proposal: p,
  state,
  command,
  disabled = false,
}: Props & { proposal: Proposal; disabled?: boolean }) {
  const doc = state.documents[p.documentId],
    current = doc.fields[p.field],
    conflict = p.conflict || current !== p.baseValue,
    [custom, setCustom] = useState(false),
    [merged, setMerged] = useState(p.proposedValue);
  return (
    <article className="proposal-card">
      <header>
        <div>
          <GitCompareArrows size={17} />
          <strong>{p.field === "dateLine" ? "Availability" : p.field}</strong>
          <span>{p.documentId}</span>
        </div>
        <Badge kind={conflict ? "amber" : "green"}>
          {conflict
            ? "Your edit needs a choice"
            : p.origin === "live model"
              ? "AI suggestion"
              : p.origin === "test replay"
                ? "Test replay suggestion"
                : "Linked source update"}
        </Badge>
      </header>
      <RevisionComparison
        current={current}
        proposed={p.proposedValue}
        provenance={`${p.origin === "live model" ? "AI PROPOSAL" : p.origin === "test replay" ? "TEST REPLAY PROPOSAL" : "PROPOSED SOURCE UPDATE"} · SOURCE V${p.sourceRevision}`}
        base={conflict ? p.baseValue : undefined}
        editor={
          custom ? (
            <textarea
              value={merged}
              onChange={(e) => setMerged(e.target.value)}
              aria-label="Merged proposal text"
            />
          ) : undefined
        }
      />
      <p className="proposal-note">{p.note}</p>
      <footer>
        <button
          className="text-button"
          disabled={disabled}
          onClick={() =>
            void command({ type: "rejectProposal", proposalId: p.id })
          }
        >
          Keep current copy
        </button>
        <div>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => setCustom(!custom)}
          >
            {custom ? "Use suggested text" : "Edit suggestion"}
          </button>
          <button
            className="primary small"
            disabled={disabled}
            onClick={() =>
              void command({
                type: "applyProposal",
                proposalId: p.id,
                expectedRevision: doc.revision,
                resolution: "use-proposal",
                ...(custom ? { mergedValue: merged } : {}),
              })
            }
          >
            <Check size={15} />
            Apply {custom ? "merged edit" : "change"}
          </button>
        </div>
      </footer>
    </article>
  );
}
export function Runs({
  state,
  command,
  documentId,
  focusedField = "headline",
}: Props & { documentId: DocumentId; focusedField?: Field }) {
  const [instructions, setInstructions] = useState(
      "Keep it warm, concise, and focused on the learning value. Preserve the confirmed course facts.",
    ),
    [scope, setScope] = useState("current"),
    [targetField, setTargetField] = useState<Field>(focusedField);
  return (
    <div className="run-content">
      <div className={`runtime-status ${state.model.available ? "ready" : ""}`}>
        <span className="status-dot" />
        <div>
          <strong>
            {state.model.available
              ? "Local model connected"
              : "Local model unavailable"}
          </strong>
          <p>
            {state.model.available
              ? `${state.model.model} · ${state.model.provider}`
              : state.model.reason ||
                "Connect the local Ollama runtime to generate new proposals."}
          </p>
        </div>
        <Badge>
          {state.generationBudget.used}/{state.generationBudget.limit} runs
        </Badge>
      </div>
      <p className="muted">
        Generate channel-specific draft proposals from your confirmed brief.
        Nothing replaces your copy until you apply it.
      </p>
      <label className="stacked-label">
        What should change?
        <textarea
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="stacked-label">
        Draft scope
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="field">One field in this document</option>
          <option value="current">Current document · {documentId}</option>
          <option value="all">All four channel / access documents</option>
        </select>
      </label>
      {scope === "field" && (
        <label className="stacked-label">
          Field to revise
          <select
            value={targetField}
            onChange={(e) => setTargetField(e.target.value as Field)}
          >
            <option value="headline">Headline</option>
            <option value="subject">Subject line</option>
            <option value="body">Message body</option>
          </select>
          <small>
            Availability and button access language stay bound to confirmed
            source facts.
          </small>
        </label>
      )}
      <button
        className="primary full"
        disabled={
          !state.model.available ||
          state.runs.some(
            (r) => r.status === "running" || r.status === "queued",
          )
        }
        onClick={() =>
          void command({
            type: "startGeneration",
            targets: scope === "all" ? DOCUMENT_IDS : [documentId],
            instructions,
            ...(scope === "field" ? { fields: [targetField] } : {}),
          })
        }
      >
        <Sparkles size={17} />
        Generate proposals
      </button>
      <div className="section-title">
        <h3>Run activity</h3>
        <span className="muted">Persists when you leave</span>
      </div>
      {state.runs.length ? (
        state.runs
          .slice()
          .reverse()
          .map((run) => (
            <article key={run.id} className="run-card">
              <header>
                <strong>Draft run · attempt {run.attempt}</strong>
                <Badge
                  kind={
                    run.status === "completed"
                      ? "green"
                      : run.status === "failed"
                        ? "red"
                        : "neutral"
                  }
                >
                  {run.status}
                </Badge>
              </header>
              <p>{run.instructions}</p>
              <AsyncActivity
                items={run.events.map((e) => ({
                  id: e.seq,
                  message: e.message,
                  at: e.at,
                }))}
              />
              {run.error && <p className="error-text">{run.error}</p>}
              <div className="button-row">
                {["running", "queued"].includes(run.status) ? (
                  <button
                    className="secondary"
                    onClick={() =>
                      void command({ type: "cancelGeneration", runId: run.id })
                    }
                  >
                    <Pause size={15} />
                    Cancel run
                  </button>
                ) : ["partial", "failed", "cancelled"].includes(run.status) ? (
                  <button
                    className="secondary"
                    disabled={!state.model.available}
                    onClick={() =>
                      void command({ type: "retryGeneration", runId: run.id })
                    }
                  >
                    <RefreshCw size={15} />
                    Retry unfinished drafts
                  </button>
                ) : null}
              </div>
            </article>
          ))
      ) : (
        <div className="empty-inline">
          <Sparkles size={22} />
          <div>
            <strong>No generation runs yet.</strong>
            <p>
              The starting documents are supplied sample copy, not model output.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
export function Brief({
  state,
  command,
  onRefresh,
  onSources,
}: Props & { onRefresh: () => Promise<void>; onSources: () => void }) {
  const [text, setText] = useState(""),
    [title, setTitle] = useState("Course brief"),
    [importing, setImporting] = useState(false),
    [error, setError] = useState("");
  async function importSource(file?: File) {
    setImporting(true);
    setError("");
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (file) {
        const data = new FormData();
        data.set("file", file);
        data.set("title", file.name);
        body = data;
      } else {
        body = JSON.stringify({ title, text });
        headers = { "Content-Type": "application/json" };
      }
      const r = await fetch("/api/import", { method: "POST", body, headers });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Import failed.");
      await onRefresh();
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="support-grid">
      <section className="surface">
        <div className="course-record">
          <img
            src="/course-art.svg"
            alt="Original Spot the Fork course artwork"
          />
          <div>
            <Badge kind="green">ORIGINAL COURSE</Badge>
            <h2>Spot the Fork</h2>
            <p>
              A short, practical introduction to seeing two threats at once.
            </p>
          </div>
        </div>
        <div className="record-facts">
          <div>
            <span>Availability</span>
            <strong>{prettyDate(state.course.availability)}</strong>
            <small>{state.course.timeZone}</small>
          </div>
          <div>
            <span>Level</span>
            <strong>800–1200</strong>
            <small>Rapid rating</small>
          </div>
          <div>
            <span>Destination</span>
            <strong>Playable sample</strong>
            <small>Available immediately</small>
          </div>
        </div>
        <div className="section-title">
          <h3>Sources & confirmed facts</h3>
          <button className="text-button" onClick={onSources}>
            Inspect changes
            <ArrowUpRight size={15} />
          </button>
        </div>
        {state.sources.map((source) => (
          <article
            key={`${source.id}-${source.revision}`}
            className="source-row"
          >
            <FileText size={20} />
            <div>
              <strong>{source.title}</strong>
              <p>
                Revision {source.revision} · {prettyDate(source.createdAt)}
              </p>
              <details>
                <summary>Read source</summary>
                <pre>{source.text}</pre>
              </details>
              {source.status === "unconfirmed" && (
                <ConfirmSource
                  sourceId={source.id}
                  command={command}
                  availability={state.course.availability}
                />
              )}
            </div>
            <Badge kind={source.status === "confirmed" ? "green" : "amber"}>
              {source.status === "confirmed" ? "Confirmed" : "Review facts"}
            </Badge>
          </article>
        ))}
      </section>
      <section className="surface import-panel">
        <div className="section-title">
          <div>
            <h2>Bring in your brief</h2>
            <p>Add a source, then confirm its facts.</p>
          </div>
          <Upload size={21} />
        </div>
        <label className="stacked-label">
          Source title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="stacked-label">
          Paste source text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Course goals, availability, access policy, audience intent…"
          />
        </label>
        <button
          className="primary full"
          disabled={importing || !text.trim()}
          onClick={() => void importSource()}
        >
          {importing ? "Reading source…" : "Import pasted brief"}
          <ArrowRight size={16} />
        </button>
        <div className="upload-divider">or upload a file</div>
        <label className="file-drop">
          <Upload size={22} />
          <strong>Choose a brief</strong>
          <span>Text, Markdown, or text-based PDF · up to 2 MB</span>
          <input
            type="file"
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importSource(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="fine-print">
          Scanned PDFs need a text version. Imported text stays unconfirmed
          until you review it.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
function ConfirmSource({
  sourceId,
  command,
  availability,
}: {
  sourceId: string;
  command: Command;
  availability: string;
}) {
  const [date, setDate] = useState(availability.slice(0, 10));
  return (
    <div className="confirm-source">
      <label>
        Confirm course availability
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button
        className="primary small"
        disabled={!date}
        onClick={() =>
          void command({
            type: "confirmSource",
            sourceId,
            availability: `${date}T09:00:00-04:00`,
          })
        }
      >
        Confirm source facts
      </button>
    </div>
  );
}
export function Audience({ state, command }: Props) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const shown = state.players.filter((p) => {
    const e = state.audience.players.find((e) => e.playerId === p.id);
    return (
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "eligible" ? e?.eligible : !e?.eligible))
    );
  });
  return (
    <div className="audience-page">
      <div className="audience-summary">
        <div>
          <strong>{state.audience.eligible}</strong>
          <span>eligible learners</span>
        </div>
        <div>
          <strong>{state.audience.email}</strong>
          <span>email recipients</span>
        </div>
        <div>
          <strong>{state.audience.inapp}</strong>
          <span>in-app recipients</span>
        </div>
        <div>
          <strong>{state.audience.overlap}</strong>
          <span>in both segments · deduplicated</span>
        </div>
        <p>
          Computed from {state.audience.total} synthetic players.
          <br />
          Rapid rating only. English locale.
        </p>
      </div>
      <div className="rule-grid">
        {state.rules.map((rule) => (
          <RuleEditor
            key={`${rule.id}-${rule.revision}`}
            rule={rule}
            command={command}
            count={
              state.audience.segments.find((s) => s.id === rule.id)?.count ?? 0
            }
          />
        ))}
      </div>
      <section className="surface player-list">
        <div className="section-title">
          <div>
            <h2>Every player has a reason.</h2>
            <p>
              Audience rules decide who qualifies. Preferences decide the
              channel.
            </p>
          </div>
          <div className="list-filters">
            <input
              aria-label="Search synthetic players"
              placeholder="Find a player…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Player eligibility filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All players</option>
              <option value="eligible">Eligible</option>
              <option value="excluded">Excluded</option>
            </select>
          </div>
        </div>
        <div className="player-table">
          <div className="player-table-head">
            <span>PLAYER</span>
            <span>RAPID / ACCESS</span>
            <span>CHANNELS</span>
            <span>EVALUATION</span>
          </div>
          {shown.slice(0, 60).map((p) => {
            const ev = state.audience.players.find((e) => e.playerId === p.id)!;
            return (
              <div className="player-table-row" key={p.id}>
                <div>
                  <Avatar player={p} size="small" />
                  <strong>{p.name}</strong>
                </div>
                <div>
                  {p.rating ?? "Unrated"} · {p.membership}
                  <small>
                    {p.ownsCourse
                      ? "Owns course"
                      : ev.variant === "included"
                        ? "Included access"
                        : "Free sample"}
                  </small>
                </div>
                <div>
                  <span className={ev.email ? "channel-yes" : "channel-no"}>
                    Email {ev.email ? "✓" : "—"}
                  </span>
                  <span className={ev.inapp ? "channel-yes" : "channel-no"}>
                    In-app {ev.inapp ? "✓" : "—"}
                  </span>
                </div>
                <div>
                  <Badge kind={ev.eligible ? "green" : "neutral"}>
                    {ev.eligible ? "Eligible" : "Excluded"}
                  </Badge>
                  <small>
                    {[...ev.reasons, ...ev.emailReasons, ...ev.inappReasons]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" · ") || "Matches the saved audience rules"}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
        <p className="fine-print">
          Showing {Math.min(shown.length, 60)} of {shown.length} matching
          players. Search to inspect any fixture.
        </p>
      </section>
    </div>
  );
}
function RuleEditor({
  rule,
  command,
  count,
}: {
  rule: AudienceRule;
  command: Command;
  count: number;
}) {
  const [draft, setDraft] = useState(rule),
    [dirty, setDirty] = useState(false);
  function patch(value: Partial<AudienceRule>) {
    setDraft((d) => ({ ...d, ...value }));
    setDirty(true);
  }
  return (
    <section className="surface rule-editor">
      <div className="section-title">
        <div>
          <span className="eyebrow">SAVED SEGMENT · V{rule.revision}</span>
          <h3>{rule.name}</h3>
        </div>
        <Badge kind="green">{count} players</Badge>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Include this segment in the launch
      </label>
      <div className="rule-fields">
        <label>
          Name
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <div className="range-fields">
          <label>
            Rapid rating, from
            <input
              type="number"
              min={0}
              max={4000}
              value={draft.minRating}
              onChange={(e) => patch({ minRating: Number(e.target.value) })}
            />
          </label>
          <span>to</span>
          <label>
            to
            <input
              aria-label="Maximum rapid rating"
              type="number"
              min={0}
              max={4000}
              value={draft.maxRating}
              onChange={(e) => patch({ maxRating: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="two-fields">
          <label>
            Learning interest
            <select
              value={draft.interest}
              onChange={(e) => patch({ interest: e.target.value })}
            >
              <option value="tactics">Tactics</option>
              <option value="openings">Openings</option>
              <option value="endgames">Endgames</option>
              <option value="strategy">Strategy</option>
            </select>
          </label>
          <label>
            Locale
            <select
              value={draft.locale}
              onChange={(e) => patch({ locale: e.target.value })}
            >
              <option value="en">English · en</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Membership</legend>
          <div className="button-row">
            {(["Basic", "Gold", "Diamond"] as const).map((m) => (
              <label className="check-label" key={m}>
                <input
                  type="checkbox"
                  checked={draft.memberships.includes(m)}
                  onChange={(e) =>
                    patch({
                      memberships: e.target.checked
                        ? [...draft.memberships, m]
                        : draft.memberships.filter((v) => v !== m),
                    })
                  }
                />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="audience-policy">
          <ShieldCheck size={17} />
          <div>
            <strong>Existing owners are excluded.</strong>
            <p>
              This acquisition launch only invites players who do not already
              own the course.
            </p>
          </div>
        </div>
        <label>
          Rating updated within (days)
          <input
            type="number"
            min={1}
            max={365}
            value={draft.maxRatingAgeDays}
            onChange={(e) =>
              patch({ maxRatingAgeDays: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <button
        className={dirty ? "primary full" : "secondary full"}
        disabled={!dirty}
        onClick={() =>
          void command({
            type: "updateRule",
            ruleId: rule.id,
            expectedRevision: rule.revision,
            patch: {
              name: draft.name,
              enabled: draft.enabled,
              minRating: draft.minRating,
              maxRating: draft.maxRating,
              interest: draft.interest,
              memberships: draft.memberships,
              locale: draft.locale,
              excludeOwners: draft.excludeOwners,
              maxRatingAgeDays: draft.maxRatingAgeDays,
            },
          })
        }
      >
        {dirty ? "Save & evaluate audience" : "Audience evaluated"}
        <Check size={16} />
      </button>
    </section>
  );
}

export function Review({
  state,
  command,
  unsaved,
  onSources,
  onDelivery,
  onCta,
}: Props & {
  unsaved: boolean;
  onSources: () => void;
  onDelivery: () => void;
  onCta: () => void;
}) {
  const [id, setId] = useState<DocumentId>("email-included"),
    [mode, setMode] = useState<"immediate" | "scheduled">("immediate"),
    [at, setAt] = useState(""),
    [comment, setComment] = useState(""),
    [field, setField] = useState<Field>("headline"),
    [reply, setReply] = useState<string | undefined>(),
    [unresolved, setUnresolved] = useState(true),
    [reason, setReason] = useState(""),
    [invite, setInvite] = useState(""),
    [join, setJoin] = useState(""),
    [inviteError, setInviteError] = useState("");
  const candidate = state.candidate,
    pending = state.proposals.filter((p) => p.status === "pending").length,
    document = candidate?.documents[id] ?? state.documents[id];
  async function inviteReviewer() {
    try {
      const r = await fetch("/api/reviewer-invite", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setInvite(data.invite);
    } catch (e) {
      setInviteError(
        e instanceof Error ? e.message : "Could not create review invitation",
      );
    }
  }
  async function joinReview() {
    try {
      const r = await fetch("/api/reviewer-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite: join }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      location.reload();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Could not join review");
    }
  }
  return (
    <div className="review-grid">
      <section className="review-artifact">
        <ReviewQueue
          state={state}
          selected={id}
          onSelect={setId}
          command={command}
          disabled={unsaved}
        />
        <div className="review-document-bar" data-review-heading tabIndex={-1}>
          <div>
            <ShieldCheck size={18} />
            <strong>{candidate ? "Release candidate" : "Current draft"}</strong>
            {candidate && <Badge>v{candidate.revision}</Badge>}
          </div>
          <select
            aria-label="Review document"
            value={id}
            onChange={(e) => setId(e.target.value as DocumentId)}
          >
            {DOCUMENT_IDS.map((d) => (
              <option
                key={d}
                value={d}
              >{`${state.documents[d].channel === "email" ? "Email" : "In-app"} · ${state.documents[d].variant === "included" ? "Included access" : "Free sample"}`}</option>
            ))}
          </select>
        </div>
        <div className="review-preview">
          <MessagePreview
            fields={document.fields}
            channel={document.channel}
            variant={document.variant}
            template={document.template}
            player={state.players.find(
              (p) =>
                p.id === (document.variant === "included" ? "alex" : "sam"),
            )}
            onCta={onCta}
          />
        </div>
        <ReviewAcknowledge
          state={state}
          selected={id}
          onSelect={setId}
          command={command}
          disabled={unsaved}
        />
        <section className="review-comments">
          <div className="section-title">
            <h3>
              <MessageSquare size={17} />
              Conversation
            </h3>
            <label className="check-label">
              <input
                type="checkbox"
                checked={unresolved}
                onChange={(e) => setUnresolved(e.target.checked)}
              />
              Unresolved only
            </label>
          </div>
          {state.comments
            .filter((c) => c.documentId === id && (!unresolved || !c.resolved))
            .map((c) => (
              <article
                className={`comment ${c.parentId ? "reply" : ""}`}
                key={c.id}
              >
                <div className="comment-avatar">
                  {c.actor === "operator" ? "M" : "R"}
                </div>
                <div>
                  <header>
                    <strong>
                      {c.actor === "operator"
                        ? "Operator"
                        : state.demoReview
                          ? "Demo reviewer"
                          : "Reviewer"}
                    </strong>
                    <small>
                      {c.field} · v{c.documentRevision}
                      {c.documentRevision !== state.documents[id].revision
                        ? " · previous version"
                        : ""}
                    </small>
                  </header>
                  <p>{c.text}</p>
                  <div className="button-row">
                    <button
                      className="text-button"
                      onClick={() => {
                        setReply(c.id);
                        setField(c.field);
                      }}
                    >
                      Reply
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        void command({
                          type: "resolveComment",
                          commentId: c.id,
                          resolved: !c.resolved,
                        })
                      }
                    >
                      {c.resolved ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          <div className="comment-composer">
            {reply && (
              <div className="reply-label">
                Replying to a comment
                <button
                  className="text-button"
                  onClick={() => setReply(undefined)}
                >
                  Cancel
                </button>
              </div>
            )}
            <textarea
              aria-label="Review comment"
              placeholder="Leave a specific note for the next reviewer…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
            <div>
              <select
                aria-label="Comment field"
                value={field}
                onChange={(e) => setField(e.target.value as Field)}
              >
                <option value="headline">Headline</option>
                <option value="body">Message</option>
                <option value="dateLine">Availability</option>
                <option value="cta">Button label</option>
                <option value="subject">Subject</option>
              </select>
              <button
                className="secondary"
                disabled={!comment.trim()}
                onClick={async () => {
                  if (
                    await command({
                      type: "addComment",
                      documentId: id,
                      field,
                      text: comment,
                      parentId: reply,
                    })
                  ) {
                    setComment("");
                    setReply(undefined);
                  }
                }}
              >
                Add comment
                <Send size={14} />
              </button>
            </div>
          </div>
        </section>
      </section>
      <aside className="review-sidebar">
        <section className="surface release-checks">
          <div className="section-title">
            <h2>Release checklist</h2>
            <ShieldCheck size={22} />
          </div>
          <div className="check-row">
            <CheckCircle2 size={18} />
            <div>
              <strong>Four channel / access documents</strong>
              <p>Email and in-app, each with included and sample copy.</p>
            </div>
          </div>
          <div className={`check-row ${pending || unsaved ? "warning" : ""}`}>
            <FileText size={18} />
            <div>
              <strong>
                {unsaved
                  ? "Save your local edits"
                  : pending
                    ? `${pending} source proposals to resolve`
                    : "Confirmed source facts"}
              </strong>
              <p>
                {unsaved
                  ? "Return to Compose to save each edited document."
                  : pending
                    ? "Review linked updates before preparing this release."
                    : `Availability: ${prettyDate(state.course.availability)}`}
              </p>
              {pending > 0 && (
                <button className="text-button" onClick={onSources}>
                  Review changes
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="check-row">
            <CheckCircle2 size={18} />
            <div>
              <strong>{state.audience.eligible} eligible players</strong>
              <p>
                {state.audience.email} email · {state.audience.inapp} in-app.
                Recipient variants are frozen with the candidate.
              </p>
            </div>
          </div>
        </section>
        <section className="surface dispatch-plan">
          <div className="section-title">
            <h3>Delivery plan</h3>
            <Clock size={18} />
          </div>
          <label
            className={`radio-card ${mode === "immediate" ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="plan"
              checked={mode === "immediate"}
              onChange={() => setMode("immediate")}
            />
            <span>
              <strong>Immediate test delivery</strong>
              <small>After approval, send to the sandbox inbox.</small>
            </span>
          </label>
          <label
            className={`radio-card ${mode === "scheduled" ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="plan"
              checked={mode === "scheduled"}
              onChange={() => setMode("scheduled")}
            />
            <span>
              <strong>Schedule a test release</strong>
              <small>Choose the message time, not course availability.</small>
            </span>
          </label>
          {mode === "scheduled" && (
            <label className="stacked-label">
              Dispatch in your browser time zone
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
              <small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
            </label>
          )}
          <button
            className="primary full"
            disabled={
              state.role !== "operator" ||
              unsaved ||
              pending > 0 ||
              (mode === "scheduled" && !at)
            }
            onClick={() =>
              void command({
                type: "prepareCandidate",
                mode,
                ...(mode === "scheduled"
                  ? { at: new Date(at).toISOString() }
                  : {}),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            }
          >
            {candidate ? "Prepare a new candidate" : "Prepare review candidate"}
            <ArrowRight size={15} />
          </button>
          {candidate && (
            <div className="candidate-state">
              <Badge
                kind={
                  candidate.status === "approved" ||
                  candidate.status === "delivered"
                    ? "green"
                    : candidate.status === "paused"
                      ? "amber"
                      : "neutral"
                }
              >
                {candidate.status}
              </Badge>
              <strong>Candidate v{candidate.revision}</strong>
              <p>
                {candidate.bindings.length} frozen player / channel bindings
                <br />
                {candidate.plan.mode === "immediate"
                  ? "Immediate test delivery"
                  : new Date(candidate.plan.at).toLocaleString()}
              </p>
              {candidate.reason && (
                <p className="warning-text">{candidate.reason}</p>
              )}
            </div>
          )}
        </section>
        <section className="surface reviewer-card">
          <div className="section-title">
            <h3>Review session</h3>
            <span className="operator-avatar">
              {state.role === "operator" ? "M" : "R"}
            </span>
          </div>
          <p>
            {state.demoReview
              ? "Demo reviewer, controlled by you. This demonstrates approval permissions—not another person’s sign-off."
              : "Separate invited reviewer session. You can review and comment, but not edit or send."}
          </p>
          {state.demoReview && (
            <div className="segmented full">
              <button
                className={state.role === "operator" ? "selected" : ""}
                onClick={() =>
                  void command({ type: "switchRole", role: "operator" })
                }
              >
                Operator
              </button>
              <button
                className={state.role === "reviewer" ? "selected" : ""}
                onClick={() =>
                  void command({ type: "switchRole", role: "reviewer" })
                }
              >
                Demo reviewer
              </button>
            </div>
          )}
          {state.role === "operator" ? (
            <button
              className="secondary full"
              disabled={!candidate}
              onClick={() => void command({ type: "requestReview" })}
            >
              {state.reviewRequested ? "Review requested" : "Request review"}
              <MessageSquare size={16} />
            </button>
          ) : (
            <>
              <button
                className="primary full"
                disabled={
                  !candidate ||
                  candidate.status !== "needs-review" ||
                  pending > 0 ||
                  unsaved ||
                  (candidate.reviewChecks !== undefined &&
                    reviewedCount(candidate) < 4)
                }
                onClick={() =>
                  candidate &&
                  void command({
                    type: "approveCandidate",
                    candidateId: candidate.id,
                    expectedRevision: candidate.revision,
                  })
                }
              >
                <ShieldCheck size={16} />
                Approve exact candidate
              </button>
              <details>
                <summary>Request changes</summary>
                <textarea
                  aria-label="Reason for requesting changes"
                  placeholder="What needs another pass?"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="secondary full"
                  disabled={!reason.trim()}
                  onClick={() =>
                    void command({ type: "requestChanges", reason })
                  }
                >
                  Send back with a note
                </button>
              </details>
            </>
          )}
          {candidate?.status === "approved" && (
            <button
              className="primary full"
              disabled={state.role !== "operator"}
              onClick={async () => {
                if (
                  await command({
                    type: "enqueue",
                    candidateId: candidate.id,
                    expectedRevision: candidate.revision,
                  })
                )
                  onDelivery();
              }}
            >
              Release to sandbox
              <Send size={16} />
            </button>
          )}
          {state.role === "reviewer" && candidate?.status === "approved" && (
            <p className="fine-print">
              Switch back to Operator to release this approved candidate.
            </p>
          )}
          <details className="separate-review">
            <summary>Review in a separate browser session</summary>
            <p className="fine-print">
              A one-use invitation connects a separate reviewer session to this
              launch. Keep the invitation private.
            </p>
            {state.role === "operator" && (
              <button
                className="secondary full"
                onClick={() => void inviteReviewer()}
              >
                Create reviewer invitation
              </button>
            )}
            {invite && (
              <label className="stacked-label">
                Private one-use invitation
                <input
                  readOnly
                  value={invite}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            <label className="stacked-label">
              Join with an invitation
              <input
                type="password"
                value={join}
                onChange={(e) => setJoin(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="secondary full"
              disabled={!join}
              onClick={() => void joinReview()}
            >
              Join review
            </button>
            {inviteError && <p className="error-text">{inviteError}</p>}
          </details>
        </section>
      </aside>
    </div>
  );
}
type DeliveryView = {
  playerId: string;
  selected: string | null;
  channel: string;
};
export function Delivery({
  state,
  command,
  onReview,
  onCta,
  viewState,
  setViewState,
}: Props & {
  onReview: () => void;
  onCta: (receipt: Receipt) => void;
  viewState: DeliveryView;
  setViewState: Dispatch<SetStateAction<DeliveryView>>;
}) {
  const { playerId, selected, channel } = viewState;
  const setPlayerId = (playerId: string) =>
    setViewState((v) => ({ ...v, playerId }));
  const setSelected = (selected: string | null) =>
    setViewState((v) => ({ ...v, selected }));
  const setChannel = (channel: string) =>
    setViewState((v) => ({ ...v, channel }));
  const candidate = state.candidate,
    receipts = state.receipts.filter(
      (r) =>
        r.playerId === playerId && (channel === "all" || r.channel === channel),
    ),
    receipt = receipts.find((r) => r.id === selected),
    player = state.players.find((p) => p.id === playerId)!,
    delivered = state.receipts.filter((r) => r.status === "delivered").length,
    suppressed = state.receipts.filter((r) => r.status === "suppressed").length;
  async function open(r: Receipt) {
    setSelected(r.id);
    if (r.status === "delivered")
      await command({
        type: "trackEvent",
        eventType: "inbox_opened",
        receiptId: r.id,
        playerId: r.playerId,
      });
  }
  return (
    <div className="delivery-page">
      <section className="delivery-status surface">
        <span className={`release-symbol ${delivered ? "complete" : ""}`}>
          {delivered ? <CheckCircle2 size={28} /> : <Send size={26} />}
        </span>
        <div>
          <div className="eyebrow">SANDBOX DELIVERY</div>
          <h2>
            {candidate
              ? candidate.status === "delivered"
                ? "Your launch has landed."
                : candidate.status === "queued"
                  ? "Your launch is queued."
                  : candidate.status === "paused"
                    ? "This release is paused."
                    : `Release ${candidate.status}`
              : "A real inbox. Ready when you are."}
          </h2>
          <p>
            {candidate?.reason ||
              (!candidate
                ? "Prepare and approve a candidate in Review to deliver these messages."
                : `${candidate.bindings.length} approved player / channel bindings · ${candidate.plan.mode === "immediate" ? "immediate test delivery" : new Date(candidate.plan.at).toLocaleString()}`)}
          </p>
        </div>
        <div className="delivery-counts">
          <span>
            <strong>{delivered}</strong>Delivered
          </span>
          <span>
            <strong>{suppressed}</strong>Suppressed
          </span>
        </div>
        {candidate &&
        ["queued", "delivering", "paused"].includes(candidate.status) ? (
          <button
            className="secondary"
            onClick={() =>
              void command({
                type: "cancelSchedule",
                candidateId: candidate.id,
              })
            }
          >
            <Pause size={15} />
            Cancel remaining
          </button>
        ) : (
          <button className="secondary" onClick={onReview}>
            Review release
            <ArrowRight size={15} />
          </button>
        )}
      </section>
      <div className="inbox-grid">
        <section className="inbox-list surface">
          <div className="section-title">
            <h2>Player inbox</h2>
            <Mail size={20} />
          </div>
          <label className="stacked-label">
            Viewing as
            <select
              value={playerId}
              onChange={(e) => {
                setPlayerId(e.target.value);
                setSelected(null);
              }}
            >
              {state.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.membership}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented full inbox-channel">
            {["all", "email", "inapp"].map((c) => (
              <button
                key={c}
                className={channel === c ? "selected" : ""}
                onClick={() => {
                  setChannel(c);
                  setSelected(null);
                }}
              >
                {c === "all" ? "All" : c === "email" ? "Email" : "In-app"}
              </button>
            ))}
          </div>
          {receipts.length ? (
            receipts.map((r) => (
              <button
                key={r.id}
                className={`inbox-item ${selected === r.id ? "selected" : ""}`}
                onClick={() => void open(r)}
              >
                <span className="inbox-item-icon">
                  {r.channel === "email" ? (
                    <Mail size={19} />
                  ) : (
                    <MessageSquare size={19} />
                  )}
                </span>
                <span>
                  <strong>{r.fields.subject || r.fields.headline}</strong>
                  <small>
                    {r.channel === "email" ? "Email" : "In-app"} · {r.variant} ·
                    v{r.documentRevision}
                  </small>
                  <Badge kind={r.status === "delivered" ? "green" : "amber"}>
                    {r.status}
                  </Badge>
                </span>
                <ChevronDown size={15} />
              </button>
            ))
          ) : (
            <div className="inbox-empty">
              <Mail size={32} />
              <h3>No messages for {player.name} yet.</h3>
              <p>
                {state.receipts.length
                  ? "This player may be outside the approved audience or opted out of this channel."
                  : "Release an approved candidate to see the exact delivered copy here."}
              </p>
              <button className="text-button" onClick={onReview}>
                Go to review
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <p className="fine-print">
            Real persisted sandbox messages. No external emails are sent.
          </p>
        </section>
        <section className="inbox-reader">
          {receipt ? (
            receipt.status === "delivered" ? (
              <>
                <div className="receipt-bar">
                  <Badge kind="green">Delivered</Badge>
                  <span>
                    {new Date(receipt.createdAt).toLocaleString()} ·{" "}
                    {receipt.documentId} v{receipt.documentRevision}
                  </span>
                  <ShieldCheck size={16} />
                </div>
                <MessagePreview
                  fields={receipt.fields}
                  channel={receipt.channel}
                  variant={receipt.variant}
                  template={receipt.template}
                  player={player}
                  receipt
                  onCta={() => onCta(receipt)}
                />
              </>
            ) : (
              <div className="empty-state">
                <ShieldCheck size={35} />
                <h2>Message suppressed.</h2>
                <p>
                  {receipt.reason ||
                    "Current player policy no longer matches the approved binding."}
                </p>
                <p>The worker did not substitute an unapproved variant.</p>
              </div>
            )
          ) : (
            <div className="empty-state">
              <div className="letter-illustration">
                <Mail size={65} strokeWidth={1.2} />
                <span>
                  <Check size={19} />
                </span>
              </div>
              <h2>
                The same message.
                <br />
                On the other side.
              </h2>
              <p>
                Select a delivery to see the exact approved content,
                <br />
                then follow it into the playable course sample.
              </p>
            </div>
          )}
        </section>
      </div>
      <details className="surface delivery-events">
        <summary>
          Delivery and interaction log <Badge>{state.events.length}</Badge>
        </summary>
        <p className="fine-print">
          Events reflect interactions in this sandbox only. They are not unique
          people, marketing attribution, or conversion lift.
        </p>
        <div className="event-records">
          {state.events
            .slice(-30)
            .reverse()
            .map((e) => (
              <div key={e.id}>
                <span>
                  {state.players.find((p) => p.id === e.playerId)?.name ??
                    e.playerId}
                </span>
                <strong>{e.type.replaceAll("_", " ")}</strong>
                <time>{new Date(e.at).toLocaleString()}</time>
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
