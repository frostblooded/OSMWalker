// Languages (Duolingo meets The Sims): one meter per language, filled by
// hours spent in a country that speaks it and by chatting with the locals.
// Each level adds LANG_CHARM to his Charm in a country that speaks it, and at
// fluent he can take guiding and translating shifts there. His own language
// (that of the country he set out from) and English, the language of his
// feed, are fluent from the start. Language names come from the
// `languages` table in data/borders.json; a country missing there has a
// language of its own, named after it. Pure; Stats owns one.

/** Level names, from 0; the last is fluent. */
export const LANG_LEVELS = ["none", "a few words", "basic", "conversational", "fluent"] as const;
export const FLUENT = LANG_LEVELS.length - 1;
/** Hours in the language needed for each level. */
export const LANG_HOURS = [0, 1, 6, 20, 50] as const;
/** Hours a chat with the locals counts for. */
export const CHAT_H = 0.5;
/** Charm per level while he is in a country that speaks the language. */
export const LANG_CHARM = 0.75;
/** The language his feed is in: fluent from the start. */
export const ENGLISH = "English";

/** Country code -> the language most people there speak. */
export type LanguageNames = Record<string, string>;

/** The language spoken in country `code` ("Bulgarian"), or "" when there is no code. */
export function languageOf(names: LanguageNames | null | undefined, code: string, country: string): string {
  if (!code) return "";
  return names?.[code] ?? (country ? `${country}'s language` : code);
}

export function levelOf(hours: number): number {
  let l = 0;
  while (l < FLUENT && hours >= LANG_HOURS[l + 1]!) l++;
  return l;
}

export class Languages {
  /** Hours in each language he has started on. */
  hours: Record<string, number> = { [ENGLISH]: LANG_HOURS[FLUENT]! };
  /** The language he grew up with, once known. */
  native = "";

  level(lang: string): number {
    return lang ? levelOf(this.hours[lang] ?? 0) : 0;
  }

  /** Makes `lang` his own language, fluent, unless he has one. */
  setNative(lang: string): void {
    if (this.native || !lang) return;
    this.native = lang;
    this.hours[lang] = Math.max(this.hours[lang] ?? 0, LANG_HOURS[FLUENT]!);
  }

  /** `h` more hours in `lang`; returns the feed line when that lifts its level, or "". */
  add(lang: string, h: number): string {
    if (!lang || h <= 0) return "";
    const was = this.level(lang);
    this.hours[lang] = (this.hours[lang] ?? 0) + h;
    const now = this.level(lang);
    return now > was ? `🗣 ${lang}: now ${LANG_LEVELS[now]}` : "";
  }

  /** Charm he gets in a country that speaks `lang`. */
  charm(lang: string): number {
    return LANG_CHARM * this.level(lang);
  }

  /** The languages he has some of, his best first. */
  list(): { lang: string; level: number }[] {
    return Object.keys(this.hours)
      .map((lang) => ({ lang, level: this.level(lang) }))
      .filter((l) => l.level > 0)
      .sort((a, b) => b.level - a.level || (this.hours[b.lang] ?? 0) - (this.hours[a.lang] ?? 0));
  }

  toJSON() {
    return { hours: this.hours, native: this.native };
  }

  /** Old saves have no languages: English only, and his own is set from where he is (see Stats.fromJSON). */
  static fromJSON(d: unknown): Languages {
    const out = new Languages();
    const v = d as { hours?: Record<string, unknown>; native?: unknown } | null;
    for (const [k, h] of Object.entries(v?.hours ?? {})) if (Number(h) > 0) out.hours[k] = Number(h);
    out.native = typeof v?.native === "string" ? v.native : "";
    return out;
  }
}
