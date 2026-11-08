// His character sheet: his money, the deliveries he made and the places he
// has been to; and what his upgrades add up to: how fast he rides and how
// long an order takes to come, on average.
import { euro } from "../core/money";
import { ORDER_WAIT_S } from "../core/orders";
import type { Stats } from "../core/stats";
import { count, speedX, UPGRADES, waitX } from "../core/upgrades";
import { BIKE_MPS } from "../core/walker";
import { Card, KV } from "./kit";

export function StatsSheet({ stats: s }: { stats: Stats }) {
  return (
    <>
      <Card icon="🚲" title="His work">
        <KV k="💶 Money" v={euro(s.cents)} />
        <KV k="📦 Deliveries" v={s.deliveries} />
        <KV k="📍 Places visited" v={s.visited.size} />
      </Card>
      <Card icon="🧰" title="Upgrades">
        {UPGRADES.map((u) => (
          <KV key={u.id} k={`${u.icon} ${u.name}`} v={`×${count(s.upgrades, u.id)}`} />
        ))}
        <KV k="🚲 Speed" v={`${Math.round(BIKE_MPS * 3.6 * speedX(s.upgrades))} km/h`} />
        <KV k="🛎 Order wait" v={`~${Math.round(ORDER_WAIT_S * waitX(s.upgrades))} s`} />
      </Card>
    </>
  );
}
