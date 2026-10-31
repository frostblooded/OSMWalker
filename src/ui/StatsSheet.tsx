// His character sheet: level and XP, his quests, what he saves up for,
// his weekly bills, six meters and Magic as bars, the sky over him, his visa, the spells he knows,
// the local words he has picked up,
// four attributes with what his gear adds, every gear slot, the bag and his
// buffs, his rival, friends and pet, and his mind: wants, fears and what
// moves his mood. Items with a story open to show it. His records close it.
import { isTreasured, SLOTS, type Item, type Slot } from "../core/items";
import { euro } from "../core/money";
import { CARD_RECENT, type Quests } from "../core/quests";
import { span } from "../core/records";
import { ATTRS, BAG_SIZE, DIRTY_AT, METERS, moodXpMult, xpToNext, type Attr, type Meter, type Stats } from "../core/stats";
import { MAGIC_MAX } from "../core/magic";
import { noun, wantIcon, wantText } from "../core/mind";
import { RIVAL_ICON, RIVAL_NAME } from "../core/rival";
import { COLD_ENERGY_PER_H, HOT_THIRST, isCold, isHot, isSunny, isWet, SNOW_SPEED, SUNNY_MOOD_PER_H, speedShare, WET_MOOD_PER_H, type Sky } from "../core/sky";
import type { Vehicle } from "../core/speeds";
import { SEASON_ICON, skyIcon } from "../game/hud";
import { hearts, SHOWN, type Friend } from "../core/friends";
import { billsAt } from "../core/bills";
import { VISAS } from "../core/visas";
import { DAYS, kindOf as clubKind } from "../core/clubs";
import { dayOf } from "../core/gifts";
import { KINDS as PET_KINDS, kmFor, PET_MAX_LEVEL } from "../core/pet";
import { dist, speed } from "./format";
import { Bar, Card, Collapsible, KV, RARITY_COLOR } from "./kit";

const METER: Record<Meter, [string, string, string]> = {
  health: ["❤", "Health", "#c01c28"],
  energy: ["⚡", "Energy", "#d4a300"],
  fullness: ["🍞", "Fullness", "#2e9e44"],
  thirst: ["💧", "Thirst", "#1a5fb4"],
  mood: ["🙂", "Mood", "#c64994"],
  hygiene: ["🧼", "Hygiene", "#1c9c9c"],
};
const ATTR: Record<Attr, [string, string]> = { str: ["💪", "Strength"], cha: ["😊", "Charm"], wit: ["🧠", "Wits"], luck: ["🍀", "Luck"] };
const SLOT: Record<Slot, [string, string]> = {
  weapon: ["⚔", "Weapon"],
  offhand: ["🛡", "Offhand"],
  head: ["🎩", "Head"],
  body: ["👕", "Body"],
  feet: ["👢", "Feet"],
  bag: ["🎒", "Bag"],
  trinket: ["💍", "Trinket"],
  vehicle: ["🚲", "Vehicle"],
};

