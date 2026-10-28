// City trivia from Wikidata: one SPARQL query for the most populous place
// near the city centre and a few facts about it (founding, population,
// height, twin towns, namesake, what it is the capital of), turned into
// quick actions he can do at random spots.
import type { Action } from "./stats";

export const SPARQL_URL = "https://query.wikidata.org/sparql";
export const RADIUS_KM = 15;
export const MAX_TWINS = 5;
const FX = { wit: 0.2, xp: 10 };

export type Row = Record<string, { value: string } | undefined>;

export function query(lat: number, lon: number): string {
  return `SELECT ?cityLabel ?pop ?inception ?elev ?twinLabel ?namedLabel ?capLabel WHERE {
  { SELECT ?city ?pop WHERE {
      SERVICE wikibase:around { ?city wdt:P625 ?loc .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${RADIUS_KM}" . }
      ?city wdt:P1082 ?pop .
    } ORDER BY DESC(?pop) LIMIT 1 }
  OPTIONAL { ?city wdt:P571 ?inception }
  OPTIONAL { ?city wdt:P2044 ?elev }
  OPTIONAL { ?city wdt:P190 ?twin }
  OPTIONAL { ?city wdt:P138 ?named }
  OPTIONAL { ?city wdt:P1376 ?cap }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT 200`;
}

export function url(lat: number, lon: number): string {
  return `${SPARQL_URL}?format=json&query=${encodeURIComponent(query(lat, lon))}`;
}

const isNum = (s: string) => s !== "" && Number.isFinite(Number(s));

/** Trivia actions from the query's result rows (results.bindings). */
export function actions(rows: Row[]): Action[] {
  const lines = new Set<string>();
  let twins = 0;
  for (const row of rows) {
    const city = value(row, "cityLabel");
    if (city === "") continue;
    const born = value(row, "inception");
    const year = born.replace(/^-/, "").split("-")[0]!;
    if (/^\d+$/.test(year)) lines.add(`Learn that ${city} was founded in ${parseInt(year, 10)}${born.startsWith("-") ? " BC" : ""}`);
    if (isNum(value(row, "pop"))) lines.add(`Read that about ${round3(Math.trunc(Number(value(row, "pop"))))} people live in ${city}`);
    if (isNum(value(row, "elev"))) lines.add(`Notice ${city} sits ${Math.round(Number(value(row, "elev")))} m above the sea`);
    const twin = value(row, "twinLabel");
    const line = `Find a signpost to ${city}'s twin town ${twin}`;
    if (twin !== "" && twins < MAX_TWINS && !lines.has(line)) {
      lines.add(line);
      twins++;
    }
    if (value(row, "namedLabel") !== "") lines.add(`Learn that ${city} is named after ${value(row, "namedLabel")}`);
    if (value(row, "capLabel") !== "") lines.add(`Remember that ${city} is the capital of ${value(row, "capLabel")}`);
  }
  return [...lines].map((name) => ({ name, min: 5, fx: { ...FX } }));
}

/** A field's value, or "" when missing or only a bare Q-id (no English label). */
function value(row: Row, key: string): string {
  const v = row[key]?.value ?? "";
  return /^Q\d+$/.test(v) ? "" : v;
}

/** A number rounded to three significant figures, with thousands commas. */
export function round3(n: number): string {
  const step = 10 ** Math.max(String(n).length - 3, 0);
  return (Math.round(n / step) * step).toLocaleString("en-US");
}
