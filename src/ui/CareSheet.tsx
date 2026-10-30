// Care packages: your clovers, the gift on its way to him, and the gifts
// clovers buy. Everything here is optional; he lives the same without it.
import { CLOVER_AWAY_S, CLOVERS_PER_DAY, dayOf, effect, GIFTS, type Care } from "../core/gifts";
import { Card, KV } from "./kit";

export function CareSheet({ care, now, onSend }: { care: Care; now: number; onSend: (id: string) => void }) {
  const on = care.pending();
  const day = dayOf(now);
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
    </>
  );
}
