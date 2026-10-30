// Help: a search box over a list of topics by section, and a page per topic
// made of cards. The code that fills the text in (help.ts, with every list and
// number it pulls from the game) is its own chunk, kept off the startup path
// (main.tsx fetches it at idle); the text itself loads the first time Help opens.
// The text's address carries a hash of it, so after a deploy that changes Help
// the service worker can't hand back the old text.
import { useEffect, useMemo, useState } from "preact/hooks";
import type { GameData } from "../game/game";
import type { Section } from "./help";

type Help = typeof import("./help");

/** Where the Help text lives; a new address whenever the text changes. */
export const HELP_URL = `${import.meta.env.BASE_URL}data/help.txt?v=${__HELP_VERSION__}`;

let text: Promise<string> | null = null;
const fetchText = () => {
  text ??= fetch(HELP_URL).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
  text.catch(() => (text = null));
  return text;
};

export function HelpSheet({ data, page, onPage }: { data: GameData; page: string; onPage: (id: string) => void }) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [help, setHelp] = useState<Help | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tries, setTries] = useState(0);
  const hits = useMemo(() => (sections && help ? help.search(sections, query) : []), [sections, help, query]);
  useEffect(() => {
    Promise.all([fetchText(), import("./help")])
      .then(([t, h]) => {
        setHelp(h);
        setSections(h.build(t, data));
      })
      .catch(() => setError("Couldn't load Help. Check your connection and try again."));
  }, [data, tries]);

  if (error) {
    return (
      <>
        <p class="notice error">✖ {error}</p>
        <button
          class="btn"
          onClick={() => {
            setError("");
            setTries(tries + 1);
          }}
        >
          ↻ Try again
        </button>
      </>
    );
  }
  if (!sections || !help) {
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
        {help.blocks(open.body).map((b, i) => (
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
