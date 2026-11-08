// The next upgrade, shown under the cards and in Stats: its price, what it
// does and where it is sold, and what it still waits on, with a bar.
import { euro } from "../core/money";
import { xpToNext, type Stats } from "../core/stats";
import { nextUpgrade, type Upgrade } from "../core/upgrades";
import { Bar, Card, KV } from "./kit";

/** What an upgrade does: "A 4th card at every stop." */
export const does = (u: Upgrade) => `${u.does[0]!.toUpperCase() + u.does.slice(1)}.`;
/** What it does and who sells it: "A 4th card at every stop. Sold at a bookshop or newsagent." */
export const about = (u: Upgrade) => `${does(u)} Sold at ${u.where}.`;

/** Nothing at the top of the ladder. */
export function NextUpgrade({ stats: s }: { stats: Pick<Stats, "upgrades" | "level" | "cents" | "xp"> }) {
  const u = nextUpgrade(s.upgrades);
  if (!u) return null;
  const open = s.level >= u.level;
  // What it still waits on: its level, then the money; then only its shop turning up on the cards.
  const [k, v] = !open ? ["🔒 Opens at", `Level ${u.level}`] : s.cents < u.cents ? ["💶 Still needs", euro(u.cents - s.cents)] : ["✔ Ready", "Look for its shop"];
  return (
    <Card icon={u.icon} title={`Next: ${u.name}`} right={euro(u.cents)}>
      <p class="dim next-does">{about(u)}</p>
      <KV k={k} v={v} tone={open && s.cents >= u.cents ? "ok" : undefined} />
      {open ? <Bar share={s.cents / u.cents} color="var(--coin)" /> : u.level === s.level + 1 && <Bar share={s.xp / xpToNext(s.level)} color="var(--lilac)" />}
    </Card>
  );
}
