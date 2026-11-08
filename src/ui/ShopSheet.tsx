// The Shop: every upgrade with how many he owns, what one more does and its
// price. One that isn't open yet says what it waits for; one he can't afford
// says how much is still missing. A buy applies at once.
import { euro } from "../core/money";
import type { Stats } from "../core/stats";
import { count, isOpen, OPENS_AFTER, priceOf, upgradeOf, UPGRADES, type UpgradeId } from "../core/upgrades";
import { Bar, Card, KV } from "./kit";

export function ShopSheet({ stats: s, onBuy }: { stats: Stats; onBuy: (id: UpgradeId) => void }) {
  return (
    <>
      <p class="lead">💶 {euro(s.cents)} to spend</p>
      {UPGRADES.map((u) => {
        const n = count(s.upgrades, u.id);
        const price = priceOf(u, s.upgrades);
        const before = u.after && upgradeOf(u.after)!;
        if (!isOpen(u, s.upgrades) && before) {
          const have = count(s.upgrades, before.id);
          return (
            <Card key={u.id} icon={u.icon} title={u.name} right="🔒">
              <p class="dim shop-does">One more: {u.does}.</p>
              <KV k="🔒 Opens after" v={`${OPENS_AFTER} ${before.name}s (${have} / ${OPENS_AFTER})`} />
              <Bar share={have / OPENS_AFTER} color="var(--lilac)" />
            </Card>
          );
        }
        const short = price - s.cents;
        return (
          <Card key={u.id} icon={u.icon} title={u.name} right={n ? `×${n}` : undefined}>
            <p class="dim shop-does">One more: {u.does}.</p>
            {short > 0 && <KV k="💶 Still needs" v={euro(short)} />}
            <button class="btn primary buy" disabled={short > 0} onClick={() => onBuy(u.id)}>
              Buy · {euro(price)}
            </button>
          </Card>
        );
      })}
    </>
  );
}

/** True when he can buy something now, for the dot on the Shop button. */
export const canBuy = (s: Stats) => UPGRADES.some((u) => isOpen(u, s.upgrades) && s.cents >= priceOf(u, s.upgrades));
