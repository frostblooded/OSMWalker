// Help: a search box over a list of topics by section, and a page per topic
// made of cards. The text is fetched the first time Help opens, so it costs
// nothing before.
import { useEffect, useMemo, useState } from "preact/hooks";
import type { GameData } from "../game/game";
import { blocks, build, search, type Section } from "./help";

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
  const [query, setQuery] = useState("");
  const hits = useMemo(() => (sections ? search(sections, query) : []), [sections, query]);
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
  const box = (
    <form class="search help-search" role="search" onSubmit={(e) => (e.preventDefault(), (document.activeElement as HTMLElement | null)?.blur())}>
      <input
        type="search"
        value={query}
        placeholder="🔍 Search Help"
        aria-label="Search Help"
        autocomplete="off"
        enterkeyhint="search"
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      {query && (
        <button class="btn" type="button" aria-label="Clear search" onClick={() => setQuery("")}>
          ✖
        </button>
      )}
    </form>
  );
  if (query.trim()) {
    return (
      <>
        {box}
        <section class="card" aria-label="Results">
          <h2>
            <span aria-hidden="true">🔍</span>
            <span class="grow">Results</span>
            <span class="right">{hits.length}</span>
          </h2>
          {hits.length ? (
            <ul class="zebra links">
              {hits.map(({ page: p, section, snip: [before, match, after] }) => (
                <li key={p.id}>
                  <button class="row hit" onClick={() => onPage(p.id)}>
                    <span class="grow">
                      <b>{p.title}</b> <span class="dim">· {section}</span>
                      <span class="snip">
                        {before}
                        <mark>{match}</mark>
                        {after}
                      </span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nothing found. Try another word.</p>
          )}
        </section>
      </>
    );
  }
  return (
    <>
      {box}
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
