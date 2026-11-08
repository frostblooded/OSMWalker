// His character sheet: his level with a bar to the next one, his money, and
// how many places he has been to.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { Bar, Card, KV } from "./kit";

export function StatsSheet({ stats: s }: { stats: Stats }) {
  const need = xpToNext(s.level);
  return (
    <Card icon="⭐" title={`Level ${s.level}`}>
      <KV k="XP" v={`${s.xp} / ${need}`} />
      <Bar share={s.xp / need} color="var(--lilac)" />
      <KV k="💶 Money" v={euro(s.cents)} />
      <KV k="📍 Places visited" v={s.visited.size} />
    </Card>
  );
}
