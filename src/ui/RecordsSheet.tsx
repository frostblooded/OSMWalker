// His records: his bests and lifetime totals, then the hall of walkers
// comparing the family's records once there is an heir.
import { euro } from "../core/money";
import { span } from "../core/records";
import type { Stats } from "../core/stats";
import { Hall } from "./Family";
import { dist } from "./format";
import { Card, Collapsible, KV } from "./kit";

export function RecordsSheet({ stats: s }: { stats: Stats }) {
  const r = s.records;
  return (
    <>
      <Card icon="🏆" title="Bests">
        <div class="zebra">
          <KV k="🚶 Longest walk without a stop" v={dist(r.best.stretchM)} />
          <KV k="📏 Most walked in a day" v={dist(r.best.dayM)} />
          <KV k="📍 Most places in a day" v={r.best.dayStops} />
          <KV k="💰 Most money held" v={euro(r.best.cents)} />
          <KV k="❤ Longest without fainting" v={span(r.best.noFaintS)} />
        </div>
        <Collapsible title="Totals" right={`${r.countries.length} countries`}>
          <div class="zebra">
            <KV k="🌍 Countries" v={r.countries.length} />
            <KV k="🏙 Cities" v={r.cities.length} />
            <KV k="💥 Mishaps" v={r.mishaps} />
            <KV k="🏥 Faints" v={r.faints} />
          </div>
        </Collapsible>
      </Card>
      <Hall stats={s} />
    </>
  );
}
