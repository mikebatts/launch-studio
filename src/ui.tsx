import { useEffect, useRef, useId, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  Diamond,
  LockKeyhole,
  Mail,
  Bell,
  Check,
} from "lucide-react";
import type {
  Fields,
  Player,
  PlayerEvaluation,
  Channel,
  Variant,
} from "../shared/types";

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  error,
  restoreFocusTo,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  error?: string;
  restoreFocusTo?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    const origin =
      restoreFocusTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    el?.showModal();
    return () => {
      el?.close();
      queueMicrotask(() => {
        if (origin?.isConnected) origin.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`sheet ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-heading">
          <div>
            <span className="eyebrow">LAUNCH STUDIO</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function Badge({
  children,
  kind = "neutral",
}: {
  children: ReactNode;
  kind?: "neutral" | "green" | "amber" | "red";
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
export function Avatar({
  player,
  size = "normal",
}: {
  player: Pick<Player, "name" | "id">;
  size?: "normal" | "small";
}) {
  return (
    <span className={`avatar ${player.id} ${size}`}>
      {player.name.slice(0, 1)}
    </span>
  );
}
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i}>
          {line
            .split(/(\*\*[^*]+\*\*|_[^_]+_)/g)
            .map((part, j) =>
              part.startsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : part.startsWith("_") ? (
                <em key={j}>{part.slice(1, -1)}</em>
              ) : (
                part
              ),
            )}
        </p>
      ))}
    </>
  );
}
export function MessagePreview({
  fields,
  channel,
  variant,
  template = "editorial",
  player,
  onCta,
  receipt = false,
  inertCta = false,
}: {
  fields: Fields;
  channel: Channel;
  variant: Variant;
  template?: "editorial" | "compact";
  player?: Player;
  onCta: () => void;
  receipt?: boolean;
  inertCta?: boolean;
}) {
  return (
    <article
      className={`message-preview ${channel} ${template}`}
      aria-label={`${channel === "email" ? "Email" : "In-app"} message preview`}
    >
      {channel === "email" ? (
        <div className="email-envelope">
          <span className="sender-mark">♞</span>
          <div>
            <strong>Learning at Launch Studio</strong>
            <span>
              To {player?.name ?? "your player"} ·{" "}
              {receipt ? "Sandbox delivery" : "Preview only"}
            </span>
          </div>
          <Mail size={16} />
        </div>
      ) : (
        <div className="inapp-envelope">
          <span className="sender-mark">♞</span>
          <strong>Your next learning move</strong>
          <Bell size={17} />
        </div>
      )}
      {channel === "email" && (
        <div className="email-subject">{fields.subject}</div>
      )}
      <div className="preview-content">
        <div className="art-wrap">
          <img
            src="/course-art.svg"
            alt="Spot the Fork. An original illustration of a knight threatening two pieces."
          />
          <span className="art-label">800–1200 RAPID</span>
        </div>
        <div className="message-copy">
          <div className="course-kicker">
            NEW COURSE <span>•</span> TACTICS
          </div>
          <h2>{fields.headline}</h2>
          <div className="rendered-body">
            <RichText text={fields.body} />
          </div>
          <div className="date-line">{fields.dateLine}</div>
          <button
            className="course-cta"
            onClick={onCta}
            disabled={inertCta}
            title={
              inertCta
                ? "Open the course from the delivered invitation"
                : undefined
            }
          >
            {fields.cta}
            <ArrowUpRight size={18} />
          </button>
          <div className="access-line">
            {variant === "included" ? (
              <>
                <Diamond size={13} /> Included with Diamond in this sample
                catalog
              </>
            ) : (
              <>
                <Check size={14} /> A free sample. No membership needed.
              </>
            )}
          </div>
        </div>
      </div>
      <footer className="message-footer">
        A little practice. A new way to see the board.
        <span>Independent sample · Not a Chess.com communication</span>
      </footer>
    </article>
  );
}
export function Eligibility({
  player,
  evaluation,
  channel,
}: {
  player: Player;
  evaluation?: PlayerEvaluation;
  channel: Channel;
}) {
  const allowed = evaluation?.[channel] ?? false;
  const reasons =
    channel === "email" ? evaluation?.emailReasons : evaluation?.inappReasons;
  return (
    <div className={`eligibility ${allowed ? "" : "excluded"}`}>
      <span className="eligibility-icon">
        {allowed ? (
          evaluation?.variant === "included" ? (
            <Diamond size={17} />
          ) : (
            <Check size={17} />
          )
        ) : (
          <LockKeyhole size={17} />
        )}
      </span>
      <div>
        <strong>
          {allowed
            ? evaluation?.variant === "included"
              ? "Full-course access"
              : "Free-sample access"
            : `Not receiving this ${channel === "email" ? "email" : "message"}`}
        </strong>
        <p>
          {allowed
            ? evaluation?.variant === "included"
              ? `${player.name} is a Diamond member. The full course opens on its availability date.`
              : `${player.name} has ${player.membership} membership. The sample is available now.`
            : [...(evaluation?.reasons ?? []), ...(reasons ?? [])]
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" · ") || "Outside the selected audience."}
        </p>
      </div>
    </div>
  );
}
