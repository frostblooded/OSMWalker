// His last events, newest first. Each row has the number of its marker on
// the map and the time; tapping it shows where it happened.
import type { History, LatLon } from "../core/history";
import { biasMin, historyTime } from "./format";

export function HistorySheet({ history: h, onFocus }: { history: History; onFocus: (at: LatLon) => void }) {
  if (!h.entries.length) return <p class="dim">Nothing yet. What he does shows up here.</p>;
  const bias = biasMin();
  const rows = h.entries.map((e, i) => ({ e, i })).reverse();
  return (
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
  );
}
