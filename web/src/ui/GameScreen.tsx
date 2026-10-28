// The game screen: the map with him on it, a compact card on top (where he
// is, where he goes, what he waits for), zoom on the right edge and the main
// buttons in a bar at the bottom, in reach of the thumb.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { distanceM, type BBox } from "../core/geo";
import { Loop } from "../app/loop";
import type { Game } from "../game/game";
import { MapView, type Padding } from "../map/mapView";
import { countdown, dist, isResetWord, streetLine, walkTime } from "./format";

/** Fastest the screen texts redraw. */
const UI_HZ = 4;

type Sheet = "menu" | "history" | "stats" | "reset" | null;

export function GameScreen({ game, onReset }: { game: Game; onReset: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLDivElement>(null);
  const view = useRef<MapView | null>(null);
  const [, redraw] = useState(0);
  const [following, setFollowing] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [mapError, setMapError] = useState("");
  const goalView = useRef<string>("");
  const tripView = useRef<string>("");

  useEffect(() => {
    let loop: Loop | null = null;
    let last = 0;
    let gone = false;
    const w = game.walker!;
    MapView.create(mapEl.current!, w.position(), game.zoom)
      .then((v) => {
        if (gone) return v.destroy();
        view.current = v;
        v.onUserMove = () => setFollowing(false);
        v.setPadding(padding());
        loop = new Loop(game, () => view.current);
        loop.onTick = () => {
          const now = performance.now();
          if (now - last < 1000 / UI_HZ) return;
          last = now;
          keepView();
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
      loop?.pause();
      view.current?.destroy();
      view.current = null;
    };
  }, [game]);

  /** Room the top card and bottom bar take over the map. */
  const padding = (): Padding => ({ top: (topEl.current?.offsetHeight ?? 0) + 12, bottom: 80, left: 0, right: 0 });

  /** A goal view ends by itself when he picks a new goal or sets off on a trip. */
  const keepView = () => {
    if (goalView.current && goalView.current !== goalKey()) backToHim();
    // A trip zooms out to show the whole ride; landing follows him again.
    const t = game.walker?.travel;
    const key = t ? `${t.to.name}:${t.path.length}` : "";
    if (key === tripView.current) return;
    tripView.current = key;
    if (t) view.current?.fit(pathBox(t.path), { ...padding(), bottom: 120, left: 40, right: 40 });
    else backToHim();
  };
  const goalKey = () => String(game.goalTarget() ?? "");

  const backToHim = () => {
    goalView.current = "";
    view.current?.follow();
    view.current?.map.easeTo({ zoom: game.zoom, duration: 0 });
    setFollowing(true);
  };

  const showGoal = () => {
    const v = view.current;
    const target = game.goalTarget();
    if (!v || !target || goalView.current) return backToHim();
    const here = game.walker!.position();
    const box: BBox = [Math.min(here[0], target[0]), Math.min(here[1], target[1]), Math.max(here[0], target[0]), Math.max(here[1], target[1])];
    v.fit(box, { ...padding(), top: padding().top + 40, bottom: 140, left: 40, right: 40 }, game.zoom);
    goalView.current = goalKey();
    setFollowing(false);
  };

  const zoom = (step: number) => {
    const v = view.current;
    if (!v) return;
    game.zoom = v.zoomBy(step);
  };

  const w = game.walker;
  if (!w) return null;
  const s = game.stats;
  return (
    <div class="game">
      <div class="map" ref={mapEl} />
      <div class="top" ref={topEl}>
        <div class="card" aria-live="polite">
          <div class="city">
            <span>🏙 {game.city}</span>
            <span>
              {s.coins}c · Lv {s.level}
            </span>
          </div>
          <div class="street">{w.travel ? `${rideIcon(w.travel.mode)} Riding to ${w.travel.to.name} by ${w.travel.mode}` : streetLine(w.streetName(), w.isResting())}</div>
          <GoalChip game={game} onTap={showGoal} />
          {mapError && <div class="notice error">✖ {mapError}</div>}
          <Waiting game={game} />
          {game.severeNow.map((p) => (
            <div class="notice error" key={p.title}>
              ⚠ {p.title}
            </div>
          ))}
        </div>
        {s.history.entries.length > 0 && (
          <div class="card toast" key={s.history.entries.length}>
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
      {!following && (
        <button class="btn back" onClick={backToHim}>
          🙂 Back to him
        </button>
      )}
      <nav class="thumbs" aria-label="Main">
        <Thumb icon="☰" label="Menu" onClick={() => setSheet("menu")} />
        <Thumb icon="📜" label="History" onClick={() => setSheet("history")} />
        <Thumb icon="🧍" label="Stats" onClick={() => setSheet("stats")} />
      </nav>
      {sheet === "menu" && (
        <SheetBox title="☰ Menu" onClose={() => setSheet(null)}>
          <div class="menu">
            <button class="btn" onClick={() => game.setShowCityArea(!game.showCityArea)}>
              🗺 City area: {game.showCityArea ? "on" : "off"}
            </button>
            <button class="btn" onClick={() => setSheet("reset")}>
              🔄 New city
            </button>
          </div>
        </SheetBox>
      )}
      {sheet === "reset" && <ResetDialog onCancel={() => setSheet(null)} onConfirm={onReset} />}
    </div>
  );
}

function pathBox(path: [number, number][]): BBox {
  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
}

const rideIcon = (mode: string) => (mode === "plane" ? "✈" : mode === "car" ? "🚗" : "🚌");

function GoalChip({ game, onTap }: { game: Game; onTap: () => void }) {
  const w = game.walker!;
  const target = game.goalTarget();
  if (!target) return null;
  const name = w.place?.name ?? "";
  if (w.isResting()) {
    return (
      <div class="chip" role="timer">
        <span>⏳ Resting at {name || "a spot"}</span>
        <span class="eta">Moving again in {countdown(w.restLeftS())}</span>
      </div>
    );
  }
  const here = w.position();
  const left = w.walkLeftM();
  return (
    <button class="chip" onClick={onTap} aria-label="Show him and his goal">
      <span>
        🎯 {w.isDeparting() ? "Heading to" : "Going to"} {name || "a random spot"} · {dist(distanceM(here[0], here[1], target[0], target[1]))}
      </span>
      {left !== null && <span class="eta">{walkTime(left, w.speedMps)}</span>}
    </button>
  );
}

/** Why he is standing still, when it is not a rest: streets still loading. */
function Waiting({ game }: { game: Game }) {
  const w = game.walker!;
  if (w.isResting() && !w.isTraveling()) {
    return (
      <div class="bar" aria-hidden="true">
        <div style={{ width: `${w.restFraction() * 100}%` }} />
      </div>
    );
  }
  if (!w.needsData()) return null;
  if (game.loader.isFailing()) return <div class="notice error">✖ Can't reach the map server. Retrying…</div>;
  return (
    <div class="notice">
      <span class="spin" /> 🛣 Loading streets…
    </div>
  );
}

function Thumb({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button class="btn" onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function SheetBox({ title, onClose, full, children }: { title: string; onClose: () => void; full?: boolean; children: ComponentChildren }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <section class={`sheet${full ? " full" : ""}`} role="dialog" aria-label={title}>
      <header>
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
        <p class="dim">He forgets everything: stats, gear, coins and history. Type RESET to confirm.</p>
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
