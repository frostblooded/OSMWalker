// A timed moment (core/moments.ts): a small choice or one of four
// mini-games (core/minigames.ts), with a bar for the time left. Loaded the
// first time one opens, to keep it out of startup JS. Nothing here waits
// for you: when the bar runs out the game takes his own pick.
import { useMemo, useRef, useState } from "preact/hooks";
import { BULL, deal, NEAR, oddGrid, oddScore, sweepAt, SWEEP_S, TAPS, tapScore, timingScore } from "../core/minigames";
import { scorePick, type GameId, type Moment } from "../core/moments";
import { Rng } from "../core/rng";

const HOW: Record<GameId, string> = { timing: "Tap Stop when the marker is in the green.", cards: "Pick one card.", taps: `Tap ${TAPS} times before time runs out.`, odd: "Tap the one that is different." };

type Props = { m: Moment; left: number; onPick: (id: string) => void; onPlay: (id: string) => void };

export function MomentSheet({ m, left, onPick, onPlay }: Props) {
  return (
    <div class="moment">
      <p>{m.ask}</p>
      {/* The bar shrinks on the compositor; the game settles the moment when it runs out. */}
      <div class="bar moment-time" role="timer" aria-label={`${Math.ceil(left)} seconds to choose`}>
        <div style={{ animationDuration: `${left}s` }} />
      </div>
      {m.game ? <Game m={m} onPick={onPick} onPlay={onPlay} /> : <Choices m={m} onPick={onPick} />}
      <p class="dim small">Or wait, and he {m.game ? "plays it himself" : "decides by himself"}.</p>
    </div>
  );
}

function Choices({ m, onPick }: { m: Moment; onPick: (id: string) => void }) {
  return (
    <div class="choices">
      {m.options.map((o) => (
        <button key={o.id} class="btn" onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Game({ m, onPick, onPlay }: { m: Moment; onPick: (id: string) => void; onPlay: (id: string) => void }) {
  const pick = (score: number) => onPick(scorePick(m, score));
  return (
    <>
      <p class="dim small">{HOW[m.game!]}</p>
      {m.game === "timing" && <Timing onScore={pick} />}
      {m.game === "cards" && <Cards onScore={pick} />}
      {m.game === "taps" && <Taps onScore={pick} onPlay={(s) => onPlay(scorePick(m, s))} />}
      {m.game === "odd" && <Odd onScore={pick} />}
    </>
  );
}

function Timing({ onScore }: { onScore: (s: number) => void }) {
  const start = useRef(performance.now());
  return (
    <>
      <div class="sweep" aria-hidden="true">
        <span class="near" style={{ width: `${NEAR * 200}%` }} />
        <span class="bull" style={{ width: `${BULL * 200}%` }} />
        {/* Out and back like sweepAt: each way takes half a sweep. */}
        <span class="track" style={{ animationDuration: `${SWEEP_S / 2}s` }}>
          <span class="marker" />
        </span>
      </div>
      <button class="btn primary" onClick={() => onScore(timingScore(sweepAt((performance.now() - start.current) / 1000)))}>
        ✋ Stop!
      </button>
    </>
  );
}

function Cards({ onScore }: { onScore: (s: number) => void }) {
  const cards = useMemo(() => deal(new Rng()), []);
  return (
    <div class="choices">
      {cards.map((c, i) => (
        <button key={i} class="btn card-back" aria-label={`Card ${i + 1}`} onClick={() => onScore(c)}>
          🂠
        </button>
      ))}
    </div>
  );
}

function Taps({ onScore, onPlay }: { onScore: (s: number) => void; onPlay: (s: number) => void }) {
  const [taps, setTaps] = useState(0);
  const tap = () => {
    const n = taps + 1;
    setTaps(n);
    if (n >= TAPS) onScore(1);
    else onPlay(tapScore(n));
  };
  return (
    <button class="btn primary tapper" onClick={tap}>
      👆 Tap! {taps} / {TAPS}
    </button>
  );
}

function Odd({ onScore }: { onScore: (s: number) => void }) {
  const grid = useMemo(() => oddGrid(new Rng()), []);
  const [misses, setMisses] = useState<number[]>([]);
  const tap = (i: number) => {
    if (i === grid.odd) return onScore(oddScore(misses.length));
    const next = [...misses, i];
    setMisses(next);
    if (next.length >= 2) onScore(oddScore(next.length));
  };
  return (
    <div class="odd-grid">
      {grid.icons.map((icon, i) => (
        <button key={i} class="btn" disabled={misses.includes(i)} aria-label={`Icon ${i + 1}: ${icon}`} onClick={() => tap(i)}>
          {icon}
        </button>
      ))}
    </div>
  );
}
