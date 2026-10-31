// While you were away: the summary card that opens when the game comes back
// after a while, with how long it covered, what he did and where, his money
// and level before and after, the clover this check-in earned, now and then
// one small choice, and everything he did folded away below. After a week
// turns over, last week's recap leads it, once.
import type { Summary } from "../core/catchup";
import type { Dilemma } from "../core/dilemmas";
import { CLOVERS_PER_CHECKIN } from "../core/gifts";
import { timeText } from "../core/history";
import { placeIcon } from "../core/look";
import { euro, signed } from "../core/money";
import type { Recap, Week } from "../core/week";
import { biasMin, dist, duration } from "./format";
import { Card, Collapsible, KV } from "./kit";

export function AwaySheet({
  summary: s,
  clover,
  week,
  dilemma,
  onChoose,
  onDone,
}: { summary: Summary; clover: boolean; week: Week; dilemma: Dilemma | null; onChoose: (pick: number) => void; onDone: () => void }) {
  const money = s.endCents - s.startCents;
  const lost = s.awayS - s.coveredS;
  const bias = biasMin();
  return (
    <>
      {week.pending() && <WeekRecap recap={week.pending()!} favourite={week.favourite()} />}
      <Card icon="🌙" title="Time away" right={duration(s.awayS)}>
        <KV k="Lived through" v={duration(s.coveredS)} />
        {s.retired ? <KV k="🌅 Then he retired" v="his heir carries on" /> : lost >= 60 && <KV k="Past the limit, not counted" v={duration(lost)} tone="warning" />}
        {clover && <KV k="☘ Clover for checking in" v={`+${CLOVERS_PER_CHECKIN}`} tone="ok" />}
      </Card>
      {dilemma && <DilemmaCard d={dilemma} onChoose={onChoose} />}
      <Card icon="🚶" title="What he did">
        <KV k="📍 Places visited" v={s.stops} />
        <KV k="✨ New places" v={s.firstVisits} />
        <KV k="👣 Walked" v={dist(s.walkedM)} />
        {s.faints > 0 && <KV k="🏥 Fainted" v={s.faints === 1 ? "once" : `${s.faints} times`} tone="error" />}
      </Card>
      {s.cities.length > 0 && (
        <Card icon="✈" title="Trips" right={s.cities.length}>
          <ol class="zebra">
            {s.cities.map((c, i) => (
              <li key={i}>🏙 {c}</li>
            ))}
          </ol>
        </Card>
      )}
      <Card icon="⭐" title="Progress">
        <KV k="💰 Money" v={`${euro(s.startCents)} → ${euro(s.endCents)}`} />
        <KV k="Change" v={signed(money)} tone={money > 0 ? "ok" : undefined} />
        <KV k="⭐ Level" v={s.endLevel > s.startLevel ? `${s.startLevel} → ${s.endLevel}` : s.endLevel} tone={s.endLevel > s.startLevel ? "ok" : undefined} />
        <KV k="🛍 Bought" v={s.bought.length} />
      </Card>
      {s.lines.length > 0 && (
        <Card icon="📜" title="Everything he did">
          <Collapsible title={`${s.lines.length} events, newest first`}>
            <ol class="zebra away-log">
              {s.lines
                .map((l, i) => (
                  <li key={i}>
                    <span class="grow">{l.text}</span>
                    <span class="dim small">{timeText(l.t, bias)}</span>
                  </li>
                ))
                .reverse()}
            </ol>
          </Collapsible>
        </Card>
      )}
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

/** The one choice this reopen offers: tap an option, or carry on and he decides by himself. */
function DilemmaCard({ d, onChoose }: { d: Dilemma; onChoose: (pick: number) => void }) {
  return (
    <Card icon={d.icon} title="One choice" right={d.picked === null ? "optional" : undefined}>
      <p>{d.ask}</p>
      {d.picked === null ? (
        <>
          <div class="choices dilemma">
            {d.labels.map((n, i) => (
              <button key={n} class="btn" onClick={() => onChoose(i)}>
                {n}
              </button>
            ))}
          </div>
          <p class="dim small">Or carry on, and he decides by himself.</p>
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
