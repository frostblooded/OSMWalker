// Today's stops as a row of icons, then his last events, newest first. Each
// row has the number of its marker on the map and the time; tapping it shows
// where it happened.
import type { History, LatLon } from "../core/history";
import { biasMin, historyTime } from "./format";
import { Card } from "./kit";

export function HistorySheet({ history: h, day, onFocus }: { history: History; day: Day; onFocus: (at: LatLon) => void }) {
  if (!h.entries.length) return <p class="dim">Nothing yet. What he does shows up here.</p>;
  const bias = biasMin();
  const rows = h.entries.map((e, i) => ({ e, i })).reverse();
  return (
    <>
      <DayRibbon day={day} />
      <ol class="history zebra">
        {rows.map(({ e, i }) => (
          <li key={`${e.t}:${i}`}>
            <button class="row" disabled={!e.at} onClick={() => e.at && onFocus(e.at)}>
              <span class="num">{h.number(i)}</span>
              <span class="grow">{e.text}</span>
              <span class="dim small">{historyTime(h, i, bias)}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

type Day = { icons: string[]; more: number };

/** Today's stops as small icons, newest on the right. */
function DayRibbon({ day }: { day: Day }) {
  if (!day.icons.length) return null;
  const n = day.icons.length + day.more;
  return (
    <Card icon="📅" title="Today" right={`${n} ${n === 1 ? "stop" : "stops"}`}>
      <div class="ribbon" role="img" aria-label={`Today: ${n} stops`}>
        {day.more > 0 && <span class="dim">+{day.more}</span>}
        {day.icons.map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>
    </Card>
  );
}
