// The game screen: the map with him on it, a compact card on top (where he
// is, where he goes, his money and level), zoom on the right edge and the
// menu button at the bottom, in reach of the thumb.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Loop } from "../app/loop";
import { euro } from "../core/money";
import type { Game } from "../game/game";
import { hud, type Goal, type Hud } from "../game/hud";
import { MapScene, type Padding } from "../map/scene";
import { MapView } from "../map/mapView";
import { DebugSheet } from "./DebugSheet";
import { dist, isResetWord, streetLine, walkTime } from "./format";
import { HelpSheet } from "./HelpSheet";
import { HistorySheet } from "./HistorySheet";
import { settle } from "./snap";
import { StatsSheet } from "./StatsSheet";

/** Fastest the screen texts redraw. */
const UI_HZ = 4;

type Sheet = "menu" | "history" | "stats" | "help" | "debug" | "reset" | null;

export function GameScreen({ game, onReset }: { game: Game; onReset: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const [, redraw] = useState(0);
  const [following, setFollowing] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [helpPage, setHelpPage] = useState("");
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let loop: Loop | null = null;
    let view: MapView | null = null;
    let last = 0;
    let gone = false;
    MapView.create(mapEl.current!, game.walker!.position(), game.zoom)
      .then((v) => {
        if (gone) return v.destroy();
        view = v;
        const sc = new MapScene(game, v, padding);
        sc.onFollowing = setFollowing;
        scene.current = sc;
        loop = new Loop(game, sc);
        loop.onTick = () => {
          const now = performance.now();
          if (now - last < 1000 / UI_HZ) return;
          last = now;
          redraw((n) => n + 1);
        };
        loop.start();
        performance.mark("osmwalker:map");
      })
      .catch((e: Error) => {
        game.problems.error(`The map couldn't start: ${e.message}`);
        setMapError("The map couldn't load. Check your connection and reload.");
      });
    const unsub = game.subscribe(() => redraw((n) => n + 1));
    return () => {
      gone = true;
      unsub();
      loop?.stop();
      view?.destroy();
      scene.current = null;
    };
  }, [game]);

  /** Room the top card and bottom bar take over the map. */
  const padding = (): Padding => ({ top: (topEl.current?.offsetHeight ?? 0) + 12, bottom: 80, left: 0, right: 0 });

  // History shows his trail and numbered markers, fitted above the sheet (again when it is dragged); closing it follows him again.
  const fitHistory = () => {
    const on = sheet === "history";
    scene.current?.showHistory(on, on ? (document.querySelector<HTMLElement>(".sheet")?.offsetHeight ?? 0) : 0);
  };
  useEffect(fitHistory, [sheet]);

  const close = () => setSheet(null);
  const zoom = (step: number) => scene.current?.zoomBy(step);

  const h = hud(game);
  if (!h) return null;
  const s = game.stats;
  return (
    <div class="game">
      <div class="map" ref={mapEl} />
      <div class="top" ref={topEl}>
        <section class="card hud" aria-live="polite" aria-label="Where he is">
          <div class="hud-head">
            <span class="hud-icon" aria-hidden="true">
              🚶
            </span>
            <div class="grow">
              <div class="city">{h.city}</div>
              <div class="street">{streetLine(h.street)}</div>
            </div>
            <div class="pills">
              <span class="pill coins">{euro(s.cents)}</span>
              <span class="pill level">Lv {s.level}</span>
            </div>
          </div>
          <GoalChip goal={h.goal} onTap={() => scene.current?.toggleGoal()} />
          {mapError && <div class="notice error">✖ {mapError}</div>}
          <Waiting hud={h} />
        </section>
        {s.history.entries.length > 0 && (
          <div class="toast" role="status" key={s.history.entries.length}>
            {s.history.latest()}
          </div>
        )}
      </div>
      <div class="zoom">
        <button class="btn round" aria-label="Zoom in" onClick={() => zoom(1)}>
          +
        </button>
        <button class="btn round" aria-label="Zoom out" onClick={() => zoom(-1)}>
          −
        </button>
      </div>
      {!following && game.cameraFollows && (
        <button class="btn back" onClick={() => scene.current?.backToHim()}>
          🙂 Back to him
        </button>
      )}
      <button class="btn round burger" aria-label="Menu" onClick={() => setSheet(sheet === "menu" ? null : "menu")}>
        ☰{game.problems.unseen > 0 && <span class="dot" />}
      </button>
      {sheet === "menu" && (
        <SheetBox title="☰ Menu" onClose={close}>
          <div class="menu">
            <button class="btn" onClick={() => setSheet("history")}>
              📜 History
            </button>
            <button class="btn" onClick={() => setSheet("stats")}>
              🧍 Stats
            </button>
            <button
              class="btn"
              onClick={() => {
                setHelpPage("");
                setSheet("help");
              }}
            >
              ❓ Help
            </button>
            <button class="btn" onClick={() => setSheet("debug")}>
              🐞 Debug {game.problems.unseen > 0 && <span class="dot" role="img" aria-label="new problems" />}
            </button>
            <button class="btn" role="switch" aria-checked={game.showRoute} onClick={() => game.setShowRoute(!game.showRoute)}>
              🧭 Route to goal <span class={`switch${game.showRoute ? " on" : ""}`} aria-hidden="true" />
            </button>
            <button class="btn" role="switch" aria-checked={game.cameraFollows} onClick={() => game.setCameraFollows(!game.cameraFollows)}>
              🎥 Camera follows him <span class={`switch${game.cameraFollows ? " on" : ""}`} aria-hidden="true" />
            </button>
            <button class="btn" role="switch" aria-checked={game.showCityArea} onClick={() => game.setShowCityArea(!game.showCityArea)}>
              🗺 City area <span class={`switch${game.showCityArea ? " on" : ""}`} aria-hidden="true" />
            </button>
            <button class="btn" onClick={() => setSheet("reset")}>
              🔄 New city
            </button>
          </div>
        </SheetBox>
      )}
      {sheet === "history" && (
        <SheetBox title="📜 History" onClose={close} onResize={fitHistory}>
          <HistorySheet history={s.history} onFocus={(at) => scene.current?.focusEvent(at)} />
        </SheetBox>
      )}
      {sheet === "stats" && (
        <SheetBox title="🧍 Stats" onClose={close}>
          <StatsSheet stats={s} />
        </SheetBox>
      )}
      {sheet === "help" && (
        <SheetBox title="❓ Help" onClose={close} onBack={helpPage ? () => setHelpPage("") : undefined} full>
          <HelpSheet page={helpPage} onPage={setHelpPage} />
        </SheetBox>
      )}
      {sheet === "debug" && (
        <SheetBox title="🐞 Debug" onClose={close} full>
          <DebugSheet game={game} onDone={close} />
        </SheetBox>
      )}
      {sheet === "reset" && <ResetDialog onCancel={close} onConfirm={onReset} />}
    </div>
  );
}

