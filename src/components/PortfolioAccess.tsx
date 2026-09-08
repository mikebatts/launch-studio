import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, Eye, EyeOff } from "lucide-react";

export function PortfolioAccess() {
  const [available, setAvailable] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/portfolio-access", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok)
          setAvailable((await response.json()).available === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <section
      className="portfolio-card"
      aria-label="Michael Battaglia portfolio"
    >
      <span className="eyebrow">DESIGNED & BUILT BY</span>
      <h2>Michael Battaglia</h2>
      <p>
        I design the experience and build the systems behind it. See my shipped
        work at Daylight, including Ray.
      </p>
      <a
        className="portfolio-link"
        href="https://mikebatts.net"
        target="_blank"
        rel="noreferrer"
      >
        Explore my portfolio <ArrowUpRight size={17} />
      </a>
      <div className="portfolio-access">
        <span>Daylight & Ray case studies · password-protected</span>
        {available && (
          <div className="portfolio-access-actions">
            <code aria-label="Case-study password">
              {password ?? "••••••••••••"}
            </code>
            <button
              className="secondary small"
              disabled={busy}
              aria-expanded={password !== null}
              onClick={async () => {
                setNotice("");
                setCopied(false);
                if (password) {
                  setPassword(null);
                  return;
                }
                setBusy(true);
                try {
                  const response = await fetch("/api/portfolio-access/reveal", {
                    method: "POST",
                    cache: "no-store",
                    signal: AbortSignal.timeout(8000),
                  });
                  if (!response.ok) throw new Error();
                  const data = await response.json();
                  if (typeof data.password !== "string") throw new Error();
                  setPassword(data.password);
                } catch {
                  setNotice("Couldn’t reveal the password. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {password ? <EyeOff size={15} /> : <Eye size={15} />}
              {busy ? "Opening…" : password ? "Hide" : "Reveal password"}
            </button>
            {password && (
              <button
                className="secondary small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(password);
                    setCopied(true);
                    setNotice("Password copied.");
                  } catch {
                    setNotice(
                      "Copy is unavailable here. Select the revealed password to copy it.",
                    );
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy password"}
              </button>
            )}
          </div>
        )}
        <span className="portfolio-notice" role="status">
          {notice}
        </span>
      </div>
    </section>
  );
}
