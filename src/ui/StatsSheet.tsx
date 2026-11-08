// His character sheet: his level with a bar to the next one, his money, how
// many places he has been to, and the upgrade ladder: what he owns, what is
// next (with a bar to its price) and what opens later.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { LADDER, nextUpgrade } from "../core/upgrades";
import { Bar, Card, KV } from "./kit";

export function StatsSheet({ stats: s }: { stats: Stats }) {
  const need = xpToNext(s.level);
  const next = nextUpgrade(s.upgrades);
  return (
    <>
      <Card icon="⭐" title={`Level ${s.level}`}>
        <KV k="XP" v={`${s.xp} / ${need}`} />
        <Bar share={s.xp / need} color="var(--lilac)" />
        <KV k="💶 Money" v={euro(s.cents)} />
        <KV k="📍 Places visited" v={s.visited.size} />
      </Card>
      <Card icon="🧰" title={`Upgrades ${s.upgrades.size} / ${LADDER.length}`}>
        {LADDER.map((u) => (
          <div key={u.id} class={`upgrade${s.upgrades.has(u.id) ? " owned" : ""}`}>
            <KV k={`${u.icon} ${u.name}`} v={s.upgrades.has(u.id) ? "✓ Owned" : u === next && s.level >= u.level ? euro(u.cents) : `Level ${u.level}`} />
            <p class="dim">
              {u.does[0]!.toUpperCase() + u.does.slice(1)}.{!s.upgrades.has(u.id) && ` Sold at ${u.where}.`}
            </p>
            {u === next && s.level >= u.level && <Bar share={Math.min(s.cents / u.cents, 1)} color="var(--coin)" />}
          </div>
        ))}
      </Card>
    </>
  );
}
