// Debug: what looks wrong with the city, what has loaded, a button that brings
// a new order at once, and two logs (problems, and orders)
// whose entries open into their detail.
import { useEffect } from "preact/hooks";
import * as DebugLog from "../core/debugLog";
import { timeText } from "../core/history";
import type { Game } from "../game/game";
import { facts } from "../game/hud";
import { biasMin } from "./format";
import { Card, Collapsible, Entry, KV } from "./kit";

export function DebugSheet({ game: g, onDone }: { game: Game; onDone: () => void }) {
  useEffect(() => {
    g.problems.markSeen();
    g.changed();
  }, []);
  const f = facts(g)!;
  const bias = biasMin();
  const alerts = g.cityAlerts();
  const ls = g.loader.stats();
  const problems = g.problems.entries();
  const picks = [...g.debugLog.entries].reverse();
  const act = (f: () => void) => () => {
    f();
    onDone();
  };
  return (
    <>
      {alerts.length > 0 && (
        <div class="alerts">
          {alerts.map((a) => (
            <div key={a.text} class={`alert tone-${a.level}`} role="alert">
              {a.level === "error" ? "✖" : "⚠"} {a.text}
            </div>
          ))}
        </div>
      )}
      <Card icon="🏙" title="City" right={g.city.split(",")[0]}>
        <KV k="City box" v={f.boxKm ? `${f.boxKm[0].toFixed(1)} × ${f.boxKm[1].toFixed(1)} km` : "none"} />
        <KV k="Where" v={f.where.map((x) => x.toFixed(5)).join(", ")} />
        <p class="small dim">Doing: {f.doing}</p>
        <div class="buttons">
          <button class="btn" onClick={act(() => g.debugNewOrder())}>
            🛎 New order
          </button>
        </div>
      </Card>
      <Card icon="🛣" title="Loaded">
        <KV k="Street squares" v={`${ls.loaded} (${ls.from_cache} cached, ${ls.downloaded} downloaded)`} />
        <KV k="Loading / queued" v={`${ls.loading} / ${ls.queued}`} />
        <KV k="Failed" v={ls.failed} tone={ls.failed ? "error" : undefined} />
        <KV k="Places in city box" v={f.placesInBox} />
      </Card>
      <Card icon="📜" title="Logs">
        <Collapsible title="⚠ Problems" right={problems.length}>
          {problems.length ? (
            <div class="zebra">
              {problems.map((p, i) => (
                <Entry
                  key={i}
                  tone={p.level === "warning" ? "warning" : "error"}
                  title={`${p.level === "error" ? "✖" : "⚠"} ${p.text}${p.count > 1 ? ` ×${p.count}` : ""}`}
                  lines={[timeText(p.t, bias), ...p.details]}
                />
              ))}
            </div>
          ) : (
            <p class="small dim">✔ No problems so far.</p>
          )}
        </Collapsible>
        <Collapsible title="🛎 Orders" right={picks.length}>
          {picks.length ? (
            <div class="zebra">
              {picks.map((e, i) => (
                <Entry key={i} tone={DebugLog.isWarning(e) ? "warning" : undefined} title={DebugLog.title(e)} lines={DebugLog.lines(e, bias)} />
              ))}
            </div>
          ) : (
            <p class="small dim">No orders yet.</p>
          )}
        </Collapsible>
      </Card>
    </>
  );
}
