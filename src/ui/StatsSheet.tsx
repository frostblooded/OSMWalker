// His character sheet: his level with a bar to the next one, his money and
// how many places he has been to; the next upgrade with what it still waits
// on; and the rest of the ladder, owned and later, in groups that open on a tap.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { LADDER, nextUpgrade, type Upgrade } from "../core/upgrades";
import { Bar, Card, Collapsible, KV } from "./kit";
import { about, does, NextUpgrade } from "./NextUpgrade";

export function StatsSheet({ stats: s }: { stats: Stats }) {
  const need = xpToNext(s.level);
  const next = nextUpgrade(s.upgrades);
  const owned = LADDER.filter((u) => s.upgrades.has(u.id));
  const later = LADDER.filter((u) => !s.upgrades.has(u.id) && u !== next);
  return (
    <>
      <Card icon="⭐" title={`Level ${s.level}`}>
        <KV k="XP" v={`${s.xp} / ${need}`} />
        <Bar share={s.xp / need} color="var(--lilac)" />
        <KV k="💶 Money" v={euro(s.cents)} />
        <KV k="📍 Places visited" v={s.visited.size} />
      </Card>
      <NextUpgrade stats={s} />
      <Card icon="🧰" title="Upgrades" right={`${owned.length} / ${LADDER.length}`}>
        {owned.length > 0 && (
          <Collapsible title={`✓ Owned (${owned.length})`}>
            {owned.map((u) => (
              <Step key={u.id} u={u} v="✓" ok />
            ))}
          </Collapsible>
        )}
        {later.length > 0 && (
          <Collapsible title={`🔒 Later (${later.length})`}>
            {later.map((u) => (
              <Step key={u.id} u={u} v={`Lv ${u.level} · ${euro(u.cents)}`} />
            ))}
          </Collapsible>
        )}
        {!later.length && !next && <p class="dim">All bought.</p>}
      </Card>
    </>
  );
}

/** One step of the ladder: its name and value, and under it what it does, plus where it is sold if he doesn't own it yet. */
function Step({ u, v, ok }: { u: Upgrade; v: string; ok?: boolean }) {
  return (
    <div class="upgrade">
      <KV k={`${u.icon} ${u.name}`} v={v} tone={ok ? "ok" : undefined} />
      <p class="dim">{ok ? does(u) : about(u)}</p>
    </div>
  );
}
