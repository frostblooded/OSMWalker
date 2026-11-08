// His character sheet: his level with a bar to the next one, his money and
// how many places he has been to; the next upgrade with what it still waits
// on; and the rest of the ladder, owned and later, in groups that open.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { LADDER, nextUpgrade, type Upgrade } from "../core/upgrades";
import { Bar, Card, Collapsible, KV } from "./kit";

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
          <Collapsible title={`✓ Owned (${owned.length})`} open>
            {owned.map((u) => (
              <Step key={u.id} u={u} v="✓" />
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

/** One step of the ladder: its name and value, and what it does under it. */
function Step({ u, v }: { u: Upgrade; v: string }) {
  return (
    <div class="upgrade">
      <KV k={`${u.icon} ${u.name}`} v={v} />
      <p class="dim">{u.does[0]!.toUpperCase() + u.does.slice(1)}.</p>
    </div>
  );
}

/** The next upgrade: its price, what it does, where it is sold and what it still waits on, with a bar for that. Nothing at the top of the ladder. */
export function NextUpgrade({ stats: s }: { stats: Pick<Stats, "upgrades" | "level" | "cents" | "xp"> }) {
  const u = nextUpgrade(s.upgrades);
  if (!u) return null;
  const open = s.level >= u.level;
  // What it still waits on: its level, then the money; then only a shop to turn up.
  const [k, v] = !open ? ["🔒 Opens at", `Level ${u.level}`] : s.cents < u.cents ? ["💶 Still needs", euro(u.cents - s.cents)] : ["🛍 Sold at", u.where];
  return (
    <Card icon={u.icon} title={`Next: ${u.name}`} right={euro(u.cents)}>
      <p class="dim next-does">{u.does[0]!.toUpperCase() + u.does.slice(1)}.</p>
      <KV k={k} v={v} />
      {open ? <Bar share={s.cents / u.cents} color="var(--coin)" /> : u.level === s.level + 1 && <Bar share={s.xp / xpToNext(s.level)} color="var(--lilac)" />}
    </Card>
  );
}