const n1 = (n: number) => (Math.round(n * 10) / 10).toString();
/** Hours as a 24-hour clock time. */
const hhmm = (h: number) => {
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const cap = (t: string) => t[0]!.toUpperCase() + t.slice(1);

function SkyCard({ sky, vehicle }: { sky: Sky; vehicle: Vehicle }) {
  const w = sky.weather;
  // What the weather does to him now, in short: speed, indoors, thirst, energy, mood.
  const fx = [
    speedShare(sky, vehicle) < 1 && `speed ${Math.round(SNOW_SPEED * 100)}%`,
    isWet(sky) && `indoors, mood −${WET_MOOD_PER_H}/h`,
    isHot(sky) && `thirst ×${HOT_THIRST}`,
    isCold(sky) && `energy −${COLD_ENERGY_PER_H}/h`,
    isSunny(sky) && `mood +${SUNNY_MOOD_PER_H}/h`,
  ].filter(Boolean);
  return (
    <Card icon="🌦" title="Sky" right={`${SEASON_ICON[sky.season]} ${cap(sky.season)}`}>
      <KV k="Weather" v={w ? `${skyIcon(sky)} ${cap(w.kind)}, ${Math.round(w.tempC)}°C` : <span class="dim">Unknown yet</span>} />
      <KV k="🕒 City time" v={hhmm(sky.clock)} />
      <KV k="🌅 Sunrise · sunset" v={`${hhmm(sky.rise)} · ${hhmm(sky.set)}`} />
      {fx.length > 0 && <KV k="✨ Weather does" v={fx.join(" · ")} tone={isSunny(sky) ? "ok" : "warning"} />}
    </Card>
  );
}

function ItemName({ item }: { item: Item }) {
  return (
    <span style={{ color: RARITY_COLOR[item.rarity] }} title={item.rarity}>
      {item.name}
    </span>
  );
}

/** Where an item came from and what it has been through, as rows. */
function Story({ item, kept }: { item: Item; kept: boolean }) {
  const st = item.story!;
  return (
    <>
      <KV k="🛒 Bought" v={`${st.from || "somewhere"}, ${new Date(st.t * 1000).toLocaleDateString()}`} />
      <KV k="🌍 Countries" v={st.countries.length ? `${st.countries.length}: ${st.countries.join(", ")}` : "0"} />
      <KV k="🚶 Worn for" v={`${n1(st.km)} km`} />
      {isTreasured(item) && <KV k="💎 Treasured" v={kept ? "he won't sell it" : "yes"} tone={kept ? "ok" : undefined} />}
    </>
  );
}

/** A gear row (slot left, item right) or a bag row (item left, price right); one with a story opens to show it. `kept`: he won't sell it (worn, or a kept treasure in the bag). */
function ItemRow({ slot, item, price, kept }: { slot?: string; item: Item; price?: string; kept: boolean }) {
  const name = (
    <>
      <ItemName item={item} />
      {isTreasured(item) && " 💎"}
    </>
  );
  const [title, right] = slot ? [slot, name] : [name, price ?? ""];
  if (!item.story) return <KV k={title} v={right} />;
  return (
    <Collapsible title={title} right={right}>
      <Story item={item} kept={kept} />
    </Collapsible>
  );
}

function Goal({ name, has, needs }: { name: string; has: number; needs: number }) {
  return (
    <>
      <KV k={name} v={`${has >= needs ? "✔ " : ""}${euro(Math.min(has, needs))} / ${euro(needs)}`} tone={has >= needs ? "ok" : undefined} />
      <Bar share={has / needs} color="var(--coin)" />
    </>
  );
}

/** The spells he knows, with what each costs and how often he cast it. */
function Spells({ stats: s }: { stats: Stats }) {
  const known = s.spellKinds.filter((k) => s.lore.known.includes(k.id));
  return (
    <Card icon="🪄" title="Spells" right={`${known.length} / ${s.spellKinds.length}`}>
      {known.length ? (
        <div class="zebra">
          {known.map((k) => (
            <KV key={k.id} k={`${k.icon} ${k.name}`} v={`${k.cost} Magic · cast ${s.lore.casts[k.id] ?? 0}×`} />
          ))}
        </div>
      ) : (
        <KV k="Known" v="none yet" />
      )}
    </Card>
  );
}

/** Languages shown on the Local words card before the rest fold away. */
const WORD_ROWS = 4;

/** The local words he knows, by language (most first, the rest folded), with the last one learned. */
function LocalWords({ stats: s }: { stats: Stats }) {
  const book = s.wordBook;
  const rows = Object.entries(s.words.known)
    .filter(([k, l]) => l.length && book?.languages[k])
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([k, l]) => {
      const lang = book!.languages[k]!;
      const last = lang.words.find(([, m]) => m === l.at(-1));
      return <KV key={k} k={`${lang.name} ${l.length} / ${lang.words.length}`} v={last ? `${last[0]} = ${last[1]}` : ""} />;
    });
  const more = rows.slice(WORD_ROWS);
  return (
    <Card icon="🗣" title="Local words" right={s.words.count() || undefined}>
      {rows.length ? <div class="zebra">{rows.slice(0, WORD_ROWS)}</div> : <KV k="Learned" v="none so far" />}
      {more.length > 0 && (
        <Collapsible title="More languages" right={more.length}>
          <div class="zebra">{more}</div>
        </Collapsible>
      )}
    </Card>
  );
}

/** His bests and lifetime totals. */
function Records({ stats: s }: { stats: Stats }) {
  const r = s.records;
  return (
    <Card icon="🏆" title="Records">
      <div class="zebra">
        <KV k="🚶 Longest walk without a stop" v={dist(r.best.stretchM)} />
        <KV k="📏 Most walked in a day" v={dist(r.best.dayM)} />
        <KV k="📍 Most places in a day" v={r.best.dayStops} />
        <KV k="💰 Most money held" v={euro(r.best.cents)} />
        <KV k="❤ Longest without fainting" v={span(r.best.noFaintS)} />
      </div>
      <Collapsible title="Totals" right={`${r.countries.length} countries`}>
        <div class="zebra">
          <KV k="🌍 Countries" v={r.countries.length} />
          <KV k="🏙 Cities" v={r.cities.length} />
          <KV k="💥 Mishaps" v={r.mishaps} />
          <KV k="🏥 Faints" v={r.faints} />
        </div>
      </Collapsible>
    </Card>
  );
}

