// His keepsakes: landmark cards (counts by rarity and finish, then the cards
// themselves), the Placedex of place kinds, souvenirs by country and crawls.
import type { Rarity } from "../core/items";
import * as K from "../core/keepsakes";
import type { Stats } from "../core/stats";
import { Card, Collapsible, KV } from "./kit";
import { RARITY_COLOR } from "./StatsSheet";

/** Newest cards drawn when the list opens; the counts above cover them all. */
export const CARDS_SHOWN = 60;
const CARD_RARITIES: Rarity[] = ["Rare", "Uncommon", "Common"];
const DEX_RARITIES: Rarity[] = ["Legendary", "Rare", "Uncommon", "Common"];
const DEX_CODE: Record<Rarity, string> = { Common: "C", Uncommon: "U", Rare: "R", Legendary: "L" };

function LandmarkCard({ card }: { card: K.Card }) {
  return (
    <div class={`lcard${card.finish ? ` ${card.finish}` : ""}`} style={{ borderColor: RARITY_COLOR[card.rarity] }}>
      <b>{card.name}</b>
      <span class="small dim">{K.kindLabel(card.kind)}</span>
      <span class="small" style={{ color: RARITY_COLOR[card.rarity] }}>
        {card.rarity}
        {card.finish && ` · ${card.finish === "gold" ? "🥇" : "✨"} ${K.FINISH_NAME[card.finish]}`}
      </span>
      <span class="small dim">📍 {card.city}</span>
    </div>
  );
}

export function CollectionSheet({ stats: s }: { stats: Stats }) {
  const k = s.keepsakes;
  const cards = [...k.cards.values()].sort((a, b) => b.t - a.t);
  const kinds = [...k.dex.entries()].sort((a, b) => b[1].t - a[1].t);
  const known = (r: Rarity) => Object.values(s.dex).filter((c) => c === DEX_CODE[r]).length;
  const cut = K.fareCut(k.souvenirs.size);
  return (
    <>
      <Card icon="🃏" title="Landmark cards" right={cards.length}>
        {CARD_RARITIES.map((r) => (
          <KV key={r} k={<span style={{ color: RARITY_COLOR[r] }}>{r}</span>} v={cards.filter((c) => c.rarity === r).length} />
        ))}
        <KV k="✨ Foil · 🥇 Gold" v={`${cards.filter((c) => c.finish === "foil").length} · ${cards.filter((c) => c.finish === "gold").length}`} />
        {cards.length ? (
          <Collapsible title="His cards" right={cards.length > CARDS_SHOWN ? `newest ${CARDS_SHOWN}` : undefined}>
            <div class="lcards">
              {cards.slice(0, CARDS_SHOWN).map((c, i) => (
                <LandmarkCard key={i} card={c} />
              ))}
            </div>
          </Collapsible>
        ) : (
          <p class="dim small">None yet. He gets one the first time he reaches a sight.</p>
        )}
      </Card>
      <Card icon="📖" title="Placedex" right={`${kinds.length} kinds`}>
        {DEX_RARITIES.map((r) => {
          const found = kinds.filter(([kind]) => K.dexRarity(s.dex, kind) === r).length;
          return <KV key={r} k={<span style={{ color: RARITY_COLOR[r] }}>{r}</span>} v={r === "Legendary" ? `${found} / ${known(r)}+` : `${found} / ${known(r)}`} />;
        })}
        {kinds.length > 0 && (
          <Collapsible title="Kinds he has seen">
            <div class="zebra">
              {kinds.map(([kind, at]) => (
                <KV key={kind} k={K.kindLabel(kind)} v={<span style={{ color: RARITY_COLOR[K.dexRarity(s.dex, kind)] }}>{at.city || K.dexRarity(s.dex, kind)}</span>} />
              ))}
            </div>
          </Collapsible>
        )}
      </Card>
      <Card icon="🎁" title="Souvenirs" right={k.souvenirs.size}>
        <KV k="✈ Fares" v={cut ? `${Math.round(cut * 100)}% cheaper` : "full price"} tone={cut ? "ok" : undefined} />
        {k.souvenirs.size ? (
          <div class="zebra">
            {[...k.souvenirs.values()].map((v) => (
              <KV key={v.country + v.name} k={v.country || v.city} v={v.name} />
            ))}
          </div>
        ) : (
          <p class="dim small">None yet. He buys one at a gift shop, kiosk, sight or museum in each country.</p>
        )}
      </Card>
      <Card icon="🏁" title="Crawls" right={`${k.done.size} / ${K.CRAWLS.length}`}>
        <div class="zebra">
          {K.CRAWLS.map((c) => {
            const done = k.done.has(c.id);
            // A day's or a city's count from before is over, even before his next stop starts it again.
            const stale = (c.per === "day" && k.day !== K.dayOf(s.now())) || (c.per === "city" && k.city !== s.where.city);
            const got = stale ? 0 : (k.progress[c.id]?.length ?? 0);
            const per = c.per === "day" ? " today" : c.per === "city" ? " here" : "";
            return <KV key={c.id} k={`${c.icon} ${c.name}`} v={done ? "✔ Done" : `${got} / ${c.need}${per}`} tone={done ? "ok" : undefined} />;
          })}
        </div>
      </Card>
    </>
  );
}
