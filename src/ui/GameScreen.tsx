// The game screen: the map with him on it, a compact card on top (where he
// is, where he goes, a guess about his next trip, what he waits for, the
// day's stops), zoom on the right edge and the main buttons in a bar at the
// bottom, in reach of the thumb.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Loop } from "../app/loop";
import type { Game } from "../game/game";
import type { Sound } from "../app/sound";
import { hud, ribbon, sound, type Goal, type Hud } from "../game/hud";
import { words, type Forecast } from "../core/forecast";
import { GUESS_CLOVERS, type Guess } from "../core/guess";
import { euro } from "../core/money";
import type { Postcard } from "../core/postcard";
import { MapView } from "../map/mapView";
import { MapScene, type Padding } from "../map/scene";
import { AwaySheet } from "./AwaySheet";
import { CareSheet } from "./CareSheet";
import { DebugSheet } from "./DebugSheet";
import { biasMin, countdown, dist, isResetWord, streetLine, walkTime } from "./format";
import { HelpSheet } from "./HelpSheet";
import { HistorySheet } from "./HistorySheet";
import { PostcardSheet, ReceivedSheet } from "./PostcardSheet";
import { StatsSheet } from "./StatsSheet";

/** Fastest the screen texts redraw. */
const UI_HZ = 4;

type Sheet = "menu" | "history" | "stats" | "collection" | "care" | "postcard" | "help" | "debug" | "reset" | null;

export function GameScreen({ game, onReset, received, onReceivedDone }: { game: Game; onReset: () => void; received?: Postcard | null; onReceivedDone?: () => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  const audio = useRef<Sound | null>(null);
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
        game.woken();
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

  // The city sound: its code loads only once the switch is on; the scene follows him at the screen's redraw rate.
  useEffect(() => {
    if (!game.sound) return;
    let gone = false;
    void import("../app/sound").then(({ Sound }) => {
      if (!gone) audio.current = new Sound();
    });
    return () => {
      gone = true;
      audio.current?.stop();
      audio.current = null;
    };
  }, [game, game.sound]);
  if (game.walker) audio.current?.set(sound(game));

  /** Room the top card and bottom bar take over the map. */
  const padding = (): Padding => ({ top: (topEl.current?.offsetHeight ?? 0) + 12, bottom: 80, left: 0, right: 0 });

  // History shows his trail and numbered markers, fitted above the sheet; closing it follows him again.
  useEffect(() => {
    const on = sheet === "history";
    scene.current?.showHistory(on, on ? (document.querySelector<HTMLElement>(".sheet")?.offsetHeight ?? 0) : 0);
  }, [sheet]);

  const close = () => setSheet(null);
  const backToHim = () => scene.current?.backToHim();

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
              {h.ride ? rideIcon(h.ride.mode) : h.doing === "resting" ? "⏸" : "🚶"}
            </span>
            <div class="grow">
              <div class="city">{h.city} · {h.doing}</div>
              <div class="street">{h.ride ? `Riding to ${h.ride.to} by ${h.ride.mode}` : streetLine(h.street, h.doing === "resting")}</div>
            </div>
            <div class="pills">
              <span class="pill coins">{euro(s.cents)}</span>
              <span class="pill level">Lv {s.level}</span>
            </div>
          </div>
          <GoalChip goal={h.goal} onTap={() => scene.current?.toggleGoal()} />
          {s.care.guess && h.goal?.kind === "going" && h.goal.departing && <GuessRow guess={s.care.guess} onPick={(c) => game.pickGuess(c)} />}
          <ForecastLine f={s.forecast()} />
          <div class="minibars" aria-hidden="true">
            <MiniBar icon="❤" share={s.meters.health / 100} color="var(--hp)" />
            <MiniBar icon="⚡" share={s.meters.energy / 100} color="var(--en)" />
            <MiniBar icon="🍞" share={s.meters.fullness / 100} color="var(--fu)" />
          </div>
          <DayRibbon day={ribbon(game, biasMin())} />
          {mapError && <div class="notice error">✖ {mapError}</div>}
          <Waiting hud={h} />
          {game.severeNow.length > 0 && (
            <button class="notice error link" onClick={() => setSheet("debug")}>
              ⛔ {game.severeNow[0]!.title}
              {game.severeNow.length > 1 && ` (+${game.severeNow.length - 1} more)`} ›
            </button>
          )}
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
        <button class="btn back" onClick={backToHim}>
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
            <button class="btn" onClick={() => setSheet("collection")}>
              🗂 Collection
            </button>
            <button class="btn" onClick={() => setSheet("care")}>
              🎁 Care package <span class="pill clovers">☘ {s.care.clovers}</span>
            </button>
            <button class="btn" onClick={() => setSheet("postcard")}>
              📮 Send a postcard
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
            <button class="btn" role="switch" aria-checked={game.sound} onClick={() => game.setSound(!game.sound)}>
              🔊 City sound <span class={`switch${game.sound ? " on" : ""}`} aria-hidden="true" />
            </button>
            <button class="btn" onClick={() => setSheet("reset")}>
              🔄 New city
            </button>
          </div>
        </SheetBox>
      )}
      {sheet === "history" && (
        <SheetBox title="📜 History" onClose={close}>
          <HistorySheet history={game.stats.history} onFocus={(at) => scene.current?.focusEvent(at)} />
        </SheetBox>
      )}
      {sheet === "stats" && (
        <SheetBox title="🧍 Stats" onClose={close} full>
          <StatsSheet stats={game.stats} />
        </SheetBox>
      )}
      {sheet === "collection" && (
        <SheetBox title="🗂 Collection" onClose={close} full>
          <LazyCollection stats={game.stats} />
        </SheetBox>
      )}
      {sheet === "care" && (
        <SheetBox title="🎁 Care package" onClose={close} full>
          <CareSheet care={s.care} now={game.now()} onSend={(id) => game.sendGift(id)} />
        </SheetBox>
      )}
      {sheet === "postcard" && (
        <SheetBox title="📮 Send a postcard" onClose={close} full>
          <PostcardSheet card={game.postcard()} name={game.postcardName} onName={(n) => game.setPostcardName(n)} />
        </SheetBox>
      )}
      {received && sheet === null && game.woke && !game.away && (
        <SheetBox title="📮 Postcard" onClose={() => onReceivedDone?.()} full>
          <ReceivedSheet
            card={received}
            onReply={() => {
              onReceivedDone?.();
              setSheet("postcard");
            }}
            onDone={() => onReceivedDone?.()}
          />
        </SheetBox>
      )}
      {sheet === "help" && (
        <SheetBox title="❓ Help" onClose={close} onBack={helpPage ? () => setHelpPage("") : undefined} full>
          <HelpSheet data={game.data} page={helpPage} onPage={setHelpPage} />
        </SheetBox>
      )}
      {sheet === "debug" && (
        <SheetBox title="🐞 Debug" onClose={close} full>
          <DebugSheet game={game} onDone={close} />
        </SheetBox>
      )}
      {sheet === "reset" && <ResetDialog onCancel={() => setSheet(null)} onConfirm={onReset} />}
      {game.away && sheet === null && (
        <SheetBox title="🌙 While you were away" onClose={() => game.dismissAway()} full>
          <AwaySheet summary={game.away} clover={game.awayClover} week={game.stats.week} dilemma={game.dilemma} onChoose={(i) => game.chooseDilemma(i)} onDone={() => game.dismissAway()} />
        </SheetBox>
      )}
    </div>
  );
}