/** `afoot`: he walks the rest of the way after a flyer landed, so his speed is his walking one. */
export function StatsSheet({ stats: s, afoot = false }: { stats: Stats; afoot?: boolean }) {
  const need = xpToNext(s.level);
  const bag = [...s.bag].sort((a, b) => b.price - a.price);
  const kept = s.keptTreasures();
  const goal = s.vehicleGoal();
  // With a dragon and no next vehicle: its gold on a day it hasn't eaten.
  const feed = goal ? 0 : s.vehicleSaving();
  return (
    <>
      <Card icon="⭐" title={`Level ${s.level}`} right={euro(s.cents)}>
        {s.keepsakes.title && <KV k="🎖 Title" v={s.keepsakes.title} />}
        <KV k="XP" v={`${Math.floor(s.xp)} / ${need}`} />
        <Bar share={s.xp / need} color="#e8730c" />
        <KV k="Speed" v={speed(s.speedMps(afoot))} />
        <KV k="XP from mood" v={`×${moodXpMult(s.meters.mood).toFixed(2)}`} />
        <KV k="Weekly bills" v={euro(billsAt(s.level))} />
      </Card>
      <QuestCard q={s.quests} now={s.now()} />
      {(goal || feed > 0 || s.savingFor > 0) && (
        <Card icon="💰" title="Saving for">
          {goal && <Goal name={`${goal.kind === "dragons" ? "🐉" : "🚲"} ${goal.name}`} has={s.cents} needs={s.vehicleSaving()} />}
          {feed > 0 && <Goal name="🐉 Dragon's gold" has={s.cents} needs={feed} />}
          {s.savingFor > 0 && <Goal name="✈ Trip fare" has={s.cents} needs={s.savingFor} />}
        </Card>
      )}
      <Card icon="❤" title="Vitals">
        <div class="meters">
          {METERS.map((m) => {
            const [icon, name, color] = METER[m];
            const v = s.meters[m];
            return (
              <div key={m} class="meter">
                <KV k={`${icon} ${name}`} v={Math.round(v)} tone={v < 20 ? "error" : undefined} />
                <Bar share={v / 100} color={color} />
              </div>
            );
          })}
          <div class="meter">
            <KV k="🔮 Magic" v={Math.round(s.magic)} />
            <Bar share={s.magic / MAGIC_MAX} color="var(--magic)" />
            {s.gearMagic() > 0 && <KV k="🌙 From enchanted gear" v={`+${n1(s.gearMagic())} a km`} />}
          </div>
        </div>
      </Card>
      {s.sky && <SkyCard sky={s.sky} vehicle={afoot ? "" : s.getsAbout()} />}
      {s.where.code && <VisaCard s={s} />}
      <Spells stats={s} />
      <LocalWords stats={s} />
      <Card icon="💪" title="Attributes">
        <div class="tiles">
          {ATTRS.map((a) => {
            const [icon, name] = ATTR[a];
            const extra = s.attr(a) - s.attrs[a];
            return (
              <div key={a} class="tile">
                <span class="dim small">
                  {icon} {name}
                </span>
                <b>
                  {n1(s.attr(a))}
                  {extra > 0.05 && <span class="tone-ok small"> +{n1(extra)}</span>}
                  {extra < -0.05 && <span class="tone-error small"> {n1(extra)}</span>}
                </b>
              </div>
            );
          })}
        </div>
        {s.meters.hygiene < DIRTY_AT && <p class="small tone-warning">🧼 Dirty: Charm counts less and mood drains.</p>}
      </Card>
      <Card icon="🛡" title="Gear">
        <div class="zebra">
          {SLOTS.map((slot) => {
            const item = s.gear[slot];
            if (item) return <ItemRow key={slot} slot={`${SLOT[slot][0]} ${SLOT[slot][1]}`} item={item} kept />;
            return <KV key={slot} k={`${SLOT[slot][0]} ${SLOT[slot][1]}`} v={<span class="dim">Empty</span>} />;
          })}
        </div>
      </Card>
      <Card icon="🎒" title="Bag">
        {bag.length ? (
          <Collapsible title="Items" right={`${bag.length} / ${BAG_SIZE}`}>
            <div class="zebra">
              {bag.map((item, i) => (
                <ItemRow key={i} item={item} price={euro(item.price)} kept={kept.has(item)} />
              ))}
            </div>
          </Collapsible>
        ) : (
          <p class="dim small">Empty. Gear he takes off goes here.</p>
        )}
      </Card>
      <MindCard s={s} />
      <RivalCard s={s} />
      <FriendsCard s={s} />
      <PetCard s={s} />
      <Card icon="✨" title="Effects">
        {s.buffs.length ? (
          <div class="zebra">
            {s.buffs.map((b) => (
              <KV
                key={b.name}
                k={`${b.name}${Object.entries(b.attrs ?? {})
                  .map(([a, v]) => ` (+${v} ${ATTR[a as Attr][1]})`)
                  .join("")}`}
                v={`${Math.ceil(b.left)} min`}
              />
            ))}
          </div>
        ) : (
          <p class="dim small">None right now.</p>
        )}
      </Card>
      <Records stats={s} />
    </>
  );
}

