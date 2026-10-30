// His character sheet: level and XP, what he saves up for, six meters as
// bars, the sky over him, four attributes with what his gear adds, every
// gear slot, the bag and his buffs. Items with a story open to show it. His
// records close it.
import { isTreasured, SLOTS, type Item, type Slot } from "../core/items";
import { euro } from "../core/money";
import { span } from "../core/records";
import { ATTRS, BAG_SIZE, DIRTY_AT, METERS, moodXpMult, xpToNext, type Attr, type Meter, type Stats } from "../core/stats";
import { RIVAL_ICON, RIVAL_NAME } from "../core/rival";
import { COLD_ENERGY_PER_H, HOT_THIRST, isCold, isHot, isSunny, isWet, SNOW_SPEED, SUNNY_MOOD_PER_H, speedShare, WET_MOOD_PER_H, type Sky } from "../core/sky";
import type { Vehicle } from "../core/speeds";
import { SEASON_ICON, skyIcon } from "../game/hud";
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
      </Card>
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
        </div>
      </Card>
      {s.sky && <SkyCard sky={s.sky} vehicle={afoot ? "" : s.getsAbout()} />}
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
      <RivalCard s={s} />
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

const STANDING = { nemesis: "Nemesis", rival: "Rival", friend: "Friendly rival" } as const;

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
