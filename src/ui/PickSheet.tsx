// Where next: the cards on offer, one per place, numbered as their pins on
// the map. Each shows the place, what it gives and how far it is; tapping one
// sends him there.
import type { Offer } from "../core/cards";
import { placeIcon } from "../core/look";
import { dist, rewardText, walkTime } from "./format";

export function PickSheet({ offer, mps, onPick }: { offer: Offer[]; mps: number; onPick: (i: number) => void }) {
  return (
    <div class="offers">
      {offer.map((o, i) => (
        <button key={`${o.place.name}${i}`} class="offer" onClick={() => onPick(i)} aria-label={`${i + 1}: ${o.place.name}, ${rewardText(o.reward)}, ${dist(o.distM)}`}>
          <span class="offer-n" aria-hidden="true">
            {i + 1}
          </span>
          <span class="grow">
            <span class="offer-name">
              {placeIcon(o.place)} {o.place.name}
              {o.isNew && <span class="pill new">🆕 New</span>}
            </span>
            <span class="offer-row">
              <span class="offer-reward">{rewardText(o.reward)}</span>
              <span class="dim">
                {dist(o.distM)} · {walkTime(o.walkM, mps)}
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
