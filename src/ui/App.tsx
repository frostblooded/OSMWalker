// Which screen shows: the picker for a new player, the game for a saved one;
// a postcard in the link opens on top of either.
import { useEffect, useState } from "preact/hooks";
import { loadData, whenIdle, yieldNow } from "../app/data";
import { decode, type Postcard } from "../core/postcard";
import { Game } from "../game/game";
import { SaveFile } from "../game/saveFile";
import { Api, type SearchPlace } from "../net/api";
import { StreetClient } from "../streets/client";
import { GameScreen, Loading } from "./GameScreen";
import { Picker } from "./Picker";

const api = new Api();
let game: Promise<Game> | null = null;

/** The game, made once the data has arrived; the streets worker starts with it. Each step is its own task, so none is long. */
function getGame(): Promise<Game> {
  game ??= loadData().then(async (data) => {
    const streets = new StreetClient();
    await yieldNow();
    const g = new Game({ api, load: streets.load, data });
    streets.onProblem = (t) => g.problems.warn(t);
    return g;
  });
  return game;
}

const hasSave = () => new SaveFile().has();

type Msg = { text: string; busy?: boolean; error?: boolean } | undefined;

/** A postcard in the link this page was opened with; the link is cleaned so a reload doesn't show it again. */
function takePostcard(): Postcard | null {
  const card = decode(location.hash);
  if (card) history.replaceState(null, "", location.pathname + location.search);
  return card;
}

export function App() {
  const [received, setReceived] = useState(takePostcard);
  const [g, setGame] = useState<Game | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resuming, setResuming] = useState(hasSave);
  const [msg, setMsg] = useState<Msg>();
  // The postcard screens load only when a link brings a postcard, so their code stays off the startup path.
  const [cards, setCards] = useState<typeof import("./PostcardSheet") | null>(null);
  const [cardsFailed, setCardsFailed] = useState(false);
  useEffect(() => {
    if (received && !playing && !cards) import("./PostcardSheet").then(setCards, () => setCardsFailed(true));
  }, [received, playing]);

  useEffect(() => {
    if (resuming) {
      void getGame().then((game) => {
        setGame(game);
        setPlaying(game.load());
        setResuming(false);
      });
    } else {
      // The picker needs none of it, so fetch it once the page is up.
      whenIdle(() => void getGame().then(setGame));
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
        received={received}
        onReceivedDone={() => setReceived(null)}
        onReset={() => {
          g.reset();
          setPlaying(false);
        }}
      />
    );
  }
  return (
    <>
      <Picker search={(t) => api.searchPlaces(t)} choose={(p) => void choose(p)} message={msg} />
      {received && (
        <div class="dialog-bg">
          <div class="dialog" role="dialog" aria-label="Postcard">
            {cards ? (
              <cards.ReceivedSheet card={received} onDone={() => setReceived(null)} />
            ) : (
              <>
                <Loading failed={cardsFailed} />
                <button class="btn" onClick={() => setReceived(null)}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
