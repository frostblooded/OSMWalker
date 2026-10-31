// Welcome back: the card that opens on a reopen only when there is something
// to show beyond the boost, namely one small choice (a dilemma) or, after a
// week turns over, last week's recap (once). It also says how long you were
// away, how long he now runs BOOST x, and the clover this check-in earned.
import { useState } from "preact/hooks";
import { BOOST } from "../core/boost";
import type { Dilemma } from "../core/dilemmas";
import { CLOVERS_PER_CHECKIN } from "../core/gifts";
import { placeIcon } from "../core/look";
import { signed } from "../core/money";
import type { Recap, Week } from "../core/week";
import { dist, duration } from "./format";
import { Card, KV } from "./kit";

export function WelcomeSheet({
  awayS,
  boostS,
  clover,
  week,
  dilemma,
  dilemmaS,
  onChoose,
  onShown,
  onDone,
}: { awayS: number; boostS: number; clover: boolean; week: Week; dilemma: Dilemma | null; dilemmaS: number; onChoose: (pick: number) => void; onShown: () => number; onDone: () => void }) {
  return (
    <>
      <Card icon="👋" title="Time away" right={duration(awayS)}>
        <KV k={`⏩ ${BOOST}× speed for`} v={duration(boostS)} tone="ok" />
        {clover && <KV k="☘ Clover for checking in" v={`+${CLOVERS_PER_CHECKIN}`} tone="ok" />}
      </Card>
      {dilemma && <DilemmaCard d={dilemma} leftS={dilemmaS} onChoose={onChoose} onShown={onShown} />}
      {week.pending() && <WeekRecap recap={week.pending()!} favourite={week.favourite()} />}
      <button class="btn primary" onClick={onDone}>
        Carry on
      </button>
    </>
  );
}

/** Last week in two cards: what he did, then how he got on. */
function WeekRecap({ recap: r, favourite }: { recap: Recap; favourite: [string, number] | null }) {
  const money = r.endCents - r.cents;
  return (
    <>
      <Card icon="📅" title="His week" right={weekText(r.start)}>
        <KV k="👣 Walked" v={dist(r.walkedM)} />
        <KV k="📍 Stops" v={r.stops} />
        <KV k="✨ New places" v={r.newPlaces} />
        {favourite && <KV k="❤ Favourite" v={`${placeIcon({ class: favourite[0], subclass: "" })} ${favourite[0].replace(/_/g, " ")} ×${favourite[1]}`} />}
      </Card>
      <Card icon="⭐" title="His week's progress">
        <KV k="⭐ Level" v={r.endLevel > r.level ? `${r.level} → ${r.endLevel}` : r.endLevel} tone={r.endLevel > r.level ? "ok" : undefined} />
        <KV k="💰 Money" v={signed(money)} tone={money > 0 ? "ok" : undefined} />
        <KV k="🏙 Cities" v={r.cities.length ? r.cities.map((c) => c.split(",")[0]).join(", ") : "stayed put"} />
      </Card>
    </>
  );
}

/** "26 Oct – 1 Nov" for the week starting at unix seconds `start`. */
function weekText(start: number): string {
  const f = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(start + 3600)} – ${f(start + 6 * 86400 + 3600)}`;
}

/** The one choice this reopen offers: tap an option before the bar runs out (`leftS`), or he decides by himself. */
function DilemmaCard({ d, leftS, onChoose, onShown }: { d: Dilemma; leftS: number; onChoose: (pick: number) => void; onShown: () => number }) {
  // Its time starts when you first see it (onShown gives the seconds), and the bar drains once from there (see MomentSheet).
  const [drain] = useState(onShown);
  const left = Math.min(leftS, drain);
  return (
    <Card icon={d.icon} title="One choice" right={d.picked === null ? "optional" : undefined}>
      <p>{d.ask}</p>
      {d.picked === null ? (
        <>
          <div class="bar moment-time" role="timer" aria-label={`${Math.ceil(left)} seconds to choose`}>
            <div style={{ animationDuration: `${drain}s` }} />
          </div>
          <div class="choices dilemma">
            {d.labels.map((n, i) => (
              <button key={n} class="btn" onClick={() => onChoose(i)}>
                {n}
              </button>
            ))}
          </div>
          <p class="dim small">Or wait, and he decides by himself.</p>
        </>
      ) : (
        <>
          <KV k={d.by === "you" ? "✔ You chose" : "✔ He chose"} v={d.labels[d.picked]} tone="ok" />
          <p class="dim small">{d.said}</p>
        </>
      )}
    </Card>
  );
}
