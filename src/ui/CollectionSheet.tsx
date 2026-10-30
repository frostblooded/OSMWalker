// The Collection: his overall %, badges and title on top, then a tab per
// topic. Each set is a card with a progress bar and a grid of tiles, like a
// dex: found entries show their name, the rest are ? tiles; tapping a tile
// shows its detail or hint. The Feats tab lists badges. Everything comes from
// core/collection.ts. Loaded only when the sheet first opens.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import * as C from "../core/collection";
import * as K from "../core/keepsakes";
import type { Stats } from "../core/stats";
import { Bar, Card, Collapsible, KV, RARITY_COLOR } from "./kit";

/** Sets with more entries than this, and no groups, start closed. */
const OPEN_UP_TO = 30;
/** The tab he looked at last, kept while the page is open. */
let lastTab: C.Tab = "cards";

/** "0.4" or "37": a tenth below 10%, so early finds still move it. */
const pct = (got: number, total: number) => {
  const p = total ? (got / total) * 100 : 0;
  return p < 10 ? String(Math.floor(p * 10) / 10) : String(Math.floor(p));
};

/** A grid of tiles; the picked one's detail or hint shows right under the grid it is in. */
function Tiles({ entries, picked, onPick }: { entries: C.Entry[]; picked: C.Entry | null; onPick: (e: C.Entry) => void }) {
  const shown = picked && entries.find((e) => e.id === picked.id);
  return (
    <>
      <div class="dex">
        {entries.map((e) => (
          <button
            key={e.id}
            class={`dex-tile${e.got ? "" : " unfound"}${e.finish ? ` ${e.finish}` : ""}`}
            style={e.got && e.rarity ? { borderColor: RARITY_COLOR[e.rarity] } : undefined}
            aria-label={e.got ? e.name : `Not found yet: ${e.info}`}
            onClick={() => onPick(e)}
          >
            <span aria-hidden="true">{e.got ? e.icon : "?"}</span>
            {e.got && <span class="small">{e.name}</span>}
          </button>
        ))}
      </div>
      {shown && (
        <p class="dex-pick" aria-live="polite">
          {shown.got ? `${shown.icon} ${shown.name} · ${shown.info}` : `❓ ${shown.info}`}
        </p>
      )}
    </>
  );
}

function SetCard({ set, stats }: { set: C.CSet; stats: Stats }) {
  const [picked, setPicked] = useState<C.Entry | null>(null);
  const entries = set.entries(stats);
  const got = entries.filter((e) => e.got);
  const groups = [...new Set(entries.map((e) => e.group ?? ""))];
  const byGroup = (g: string) => entries.filter((e) => (e.group ?? "") === g);
  const started = set.startedOnly ? groups.filter((g) => byGroup(g).some((e) => e.got)) : groups;
  const tiles = (list: C.Entry[]) => <Tiles entries={list} picked={picked} onPick={setPicked} />;
  let body: ComponentChildren;
  if (set.open) body = got.length ? tiles(got.slice(0, K.CARDS_SHOWN)) : null;
  else if (groups.length > 1)
    body = started.map((g) => {
      const list = byGroup(g);
      return (
        <Collapsible key={g} title={g} right={`${list.filter((e) => e.got).length} / ${list.length}`}>
          {tiles(list)}
        </Collapsible>
      );
    });
  else if (entries.length > OPEN_UP_TO) body = <Collapsible title="All">{tiles(entries)}</Collapsible>;
  else body = tiles(entries);
  const hidden = groups.length - started.length;
  return (
    <Card icon={set.icon} title={set.title} right={set.open ? got.length : `${got.length} / ${entries.length}`}>
      {!set.open && <Bar share={entries.length ? got.length / entries.length : 0} color="var(--ok)" />}
      {set.facts?.(stats).map(([k, v]) => <KV key={k} k={k} v={v} />)}
      {body}
      {set.open && got.length > K.CARDS_SHOWN && <p class="dim small">The newest {K.CARDS_SHOWN} of {got.length}.</p>}
      {hidden > 0 && <p class="dim small">{started.length ? `${hidden} more not started.` : "None yet."}</p>}
      {set.open && !got.length && <p class="dim small">None yet.</p>}
    </Card>
  );
}

/** Badges, a card per tab they belong to, so no card holds more than a few. */
function Feats({ stats: s }: { stats: Stats }) {
  return (
    <>
      {C.TABS.map((t) => {
        const feats = C.FEATS.filter((f) => f.tab === t.id);
        if (!feats.length) return null;
        return (
          <Card key={t.id} icon={t.icon} title={t.name} right={`${feats.filter((f) => C.tierHeld(f, s) === 3).length} / ${feats.length} Gold`}>
            <div class="zebra">
              {feats.map((f) => {
                const n = f.count(s);
                const tier = C.tierHeld(f, s);
                const next = f.tiers[tier];
                return (
                  <div key={f.id}>
                    <KV k={`${f.icon} ${f.name}`} v={[1, 2, 3].map((t) => (tier >= t ? C.MEDALS[t] : "·")).join(" ")} />
                    <div class="small dim">{next === undefined ? `Done · title ${f.title}` : `${C.say(f, `${Math.min(n, next)} / ${next}`)} for ${C.TIER_NAMES[tier + 1]}`}</div>
                    {next !== undefined && <Bar share={n / next} color="var(--ok)" />}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </>
  );
}

export function CollectionSheet({ stats: s }: { stats: Stats }) {
  const [tab, setTab] = useState<C.Tab>(lastTab);
  const pick = (t: C.Tab) => setTab((lastTab = t));
  const { got, total } = C.completion(s);
  const tiers = [3, 2, 1].map((t) => C.FEATS.filter((f) => C.tierHeld(f, s) === t).length);
  return (
    <>
      <Card icon="🗂" title="Completion" right={`${pct(got, total)}%`}>
        <Bar share={total ? got / total : 0} color="var(--ok)" />
        <KV k="🏅 Badges" v={`🥇 ${tiers[0]} · 🥈 ${tiers[1]} · 🥉 ${tiers[2]}`} />
        <KV k="🎖 Title" v={s.keepsakes.title || "none yet"} />
      </Card>
      <div class="tabs" role="tablist">
        {C.TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} class={`tab${tab === t.id ? " on" : ""}`} onClick={() => pick(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            <span class="small">{t.name}</span>
          </button>
        ))}
      </div>
      {tab === "feats" ? <Feats stats={s} /> : C.SETS.filter((x) => x.tab === tab).map((x) => <SetCard key={x.id} set={x} stats={s} />)}
    </>
  );
}