function GoalChip({ goal, onTap }: { goal: Goal | null; onTap: () => void }) {
  if (!goal) return null;
  return (
    <button class="chip" onClick={onTap} aria-label="Show him and his goal">
      <span class="grow">🎯 Going to {goal.name || "a random spot"}</span>
      <span class="eta">
        {dist(goal.distM)}
        {goal.walkLeftM !== null && ` · ${walkTime(goal.walkLeftM, goal.mps)}`}
      </span>
    </button>
  );
}

/** Why he is standing still: streets still loading, or the map server out of reach. */
function Waiting({ hud: h }: { hud: Hud }) {
  if (h.waiting === "failing") return <div class="notice error">✖ Can't reach the map server. Retrying…</div>;
  if (h.waiting === "streets") {
    return (
      <div class="notice">
        <span class="spin" /> 🛣 Loading streets…
      </div>
    );
  }
  return null;
}

/**
 * A sheet over the map. Dragging its title bar resizes it: it stays at the
 * height where the finger lets go, up to its tallest, and closes when let go
 * below CLOSE_AT of the screen (src/ui/snap.ts).
 */
export function SheetBox({ title, onClose, onBack, onResize, full, children }: { title: string; onClose: () => void; onBack?: () => void; onResize?: () => void; full?: boolean; children: ComponentChildren }) {
  // The height as a share of the screen once dragged; null is the sheet's own height.
  const [share, setShare] = useState<number | null>(null);
  // Counts releases, so History refits even when a drag ends at the same height.
  const [drops, setDrops] = useState(0);
  const box = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number; dy: number } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    if (drops) onResize?.();
  }, [drops]);
  const down = (e: PointerEvent) => {
    if (!box.current || (e.target as Element).closest("button")) return;
    drag.current = { y: e.clientY, h: box.current.offsetHeight, dy: 0 };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  // The height follows the finger without a re-render; it is kept once, on release.
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    d.dy = e.clientY - d.y;
    // A few px of jitter is a tap, not a drag.
    if (Math.abs(d.dy) < 8 && !box.current.style.height) return;
    const st = box.current.style;
    st.height = `${Math.max(d.h - d.dy, 0)}px`;
    st.maxHeight = "none";
    st.top = "auto";
  };
  // A cancelled gesture (the system took the touch) puts the sheet back as it was.
  const up = (e: PointerEvent) => {
    const d = drag.current;
    const el = box.current;
    drag.current = null;
    if (!d || !el?.style.height) return;
    const next = e.type === "pointercancel" ? (share ?? "keep") : settle(el.offsetHeight, el.parentElement?.clientHeight ?? innerHeight, !!full);
    // Only a drag down closes it; a short sheet dragged up stays as it was.
    if (next === "close" && d.dy > 0) return onClose();
    el.style.height = el.style.top = "";
    if (next === "close" || next === "keep") {
      el.style.maxHeight = share === null ? "" : `${share * 100}%`;
      return;
    }
    // Written here as well as in the style prop: Preact won't rewrite a value it thinks is unchanged.
    el.style.maxHeight = full && next >= 1 ? "" : `${next * 100}%`;
    setShare(next);
    setDrops(drops + 1);
  };
  const whole = full && (share === null || share >= 1);
  const style = share !== null && !whole ? { maxHeight: `${share * 100}%` } : undefined;
  return (
    <section class={`sheet${whole ? " full" : ""}`} style={style} role="dialog" aria-label={title} ref={box}>
      <header onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {onBack && (
          <button class="btn" onClick={onBack} aria-label="Back">
            ‹ Back
          </button>
        )}
        <h2>{title}</h2>
        <button class="btn" onClick={onClose}>
          ✕ Close
        </button>
      </header>
      <div class="body">{children}</div>
    </section>
  );
}

function ResetDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [word, setWord] = useState("");
  return (
    <div class="dialog-bg">
      <div class="card dialog" role="alertdialog" aria-label="New city">
        <h2>🔄 Start over in a new city?</h2>
        <p class="dim">He forgets everything: his money, level, places and history. Type RESET to confirm.</p>
        <input value={word} aria-label="Type RESET" autocapitalize="characters" onInput={(e) => setWord((e.target as HTMLInputElement).value)} />
        <button class="btn danger" disabled={!isResetWord(word)} onClick={onConfirm}>
          Start over
        </button>
        <button class="btn" onClick={onCancel}>
          Keep walking
        </button>
      </div>
    </div>
  );
}
