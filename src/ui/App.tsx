// Which screen shows: the picker for a new player, the game for a saved one.
import { useEffect, useState } from "preact/hooks";
import { loadData } from "../app/data";
import { Game, SAVE_KEY } from "../game/game";
import { Api, type SearchPlace } from "../net/api";
import { StreetClient } from "../streets/client";
import { GameScreen } from "./GameScreen";
import { Picker } from "./Picker";

const api = new Api();
let game: Promise<Game> | null = null;

/** The game, made once the data has arrived; the streets worker starts with it. */
function getGame(): Promise<Game> {
  game ??= loadData().then((data) => {
    const streets = new StreetClient();
    const g = new Game({ api, load: streets.load, data });
    streets.onProblem = (t) => g.problems.warn(t);
    return g;
  });
  return game;
}

const hasSave = () => {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
};

type Msg = { text: string; busy?: boolean; error?: boolean } | undefined;

export function App() {
  const [g, setGame] = useState<Game | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resuming, setResuming] = useState(hasSave);
  const [msg, setMsg] = useState<Msg>();

  useEffect(() => {
    if (resuming) {
      void getGame().then((game) => {
        setGame(game);
        setPlaying(game.load());
        setResuming(false);
      });
    } else {
      // The picker needs none of it, so fetch it once the page is up.
      const idle = (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200))) as (f: () => void) => void;
      idle(() => void getGame().then(setGame));
    }
  }, []);

  const choose = async (p: SearchPlace) => {
    const name = p.name.split(",")[0]!;
    setMsg({ text: `Finding streets in ${name}…`, busy: true });
    const game = await getGame();
    setGame(game);
    const err = await game.startCity(p.name, p.lat, p.lon, p.bbox, (state) => setMsg({ text: `Finding streets in ${name}… (${state})`, busy: true }));
    if (err) return setMsg({ text: err, error: true });
    setMsg(undefined);
    setPlaying(true);
  };

  if (resuming) {
    return (
      <div class="picker" style={{ placeItems: "center", justifyContent: "center", textAlign: "center" }}>
        <h1>OSM Walker</h1>
        <p class="status" style={{ justifyContent: "center" }}>
          <span class="spin" /> Picking up where he was…
        </p>
      </div>
    );
  }
  if (playing && g?.walker) {
    return (
      <GameScreen
        game={g}
        onReset={() => {
          g.reset();
          setPlaying(false);
        }}
      />
    );
  }
  return <Picker search={(t) => api.searchPlaces(t)} choose={(p) => void choose(p)} message={msg} />;
}
