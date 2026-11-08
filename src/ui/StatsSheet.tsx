// His character sheet: his level with a bar to the next one, his money, and
// how many places he has been to.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { Bar, Card, KV } from "./kit";

export function StatsSheet({ stats: s }: { stats: Stats }) {
  const need = xpToNext(s.level);
  return (
    <Card icon="⭐" title={`Level ${s.level}`} right={euro(s.cents)}>
      <KV k="XP" v={`${Math.floor(s.xp)} / ${need}`} />
      <Bar share={s.xp / need} color="#e8730c" />
      <KV k="💶 Money" v={euro(s.cents)} />
      <KV k="📍 Places visited" v={s.visited.size} />
    </Card>
  );
}