/** The quest he is on, what the city's board and the streets around him still hold, and his last few quests and events. */
function QuestCard({ q, now }: { q: Quests; now: number }) {
  const k = q.active && q.kind(q.active.kind);
  // A new city drops the old board and events (Quests.roll), so these are always the city he is in.
  const events = q.events.filter((e) => e.ends > now).length;
  const recent = q.log.slice(-CARD_RECENT).reverse();
  return (
    <Card icon="❗" title="Quests" right={`${q.finished} done`}>
      <KV k="🎯 Now" v={k ? `${k.icon} ${k.title} (${q.active!.step + 1} / ${k.steps.length})` : <span class="dim">None</span>} />
      <KV k="📋 On the board" v={q.board.length} />
      <KV k="🌟 Events" v={events} />
      {recent.length > 0 && (
        <div class="zebra">
          {recent.map((e, i) => (
            <KV key={i} k={`${e.icon} ${e.title}`} v={<span class={e.good ? "tone-ok" : "dim"}>{e.good ? "✔ Went well" : "Went so-so"}</span>} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** The friends he has made, his partner first, then most hearts; past SHOWN the rest fold away. Then his clubs, with their city and night. */
function FriendsCard({ s }: { s: Stats }) {
  const f = s.friends;
  const list = [...f.list].sort((a, b) => Number(b.id === f.partner) - Number(a.id === f.partner) || b.hearts - a.hearts);
  const row = (p: Friend) => <KV key={p.id} k={`${p.icon} ${p.name}${p.id === f.partner ? " (partner)" : ""}`} v={`${hearts(p.hearts)} · ${p.city.split(",")[0]}`} />;
  return (
    <Card icon="💞" title="Friends" right={f.list.length || undefined}>
      {f.companion && <KV k="Travelling with" v={`${f.companion.icon} ${f.companion.who}`} />}
      {list.length ? (
        <div class="zebra">{list.slice(0, SHOWN).map(row)}</div>
      ) : (
        <p class="dim small">No one yet. He gets talking with locals as he goes.</p>
      )}
      {list.length > SHOWN && (
        <Collapsible title="More" right={list.length - SHOWN}>
          <div class="zebra">{list.slice(SHOWN).map(row)}</div>
        </Collapsible>
      )}
      {s.clubs.list.map((c) => {
        const k = clubKind(c);
        return <KV key={c.city} k={`${k.icon} ${k.name[0]!.toUpperCase()}${k.name.slice(1)}`} v={`${c.city.split(",")[0]} · ${DAYS[c.day]!.slice(0, 3)} ${String(c.hour).padStart(2, "0")}:00`} />;
      })}
    </Card>
  );
}

/** His visa in the country he is in: its level, this stay against its limit, and the extra pay at work. */
function VisaCard({ s }: { s: Stats }) {
  const v = s.visas;
  const visa = v.visa(s.where.code);
  const left = v.left();
  const next = VISAS[VISAS.indexOf(visa) + 1];
  return (
    <Card icon="🛂" title="Visa" right={visa.name}>
      <KV k="Country" v={s.where.country || s.where.code} />
      <KV k="This stay" v={visa.stay === Infinity ? `${v.stay} days, no limit` : `${v.stay} of ${visa.stay} days`} tone={left <= 0 ? "warning" : undefined} />
      <KV k="Pay at work" v={`+${Math.round(visa.pay * 100)}%`} />
      {next && <KV k={`Next: ${next.name}`} v={`${v.days[s.where.code] ?? 0} / ${next.from} days`} />}
    </Card>
  );
}

/** His pet: level, km together and its perk; the pets he had fold away below. */
function PetCard({ s }: { s: Stats }) {
  const ps = s.pets;
  const p = ps.pet;
  const lvl = ps.level();
  const days = p ? Math.floor((s.now() - p.since) / 86400) : 0;
  return (
    <Card icon={p ? ps.icon() : "🐾"} title={p ? ps.title() : "Pet"} right={p ? `Level ${lvl}` : undefined}>
      {p ? (
        <>
          <KV k="Walked together" v={lvl < PET_MAX_LEVEL ? `${Math.floor(p.km)} / ${kmFor(lvl + 1)} km` : `${Math.floor(p.km)} km`} />
          <KV k="Perk" v={PET_KINDS[p.kind].perk} />
          <KV k="With him" v={days === 1 ? "1 day" : `${days} days`} />
          <KV k="Fed today" v={p.fed === dayOf(s.now() * 1000) ? "Yes" : "No, grumpy"} tone={p.fed === dayOf(s.now() * 1000) ? undefined : "warning"} />
        </>
      ) : (
        <p class="dim small">No pet yet. Now and then a stray follows him, and one may stay.</p>
      )}
      {ps.past.length > 0 && (
        <Collapsible title="Remembered" right={ps.past.length}>
          <div class="zebra">
            {ps.past.map((r) => (
              <KV key={r.since} k={`${r.fairy ? PET_KINDS[r.kind].fairy.icon : PET_KINDS[r.kind].icon} ${r.name}`} v={`${Math.round((r.until - r.since) / 86400)} days`} />
            ))}
          </div>
        </Collapsible>
      )}
    </Card>
  );
}

const STANDING = { nemesis: "Nemesis", rival: "Rival", friend: "Friendly rival" } as const;

const perH = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${n1(Math.abs(n))}/h`;
const hoursLeft = (min: number) => (min >= 60 ? `${Math.ceil(min / 60)} h` : `${Math.ceil(min)} min`);

/** His wants and fears, and what moves his mood each hour. */
function MindCard({ s }: { s: Stats }) {
  const m = s.mind;
  const now = s.now();
  const pieces = s.moodPieces();
  const total = pieces.reduce((t, p) => t + p.per_h, 0);
  return (
    <Card icon="💭" title="Mind">
      <div class="zebra">
        {/* A fear shows as its want to face it, so the card stays at 5 rows at most. */}
        {m.wants.map((w) => (
          <KV
            key={`${w.kind}${w.place}`}
            k={w.kind === "face" ? `😨 Wary of ${noun(w.place)}s: ${wantText(w).toLowerCase()}` : `${wantIcon(w)} ${wantText(w)}`}
            v={w.until ? <span class="dim">{hoursLeft((w.until - now) / 60)}</span> : ""}
            tone={w.kind === "face" ? "warning" : undefined}
          />
        ))}
      </div>
      <Collapsible title="🙂 Mood" right={perH(total)}>
        <div class="zebra">
          {pieces.map((p) => (
            <KV
              key={p.name}
              k={`${p.icon} ${p.name}`}
              v={
                <span class={p.per_h > 0 ? "tone-ok" : p.per_h < 0 ? "tone-error" : undefined}>
                  {perH(p.per_h)}
                  {p.left !== undefined && <span class="dim small"> · {hoursLeft(p.left)}</span>}
                </span>
              }
            />
          ))}
        </div>
      </Collapsible>
    </Card>
  );
}

/** Viktor: his level, their record, and what they are to each other. */
function RivalCard({ s }: { s: Stats }) {
  const r = s.rival;
  const last = r.memory.at(-1);
  return (
    <Card icon={RIVAL_ICON} title={RIVAL_NAME} right={last ? STANDING[r.standing()] : undefined}>
      {last ? (
        <>
          <KV k="Level" v={r.level} />
          <KV k="Contests" v={`${r.wins} won · ${r.losses} lost`} />
          <KV k="Chats" v={r.chats} />
          <KV k="Last met" v={last.city.split(",")[0]} />
        </>
      ) : (
        <p class="dim small">Not met yet. He travels too.</p>
      )}
    </Card>
  );
}
