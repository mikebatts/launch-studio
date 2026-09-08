import { useRef, useState } from "react";
import { Check, Mail, Bell, ArrowRight } from "lucide-react";
import {
  DOCUMENT_IDS,
  type DocumentId,
  type ReleaseCandidate,
  type WorkspaceState,
} from "../../shared/types";
import type { Command } from "../App";
export const documentLabel = (id: DocumentId) =>
  `${id.startsWith("email") ? "Email" : "In-app"} · ${id.endsWith("sample") ? "Free sample" : "Included access"}`;
export const reviewedCount = (
  candidate: ReleaseCandidate | null | undefined,
) =>
  candidate
    ? DOCUMENT_IDS.filter(
        (id) =>
          candidate.reviewChecks?.[id]?.documentRevision ===
          candidate.documents[id].revision,
      ).length
    : 0;
export function ReviewQueue({
  state,
  selected,
  onSelect,
  disabled = false,
}: {
  state: WorkspaceState;
  selected: DocumentId;
  onSelect: (id: DocumentId) => void;
  command: Command;
  disabled?: boolean;
}) {
  const c = state.candidate;
  const active = !!c && !["paused", "cancelled"].includes(c.status);
  const approved =
    active &&
    ["approved", "queued", "delivering", "delivered"].includes(c.status);
  const count = active ? reviewedCount(c) : 0;
  return (
    <section className="release-queue" aria-label="Messages in this version">
      <header>
        <div>
          <h2>Messages in this version</h2>
          <p>
            {approved
              ? "All four messages belong to the approved release."
              : active
                ? "Open each message and mark it reviewed."
                : "Prepare a version to begin review."}
          </p>
        </div>
        <span
          className={`review-count ${approved ? "is-approved" : ""}`}
          role="status"
        >
          {approved ? "4 approved" : `${count} / 4 reviewed`}
        </span>
      </header>
      <div className="review-queue-list">
        {DOCUMENT_IDS.map((id) => {
          const doc = active ? c.documents[id] : state.documents[id];
          const done =
            active && c.reviewChecks?.[id]?.documentRevision === doc.revision;
          const Icon = id.startsWith("email") ? Mail : Bell;
          return (
            <button
              key={id}
              className={`review-queue-item ${selected === id ? "is-selected" : ""}`}
              aria-pressed={selected === id}
              disabled={disabled}
              onClick={() => {
                onSelect(id);
                focusReviewPreview();
              }}
            >
              <Icon size={17} />
              <span className="review-item-copy">
                <strong>{documentLabel(id)}</strong>
                <small>{doc.fields.headline}</small>
              </span>
              <span
                className={`review-item-status ${approved || done ? "is-done" : ""}`}
              >
                {approved || done ? <Check size={13} /> : null}
                {approved
                  ? "Approved"
                  : done
                    ? "Reviewed"
                    : active
                      ? "To review"
                      : "Draft"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ReviewAcknowledge({
  state,
  selected,
  onSelect,
  command,
  disabled = false,
}: {
  state: WorkspaceState;
  selected: DocumentId;
  onSelect: (id: DocumentId) => void;
  command: Command;
  disabled?: boolean;
}) {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const c = state.candidate;
  if (!c || c.status !== "needs-review" || state.role !== "reviewer")
    return null;
  const checked =
    c.reviewChecks?.[selected]?.documentRevision ===
    c.documents[selected].revision;
  return (
    <footer className="review-acknowledge">
      <span>
        {checked ? "This message is reviewed." : documentLabel(selected)}
      </span>
      <button
        className="journey-secondary"
        disabled={disabled || saving || checked}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setSaving(true);
          try {
            if (
              await command({
                type: "reviewDocument",
                candidateId: c.id,
                expectedRevision: c.revision,
                documentId: selected,
              })
            ) {
              const next = DOCUMENT_IDS.find(
                (id) =>
                  id !== selected &&
                  c.reviewChecks?.[id]?.documentRevision !==
                    c.documents[id].revision,
              );
              if (next) {
                onSelect(next);
                focusReviewPreview();
              }
            }
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      >
        {checked ? (
          <>
            <Check size={15} />
            Reviewed
          </>
        ) : (
          <>
            Mark reviewed
            <ArrowRight size={15} />
          </>
        )}
      </button>
    </footer>
  );
}

function focusReviewPreview() {
  requestAnimationFrame(() => {
    const heading = document.querySelector<HTMLElement>(
      "[data-review-heading]",
    );
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "start", behavior: "instant" });
  });
}
