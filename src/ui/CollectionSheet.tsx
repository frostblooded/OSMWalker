// His keepsakes: landmark cards (counts by rarity and finish, then the cards
// themselves), the Placedex of place kinds, souvenirs by country and crawls.
import type { Rarity } from "../core/items";
import { dayOf } from "../core/gifts";
import * as K from "../core/keepsakes";
import type { Stats } from "../core/stats";
import { Card, Collapsible, KV } from "./kit";
import { RARITY_COLOR } from "./StatsSheet";

const CARD_RARITIES: Rarity[] = ["Rare", "Uncommon", "Common"];
const DEX_RARITIES: Rarity[] = ["Legendary", "Rare", "Uncommon", "Common"];
const CRAWL_GROUPS: [K.Crawl["per"], string][] = [["day", "Today"], ["city", "In this city"], ["ever", "All time"]];
const DEX_CODE: Record<Rarity, string> = { Common: "C", Uncommon: "U", Rare: "R", Legendary: "L" };

function LandmarkCard({ card }: { card: K.Card }) {
  return (
    <div class={`lcard${card.finish ? ` ${card.finish}` : ""}`} style={{ borderColor: RARITY_COLOR[card.rarity] }}>
      <b>{card.name}</b>
      <span class="small dim">{K.kindLabel(card.kind)}</span>
      <span class="small" style={{ color: RARITY_COLOR[card.rarity] }}>
        {card.rarity}
        {card.finish && ` · ${card.finish === "gold" ? "🥇" : "🌈"} ${K.FINISH_NAME[card.finish]}`}
      </span>
      <span class="small dim">🏙 {card.city}</span>
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
        <KV k="🌈 Foil · 🥇 Gold" v={`${cards.filter((c) => c.finish === "foil").length} · ${cards.filter((c) => c.finish === "gold").length}`} />
        {cards.length ? (
          <Collapsible title="His cards" right={cards.length > K.CARDS_SHOWN ? `newest ${K.CARDS_SHOWN}` : undefined}>
            <div class="lcards">
              {cards.slice(0, K.CARDS_SHOWN).map((c, i) => (
                <LandmarkCard key={i} card={c} />
              ))}
            </div>
          </Collapsible>
        ) : (
          <p class="dim small">None yet. He gets one the first time he reaches a sight.</p>
        )}
      </Card>
      <Card icon="📇" title="Placedex" right={`${kinds.length} kinds`}>
        {DEX_RARITIES.map((r) => {
          const found = kinds.filter(([kind]) => K.dexRarity(s.dex, kind) === r).length;
          return <KV key={r} k={<span style={{ color: RARITY_COLOR[r] }}>{r}</span>} v={r === "Legendary" ? `${found} / ${known(r)}+` : `${found} / ${known(r)}`} />;
        })}
        {kinds.length > 0 && (
          <Collapsible title="Kinds he has seen">
            <div class="zebra">
              {kinds.map(([kind, at]) => {
                const r = K.dexRarity(s.dex, kind);
                return <KV key={kind} k={K.kindLabel(kind)} v={<span style={{ color: RARITY_COLOR[r] }}>{at.city ? `${r} · ${at.city}` : r}</span>} />;
              })}
            </div>
          </Collapsible>
        )}
      </Card>
      <Card icon="🧳" title="Souvenirs" right={k.souvenirs.size}>
        <KV k="✈ Fares" v={cut ? `${Math.round(cut * 100)}% cheaper` : "full price"} tone={cut ? "ok" : undefined} />
        {k.souvenirs.size ? (
          <Collapsible title="Countries" right={k.souvenirs.size}>
            <div class="zebra">
              {[...k.souvenirs.values()].map((v) => (
                <KV key={v.country + v.name} k={v.country || v.city} v={v.name} />
              ))}
            </div>
          </Collapsible>
        ) : (
          <p class="dim small">None yet. He may find one at a sight in each country (see Souvenirs in Help).</p>
        )}
      </Card>
      <Card icon="🏁" title="Crawls" right={`${k.done.size} / ${K.CRAWLS.length}`}>
        {CRAWL_GROUPS.map(([per, title]) => {
          const crawls = K.CRAWLS.filter((c) => c.per === per);
          return (
            <Collapsible key={per} title={title} right={`${crawls.filter((c) => k.done.has(c.id)).length} / ${crawls.length} done`}>
              <div class="zebra">
                {crawls.map((c) => {
                  const done = k.done.has(c.id);
                  // A day's or a city's count from before is over, even before his next stop starts it again.
                  const stale = (c.per === "day" && k.day !== dayOf(s.now() * 1000)) || (c.per === "city" && k.city !== s.where.city);
                  const got = stale ? 0 : (k.progress[c.id]?.length ?? 0);
                  return <KV key={c.id} k={`${c.icon} ${c.name}`} v={done ? "✔ Done" : `${got} / ${c.need}`} tone={done ? "ok" : undefined} />;
                })}
              </div>
            </Collapsible>
          );
        })}
      </Card>
    </>
  );
}
