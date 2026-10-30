// While you were away: the summary card that opens when the game comes back
// after a while, with how long it covered, what he did and where, his money
// and level before and after, the clover this check-in earned, and
// everything he did folded away below.
import type { Summary } from "../core/catchup";
import { CLOVERS_PER_CHECKIN } from "../core/gifts";
import { timeText } from "../core/history";
import { euro, signed } from "../core/money";
import { biasMin, dist, duration } from "./format";
import { Card, Collapsible, KV } from "./kit";

export function AwaySheet({ summary: s, clover, onDone }: { summary: Summary; clover: boolean; onDone: () => void }) {
  const money = s.endCents - s.startCents;
  const lost = s.awayS - s.coveredS;
  const bias = biasMin();
  return (
    <>
      <Card icon="🌙" title="Time away" right={duration(s.awayS)}>
        <KV k="Lived through" v={duration(s.coveredS)} />
        {lost >= 60 && <KV k="Past the limit, not counted" v={duration(lost)} tone="warning" />}
        {clover && <KV k="☘ Clover for checking in" v={`+${CLOVERS_PER_CHECKIN}`} tone="ok" />}
      </Card>
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
