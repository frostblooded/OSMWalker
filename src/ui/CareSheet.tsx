// Care packages and the bond: your clovers, the gift on its way to him, the
// gifts clovers buy, his trust and lean, whispers, and praise or scold for
// his latest line. Everything here is optional; he lives the same without it.
import { LEAN_MAX, TRUST_MAX, WHISPERS, type Bond, type Whisper } from "../core/bond";
import { CLOVER_AWAY_S, CLOVERS_PER_DAY, dayOf, effect, GIFTS, type Care } from "../core/gifts";
import { Bar, Card, KV } from "./kit";

const WHISPER_ICON: Record<Whisper, string> = { eat: "🍞", rest: "💤", explore: "🧭", save: "💰" };
const LEAN_NAME = { kind: "😇 Kind", rascal: "😈 Rascal", "": "Neither" } as const;

export type CareProps = {
  care: Care;
  bond: Bond;
  /** His latest line and when he said it, for praise or scold. */
  last: { text: string; t: number } | null;
  now: number;
  onSend: (id: string) => void;
  onWhisper: (w: Whisper) => void;
  onJudge: (sign: 1 | -1) => void;
};

export function CareSheet({ care, bond, last, now, onSend, onWhisper, onJudge }: CareProps) {
  const on = care.pending();
  const day = dayOf(now);
  const left = bond.whispersLeft(day);
  const judged = !last || last.t <= bond.judged;
  return (
    <>
      <Card icon="☘" title="Clovers" right={care.clovers}>
        <KV k="Earned today" v={`${care.earnedOn(day)} / ${CLOVERS_PER_DAY}`} />
        <KV k="Next clover" v={care.full(day) ? "Tomorrow" : `On reopen after ${CLOVER_AWAY_S / 3600} h away`} />
      </Card>
      {on && (
        <Card icon="📦" title="On its way" tone="ok">
          <KV k={`${on.icon} ${on.name}`} v="Opens at his next stop" />
        </Card>
      )}
      <Card icon="🎁" title="Send a care package">
        <ol class="zebra gifts">
          {GIFTS.map((g) => {
            const why = care.whyNot(g);
            return (
              <li key={g.id}>
                <div class="grow">
                  <div>
                    {g.icon} {g.name}
                  </div>
                  <div class="dim small">
                    {effect(g)}
                    {why && ` · ${why}`}
                  </div>
                </div>
                <button class="btn" disabled={!!why} aria-label={`Send ${g.name} for ${g.cost} ☘`} onClick={() => onSend(g.id)}>
                  ☘ {g.cost}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>
      <Card icon="🤝" title="His trust in you" right={Math.round(bond.trust)}>
        <Bar share={bond.trust / TRUST_MAX} color="var(--accent)" />
        <KV k="He leans" v={`${LEAN_NAME[bond.leaning()]} (${bond.lean > 0 ? "+" : ""}${bond.lean} of ±${LEAN_MAX})`} />
        <KV k="Following a whisper" v={bond.nudge ? `${WHISPER_ICON[bond.nudge]} ${bond.nudge}, ${Math.ceil(bond.nudgeLeft)} min` : "No"} />
      </Card>
      <Card icon="🤫" title="Whisper to him" right={`${left} left today`}>
        <div class="buttons">
          {WHISPERS.map((w) => (
            <button key={w} class="btn" disabled={left <= 0} aria-label={`Whisper ${w}`} onClick={() => onWhisper(w)}>
              {WHISPER_ICON[w]} {w[0]!.toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
      </Card>
      <Card icon="⚖" title="His latest deed">
        <div class="dim small">{last?.text ?? "Nothing yet"}</div>
        <div class="buttons">
          <button class="btn" disabled={judged} onClick={() => onJudge(1)}>
            👍 Praise
          </button>
          <button class="btn" disabled={judged} onClick={() => onJudge(-1)}>
            👎 Scold
          </button>
        </div>
      </Card>
    </>
  );
}
