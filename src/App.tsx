import { Analytics } from "@vercel/analytics/react";
import { WorkspaceNav } from "./components/WorkspaceNav";
import { LaunchJourney } from "./LaunchJourney";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Users,
  PenLine,
  CheckCheck,
  Send,
  BookOpen,
  History,
  Link2,
  Sparkles,
  Mail,
  Bell,
  PanelLeftClose,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Save,
  ExternalLink,
  ShieldMinus,
} from "lucide-react";
import type {
  Action,
  WorkspaceState,
  DocumentId,
  Fields,
  Field,
  Channel,
  Variant,
  Receipt,
  ReleaseCandidate,
} from "../shared/types";
import { Avatar, Badge, Dialog, Eligibility, MessagePreview } from "./ui";
import { Brief, Audience, Review, Delivery, Sources, Runs } from "./Workflow";
import { PatternNotes } from "./components/ReviewPatterns";
import {
  prepareMerge,
  restoreDraftCache,
  type LocalDraft,
} from "./draft-state";
const Puzzle = lazy(() => import("./Puzzle"));
type Tab = "Brief" | "Audience" | "Compose" | "Review" | "Delivery";
type Sheet = "sources" | "runs" | "conflict" | "about" | "destination" | null;
const tabs = [
  { name: "Brief" as Tab, icon: FileText },
  { name: "Audience" as Tab, icon: Users },
  { name: "Compose" as Tab, icon: PenLine },
  { name: "Review" as Tab, icon: CheckCheck },
  { name: "Delivery" as Tab, icon: Send },
];
const labels: Record<Field, string> = {
  subject: "Subject line",
  headline: "Headline",
  body: "Message",
  dateLine: "Availability",
  cta: "Button label",
};
export type Command = (action: Action) => Promise<boolean>;

