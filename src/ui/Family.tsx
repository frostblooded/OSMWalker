// His life and his family (core/life.ts): the Life card with his stage, the
// care so far and the family perk; the drawn family tree, whose walkers open
// into their farewell letter; and the farewell card shown once when one
// retires; and the hall of walkers (core/hall.ts). Part of the Stats sheet's
// chunk and the farewell's own.
import { useState } from "preact/hooks";
import { hall, heldBy, LIFE_ROWS, type HallRow } from "../core/hall";
import * as L from "../core/life";
import { euro } from "../core/money";
import type { Stats } from "../core/stats";
import { Card, Collapsible, KV } from "./kit";

const TIER_WORD = { good: "Good", fine: "Fine", poor: "Poor" } as const;
const TIER_TONE = { good: "ok", fine: undefined, poor: "warning" } as const;
const days = (s: number) => `${Math.ceil(s / L.DAY_S)} d`;
const date = (t: number) => new Date(t * 1000).toLocaleDateString();
const short = (city: string) => city.split(",")[0];
const perkText = (life: L.Life) => `XP +${Math.round((life.perkXp() - 1) * 100)}% · ${euro(life.perkCents())} more to start`;

/** What a stage changes, in short, or "" for none. */
export function stageDoes(st: L.Stage): string {
  return [st.speed !== 1 && `speed ×${st.speed}`, st.xp !== 1 && `XP ×${st.xp}`, st.wage !== 1 && `pay ×${st.wage}`].filter(Boolean).join(" · ");
}

/** His stage, how long until the next (or until he retires), his care in it so far and the family perk. */
export function LifeCard({ life, now }: { life: L.Life; now: number }) {
  const st = life.info();
  const next = L.STAGES[life.stage + 1];
  const tier = L.tierOf(life.faints, life.starveMin);
  return (
    <Card icon={st.icon} title={life.title()} right={`Day ${life.ageDays(now) + 1}`}>
      <KV k={next ? `⏳ ${next.name} in` : "🌅 Retires in"} v={life.retireDue ? "any moment" : days(life.leftS(now))} />
      <KV k="❤ Care this stage" v={`${TIER_WORD[tier]} · ${life.faints} ${life.faints === 1 ? "faint" : "faints"} · ${Math.floor(life.starveMin / 60)} h starving`} tone={TIER_TONE[tier]} />
      <KV k="✨ Stage does" v={stageDoes(st) || <span class="dim">Nothing special</span>} />
      {life.gen > 1 && <KV k="👪 Family perk" v={perkText(life)} />}
    </Card>
  );
}

/** A walker's spot on the tree: a drawn node with his number, and below it the line to the next generation's (none for him, the last). */
function Node({ gen, now }: { gen: number; now?: boolean }) {
  return (
    <div class="tree-rail" aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill={now ? "var(--accent)" : "var(--zebra)"} stroke="var(--ink)" stroke-width="3" />
        <text x="16" y="20.5" text-anchor="middle" font-size="12" font-weight="800" fill="var(--ink)">
          {L.roman(gen)}
        </text>
      </svg>
      {!now && <div class="tree-line" />}
    </div>
  );
}

/** One retired walker: his row, which opens into his letter and his life in numbers. */
function Ancestor({ a }: { a: L.Ancestor }) {
  const [open, setOpen] = useState(false);
  return (
    <li class="tree-row">
      <Node gen={a.gen} />
      <div class="grow">
        <button class="tree-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <b>
            {L.walkerName(a.gen)} · {a.title} {open ? "▾" : "▸"}
          </b>
          <span class="dim small">
            Lv {a.level} · {short(a.home)}
            {a.heirloom && ` · ${a.heirloom}`}
          </span>
        </button>
        {open && (
          <div class="tree-body">
            <p class="letter">{a.letter}</p>
            <KV k="📅 Lived" v={`${date(a.born)} – ${date(a.retired)}`} />
            <KV k="🚶 Walked" v={`${Math.round(a.km)} km · ${a.cities} ${a.cities === 1 ? "city" : "cities"}`} />
            <KV k="🌅 Retired" v={a.by === "you" ? "when you said so" : "of old age"} />
          </div>
        )}
      </div>
    </li>
  );
}

/** The family tree, oldest at the top and him at the bottom. */
export function FamilyTree({ life, level, city }: { life: L.Life; level: number; city: string }) {
  return (
    <Card icon="🌳" title="Family" right={`${life.gen} ${life.gen === 1 ? "generation" : "generations"}`}>
      <ol class="tree">
        {life.family.map((a) => (
          <Ancestor key={a.gen} a={a} />
        ))}
        <li class="tree-row">
          <Node gen={life.gen} now />
          <div class="grow tree-head">
            <b>
              {L.walkerName(life.gen)} · {life.title()}
            </b>
            <span class="dim small">
              Lv {level} · {short(city)} · now
            </span>
          </div>
        </li>
      </ol>
      {life.gen === 1 && <p class="dim small">When he retires, his heir carries on and joins the tree.</p>}
    </Card>
  );
}

/** The family's records and who holds each, his own in green; only once there is an heir. His life's four first, his Records' bests folded below (see Records). */
export function Hall({ stats: s }: { stats: Stats }) {
  if (!s.life.family.length) return null;
  const rows = hall(s);
  const row = (r: HallRow) => (
    <KV key={r.id} k={`${r.icon} ${r.name}`} v={r.gen ? `${r.text} · ${L.walkerName(r.gen)}` : <span class="dim">nobody yet</span>} tone={r.gen === s.life.gen ? "ok" : undefined} />
  );
  return (
    <Card icon="🏛" title="Hall of walkers" right={`${heldBy(s).length} / ${rows.length} his`}>
      <div class="zebra">{rows.slice(0, LIFE_ROWS).map(row)}</div>
      <Collapsible title="Bests">
        <div class="zebra">{rows.slice(LIFE_ROWS).map(row)}</div>
      </Collapsible>
    </Card>
  );
}

/** The letter the walker who just retired left, shown once. */
export function Farewell({ a, life, onDone }: { a: L.Ancestor; life: L.Life; onDone: () => void }) {
  return (
    <>
      <Card icon="✉" title={`From ${L.walkerName(a.gen)}`} right={a.title}>
        <p class="letter">{a.letter}</p>
      </Card>
      <Card icon="🌱" title={`${L.walkerName(life.gen)} sets out`} right={short(a.home)}>
        <KV k="🎁 Heirloom" v={a.heirloom || <span class="dim">None</span>} />
        <KV k="👪 Family perk" v={perkText(life)} />
        <KV k="🗂 Kept" v="the Collection, monuments, his pet, your clovers, care packages and storyteller" />
        <button class="btn primary" onClick={onDone}>
          Carry on
        </button>
      </Card>
    </>
  );
}
