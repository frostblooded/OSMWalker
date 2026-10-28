// The city picker: suggestions appear as you type (after 3 letters and a
// short pause), tap one to start there.
import { useEffect, useRef, useState } from "preact/hooks";
import type { SearchPlace } from "../net/api";
import { typedSplit } from "./format";

export const MIN_CHARS = 3;
export const TYPING_DELAY_MS = 350;

type Props = {
  search: (text: string) => Promise<SearchPlace[] | null>;
  choose: (p: SearchPlace) => void;
  /** What happens after a tap ("Finding streets in Sofia…"), or an error. */
  message?: { text: string; busy?: boolean; error?: boolean };
};

export function Picker({ search, choose, message }: Props) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [status, setStatus] = useState<{ text: string; busy?: boolean; error?: boolean }>({ text: "" });
  const latest = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const run = async (q: string) => {
    const t = q.trim();
    if (!t) return;
    latest.current = t;
    setStatus({ text: "Searching…", busy: true });
    const places = await search(t);
    if (latest.current !== t) return; // the player typed on meanwhile
    setResults(places ?? []);
    if (!places) setStatus({ text: "Couldn't reach the search server. Check your connection and try again.", error: true });
    else setStatus({ text: places.length ? "Tap a place" : "Nothing found. Try another name." });
  };

  useEffect(() => {
    clearTimeout(timer.current);
    if (text.trim().length >= MIN_CHARS) timer.current = setTimeout(() => void run(text), TYPING_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [text]);

  const shown = message ?? status;
  return (
    <section class="picker" aria-label="Pick a city">
      <h1>🏙 Where does he start?</h1>
      <p class="lead">Type a town or city. He walks its real streets.</p>
      <form
        class="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur(); // hides the on-screen keyboard
          void run(text);
        }}
      >
        <input
          type="search"
          value={text}
          placeholder="Sofia, Lyon, Kyoto…"
          aria-label="City name"
          autocomplete="off"
          enterkeyhint="search"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button class="btn primary" type="submit" aria-label="Search">
          🔍
        </button>
      </form>
      <p class={`status${shown.error ? " error" : ""}`} role="status">
        {shown.busy && <span class="spin" />}
        {shown.error && "✖ "}
        {shown.text}
      </p>
      <ul class="results">
        {results.map((p) => {
          const [typed, rest] = typedSplit(p.name, text);
          return (
            <li key={`${p.lat},${p.lon},${p.name}`}>
              <button type="button" disabled={!!message?.busy} onClick={() => choose(p)}>
                {typed}
                <b>{rest}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
