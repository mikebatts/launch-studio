import { PortfolioAccess } from "./PortfolioAccess";
import { useState, type ReactNode } from "react";
import { Check, GitCompareArrows, History, ShieldCheck } from "lucide-react";

/** A neutral, text-safe comparison surface. Authority and mutations stay with its caller. */
export function RevisionComparison({
  current,
  proposed,
  provenance,
  base,
  editor,
}: {
  current: string;
  proposed: string;
  provenance: string;
  base?: string;
  editor?: ReactNode;
}) {
  return (
    <div className="diff-columns">
      <div>
        <span className="eyebrow">CURRENT COPY</span>
        <p>{current}</p>
        {base !== undefined && (
          <details>
            <summary>Show original base</summary>
            <p>{base}</p>
          </details>
        )}
      </div>
      <div className="proposed">
        <span className="eyebrow">{provenance}</span>
        {editor ?? <p>{proposed}</p>}
      </div>
    </div>
  );
}
export type ActivityItem = { id: string | number; message: string; at: string };
/** Stable IDs keep a reconnecting activity stream from remounting existing messages. */
export function AsyncActivity({
  items,
  label = "Run activity",
}: {
  items: ActivityItem[];
  label?: string;
}) {
  return (
    <ol
      className="event-list"
      aria-label={label}
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((item) => (
        <li key={item.id}>
          <span className="event-point" />
          <span>{item.message}</span>
          <time dateTime={item.at}>
            {new Date(item.at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </li>
      ))}
    </ol>
  );
}
export function PatternNotes({ onReset }: { onReset?: () => Promise<void> }) {
  const [applied, setApplied] = useState(false),
    [tab, setTab] = useState<"decisions" | "patterns">("decisions");
  return (
    <div className="pattern-notes">
      <PortfolioAccess />
      <div className="segmented">
        <button
          className={tab === "decisions" ? "selected" : ""}
          onClick={() => setTab("decisions")}
        >
          How it works
        </button>
        <button
          className={tab === "patterns" ? "selected" : ""}
          onClick={() => setTab("patterns")}
        >
          UI patterns
        </button>
      </div>
      {tab === "decisions" ? (
        <>
          <p className="pattern-intro">
            I built Launch Studio to explore a problem in AI-assisted growth
            tools: keeping copy, audience rules and approvals in sync when the
            brief changes. The example is a course launch. You can follow an
            operator’s edit all the way to the invitation a learner receives.
          </p>
          <p className="about-byline">
            Michael Battaglia · Independent exploration, not a Chess.com project
            or a claim about its internal workflows.
          </p>
          <div className="decision-note">
            <GitCompareArrows size={22} />
            <div>
              <h3>Preview is not targeting.</h3>
              <p>
                Two access variants, across two channels. Choosing a player
                reveals the matching message without editing audience rules or
                switching your editor.
              </p>
            </div>
          </div>
          <div className="decision-note">
            <History size={22} />
            <div>
              <h3>Edits keep their history.</h3>
              <p>
                Source changes and model output arrive as proposals. Every save
                carries the revision it began from. If another edit wins the
                race, compare the original, latest, and your version.
              </p>
            </div>
          </div>
          <div className="decision-note">
            <ShieldCheck size={22} />
            <div>
              <h3>Approval means this version.</h3>
              <p>
                Review binds the copy, recipient-to-variant assignments, and
                delivery plan. Changes pause that release. The inbox displays
                the frozen message—not a fresh rendering of today’s draft.
              </p>
            </div>
          </div>
          <p className="fine-print">
            React and TypeScript on the frontend. Node and SQLite for revisions,
            jobs, approvals and delivery receipts. Ollama runs the drafting
            model locally. The system stores proposals before an editor accepts
            them; a release freezes what the reviewer approved.
          </p>
          <p className="fine-print">
            Original synthetic player data and course artwork. Real local-model
            jobs and sandbox deliveries. No Chess.com accounts, integrations,
            external email, or claimed marketing lift.
          </p>

          {onReset && (
            <details className="reset-sample">
              <summary>Start over with a fresh sample</summary>
              <p className="fine-print">
                Reset this isolated workspace’s copy, sources, rules, reviews,
                and sandbox deliveries. Other workspaces are not affected.
              </p>
              <button className="secondary" onClick={() => void onReset()}>
                Reset this sample workspace
              </button>
            </details>
          )}
        </>
      ) : (
        <>
          <p className="pattern-intro">
            Two neutral components extracted from the working interface. These
            small examples are interactive illustrations, not activity from your
            launch.
          </p>
          <article className="proposal-card">
            <header>
              <strong>RevisionComparison</strong>
              <span className="badge">Component example</span>
            </header>
            <RevisionComparison
              current={
                applied ? "Available October 12." : "Available October 5."
              }
              proposed="Available October 12."
              provenance="SOURCE · REVISION 2"
            />
            <footer>
              <span className="muted" role="status">
                {applied
                  ? "Example change applied."
                  : "Text-safe, linked comparison."}
              </span>
              <button
                className="primary small"
                onClick={() => setApplied(!applied)}
              >
                <Check size={14} />
                {applied ? "Reset example" : "Apply example"}
              </button>
            </footer>
          </article>
          <article className="run-card">
            <header>
              <strong>AsyncActivity</strong>
              <span className="badge">Component example</span>
            </header>
            <AsyncActivity
              label="Example asynchronous activity"
              items={[
                {
                  id: 1,
                  message: "Confirmed source facts loaded.",
                  at: "2026-09-07T14:00:00Z",
                },
                {
                  id: 2,
                  message: "Draft returned. Checking the structured fields.",
                  at: "2026-09-07T14:00:05Z",
                },
                {
                  id: 3,
                  message: "Two proposals ready for review. No edits applied.",
                  at: "2026-09-07T14:00:07Z",
                },
              ]}
            />
          </article>
          <p className="fine-print">
            Typed props, semantic text rendering, stable event identity, and
            restrained reduced-motion-aware presentation. Source modules are
            included in this project; publication is not claimed.
          </p>
        </>
      )}
    </div>
  );
}
