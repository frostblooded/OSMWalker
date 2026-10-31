// His diary, newest day first: each day's title opens to the lines he wrote
// and the dreams he had that day (see core/diary.ts).
import type { Diary } from "../core/diary";
import { Entry } from "./kit";

export function DiarySheet({ diary }: { diary: Diary }) {
  if (!diary.entries.length) return <p class="dim">Nothing yet. At the end of each day he writes a few lines here.</p>;
  return (
    <div class="zebra">
      {[...diary.entries].reverse().map((e) => (
        <Entry key={`${e.date}:${e.city}`} title={`📔 ${e.lines[0]}`} lines={[...e.lines.slice(1), ...e.dreams.map((d) => `💤 ${d}`)]} />
      ))}
    </div>
  );
}
