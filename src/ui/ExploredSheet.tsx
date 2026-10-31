// The 200 m squares he walked: how much of this city, and how many in the
// whole world. The map above the sheet shows them.
import type { BBox } from "../core/geo";
import { CELL_M, type Explored } from "../core/explored";
import { share } from "./format";
import { Card, KV } from "./kit";

const KM2 = (CELL_M / 1000) ** 2;

export function ExploredSheet({ explored: e, city, box }: { explored: Explored; city: string; box: BBox | null }) {
  const here = box ? e.inBox(box) : { walked: 0, total: 0 };
  const km2 = e.size * KM2;
  return (
    <>
      <Card icon="🏙" title={city} right={`${share(here.walked, here.total)} explored`}>
        <KV k="Squares walked" v={`${here.walked.toLocaleString()} of ${here.total.toLocaleString()}`} />
      </Card>
      <Card icon="🌍" title="World" right={`${e.size.toLocaleString()} square${e.size === 1 ? "" : "s"}`}>
        <KV k="Area walked" v={`${km2.toFixed(km2 < 1 ? 2 : 1)} km²`} />
      </Card>
      {!e.size && <p class="dim">He marks a square each time he walks into a new one.</p>}
    </>
  );
}
