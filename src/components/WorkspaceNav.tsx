import { Route, PanelsTopLeft, Info } from "lucide-react";
export function WorkspaceNav({
  mode,
  onChange,
  onHome,
  onAbout,
  disabled = false,
}: {
  mode: "guided" | "workspace";
  onChange: (mode: "guided" | "workspace") => void;
  onHome: () => void;
  onAbout: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="studio-nav">
      <button
        className="studio-wordmark"
        onClick={onHome}
        disabled={disabled}
        aria-label="Launch Studio start"
      >
        <img src="/mark.svg" alt="" />
        <strong>Launch Studio</strong>
      </button>
      <nav aria-label="Launch Studio navigation">
        <button
          aria-current={mode === "guided" ? "page" : undefined}
          onClick={() => onChange("guided")}
          disabled={disabled}
        >
          <Route size={17} />
          Guided launch
        </button>
        <button
          aria-current={mode === "workspace" ? "page" : undefined}
          onClick={() => onChange("workspace")}
          disabled={disabled}
        >
          <PanelsTopLeft size={17} />
          Full workspace
        </button>
      </nav>
      <button className="studio-about" onClick={onAbout} aria-haspopup="dialog">
        <Info size={17} />
        About this build
      </button>
    </header>
  );
}
