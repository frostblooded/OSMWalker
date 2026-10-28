// Help: a list of topics by section, and a page per topic made of cards.
// The text is fetched the first time Help opens, so it costs nothing before.
import { useEffect, useState } from "preact/hooks";
import type { GameData } from "../game/game";
import { blocks, build, type Section } from "./help";

let text: Promise<string> | null = null;
const fetchText = () => {
  text ??= fetch(`${import.meta.env.BASE_URL}data/help.txt`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
  text.catch(() => (text = null));
  return text;
};

export function HelpSheet({ data, page, onPage }: { data: GameData; page: string; onPage: (id: string) => void }) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchText()
      .then((t) => setSections(build(t, data)))
      .catch(() => setError("Couldn't load Help. Check your connection and try again."));
  }, [data]);

  if (error) return <p class="notice error">✖ {error}</p>;
  if (!sections) {
    return (
      <p class="notice">
        <span class="spin" /> Loading Help…
      </p>
    );
  }
  const open = sections.flatMap((s) => s.pages).find((p) => p.id === page);
  if (open) {
    return (
      <>
        <h3 class="page-title">{open.title}</h3>
        {blocks(open.body).map((b, i) => (
          <div class="card help-block" key={i}>
            {b.text && <p>{b.text}</p>}
            {b.items.length > 0 && (
              <ul class="zebra">
                {b.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {sections.map((s) => (
        <section class="card" key={s.title}>
          <h2>{s.title}</h2>
          <ul class="zebra links">
            {s.pages.map((p) => (
              <li key={p.id}>
                <button class="row" onClick={() => onPage(p.id)}>
                  <span class="grow">{p.title}</span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
