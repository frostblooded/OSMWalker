// Where next: the cards on offer, one per place, numbered as their pins on
// the map. Each shows the place, what it gives (or sells, or where it rides
// to) and how far it is; tapping one sends him there. Below, the next
// upgrade and what it still waits on.
import type { Offer } from "../core/cards";
import type { Stats } from "../core/stats";
import { cardText, dist, walkTime } from "./format";
import { NextUpgrade } from "./NextUpgrade";

export function PickSheet({ offer, mps, stats, onPick }: { offer: Offer[]; mps: number; stats: Stats; onPick: (i: number) => void }) {
  return (
    <div class="offers">
      {offer.map((o, i) => {
        const t = cardText(o);
        return (
          <button key={`${o.place.name}${i}`} class={`offer ${o.slot}`} onClick={() => onPick(i)} aria-label={`${i + 1}: ${t.name}, ${t.gets}, ${dist(o.distM)}`}>
            <span class="offer-n" aria-hidden="true">
              {i + 1}
            </span>
            <span class="grow">
              <span class="offer-name">
                {t.name}
                {o.isNew && <span class="pill new">🆕 New</span>}
              </span>
              <span class="offer-row">
                <span class="offer-reward">{t.gets}</span>
                <span class="dim">
                  {dist(o.distM)} · {walkTime(o.walkM, mps)}
                </span>
              </span>
            </span>
          </button>
        );
      })}
      <NextUpgrade stats={stats} />
    </div>
  );
}