type CollectionModule = typeof import("./CollectionSheet");
/** The Collection sheet, loaded the first time it opens to keep it out of startup JS. */
function LazyCollection({ stats }: { stats: Game["stats"] }) {
  const [mod, setMod] = useState<CollectionModule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void import("./CollectionSheet").then(
      (m) => setMod(() => m),
      () => setFailed(true),
    );
  }, []);
  if (failed) return <p class="tone-error">Couldn't load the Collection. Check your connection and try again.</p>;
  return mod ? <mod.CollectionSheet stats={stats} /> : <p class="dim">Loading…</p>;
}

const rideIcon = (mode: string) => (mode === "plane" ? "✈" : mode === "car" ? "🚗" : "🚌");

function GoalChip({ goal, onTap }: { goal: Goal | null; onTap: () => void }) {
  if (!goal) return null;
  if (goal.kind === "resting") {
    return (
      <div class="chip" role="timer">
        <span class="grow">⏳ Resting at {goal.name || "a spot"}</span>
        <span class="eta">Moving again in {countdown(goal.leftS)}</span>
      </div>
    );
  }
  return (
    <button class="chip" onClick={onTap} aria-label="Show him and his goal">
      <span class="grow">
        🎯 {goal.departing ? "Heading to" : "Going to"} {goal.name || "a random spot"}
      </span>
      <span class="eta">
        {dist(goal.distM)}
        {goal.walkLeftM !== null && ` · ${walkTime(goal.walkLeftM, goal.mps)}`}
      </span>
    </button>
  );
}

/** While he walks to the station: guess where he is going, or the guess you made. */
function GuessRow({ guess: g, onPick }: { guess: Guess; onPick: (choice: string) => void }) {
  if (g.pick) return <div class="notice">🎲 Your guess: {g.pick}. He reveals it when he boards.</div>;
  return (
    <div class="guess" role="group" aria-label="Guess where he is going">
      <div class="small dim">
        🎲 Where to? {g.abroad ? "Which country" : "Which city"}, for +{GUESS_CLOVERS} ☘
      </div>
      <div class="choices">
        {g.choices.map((c) => (
          <button key={c} class="btn" onClick={() => onPick(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Why he is standing still, when it is not a rest: streets still loading. */
function Waiting({ hud: h }: { hud: Hud }) {
  if (h.restShare !== null) {
    return (
      <div class="bar" aria-hidden="true">
        <div style={{ width: `${h.restShare * 100}%` }} />
      </div>
    );
  }
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

/** Today's forecast, one dim line (see core/forecast.ts). */
function ForecastLine({ f }: { f: Forecast }) {
  return (
    <div class="dim small forecast" title="Today's forecast">
      {f.icon} {words(f)}
    </div>
  );
}

/** Today's stops as small icons, newest on the right. */
function DayRibbon({ day }: { day: { icons: string[]; more: number } }) {
  if (!day.icons.length) return null;
  return (
    <div class="ribbon" role="img" aria-label={`Today: ${day.icons.length + day.more} stops`}>
      <span class="dim">Today</span>
      {day.more > 0 && <span class="dim">+{day.more}</span>}
      {day.icons.map((icon, i) => (
        <span key={i}>{icon}</span>
      ))}
    </div>
  );
}

function MiniBar({ icon, share, color }: { icon: string; share: number; color: string }) {
  return (
    <div class="minibar">
      <span>{icon}</span>
      <div class="track">
        <div style={{ width: `${Math.round(Math.min(Math.max(share, 0), 1) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function SheetBox({ title, onClose, onBack, full, children }: { title: string; onClose: () => void; onBack?: () => void; full?: boolean; children: ComponentChildren }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <section class={`sheet${full ? " full" : ""}`} role="dialog" aria-label={title}>
      <header>
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
        <p class="dim">He forgets everything: stats, gear, money and history. Type RESET to confirm.</p>
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