export default function App() {
  const [guided, setGuided] = useState(true);
  const [state, setState] = useState<WorkspaceState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("Compose"),
    [channel, setChannel] = useState<Channel>("email"),
    [variant, setVariant] = useState<Variant>("included"),
    [previewId, setPreviewId] = useState("alex"),
    [sheet, setSheet] = useState<Sheet>(null),
    [mobilePane, setMobilePane] = useState<"edit" | "preview">("preview"),
    [drafts, setDrafts] = useState<Partial<Record<DocumentId, LocalDraft>>>({}),
    [puzzle, setPuzzle] = useState(false),
    [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null),
    [focusedField, setFocusedField] = useState<Field>("headline"),
    [hydratedId, setHydratedId] = useState(""),
    [highlightedFields, setHighlightedFields] = useState<string[]>([]);
  const [deliveryView, setDeliveryView] = useState({
    playerId: "sam",
    selected: null as string | null,
    channel: "all",
  });
  const [destinationSnapshot, setDestinationSnapshot] =
    useState<ReleaseCandidate | null>(null);
  const [destinationError, setDestinationError] = useState("");
  useEffect(() => {
    setDestinationSnapshot(null);
    setDestinationError("");
    if (sheet !== "destination" || !activeReceipt) return;
    const controller = new AbortController();
    fetch(`/api/releases/${encodeURIComponent(activeReceipt.releaseId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The approved destination could not be loaded. Close this view and try again.",
          );
        return response.json() as Promise<ReleaseCandidate>;
      })
      .then((release) => {
        if (!controller.signal.aborted) setDestinationSnapshot(release);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setDestinationError(error.message);
      });
    return () => controller.abort();
  }, [sheet, activeReceipt?.releaseId]);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const pendingHighlights = useRef(new Set<string>());
  const previousApplied = useRef<{ workspace: string; ids: Set<string> }>({
    workspace: "",
    ids: new Set(),
  });
  const appliedSignature =
    state?.proposals
      .filter((p) => p.status === "applied")
      .map((p) => p.id)
      .join(",") ?? "";
  useEffect(() => {
    if (!state) return;
    const applied = state.proposals.filter((p) => p.status === "applied");
    const fresh =
      previousApplied.current.workspace === state.id
        ? applied.filter((p) => !previousApplied.current.ids.has(p.id))
        : [];
    previousApplied.current = {
      workspace: state.id,
      ids: new Set(applied.map((p) => p.id)),
    };
    fresh.forEach((p) =>
      pendingHighlights.current.add(`${p.documentId}-${p.field}`),
    );
    if (sheet === "sources") return;
    const fields = [...pendingHighlights.current];
    pendingHighlights.current.clear();
    setHighlightedFields(fields);
    if (!fields.length) return;
    const timer = setTimeout(() => setHighlightedFields([]), 1350);
    return () => clearTimeout(timer);
  }, [appliedSignature, state?.id, sheet]);
  const acceptState = useCallback(
    (next: WorkspaceState) =>
      setState((old) =>
        !old || old.id !== next.id || next.revision >= old.revision
          ? next
          : old,
      ),
    [],
  );
  const refreshInFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const r = await fetch("/api/state", {
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error("Could not reconnect to your workspace.");
      const next = await r.json();
      acceptState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    } finally {
      refreshInFlight.current = false;
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then(async (r) => {
        if (!r.ok) throw new Error("The workspace could not be loaded.");
        return r.json();
      })
      .then((s) => {
        if (!cancelled) acceptState(s);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);
  const running =
    state?.runs.some((r) => r.status === "queued" || r.status === "running") ||
    state?.candidate?.status === "queued" ||
    state?.candidate?.status === "delivering";
  useEffect(() => {
    if (!state?.id) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = setInterval(tick, running ? 1800 : 15000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running, refresh, state?.id]);
  const command: Command = useCallback(async (action) => {
    if (action.type !== "trackEvent") setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.current) acceptState(data.current);
        else if (r.status === 409) {
          const latest = await fetch("/api/state");
          if (latest.ok) acceptState(await latest.json());
        }
        throw new Error(data.error || "That change could not be saved.");
      }
      acceptState(data);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Your local edits are still here.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!state?.id || hydratedId === state.id) return;
    try {
      setDrafts(
        restoreDraftCache(
          localStorage.getItem(`launch-studio:drafts:v1:${state.id}`),
        ),
      );
    } catch {
      /* A corrupt recovery cache never blocks the workspace. */
    }
    setHydratedId(state.id);
  }, [state?.id, hydratedId]);
  useEffect(() => {
    if (!state?.id || hydratedId !== state.id) return;
    try {
      localStorage.setItem(
        `launch-studio:drafts:v1:${state.id}`,
        JSON.stringify({ version: 1, drafts }),
      );
    } catch {
      /* Server saves remain available if browser storage is restricted. */
    }
  }, [drafts, state?.id, hydratedId]);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  const docId = `${channel}-${variant}` as DocumentId,
    doc = state?.documents[docId];
  const saveDocument = useCallback(
    async (id: DocumentId) => {
      const selected = state?.documents[id];
      if (!selected) return false;
      if (!drafts[id]) return true;
      const captured = drafts[id];
      if (
        await command({
          type: "editDocument",
          documentId: id,
          expectedRevision: captured.baseRevision,
          fields: captured.fields,
        })
      ) {
        setDrafts((previous) => {
          if (previous[id] !== captured) return previous;
          const next = { ...previous };
          delete next[id];
          return next;
        });
        return true;
      }
      return false;
    },
    [state?.documents, drafts, command],
  );
  const save = useCallback(async () => {
    await saveDocument(docId);
  }, [saveDocument, docId]);

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveDocument(guided ? "email-sample" : docId);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [saveDocument, guided, docId]);
  if (!state || !doc)
    return (
      <main className="loading-screen">
        <img src="/mark.svg" alt="" />
        <h1>Launch Studio</h1>
        <p>{error || "Opening your course launch…"}</p>
        {error && (
          <button className="primary" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </main>
    );
  const currentFields = drafts[docId]?.fields ?? doc.fields,
    player = state.players.find((p) => p.id === previewId) ?? state.players[0],
    evaluation = state.audience.players.find((p) => p.playerId === player.id),
    previewVariant = evaluation?.variant ?? "sample",
    previewDocId = `${channel}-${previewVariant}` as DocumentId,
    previewDoc = state.documents[previewDocId],
    previewFields = drafts[previewDocId]?.fields ?? previewDoc.fields,
    pending = state.proposals.filter((p) => p.status === "pending"),
    unsaved = Object.keys(drafts).length > 0;
  const receivesMessage = evaluation?.[channel] ?? false;
  const channelName = channel === "email" ? "email" : "in-app message";
  const sourcePending = pending.filter((p) => p.origin === "source revision");
  const unsavedIds = Object.keys(drafts) as DocumentId[];
  const availabilityLabel = new Date(
    state.course.availability,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: state.course.timeZone,
  });
  function selectDocument(id: DocumentId, field: Field = "headline") {
    const selected = state!.documents[id];
    setChannel(selected.channel);
    setVariant(selected.variant);
    setFocusedField(field);
    setTab("Compose");
    setMobilePane("edit");
    requestAnimationFrame(() =>
      document.getElementById(`field-${field}`)?.focus(),
    );
  }
  function previewPlayer(id: string) {
    setPreviewId(id);
  }
  function openDestination(receipt: Receipt | null = null) {
    setActiveReceipt(receipt);
    setSheet("destination");
    if (receipt)
      void command({
        type: "trackEvent",
        eventType: "cta_followed",
        playerId: receipt.playerId,
        receiptId: receipt.id,
      });
  }
  function edit(field: Field, value: string, id: DocumentId = docId) {
    const selected = state!.documents[id];
    setDrafts((d) => ({
      ...d,
      [id]: {
        baseRevision: d[id]?.baseRevision ?? selected.revision,
        baseFields: d[id]?.baseFields ?? selected.fields,
        fields: { ...(d[id]?.fields ?? selected.fields), [field]: value },
      },
    }));
  }
  function format(selection: "bold" | "italic") {
    const textarea = document.getElementById(
      "field-body",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart,
      end = textarea.selectionEnd,
      wrap = selection === "bold" ? "**" : "_";
    edit(
      "body",
      currentFields.body.slice(0, start) +
        wrap +
        currentFields.body.slice(start, end) +
        wrap +
        currentFields.body.slice(end),
    );
    textarea.focus();
  }
  function openSample(receipt: Receipt | null = null) {
    setActiveReceipt(receipt);
    setSheet(null);
    setPuzzle(true);
    void (async () => {
      await command({
        type: "trackEvent",
        eventType: "sample_started",
        playerId: receipt?.playerId ?? player.id,
        receiptId: receipt?.id,
      });
    })();
  }
  return (
    <div
      className={guided ? "guided-app" : "app-shell"}
      onClickCapture={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(
                "button,a,input,select,textarea",
              )
            : null;
        if (target && !target.closest("dialog")) dialogTrigger.current = target;
      }}
    >
      {guided && (
        <div hidden={puzzle}>
          <LaunchJourney
            key={state.id}
            state={state}
            fields={
              drafts["email-sample"]?.fields ??
              state.documents["email-sample"].fields
            }
            dirty={!!drafts["email-sample"]}
            unsaved={unsaved}
            busy={busy}
            error={error}
            onEdit={(field, value) => edit(field, value, "email-sample")}
            onSave={() => saveDocument("email-sample")}
            command={command}
            onWorkspace={(next = "Compose") => {
              setGuided(false);
              setTab(next);
            }}
            onSources={() => {
              setChannel("email");
              setVariant("sample");
              setFocusedField("dateLine");
              setSheet("sources");
            }}
            onRuns={() => {
              setChannel("email");
              setVariant("sample");
              setFocusedField("headline");
              setSheet("runs");
            }}
            onAbout={() => setSheet("about")}
            onDestination={(receipt, playerId = "sam") => {
              setPreviewId(playerId);
              openDestination(receipt);
            }}
          />
        </div>
      )}
      {guided && puzzle && (
        <Suspense
          fallback={<div className="page-padding">Opening sample…</div>}
        >
          <Puzzle
            onBack={() => setPuzzle(false)}
            onComplete={() =>
              void command({
                type: "trackEvent",
                eventType: "sample_completed",
                playerId: activeReceipt?.playerId ?? "sam",
                receiptId: activeReceipt?.id,
              })
            }
          />
        </Suspense>
      )}
      {!guided && (
        <>
          <WorkspaceNav
            mode="workspace"
            onAbout={() => setSheet("about")}
            disabled={busy}
            onHome={() => {
              setPuzzle(false);
              setGuided(true);
            }}
            onChange={(mode) => {
              if (mode === "guided") {
                setPuzzle(false);
                setGuided(true);
              }
            }}
          />
          <aside className="rail">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPuzzle(false);
                setTab("Compose");
              }}
              aria-label="Launch Studio home"
            >
              <img src="/mark.svg" alt="" />
              <span>
                Launch
                <br />
                <strong>Studio</strong>
              </span>
            </a>
            <div className="rail-divider" />
            <div className="rail-project">
              <span className="project-icon">
                <BookOpen size={19} />
              </span>
              <span>
                Course launch<small>Spot the Fork</small>
              </span>
            </div>
            <nav aria-label="Launch workflow">
              {tabs.map(({ name, icon: Icon }, i) => (
                <button
                  key={name}
                  className={
                    tab === name && !puzzle ? "nav-item active" : "nav-item"
                  }
                  onClick={() => {
                    setPuzzle(false);
                    setTab(name);
                  }}
                >
                  <Icon size={18} />
                  <span>{name === "Compose" ? "Messages" : name}</span>
                  {name === "Review" && pending.length > 0 ? (
                    <span className="nav-count">{pending.length}</span>
                  ) : (
                    <span className="nav-number">0{i + 1}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="rail-bottom">
              <div className="sandbox-label">
                <span className="status-dot" />
                Isolated sandbox
              </div>
              <p>Real drafts and approvals. Delivery stays in this demo.</p>
              <button
                className="text-button about-trigger"
                onClick={() => setSheet("about")}
              >
                About this build
                <ExternalLink size={12} />
              </button>
              <div className="author-credit">
                Independent exploration by
                <br />
                <strong>Michael Battaglia</strong>
                <span>Not affiliated with Chess.com</span>
              </div>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <div className="breadcrumb">
                <span>Course launches</span>
                <ChevronRight size={14} />
                <strong>Spot the Fork</strong>
                <Badge
                  kind={
                    state.candidate?.status === "approved" ||
                    state.candidate?.status === "delivered"
                      ? "green"
                      : state.candidate?.status === "paused"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {state.candidate?.status ?? "Draft"}
                </Badge>
              </div>
              <div className="top-actions">
                <span className={`save-status ${unsaved ? "unsaved" : ""}`}>
                  <span className="status-dot" />
                  {busy
                    ? "Saving…"
                    : unsaved
                      ? "Unsaved changes"
                      : "Saved to workspace"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Open generation activity"
                  onClick={() => setSheet("runs")}
                >
                  <History size={18} />
                  {running && <span className="activity-dot" />}
                </button>
                <button
                  className="operator-avatar"
                  title={
                    state.role === "operator"
                      ? "Operator session"
                      : "Demo reviewer, controlled by you"
                  }
                  onClick={() => {
                    setTab("Review");
                    setPuzzle(false);
                  }}
                >
                  {state.role === "operator" ? "M" : "R"}
                </button>
              </div>
            </header>
            {error && (
              <div className="error-banner" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  ×
                </button>
              </div>
            )}
            {puzzle ? (
              <Suspense
                fallback={<div className="page-padding">Opening sample…</div>}
              >
                <Puzzle
                  onBack={() => setPuzzle(false)}
                  onComplete={() =>
                    void command({
                      type: "trackEvent",
                      eventType: "sample_completed",
                      playerId: activeReceipt?.playerId ?? player.id,
                      receiptId: activeReceipt?.id,
                    })
                  }
                />
              </Suspense>
            ) : (
              <>
                <div
                  className={`page-heading ${tab === "Compose" ? "compose-heading" : ""}`}
                >
                  <div>
                    <div className="eyebrow">
                      {tab === "Compose"
                        ? "LAUNCH STUDIO / WORKING PROTOTYPE"
                        : "SPOT THE FORK / " + tab.toUpperCase()}
                    </div>
                    <h1>
                      {tab === "Compose"
                        ? "One course. Different learners."
                        : tab === "Brief"
                          ? "One source of truth."
                          : tab === "Audience"
                            ? "Find the right learners."
                            : tab === "Review"
                              ? "Ready for a second look."
                              : "From launch to learning."}
                    </h1>
                    <p>
                      {tab === "Compose"
                        ? "Prepare invitations, review AI-assisted edits, and deliver the approved launch."
                        : tab === "Brief"
                          ? "Confirm the facts before they become part of your message."
                          : tab === "Audience"
                            ? "Two saved segments. One shared, explainable audience."
                            : tab === "Review"
                              ? "Review the copy, audience, and exact delivery plan together."
                              : "Follow the exact approved message into a player’s sandbox inbox."}
                    </p>
                  </div>
                  <button
                    className="mobile-credit"
                    onClick={() => setSheet("about")}
                  >
                    Independent exploration by Michael Battaglia · How it works
                    ↗
                  </button>
                  <div className="heading-actions">
                    {tab === "Compose" ? (
                      <>
                        <button
                          className="secondary"
                          onClick={() => setTab("Review")}
                        >
                          Review release
                          <ArrowRight size={16} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() => setTab("Compose")}
                      >
                        <PenLine size={16} />
                        Back to compose
                      </button>
                    )}
                  </div>
                </div>
                {tab === "Compose" ? (
                  <>
                    <div
                      className="course-context"
                      aria-label="Course and audience"
                    >
                      <button onClick={() => setTab("Brief")}>
                        <BookOpen size={16} />
                        <strong>Spot the Fork</strong>
                        <span>Course opens {availabilityLabel}</span>
                        <ChevronRight size={14} />
                      </button>
                      <button onClick={() => setTab("Audience")}>
                        <Users size={15} />
                        <span>
                          {state.audience.eligible} of {state.audience.total}{" "}
                          sample players match
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <div
                      className={`compose-toolbar first-minute-toolbar mode-${mobilePane}`}
                    >
                      <div
                        className="workspace-panes"
                        aria-label="Workspace view"
                      >
                        <button
                          aria-pressed={mobilePane === "preview"}
                          className={mobilePane === "preview" ? "selected" : ""}
                          onClick={() => setMobilePane("preview")}
                        >
                          <Users size={16} /> Compare learners
                        </button>
                        <button
                          aria-pressed={mobilePane === "edit"}
                          className={mobilePane === "edit" ? "selected" : ""}
                          onClick={() => {
                            if (mobilePane !== "edit")
                              selectDocument(
                                receivesMessage ? previewDocId : docId,
                              );
                          }}
                        >
                          <PenLine size={16} /> Edit copy
                        </button>
                      </div>
                      <div className="segmented" aria-label="Message channel">
                        {(["email", "inapp"] as Channel[]).map((c) => (
                          <button
                            key={c}
                            aria-pressed={channel === c}
                            className={channel === c ? "selected" : ""}
                            onClick={() => setChannel(c)}
                          >
                            {c === "email" ? (
                              <Mail size={16} />
                            ) : (
                              <Bell size={16} />
                            )}{" "}
                            {c === "email" ? "Email" : "In-app"}
                          </button>
                        ))}
                      </div>
                      <div className="variant-select">
                        <span>Writing for</span>
                        <select
                          value={variant}
                          onChange={(e) =>
                            setVariant(e.target.value as Variant)
                          }
                          aria-label="Editing access variant"
                        >
                          <option value="included">Included access</option>
                          <option value="sample">Free sample</option>
                        </select>
                      </div>
                      <span className="document-origin">
                        {doc.origin === "supplied sample" ? (
                          <Badge>Supplied sample</Badge>
                        ) : (
                          <Badge kind="green">{doc.origin}</Badge>
                        )}
                        <span>v{doc.revision}</span>
                      </span>
                    </div>
                    <div
                      className={`compose-grid first-minute-grid mobile-${mobilePane}`}
                    >
                      <section className="editor-panel">
                        <header className="panel-title">
                          <div>
                            <PenLine size={17} />
                            <h2>Message editor</h2>
                          </div>
                          <span>
                            {channel === "email" ? "Email" : "In-app"} ·{" "}
                            {variant === "included" ? "Included" : "Sample"}
                          </span>
                        </header>
                        {drafts[docId] &&
                          drafts[docId]!.baseRevision !== doc.revision && (
                            <div className="draft-conflict-notice">
                              <strong>This document changed elsewhere.</strong>
                              <p>
                                Your local edits are safe. Compare versions
                                before saving.
                              </p>
                              <button
                                className="secondary"
                                onClick={() => setSheet("conflict")}
                              >
                                Compare & merge
                              </button>
                            </div>
                          )}
                        <fieldset
                          className="editor-fields"
                          disabled={state.role !== "operator"}
                        >
                          {(Object.keys(labels) as Field[])
                            .filter(
                              (f) => channel === "email" || f !== "subject",
                            )
                            .map((field) => (
                              <div
                                className={`field-group ${focusedField === field ? "focused" : ""} ${highlightedFields.includes(`${docId}-${field}`) ? "field-applied" : ""}`}
                                key={field}
                              >
                                <div className="field-heading">
                                  <label htmlFor={`field-${field}`}>
                                    {labels[field]}
                                  </label>
                                  <button
                                    className="field-source"
                                    onClick={() => {
                                      setFocusedField(field);
                                      setSheet("sources");
                                    }}
                                    aria-label={`Inspect source for ${labels[field]}`}
                                  >
                                    <Link2 size={12} />
                                    {field === "dateLine"
                                      ? "Catalog · availability"
                                      : "Brief"}
                                    {pending.some(
                                      (p) =>
                                        p.documentId === docId &&
                                        p.field === field,
                                    ) && <span className="small-dot" />}
                                  </button>
                                </div>
                                {field === "body" ? (
                                  <>
                                    <div className="formatting-tools">
                                      <button
                                        onClick={() => format("bold")}
                                        aria-label="Bold selected message text"
                                      >
                                        <strong>B</strong>
                                      </button>
                                      <button
                                        onClick={() => format("italic")}
                                        aria-label="Italicize selected message text"
                                      >
                                        <em>I</em>
                                      </button>
                                      <span>Simple formatting supported</span>
                                    </div>
                                    <textarea
                                      id="field-body"
                                      value={currentFields.body}
                                      onFocus={() => setFocusedField(field)}
                                      onChange={(e) =>
                                        edit(field, e.target.value)
                                      }
                                      rows={5}
                                    />
                                  </>
                                ) : field === "headline" ? (
                                  <textarea
                                    id={`field-${field}`}
                                    className="headline-input"
                                    value={currentFields[field]}
                                    onFocus={() => setFocusedField(field)}
                                    onChange={(e) =>
                                      edit(field, e.target.value)
                                    }
                                    rows={2}
                                  />
                                ) : (
                                  <input
                                    id={`field-${field}`}
                                    value={currentFields[field]}
                                    onFocus={() => setFocusedField(field)}
                                    onChange={(e) =>
                                      edit(field, e.target.value)
                                    }
                                  />
                                )}
                              </div>
                            ))}
                          <div className="layout-select">
                            <label htmlFor="template">Layout</label>
                            <select
                              id="template"
                              value={doc.template}
                              disabled={busy}
                              onChange={(e) =>
                                void command({
                                  type: "editDocument",
                                  documentId: docId,
                                  expectedRevision: doc.revision,
                                  template: e.target.value as
                                    "editorial" | "compact",
                                })
                              }
                            >
                              <option value="editorial">
                                Editorial · course first
                              </option>
                              <option value="compact">
                                Compact · message first
                              </option>
                            </select>
                          </div>
                        </fieldset>
                        <footer className="editor-footer">
                          <button
                            className="text-button"
                            onClick={() => setSheet("runs")}
                          >
                            <Sparkles size={16} />
                            Generate new draft
                          </button>
                          <button
                            className={
                              drafts[docId] ? "primary small" : "saved-button"
                            }
                            disabled={
                              !drafts[docId] ||
                              busy ||
                              state.role !== "operator"
                            }
                            onClick={() => void save()}
                          >
                            {drafts[docId] ? (
                              <Save size={15} />
                            ) : (
                              <Check size={15} />
                            )}
                            {drafts[docId]
                              ? "Save changes"
                              : "All changes saved"}
                          </button>
                        </footer>
                        <div className="revision-shortcut">
                          <span>
                            Try a new headline. Save it, then change the date.
                          </span>
                          <button
                            onClick={() => {
                              setFocusedField("dateLine");
                              setSheet("sources");
                            }}
                          >
                            {sourcePending.length
                              ? "Review date changes"
                              : "Change the brief"}{" "}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </section>
                      <section
                        className="preview-panel"
                        aria-label="Learner invitation preview"
                      >
                        <div className="learner-context">
                          <header className="learner-heading">
                            <span className="eyebrow">
                              START WITH THE LEARNER
                            </span>
                            <h2>Who gets what?</h2>
                            <p>
                              Choose a player. See the invitation their access
                              and preferences allow.
                            </p>
                          </header>
                          <div className="player-picker">
                            {state.previewPlayerIds.map((id) => {
                              const p = state.players.find((p) => p.id === id)!;
                              const result = state.audience.players.find(
                                (entry) => entry.playerId === id,
                              );
                              const outcome = !result?.[channel]
                                ? "No invitation"
                                : result.variant === "included"
                                  ? "Included access"
                                  : "Free sample";
                              return (
                                <button
                                  key={id}
                                  className={previewId === id ? "selected" : ""}
                                  aria-pressed={previewId === id}
                                  onClick={() => previewPlayer(id)}
                                >
                                  <Avatar player={p} />
                                  <span>
                                    <strong>{p.name}</strong>
                                    <small>
                                      {p.ownsCourse
                                        ? "Course owner"
                                        : !p.emailOptIn
                                          ? "Email opted out"
                                          : p.membership === "Diamond"
                                            ? "Diamond"
                                            : p.membership}
                                    </small>
                                    <span className="player-outcome">
                                      {outcome}
                                    </span>
                                  </span>
                                  {previewId === id && <Check size={14} />}
                                </button>
                              );
                            })}
                          </div>
                          <Eligibility
                            player={player}
                            evaluation={evaluation}
                            channel={channel}
                          />
                          <p className="preview-scope">
                            Sample players. Choosing one never changes the
                            audience.
                          </p>
                        </div>
                        {mobilePane === "edit" &&
                          receivesMessage &&
                          previewVariant !== variant && (
                            <div className="variant-mismatch">
                              <span>
                                Showing{" "}
                                <strong>
                                  {previewVariant === "included"
                                    ? "included-access"
                                    : "free-sample"}
                                </strong>{" "}
                                copy for {player.name}.
                              </span>
                              <button
                                onClick={() => selectDocument(previewDocId)}
                              >
                                Edit this variant
                                <ArrowRight size={13} />
                              </button>
                            </div>
                          )}
                        <div className="preview-scroll">
                          <div className="invitation-heading">
                            <span>
                              {receivesMessage
                                ? `${channel === "email" ? "Email" : "In-app invitation"} for ${player.name}`
                                : `${player.name} · not selected`}
                            </span>
                            {receivesMessage && mobilePane === "preview" && (
                              <button
                                onClick={() => selectDocument(previewDocId)}
                              >
                                <PenLine size={13} /> Edit this invitation
                              </button>
                            )}
                          </div>
                          {receivesMessage ? (
                            <MessagePreview
                              key={`${channel}-${player.id}`}
                              fields={previewFields}
                              channel={channel}
                              variant={previewVariant}
                              template={previewDoc.template}
                              player={player}
                              onCta={() => openDestination()}
                            />
                          ) : (
                            <div
                              className="suppressed-preview"
                              key={`${player.id}-${channel}`}
                            >
                              <div className="suppression-symbol">
                                <ShieldMinus size={31} />
                              </div>
                              <span className="eyebrow">AUDIENCE DECISION</span>
                              <h2>
                                No {channelName} for {player.name}.
                              </h2>
                              <p>
                                {player.ownsCourse
                                  ? "They already own this course, so they’re excluded from its acquisition launch."
                                  : channel === "email" && !player.emailOptIn
                                    ? "They opted out of email. Their in-app eligibility is checked separately."
                                    : "This player does not match the current audience and channel rules. No invitation is selected for delivery."}
                              </p>
                              <div className="suppression-actions">
                                {channel === "email" && evaluation?.inapp && (
                                  <button
                                    className="primary small"
                                    onClick={() => setChannel("inapp")}
                                  >
                                    See their in-app message{" "}
                                    <ArrowRight size={14} />
                                  </button>
                                )}
                                <button
                                  className="secondary small"
                                  onClick={() => setTab("Audience")}
                                >
                                  Inspect audience rules <Users size={14} />
                                </button>
                              </div>
                              <details className="hypothetical-preview">
                                <summary>
                                  Inspect hypothetical copy{" "}
                                  <ChevronDown size={14} />
                                </summary>
                                <p>
                                  For copy inspection only. {player.name} will
                                  not receive this {channelName} under the
                                  current rules. Opening this example does not
                                  change targeting.
                                </p>
                                <MessagePreview
                                  fields={previewFields}
                                  channel={channel}
                                  variant={previewVariant}
                                  template={previewDoc.template}
                                  player={player}
                                  onCta={() => openDestination()}
                                />
                              </details>
                            </div>
                          )}
                          {receivesMessage && (
                            <div className="preview-caption">
                              <span>
                                {channel === "email" ? "Email" : "In-app"} /{" "}
                                {previewVariant === "included"
                                  ? "Included access"
                                  : "Free sample"}{" "}
                                / v{previewDoc.revision}
                                {drafts[previewDocId] ? " + unsaved edits" : ""}
                              </span>
                              <span>Original course artwork</span>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                    <section
                      className="explore-workflow"
                      aria-labelledby="explore-title"
                    >
                      <header>
                        <span className="eyebrow">
                          THEN TAKE IT THROUGH A LAUNCH
                        </span>
                        <h2 id="explore-title">
                          The work behind the invitation.
                        </h2>
                      </header>
                      <div className="workflow-actions">
                        <button
                          onClick={() =>
                            selectDocument(
                              receivesMessage ? previewDocId : docId,
                            )
                          }
                        >
                          <PenLine size={20} />
                          <strong>Make the copy yours</strong>
                          <span>
                            Edit a headline, or ask the local model for a new
                            draft.
                          </span>
                          <span className="workflow-link">
                            Open editor <ArrowRight size={14} />
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setFocusedField("dateLine");
                            setSheet("sources");
                          }}
                        >
                          <RefreshCw size={20} />
                          <strong>Change the brief</strong>
                          <span>
                            Move the course date. Review corrections without
                            losing your wording.
                          </span>
                          <span className="workflow-link">
                            {sourcePending.length
                              ? `Review ${sourcePending.length} date corrections`
                              : "Try a source change"}{" "}
                            <ArrowRight size={14} />
                          </span>
                        </button>
                        <button onClick={() => setTab("Review")}>
                          <Send size={20} />
                          <strong>Review, then deliver</strong>
                          <span>
                            Approve a saved version. Open it in the demo inbox
                            and play the course sample.
                          </span>
                          <span className="workflow-link">
                            Open release review <ArrowRight size={14} />
                          </span>
                        </button>
                      </div>
                      <p className="explore-footnote">
                        A working prototype by Michael Battaglia. Synthetic
                        learners, local AI, sandbox delivery.{" "}
                        <button onClick={() => setSheet("about")}>
                          Design & engineering notes <ArrowRight size={12} />
                        </button>
                      </p>
                    </section>
                    <details
                      className={`launch-check ${pending.length || unsaved ? "needs-attention" : ""}`}
                    >
                      <summary>
                        <span className="launch-check-label">
                          <CheckCheck size={17} />
                          <strong>Launch check</strong>
                        </span>
                        <span className="launch-check-summary">
                          {unsaved
                            ? `${unsavedIds.length} unsaved ${unsavedIds.length === 1 ? "draft" : "drafts"}`
                            : "Drafts saved"}
                          <i>·</i>
                          {pending.length
                            ? `${pending.length} suggestions to review`
                            : "No pending suggestions"}
                          <i>·</i>
                          {state.candidate
                            ? `Release ${state.candidate.status.replaceAll("-", " ")}`
                            : "Release not prepared"}
                        </span>
                        <ChevronDown size={16} />
                      </summary>
                      <div className="launch-check-body">
                        <p>
                          This is your current workspace state, not a release
                          approval. Preparing a release checks the saved copy,
                          facts, recipients and delivery plan together.
                        </p>
                        {unsavedIds.map((id) => (
                          <button
                            className="check-action"
                            key={id}
                            onClick={() => selectDocument(id)}
                          >
                            <Save size={15} />
                            <span>
                              Save{" "}
                              {id
                                .replace("inapp", "in-app")
                                .replace("-included", " · included access")
                                .replace("-sample", " · free sample")}
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        ))}
                        {pending.map((proposal) => (
                          <button
                            className="check-action"
                            key={proposal.id}
                            onClick={() => {
                              selectDocument(
                                proposal.documentId,
                                proposal.field,
                              );
                              setSheet("sources");
                            }}
                          >
                            <Link2 size={15} />
                            <span>
                              {proposal.origin === "source revision"
                                ? "Source change"
                                : "AI suggestion"}
                              : {labels[proposal.field]}
                              <small>
                                {proposal.documentId} ·{" "}
                                {proposal.conflict
                                  ? "competing edits to compare"
                                  : "review before applying"}
                              </small>
                            </span>
                            <ArrowRight size={14} />
                          </button>
                        ))}
                        {state.candidate?.reason && (
                          <p className="check-release-reason">
                            {state.candidate.reason}
                          </p>
                        )}
                        <button
                          className="check-action"
                          onClick={() => setTab("Review")}
                        >
                          <CheckCheck size={15} />
                          <span>
                            {state.candidate
                              ? "Inspect the exact release and review status"
                              : "Prepare an exact release for review"}
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </details>
                  </>
                ) : tab === "Brief" ? (
                  <Brief
                    state={state}
                    command={command}
                    onRefresh={refresh}
                    onSources={() => setSheet("sources")}
                  />
                ) : tab === "Audience" ? (
                  <Audience state={state} command={command} />
                ) : tab === "Review" ? (
                  <Review
                    state={state}
                    command={command}
                    unsaved={unsaved}
                    onSources={() => setSheet("sources")}
                    onDelivery={() => setTab("Delivery")}
                    onCta={() => openDestination()}
                  />
                ) : (
                  <Delivery
                    viewState={deliveryView}
                    setViewState={setDeliveryView}
                    state={state}
                    command={command}
                    onReview={() => setTab("Review")}
                    onCta={openDestination}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
      {sheet === "destination" &&
        (() => {
          const destinationPlayer =
            state.players.find(
              (p) => p.id === (activeReceipt?.playerId ?? player.id),
            ) ?? player;
          const frozen = activeReceipt ? destinationSnapshot : null;
          const included = activeReceipt
            ? activeReceipt.variant === "included"
            : destinationPlayer.membership === "Diamond" ||
              destinationPlayer.ownsCourse;
          const availability =
            frozen?.destination.availability ?? state.course.availability;
          const available = new Date(availability).getTime() <= Date.now();
          const shownDate = new Date(availability).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: state.course.timeZone,
          });
          return (
            <Dialog
              restoreFocusTo={dialogTrigger.current}
              title="A next step that fits the player."
              onClose={() => setSheet(null)}
            >
              {activeReceipt && !frozen ? (
                <p role="status">
                  {destinationError ||
                    "Loading the approved course destination…"}
                </p>
              ) : (
                <div className="course-destination">
                  <img
                    src="/course-art.svg"
                    alt="An original knight-fork course illustration"
                  />
                  <div className="destination-player">
                    <Avatar player={destinationPlayer} />
                    <div>
                      <strong>
                        {destinationPlayer.name}’s course destination
                      </strong>
                      <span>
                        {activeReceipt
                          ? "Access from this delivered message"
                          : `${destinationPlayer.membership}${destinationPlayer.ownsCourse ? " · Course owner" : " · Does not own this course"}`}
                      </span>
                    </div>
                  </div>
                  <h3>
                    {included
                      ? available
                        ? "Included access in this catalog."
                        : "Included when the course opens."
                      : "Start with the free sample."}
                  </h3>
                  <p>
                    {included
                      ? `${activeReceipt ? "The approved message carries included-course access" : destinationPlayer.ownsCourse ? "Course ownership includes full-course access" : "Diamond membership includes full-course access"} under this fictional policy. ${available ? "The catalog availability date has passed." : `The course opens ${shownDate} (${state.course.timeZone}).`}`
                      : "This invitation offers the free sample, not full-course access. The sample is available now, with no membership change."}
                  </p>
                  <div className="destination-limit">
                    <BookOpen size={18} />
                    <span>
                      This working destination contains one original knight-fork
                      exercise, not a full course. Everyone can try the same
                      free sample.
                    </span>
                  </div>
                  <button
                    className="primary full"
                    onClick={() => openSample(activeReceipt)}
                  >
                    Play the free sample <ArrowRight size={16} />
                  </button>
                  <small>
                    {activeReceipt
                      ? "Showing the approved release snapshot. Later catalog or membership edits do not rewrite this delivery record."
                      : "Access shown from the current player profile and catalog."}
                  </small>
                </div>
              )}
            </Dialog>
          );
        })()}
      {sheet === "sources" && (
        <Dialog
          restoreFocusTo={dialogTrigger.current}
          error={error}
          title="A changed fact. Your edits stay yours."
          onClose={() => setSheet(null)}
          wide
        >
          <Sources
            state={state}
            command={command}
            documentId={docId}
            focusedField={focusedField}
            unsavedFields={drafts[docId]?.fields}
            onSave={save}
          />
        </Dialog>
      )}
      {sheet === "conflict" && drafts[docId] && (
        <Dialog
          restoreFocusTo={dialogTrigger.current}
          error={error}
          title="Keep the best of both versions."
          onClose={() => setSheet(null)}
          wide
        >
          <DraftConflict
            draft={drafts[docId]!}
            current={doc.fields}
            onDiscard={() => {
              setDrafts((d) => {
                const n = { ...d };
                delete n[docId];
                return n;
              });
              setSheet(null);
            }}
            onSave={async (fields) => {
              if (
                await command({
                  type: "editDocument",
                  documentId: docId,
                  expectedRevision: doc.revision,
                  fields,
                })
              ) {
                setDrafts((d) => {
                  const n = { ...d };
                  delete n[docId];
                  return n;
                });
                setSheet(null);
              }
            }}
          />
        </Dialog>
      )}
      {sheet === "about" && (
        <Dialog
          restoreFocusTo={dialogTrigger.current}
          error={error}
          title="From course brief to player experience."
          onClose={() => setSheet(null)}
        >
          <PatternNotes
            onReset={
              state.role === "operator"
                ? async () => {
                    if (await command({ type: "reset" })) {
                      setDrafts({});
                      setSheet(null);
                      setPuzzle(false);
                      setTab("Compose");
                    }
                  }
                : undefined
            }
          />
        </Dialog>
      )}
      {sheet === "runs" && (
        <Dialog
          restoreFocusTo={dialogTrigger.current}
          error={error}
          title="Draft with a little assistance."
          onClose={() => setSheet(null)}
        >
          <Runs
            state={state}
            command={command}
            documentId={docId}
            focusedField={focusedField}
          />
        </Dialog>
      )}
      <Analytics />
    </div>
  );
}

function DraftConflict({
  draft,
  current,
  onDiscard,
  onSave,
}: {
  draft: LocalDraft;
  current: Fields;
  onDiscard: () => void;
  onSave: (fields: Fields) => Promise<void>;
}) {
  const [merged, setMerged] = useState<Fields>(() =>
    prepareMerge(draft, current),
  );
  return (
    <div>
      <p className="muted">
        Your edits are compared with the version you started from. Unchanged
        fields take the latest saved copy. Review each merged field before
        saving.
      </p>
      {(Object.keys(current) as Field[])
        .filter((f) => draft.fields[f] !== current[f])
        .map((field) => (
          <section className="proposal-card conflict-field" key={field}>
            <header>
              <strong>{labels[field]}</strong>
              <Badge kind="amber">Version comparison</Badge>
            </header>
            <div className="diff-columns">
              <div>
                <span className="eyebrow">LATEST SAVED COPY</span>
                <p>{current[field]}</p>
              </div>
              <div>
                <span className="eyebrow">YOUR LOCAL COPY</span>
                <p>{draft.fields[field]}</p>
              </div>
            </div>
            <label className="stacked-label">
              Merged result
              <textarea
                rows={3}
                value={merged[field]}
                onChange={(e) =>
                  setMerged((m) => ({ ...m, [field]: e.target.value }))
                }
              />
            </label>
          </section>
        ))}
      <div className="button-row">
        <button className="secondary" onClick={onDiscard}>
          Discard local edits
        </button>
        <button className="primary" onClick={() => void onSave(merged)}>
          Save reviewed merge
          <Check size={15} />
        </button>
      </div>
    </div>
  );
}
