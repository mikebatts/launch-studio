import { useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowLeft, Lightbulb, RotateCcw, CheckCircle2 } from "lucide-react";
import { SAMPLE_FEN, SAMPLE_MOVE } from "../shared/types";
const pieceNames: Record<string, string> = {
  k: "king",
  q: "queen",
  n: "knight",
  r: "rook",
  b: "bishop",
  p: "pawn",
};
const pieces: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};
export default function Puzzle({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => void;
}) {
  const [fen, setFen] = useState(SAMPLE_FEN),
    [selected, setSelected] = useState<Square | null>(null),
    [hint, setHint] = useState(false),
    [solved, setSolved] = useState(false),
    [feedback, setFeedback] = useState(
      "White to move. Can one knight threaten two pieces?",
    );
  const game = new Chess(fen);
  const legal = selected
    ? game.moves({ square: selected, verbose: true }).map((m) => m.to)
    : [];
  function move(square: Square) {
    if (solved) return;
    const piece = game.get(square);
    if (piece?.color === "w") {
      setSelected(square);
      return;
    }
    if (!selected) return;
    try {
      const played = game.move({ from: selected, to: square });
      if (!played) return;
      if (selected === SAMPLE_MOVE.from && square === SAMPLE_MOVE.to) {
        setFen(game.fen());
        setSolved(true);
        setFeedback(
          "A royal fork! Ne6+ checks the king on f8 and attacks the queen on g7. The king must answer the check.",
        );
        onComplete();
      } else {
        setFeedback(
          `${played.san} is legal. This exercise is looking for a knight move that attacks both the king and queen. Try again from the starting position.`,
        );
      }
      setSelected(null);
    } catch {
      setFeedback("That move is not legal. Choose a highlighted square.");
    }
  }
  return (
    <section className="learner">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={17} />
        Back to the message
      </button>
      <div className="learner-grid">
        <div>
          <div className="eyebrow">SPOT THE FORK · FREE SAMPLE</div>
          <h1>
            Two threats.
            <br />
            One good move.
          </h1>
          <p className="lead">
            A fork attacks two pieces at once. Look for a knight move that gives
            check and puts the queen under attack.
          </p>
          <div
            className={`puzzle-feedback ${solved ? "solved" : ""}`}
            role="status"
          >
            {solved && <CheckCircle2 size={23} />}
            <p>{feedback}</p>
          </div>
          {hint && (
            <p className="hint">
              The knight starts on d4. Look at e6: which two black pieces could
              it attack from there?
            </p>
          )}
          <div className="button-row">
            <button className="secondary" onClick={() => setHint(!hint)}>
              <Lightbulb size={16} />
              {hint ? "Hide hint" : "Show a hint"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setFen(SAMPLE_FEN);
                setSolved(false);
                setSelected(null);
                setHint(false);
                setFeedback(
                  "White to move. Can one knight threaten two pieces?",
                );
              }}
            >
              <RotateCcw size={15} />
              Try again
            </button>
          </div>
          <p className="fine-print">
            One original exercise, not a full course or engine evaluation. Legal
            moves are validated with chess.js.
          </p>
        </div>
        <div className="board-container">
          <div className="board-top">
            <span>BLACK</span>
            <span>Find the royal fork</span>
          </div>
          <div
            className="chessboard"
            role="group"
            aria-label="Chessboard. White to move"
          >
            {game
              .board()
              .flat()
              .map((piece, i) => {
                const file = i % 8,
                  rank = 8 - Math.floor(i / 8),
                  square = `${"abcdefgh"[file]}${rank}` as Square;
                return (
                  <button
                    key={square}
                    aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${pieceNames[piece.type]}` : ""}${legal.includes(square) ? ", legal destination" : ""}`}
                    className={`square ${(file + rank) % 2 === 0 ? "dark" : "light"} ${selected === square ? "selected" : ""} ${legal.includes(square) ? "legal" : ""} ${piece?.color === "w" ? "white-piece" : "black-piece"}`}
                    onClick={() => move(square)}
                  >
                    {file === 0 && <span className="rank-label">{rank}</span>}
                    {rank === 1 && (
                      <span className="file-label">{"abcdefgh"[file]}</span>
                    )}
                    {piece && (
                      <span
                        className={`piece ${solved && square === SAMPLE_MOVE.to ? "moved-piece" : ""}`}
                      >
                        {pieces[piece.color + piece.type]}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
          <div className="board-bottom">
            <span>WHITE TO MOVE</span>
            <span>
              {solved ? "Nicely spotted." : "Select a piece, then a square."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
