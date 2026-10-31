// His emotion (The Sims 4): his moodlets add up to one named feeling. Each
// moodlet counts its mood an hour towards its own emotion (untagged ones
// towards Happy or Sad by their sign), a full tank of energy counts towards
// Energised and very low mood towards Sad; the biggest wins, else he is Bored
// (low mood) or just Fine. An emotion pulls his goal EMO_PULL times as hard
// to its kinds of place, weighs actions that train or need its attribute
// EMO_PULL as much, and lifts their XP and pay by EMO_BONUS (Happy: all XP
// by HAPPY_XP). Doing anything at an emotion's kind of place brings its
// moodlet. Pure: Stats asks it.
import type { Moodlet } from "./mind";

export const EMOTIONS = ["happy", "focused", "inspired", "playful", "energised", "tense", "sad", "bored", "fine"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const EMO_PULL = 2;
export const EMO_BONUS = 0.15;
export const HAPPY_XP = 0.05;
/** Energy at or above this counts ENERGY_WEIGHT towards Energised; mood at or below SAD_MOOD counts SAD_WEIGHT towards Sad; with nothing else, mood under BORED_MOOD is Bored. */
export const FULL_ENERGY = 80;
export const ENERGY_WEIGHT = 1;
export const SAD_MOOD = 20;
export const SAD_WEIGHT = 2;
export const BORED_MOOD = 40;
/** The moodlet a visit to an emotion's kind of place brings: mood an hour, for how many hours. */
export const EMO_MOODLET: [number, number] = [1, 3];

type Info = { word: string; icon: string; attr?: "str" | "cha" | "wit" | "luck"; kinds: string[]; moodlet?: [string, string] };

/** Map classes each emotion pulls him to; the first four also come from them (their moodlet). */
export const INFO: Record<Emotion, Info> = {
  focused: { word: "Focused", icon: "🧐", attr: "wit", kinds: ["library", "college", "school", "office", "hackerspace", "chess"], moodlet: ["Deep in thought", "🧐"] },
  inspired: { word: "Inspired", icon: "🎨", attr: "luck", kinds: ["museum", "art_gallery", "theatre", "lookout", "monument", "memorial", "castle", "garden"], moodlet: ["Inspired", "🎨"] },
  playful: { word: "Playful", icon: "😜", attr: "cha", kinds: ["theme_park", "water_park", "zoo", "aquarium", "cinema", "bar", "beer", "ice_cream", "playground", "escape_game", "karting", "billiards"], moodlet: ["In a playful mood", "😜"] },
  energised: { word: "Energised", icon: "🏃", attr: "str", kinds: ["park", "pitch", "sports_centre", "fitness_centre", "stadium", "swimming", "swimming_pool", "climbing", "boxing", "tennis", "ice_rink", "yoga"], moodlet: ["Pumped", "🏃"] },
  happy: { word: "Happy", icon: "😊", kinds: [] },
  tense: { word: "Tense", icon: "😬", kinds: ["park", "garden", "cafe", "library", "yoga"] },
  sad: { word: "Sad", icon: "😢", kinds: ["cafe", "ice_cream", "bakery", "bar", "park"] },
  bored: { word: "Bored", icon: "😑", kinds: ["theme_park", "zoo", "aquarium", "museum", "castle", "lookout", "cinema"] },
  fine: { word: "Fine", icon: "🙂", kinds: [] },
};

/** The emotion his moodlets, energy and mood add up to. */
export function emotionOf(moodlets: Moodlet[], energy: number, mood: number): Emotion {
  const score: Partial<Record<Emotion, number>> = {};
  const add = (e: Emotion, n: number) => (score[e] = (score[e] ?? 0) + n);
  for (const m of moodlets) if (m.per_h) add(m.emo ?? (m.per_h > 0 ? "happy" : "sad"), Math.abs(m.per_h));
  if (energy >= FULL_ENERGY) add("energised", ENERGY_WEIGHT);
  if (mood <= SAD_MOOD) add("sad", SAD_WEIGHT);
  let best: Emotion | null = null;
  for (const e of EMOTIONS) if ((score[e] ?? 0) > (best ? score[best]! : 0)) best = e;
  return best ?? (mood < BORED_MOOD ? "bored" : "fine");
}

/** How hard emotion `e` pulls him to a place of map class `kind`. */
export const emoPull = (e: Emotion, kind: string) => (INFO[e].kinds.includes(kind) ? EMO_PULL : 1);

/** The emotion whose moodlet doing something at a place of map class `kind` brings, if any. */
export function emoFrom(kind: string): Emotion | null {
  for (const e of EMOTIONS) if (INFO[e].moodlet && INFO[e].kinds.includes(kind)) return e;
  return null;
}
