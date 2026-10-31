// Debug: what looks wrong with the city, what has loaded, the ways out, the
// trip dice, buttons that change the game at once, and three logs (trivia,
// problems, goal picks) whose entries open into their detail.
import { useEffect } from "preact/hooks";
import * as DebugLog from "../core/debugLog";
import { timeText } from "../core/history";
import { euro } from "../core/money";
import { CITY_CHANCE, COUNTRY_CHANCE, NO_PLACES_BOOST } from "../core/trips";
import type { Game } from "../game/game";
import { facts } from "../game/hud";
import { biasMin } from "./format";
import { Card, Collapsible, Entry, KV } from "./kit";

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

export function DebugSheet({ game: g, onDone }: { game: Game; onDone: () => void }) {
  useEffect(() => {
    g.problems.markSeen();
    g.changed();
  }, []);
  const f = facts(g)!;
  const bias = biasMin();
  const alerts = g.cityAlerts();
  const ls = g.loader.stats();
  const sm = g.citySummary;
  const boost = g.noPlaces() ? NO_PLACES_BOOST : 1;
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
        <KV k="Country" v={g.country || "?"} />
        <KV k="City box" v={f.boxKm ? `${f.boxKm[0].toFixed(1)} × ${f.boxKm[1].toFixed(1)} km` : "none"} />
        <KV k="Where" v={f.where.map((x) => x.toFixed(5)).join(", ")} />
        <p class="small dim">Doing: {f.doing}</p>
      </Card>
      <Card icon="🛣" title="Loaded">
        <KV k="Street squares" v={`${ls.loaded} (${ls.from_cache} cached, ${ls.downloaded} downloaded)`} />
        <KV k="Loading / queued" v={`${ls.loading} / ${ls.queued}`} />
        <KV k="Failed" v={ls.failed} tone={ls.failed ? "error" : undefined} />
        <KV k="Places in city box" v={f.placesInBox} />
        <KV k="Trivia" v={g.cityFacts.length} />
      </Card>
      <Card icon="🚪" title="Ways out and pay">
        {sm ? (
          <>
            <KV k="🚌 Bus stations" v={sm.bus} tone={sm.bus ? undefined : "warning"} />
            <KV k="✈ Airports" v={sm.airport} />
            <KV k="⛽ Gas stations" v={sm.gas} tone={sm.gas ? undefined : "warning"} />
            <KV k="🚗 Car dealers" v={sm.dealer} />
            <KV k="💰 Places that pay" v={sm.earn} tone={sm.earn ? undefined : "error"} />
          </>
        ) : (
          <p class="small dim">Checked once the streets all around him have loaded.</p>
        )}
      </Card>
      <Card icon="🎲" title="Trip dice">
        <KV k="Another country" v={pct(COUNTRY_CHANCE * boost)} />
        <KV k="Another city" v={pct(CITY_CHANCE * boost)} />
        {boost > 1 && <p class="small tone-warning">Odds doubled: no places of note in the city box.</p>}
        {g.stats.savingFor > 0 && <KV k="Saving up for a trip" v={`${euro(g.stats.cents)} / ${euro(g.stats.savingFor)}`} />}
        <div class="buttons">
          <button class="btn" onClick={act(() => g.debugNewGoal())}>
            🎯 New goal
          </button>
          <button class="btn" onClick={act(() => g.debugTrip("city"))}>
            🏙 New city
          </button>
          <button class="btn" onClick={act(() => g.debugTrip("country"))}>
            🌍 New country
          </button>
        </div>
      </Card>
      <Card icon="🎂" title="Life stage" right={g.stats.life.title()}>
        <button class="btn" onClick={act(() => g.debugAge())}>
          ⏩ A stage older
        </button>
      </Card>
      <Card icon="🤔" title="Dilemmas">
        <button class="btn" role="switch" aria-checked={g.alwaysDilemma} onClick={() => g.setAlwaysDilemma(!g.alwaysDilemma)}>
          One on every long reopen <span class={`switch${g.alwaysDilemma ? " on" : ""}`} aria-hidden="true" />
        </button>
      </Card>
      <Card icon="📜" title="Logs">
        <Collapsible title="🧠 Trivia" right={g.cityFacts.length}>
          {g.cityFacts.length ? (
            <div class="zebra">
              {g.cityFacts.map((a) => (
                <div key={a.name}>{a.name}</div>
              ))}
            </div>
          ) : (
            <p class="small dim">None for this city.</p>
          )}
        </Collapsible>
        <Collapsible title="⚠ Problems" right={problems.length}>
          {problems.length ? (
            <div class="zebra">
              {problems.map((p, i) => (
                <Entry
                  key={i}
                  tone={p.level === "warning" ? "warning" : "error"}
                  title={`${p.level === "severe" ? "⛔" : p.level === "error" ? "✖" : "⚠"} ${p.text}${p.count > 1 ? ` ×${p.count}` : ""}`}
                  lines={[timeText(p.t, bias), ...p.details]}
                />
              ))}
            </div>
          ) : (
            <p class="small dim">✔ No problems so far.</p>
          )}
        </Collapsible>
        <Collapsible title="🎯 Goal picks" right={picks.length}>
          {picks.length ? (
            <div class="zebra">
              {picks.map((e, i) => (
                <Entry key={i} tone={DebugLog.isWarning(e) ? "warning" : undefined} title={DebugLog.title(e)} lines={DebugLog.lines(e, bias)} />
              ))}
            </div>
          ) : (
            <p class="small dim">No picks yet.</p>
          )}
        </Collapsible>
      </Card>
    </>
  );
}
