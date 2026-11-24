# Feature history

The game went through three shapes in a month:

1. **Godot 4 (2026-10-22 to 10-28, PRs #2–#31).** GDScript, a web export on
   GitHub Pages. He walked Overpass streets, later OpenFreeMap tiles, to
   random spots, then to places of note; trips to other cities by bus and
   plane; stats, coins, XP and actions at places; procedural items and shops;
   per-country actions for 41 countries; Wikidata trivia; a history log; a
   debug panel; city search; Help pages; a UI kit. Dropped for speed (see
   [performance.md](performance.md)).
2. **TypeScript, the big version (2026-10-28 to 10-31, PRs #35–#139).** The
   Godot game ported in one PR (#35), then about 90 systems inspired by
   Godville, The Sims, RimWorld and Stardew Valley: needs, moods, friends,
   quests, weather, a pet, careers, life stages and heirs, fantasy creatures,
   collections... Everything is at commit `2d468a4`.
3. **The refocus (2026-11-08 on, PRs #141–#154).** The user found too many
   features and no basic loop. A design research report
   (`docs/design-research.md`) and design rules came first; PR #142 cut the
   game to a small base loop (walk to a place you pick from 3 cards, money and
   XP, an unlock ladder), and PR #152 replaced that with the food delivery
   incremental loop described in [game-design.md](game-design.md).

## How to dig up a cut feature

```sh
git show 2d468a4:src/core/pet.ts            # the code
git show 2d468a4:public/data/incidents.json # its data
git log --oneline a87edab -- src/core/pet.ts   # the PRs that touched it
git grep -n "pet" 2d468a4 -- public/data/help.txt  # how Help explained it
```

Big data files at `2d468a4` (`public/data/`): actions.json (what he can do
at each kind of place), flavour.json (each country's own actions),
cities.tsv and airports.tsv (cities by population, airports, for trips),
quests.json and city-quests.json, incidents.json, beats.json, moments.json,
friends.json, letters.json, mail.json, diary.json, rival.json,
creatures.json, spells.json, words.json (everyday words in 41 languages),
borders.json, forecasts.json, jokes.json, placedex.json, help.txt.

## Catalog of every source file before the refocus

"cut" means the file is gone at `a87edab`; "kept" means a file of that name
survived the refocus (usually much smaller). The descriptions are the files'
own header comments.

| File at `2d468a4` | Lines | Fate | What it did (its header comment) |
| --- | --- | --- | --- |
| `src/app/data.ts` | 91 | cut | The bundled game data, fetched once after first paint (about 172 KB gzip in all), so the city picker shows before any of it arrives. |
| `src/app/loop.ts` | 71 | kept | Runs the game while the page is visible. Ticks come a few times a second; between them his figure glides (a CSS transition), so steps can be a few pixels without looking jumpy, and an idle main thread saves battery. When the page shows again, Game.wake turns the time it was hidden into a boost (see core/boost.ts). |
| `src/app/sound.ts` | 111 | cut | The optional city sound, made in the browser with Web Audio: nothing is downloaded. One looped noise buffer, filtered three ways, gives the street hum, cafe murmur and wind in the leaves; short sine blips add cups and birds. Loaded only when the player turns sound on, and silent while the page is hidden. |
| `src/core/activities.ts` | 259 | cut | What he can do at each kind of place, from data/actions.json, keyed by "class/subclass" or "class" of the tiles' POI layer, with "_generic" for places we have no actions for yet and "_spot" for random spots. data/flavour.json adds each country's own actions (by its code in data/cities.tsv) under the same keys; they join the usual ones there. Places of a career (see careers.ts) get its rank shifts, and their shifts count for it. On a public holiday the "_holiday" actions join every place's. Picks an action he can do, leaning towards what he needs and his karma. |
| `src/core/anniversaries.ts` | 96 | cut | Anniversaries (RimWorld's rituals, The Sims' birthdays): the day he set out is his birthday. Each year on it he has a party with his friends in the city he is in; how it goes rolls with his mood, and a great one leaves a long glow. On the same day of each of the other months he marks a small one: "Three months on the road". Pure; Stats owns one and calls it once a local day. |
| `src/core/beats.ts` | 112 | cut | Little moments between the bigger ones: once his History has been quiet for a random BEAT_MIN_S to BEAT_MAX_S seconds of play, a beat from the deck (data/beats.json) happens: something on the street, on board, at the place he stays at, a thought, or a word about a place he walks past. Each shows as a speech bubble over him and a History line, with a small nudge to his meters. Pure: the game says what he is doing, applies and says the line. |
| `src/core/beliefs.ts` | 113 | cut | His beliefs (RimWorld's ideoligion, kept small): now and then something he does at a place takes root as a belief, such as finding faith at a church or swearing by fresh air in a park. He holds at most MAX_BELIEFS. A belief pulls his goal to its kinds of place, weighs up the actions it favours, and cheers him when he lives by it. Unlike a quirk it comes from one moment, not a count, and it fades when he hasn't lived by it for FADE_DAYS; a faded belief may come back. Pure; Stats owns one. |
| `src/core/bills.ts` | 20 | cut | Weekly bills (The Sims' bills and repo man): at the start of each week, Monday at midnight by his clock, the bills for his phone, travel insurance and a storage locker arrive and he pays them by himself, or on the next reopen. They grow with his level, so they still matter late in the game. When he can't pay them all, a debt collector takes the cheapest thing in his bag he may sell instead and the bills are settled; with nothing to take, they are written off. Never his gear or a treasured item, so a bill never blocks him. |
| `src/core/bond.ts` | 152 | cut | His bond with you, the unseen friend (Godville's hero and god): how much he trusts you, which way he leans (kind or rascal), and the whispers you may send him. Trust grows when you check in and send care packages, fades a little when you stay away, and never drops sharply. Now and then he writes to you in his History. Whispers and praise or scold are optional taps: he lives the same without them, and may ignore a whisper. |
| `src/core/boost.ts` | 14 | cut | Time away: the game doesn't live through it while closed. On reopen he gets a boost instead, BOOST times as fast for a while, long enough that he ends up as far along as if the game had stayed open. Time away has no cap, and a boost left over from before adds to the new one. |
| `src/core/border.ts` | 22 | cut | Border moments: crossing into another country gives a few feed lines: a passport stamp, swapping some euros for the local money (flavour only: prices stay in euros), the first word he learns there on his first visit, and a border guard's quip. Words and quips come from data/borders.json. |
| `src/core/bricks.ts` | 65 | cut | Golden bricks (Godville's temple bricks): very rare finds at his stops, at most BRICKS_PER_DAY a day, so his first goal takes about a month. With enough for the next monument he pays for it at the next real park he reaches: a bench with his name, then a fountain, a statue, and then golden towers (the fantasy creeping into the real map). The map marks each one. |
| `src/core/bucket.ts` | 148 | cut | His bucket list: BUCKET_SIZE dreams at a time, a mix of things to do in the game (reach a level, ride a dragon, cook a stew...) and real sights in real cities (see the Eiffel Tower in Paris). He ticks one off by himself when he gets there: a goal once it is met, a sight once he arrives in its city. A sight on his list pulls his trips gently toward its city (DREAM_PULL, and at least DREAM_SHARE of a trip's odds, so a small city comes up too), and a dream ticked off makes room for a new one each morning. Pure; Stats owns one. |
| `src/core/business.ts` | 112 | cut | Side businesses (Godville's investments, Stardew's sheds): once he has a business's price to spare past what he saves up for, he buys the next one, cheapest first, in the city he is in. A local partner runs it, so it brings in money by the hour wherever he is, and pays him once a day. The last one is a small fantasy touch: a potion stall. He also buys a share in his spot (see spot.ts) in each city that has one: it pays a little each day, and more for each time he dropped by since, so it is a reason to come back. All by himself. Pure; Stats owns one. |
| `src/core/careers.ts` | 158 | cut | Careers (The Sims' careers): his paid shifts at one kind of place rank him up in that career, from Dishwasher to Café owner. Each rank pays more there (in place of the old pay rise per level) and brings its own better-paid shift at those places, in place of the last rank's. He climbs by himself: jobs in his best career weigh CAREER_PULL times as much when he picks what to do there, and his ranks go with him to every country. Pure; Stats owns one, Activities adds the career shifts to the places. |
| `src/core/chronicle.ts` | 33 | cut | His life chronicle (Godville's hero chronicle): one sentence per milestone, each only once, oldest first: where he set out from, his first trip and first time abroad, his first wage, levels, countries, fainting, his first letter to you, the monuments he built. History is his day; this is his life. |
| `src/core/cityCards.ts` | 91 | cut | City cards: a trading card for each of the CARDS_PER_COUNTRY biggest cities of every country, pulled at random from packs. A card's rarity is fixed by the city's size in its country; on top of it a pull may be Foil or Gold. Spares are sold at card shops, and a whole country's set gives a little Charm while he is in that country. Pure data and rules; Stats uses them. |
| `src/core/cityCheck.ts` | 70 | cut | Checks that a city lets him go on: a way out (a bus station, an airport or a gas station for a car) and a place where he can earn money. Missing either is severe: he could be stuck there. |
| `src/core/cityFacts.ts` | 71 | cut | City trivia from Wikidata: one SPARQL query for the most populous place near the city centre and a few facts about it (founding, population, height, twin towns, namesake, what it is the capital of), turned into quick actions he can do at random spots. |
| `src/core/clothes.ts` | 45 | cut | Clothes wear out (RimWorld's tattered apparel): cloth gear on his head, body and feet wears with every km he walks, twice as fast in the rain. Worn thin, the feed says so; worn through, it is tattered: it adds nothing, costs him Charm and mood, and clothes shops pull him until he buys something new there (anything beats a tattered piece). A tailor's mending makes his clothes as good as new. Pure; Stats applies it. |
| `src/core/clubs.ts` | 127 | cut | Clubs (The Sims 4's clubs): a friend with JOIN_AT hearts may invite him to the club they go to, at the place where they met, on one weekday at a set hour (chess at a café on Tuesdays at 19:00). From then on, whenever he is in that city at that time he goes by himself: a quiet stop anywhere in the city in the club's hours turns into the club night (he heads over), with its mood and XP and a heart for the friend. One club per city, MAX_CLUBS in all. A rare few are not of this world: a hedge mages' circle meets at a wizard's tower. Pure; Stats owns one. |
| `src/core/coffee.ts` | 97 | cut | His coffee habit (The Sims' and RimWorld's caffeine): each cup makes the habit stronger and each day fades it a little. Hooked, he craves a cup after CRAVE_H hours (cafés pull him harder), and after ACHE_H hours with none he gets a headache. After QUIT_AFTER headaches he decides to cut down on his own: the habit is gone, and for QUIT_DAYS cafés pull him less and cups build no habit. It always stays gentle: nothing worse than a headache. Pure; Stats owns one. |
| `src/core/collection.ts` | 561 | cut | The Collection as data: every set he can fill and every feat he can earn. A set lists its entries, found or not, with a hint for the ones he hasn't found; a feat counts something and has Bronze, Silver and Gold tiers, and Gold gives him a title. A new feature adds its SETS and FEATS here, and the sheet, the overall % and Help pick them up. Loaded lazily (sheet, Help, Game). |
| `src/core/comforts.ts` | 83 | cut | His daily comforts (The Sims' and RimWorld's): where he sleeps, what he eats and how pretty the streets around him are each leave a moodlet. Beds and meals are tiers on actions in data/actions.json (`bed`, `meal`); the surroundings come from the map tiles under him (map/mapView.ts landAt) and his places nearby, looked at every BEAUTY_EVERY_S while the game is open. Grim surroundings also pull his goal a little towards green and pretty places. Comforts counts the lavish meals and hotel nights for the Collection. Pure; Stats applies them. |
| `src/core/cooking.ts` | 119 | cut | Cooking (Stardew's cooking): bakeries, butchers and grocers sell him ingredients, which go in a pantry corner of his bag (PANTRY_MAX of them). At his hostel, a park or a campsite he cooks the best recipe his cooking level knows and his pantry holds: bread + cheese + tomato is a picnic, more filling than each alone. All by himself. Pure; Stats owns a Pantry. |
| `src/core/crawl.ts` | 64 | cut | A ruin crawl: 3 to 5 rooms at a real castle or ruin, each passed with a roll on one attribute. A failed roll turns him back with what he found; nothing fights. Deeper crawls find rarer things. Loaded at idle (main.tsx) and on a reopen (game.ts), then handed to ruins.ts. |
| `src/core/creatures.ts` | 78 | cut | Place creatures: a little folklore on the real map. A troll under a bridge, a water sprite in a fountain or well, a dryad in a park's old tree. At most once a day, when he reaches such a place, its creature may show up with a small choice (a timed moment, see moments.ts); each option is a small buff or a small loss. He takes his own pick when nobody taps. Who they are and what each pick does is data (data/creatures.json). |
| `src/core/debugLog.ts` | 90 | kept | Debug log: how each of his last SIZE goals was picked, with every roll, the odds and why a random spot was used. |
| `src/core/diary.ts` | 102 | cut | His diary (Godville's hero diary): once a local day he writes a few first-person lines about the day that ended, from fill-in templates over what he noted that day (a wish come true, a fear, a new spot, a faint...). When he naps or sleeps he may dream: a short, odd remix of the places of his day. No AI model, only templates from data/diary.json. Pure; Stats owns one. |
| `src/core/dilemmas.ts` | 162 | cut | One dilemma on reopen: now and then, after a long time away, the welcome-back card holds one small choice ("A trucker offers a free ride to Varna. Hop on, or stay?"). Your tap picks the outcome; if you just carry on he decides by himself, leaning on one of his attributes. Nothing ever waits for you. A few offers send him to another city, free. |
| `src/core/emotion.ts` | 61 | cut | His emotion (The Sims 4): his moodlets add up to one named feeling. Each moodlet counts its mood an hour towards its own emotion (untagged ones towards Happy or Sad by their sign), a full tank of energy counts towards Energised and very low mood towards Sad; the biggest wins, else he is Bored (low mood) or just Fine. An emotion pulls his goal EMO_PULL times as hard to its kinds of place, weighs actions that train or need its attribute EMO_PULL as much, and lifts their XP and pay by EMO_BONUS (Happy: all XP by HAPPY_XP). Doing anything at an emotion's kind of place brings its |
| `src/core/explored.ts` | 159 | cut | The world in squares of about CELL_M a side, and the ones he has walked through, kept for good across every city (New city clears them). Rows run along the latitude; each row's squares are CELL_M wide at its middle, so squares keep their size away from the equator. Only walking marks them: rides, flights and the time the game was closed don't. |
| `src/core/fairy.ts` | 79 | cut | Fairy rings: at dawn in a real park or garden he may lie down in a ring of mushrooms for a nap, and wake hours later, rested, with either a fairy gift (a trinket spun with a little fairy luck and Magic) or a burst of Magic and a strange story he can't quite tell. At most once every FAIRY_GAP_DAYS (Stats.fairyAt). |
| `src/core/fame.ts` | 86 | cut | His fame, city by city: how well people there know his face, good or bad (Fable's renown). Time spent in a city and every deed, kind or rascal, add points; past each tier he is Known, a Regular, then a Local hero. Fame never falls. Where they know him, people at his stops greet him now and then, and a Local hero gets a story in the local paper. The karma gate on discounts lives in Stats.shopDiscount, so this file knows nothing of karma. |
| `src/core/forecast.ts` | 46 | cut | The daily forecast: one small rule of the day, picked from data/forecasts.json with an Rng seeded from the local date, so every player on the same date gets the same one with no server (Godville's newspaper). It changes a little of how things go that day; he never has to do anything about it. |
| `src/core/friends.ts` | 160 | cut | The people in his life (Stardew's friendship hearts, kept gentle): the locals he keeps running into at the kinds of places he likes, a fellow traveller now and then for one trip, and maybe a partner. Each local has hearts from 0 to HEARTS_MAX; meeting again adds one. From MEET_UP_AT hearts they meet up on purpose wherever he is in their city; at HEARTS_MAX one may become his partner, who comes along on his trips. A companion joins a trip, splits the fare and chats for a few stops, then parts. Names and lines live in data/friends.json. All of it happens by |
| `src/core/geo.ts` | 73 | kept | Geo math helpers: distances and Web Mercator (OSM tile) projection. |
| `src/core/giants.ts` | 72 | cut | Giants seen from afar: rare spectacle with no fighting. A sea serpent's coils off a ferry pier or a swimming lake, a kraken's arm in the harbour, a giant asleep on the far hills seen from a viewpoint. When he reaches such a real place, now and then (at most once a day) one shows: he stops to watch, which lifts his mood, and keeps a legendary photo of it in the Collection. The first time he sees each one goes in his life story. |
| `src/core/gifts.ts` | 118 | cut | Care packages, the one small thing the player can do for him. Opening the game after at least CLOVER_AWAY_S away earns a clover, at most CLOVERS_PER_DAY a day, and a missed day costs nothing. Clovers buy one gift at a time, which he opens at his next stop: a snack, or a boost for a few hours. All of it is optional: he never waits for a gift, and you never choose where he goes. |
| `src/core/goals.ts` | 108 | cut | How the walker weighs his next goal: places of note by importance, by a medium walking distance and by lying ahead along his last leg, times how well they meet his needs; random spots are drawn with the same distance and heading odds. With an urgent need only places that fix it count, and the nearest of them wins. Pure functions, used by the walker. |
| `src/core/graph.ts` | 248 | kept | Walkable street network. Streets come in fixed cells (map tiles at CELL_ZOOM, one OpenFreeMap vector tile each), so downloads never overlap, add up, and can be cached by name. Node ids are numbers: tile grid ids are positive (see ofm.ts) and OSM node ids from Overpass are negated. |
| `src/core/hall.ts` | 62 | cut | The hall of walkers (Godville's pantheons, with no server): his family's records compared across its walkers. Each record names the walker who holds it, the first to reach it on a tie, with him counting as he is now; a record nobody has above 0 has no holder yet. Ancestors from before the hall only have what the family tree kept. |
| `src/core/history.ts` | 147 | kept | His history: the last SIZE things that happened, each with when and where, and the trail he walked since the oldest of them. Trips break the trail. |
| `src/core/holidays.ts` | 33 | cut | Public holidays from Nager.Date: which days are holidays in a country (what closes on them is core/opening.ts). Nager.Date takes ISO 3166 two-letter codes (core/iso2.ts turns the game's three-letter ones into them). |
| `src/core/home.ts` | 84 | cut | His home (The Sims' houses): once a city knows him as a Regular (see fame.ts), he rents a flat there, near his spot. The rent comes with his weekly bills. Once he has the price to spare past what he saves up for, he buys it, and the rent stops. In a home he owns he puts up one thing from his travels a day, and each makes the place more his. A share of his trips take him home, and a night in a hostel or hotel in his home city is a night in his own bed instead: free, and it cheers him, the more so the more things are up. He retires there too. |
| `src/core/incidents.ts` | 147 | cut | The incident deck: things that happen to him, not actions he picks at a place (a pickpocket, a stray dog, a wedding invite, a pub quiz win). Cards live in data/incidents.json; the storyteller (storyteller.ts) says when one happens and whether it is good, bad or odd, and this file picks a card that fits where he is (night legends at castles and graveyards first) and plays it out. Some cards hold a choice of two, asked as a timed moment while you watch (moment()); untapped, he picks by himself, leaning on one of his attributes. A bad card never takes more than LOSS_CAP_SHARE of his money, |
| `src/core/iso2.ts` | 27 | cut | ISO 3166 two-letter country codes for the three-letter ones the game keeps (Natural Earth's, in data/cities.tsv), for services that want two letters. |
| `src/core/items.ts` | 196 | cut | Procedural items: a base from the shop's kind, a material that unlocks with his level, and 0-3 modifiers that add stats and name the item ("Mighty Bronze Sword of the Fox"). More modifiers are rarer. There is no combat: gear only adds to his attributes (and speed). |
| `src/core/jokes.ts` | 13 | cut | Deadpan jokes: now and then a feed line about what he did at a place gets a dry second sentence, Godville style. The lines live in data/jokes.json by place class, with "_generic" for every other kind; picked with the action's own Rng. |
| `src/core/keepsakes.ts` | 177 | cut | His keepsakes: a card for each landmark he visits (its rarity from the map's rank, sometimes foil or gold), the Placedex of place kinds he has seen (rarer the less common the kind is in the POI sweep), a souvenir from each country, and crawls, little sets he finishes by visiting places of a kind. Pure data and rules; Stats.collect() uses them. |
| `src/core/languages.ts` | 95 | cut | Languages (Duolingo meets The Sims): one meter per language, filled by hours spent in a country that speaks it and by chatting with the locals. Each level adds LANG_CHARM to his Charm in a country that speaks it, and at fluent he can take guiding and translating shifts there. His own language (that of the country he set out from) and English, the language of his feed, are fluent from the start. Language names come from the `languages` table in data/borders.json; a country missing there has a language of its own, named after it. Pure; Stats owns one. |
| `src/core/life.ts` | 208 | cut | His life stages and his family. He grows from backpacker to settled, veteran and elder, STAGE_DAYS of real time each (open or closed alike). How well he was kept in a stage (faints, hours starving or parched) names the next one ("Hearty Veteran") and nudges that stage's attribute. At the end of elder he retires by himself (or sooner, from the menu, once he is an elder), in the city he spent most time in, and an heir sets out from there with one heirloom and the family perk, which grows each generation. |
| `src/core/look.ts` | 121 | kept | How he looks on the map: a face for how he feels, a bubble over his head with his most pressing need or the icon of the kind of place he heads for, and while he stays somewhere a pose for what he does there (zZz, steam, a note). |
| `src/core/lottery.ts` | 89 | cut | The lottery: kiosks, corner shops and newsagents sell him a TICKET for the next draw, at DRAW_HOUR by his clock, one ticket a draw. The odds are a real lottery's, and each point of Luck nudges every prize a little likelier (LUCK_NUDGE, up to LUCK_MULT_MAX). Like a real one it pays back well under the price on average, so it is a small treat, not a living; a big win is a rare story for his chronicle. Drawn by itself, by the clock. Pure; Stats owns one. |
| `src/core/magic.ts` | 139 | cut | Ley lines and small spells: a little magic on the real map. Every church, monument, memorial and castle he knows of is joined by a ley line to the nearest other one. Walking along a line slowly fills his Magic meter and charms his luck; reaching a place on one gives a burst, once a day each. Old books in real libraries and bookshops now and then teach him a spell, which he casts on his own for Magic: a few fix a low meter, the others are short buffs he spends spare Magic on. The spells are data (data/spells.json). |
| `src/core/mail.ts` | 86 | cut | Letters and gifts from his friends (Animal Crossing's letters, Neko Atsume's gifts). On the first minute of a local day, a friend in another city (LETTER_AT hearts or more) may write to him about the place where they met; the letter waits in his mailbox, so after a long time away you find it there. A friend in a city where he has a spot (GIFT_AT hearts or more) may leave a gift at his spot; he finds it the next time he gets there. His partner is with him, so never writes or leaves one. Lines and gifts live in data/mail.json. Pure; Stats owns one. |
| `src/core/mapIcons.ts` | 73 | cut | Which game icons the map shows: the city's made-up places (core/poiGen.ts) and the real bus stations and airports he travels from, nearest to him first and capped, so a capital never floods the map. Quests and events add their own icons with another `kind`; each kind has its own cap. The monuments he built in this city always show, uncapped (see bricks.ts), and so does his spot (see spot.ts). |
| `src/core/midnight.ts` | 56 | cut | The shop after midnight: between midnight and 3 the real antique and second-hand shops sell to those who knock. Half the time the shelf holds an enchanted item (items.ts ENCHANTMENTS: Magic for each km he walks), otherwise a one-off trinket used on the spot. He pays in euros plus a little Magic. |
| `src/core/mind.ts` | 181 | cut | His mind (The Sims' wants and fears, RimWorld's named thoughts): moodlets, wants and fears. A moodlet is a named, timed piece that nudges his mood a little each hour on top of the usual drift ("Wish come true +2/h"). He always holds a long and a short want for a kind of place, and after a mishap a want to shake it off; a wanted kind pulls his goal WANT_PULL times as hard and doing anything there makes the wish come true. A mishap may leave a fear of that kind of place, which pulls FEAR_PULL as hard, until a want to face it again brings him back and a visit with no mishap beats it. |
| `src/core/minigames.ts` | 50 | cut | The four mini-games a timed moment can be played as (moments.ts GameId), as pure rules; src/ui/MomentSheet.tsx draws them. Each scores 0 (worst) to 1 (best), and moments.ts scorePick turns the score into an option. |
| `src/core/moments.ts` | 96 | cut | Timed moments: a small choice or mini-game that may pop up when he does something (an activity, a trip, a story beat). You may tap an option; if you don't within the Settings timer, or the app is hidden or catching up, he takes the default. Effects stay with the caller: this file only says which option was picked. |
| `src/core/money.ts` | 16 | kept | Money is euros, kept as whole cents so sums never drift. The data files list prices in euros (3, 5.5); toCents turns them into cents once. |
| `src/core/ofm.ts` | 367 | kept | Turns an OpenFreeMap (OpenMapTiles schema) z14 vector tile into one street graph cell, with the tile's named places of note (shops, cafes, sights...).  Tiles carry no OSM node ids, so a node's id is its position on the tile grid: the same point gets the same id in every tile. Lines are clipped at the tile's edge, and the cut point is snapped so both neighbours agree on it. |
| `src/core/opening.ts` | 30 | cut | When places are open: shops, offices, museums and other day businesses close at night by the city's own clock (and all day when the sky says it is a public holiday, which Game.sky() sets from core/holidays.ts); bars, fast food, hotels, kiosks, parks and the rest stay open. Pure. |
| `src/core/perks.ts` | 70 | cut | Lifetime rewards (The Sims 3): wishes that come true and levels he reaches give lifetime points, and he spends them himself on lasting perks. As soon as he can afford one he takes the one that suits him best: the perk of his best attribute among those he can pay for (one with no attribute counts his average), the cheaper on a tie. Pure; Stats asks what he owns. |
| `src/core/pet.ts` | 156 | cut | His pet (Godville's hero pet): a stray from the incident deck, a dog or a cat that follows him, may stay for good. It gets a name, eats a little of his money each day, gives a steady mood lift while fed, and grows a level with the km it walks at his side; each level makes its perk a little bigger (a dog sniffs out coins, a cat keeps mishaps away). A pet high enough may show at a real old place that it was a fairy creature all along, which doubles its perk. After many months it grows old and passes, and a new stray can come. |
| `src/core/placeMoments.ts` | 55 | cut | A timed moment at each kind of place (see moments.ts): when he starts an activity there, a small choice or mini-game may change how it goes ("tip the barista", "skip paying"). Each option's outcome is data (data/moments.json), keyed like actions.json; Stats.settleMoment applies it. |
| `src/core/poiGen.ts` | 114 | cut | Places the game makes up on top of the real map. Must-haves fill gaps (a city with no bus station, gas station, food, bed or paid work gets one near its centre; trips.ts gives a big city with no airport in reach its own). Extras give quests somewhere to happen: notice boards, an adventurers' hall, old wells and the like at fitting real spots, more of them in bigger cities, and a few wizard towers at the grandest landmarks of big ones. Everything is seeded from the city's name, so the same city gets the same places. |
| `src/core/portals.ts` | 41 | cut | Portals: very rarely an old monument or castle ruin he reaches opens like a door, and he steps through to a real city he has never been to, anywhere in the world. Free and at once, at most once every PORTAL_GAP_DAYS (Stats.portalAt). |
| `src/core/postcard.ts` | 61 | cut | Postcards to friends: a snapshot of where he is (city, place, level and what he just did) packed into a link, so no server is needed. The data rides in the link's #fragment, which browsers never send anywhere; the friend's game reads it on open and shows the card. Everything read from a link is checked and cut to size, since anyone can write one. |
| `src/core/problems.ts` | 97 | kept | Problems from anywhere in the game, for the Debug panel: the last MAX_WARNINGS warnings, MAX_ERRORS errors and MAX_SEVERE severe problems (he may be stuck: shown on the map too), each also printed to the console. Each has a short title and detail lines. A problem repeated right away counts up instead of filling the log. |
| `src/core/quests.ts` | 532 | cut | Quests and world events, the story at the heart of his life. Each city has a board of quests (from 2 in a town to 30 in a capital), drawn from a bank of quest kinds in data/quests.json, each filled with a named local, an item, a twist and the city's real places, so the same kind reads as a new quest; capitals also have their own quests (data/city-quests.json) about named landmarks, dealt first. Every QUEST_EVERY_MIN to QUEST_EVERY_MAX stops he takes one on and does its steps back to back, stopping only for an urgent need; at its middle step it goes on or fails, ending early with no |
| `src/core/quirks.ts` | 81 | cut | Quirks from habits (Dwarf Fortress's dwarves): counts of where he does things turn into named traits. Twenty bakeries make him a Croissant snob, ten museums or galleries a Culture vulture. A quirk makes its places pull his goal QUIRK_PULL times as hard and cheers him a little each time he is at one. He holds at most MAX_QUIRKS; a new one pushes the oldest out, and a quirk that faded never comes back. Pure; Stats owns one. |
| `src/core/records.ts` | 113 | cut | His records over a whole life: longest stretch between stops, most walked and most places in a day, most money held, longest run without fainting, and totals (countries, cities, mishaps, faints). Stats feeds it, so a record counts every minute he lives. Beating a best may get a feed line, at most one a day. |
| `src/core/repute.ts` | 189 | cut | His good or bad name and the law. Karma is his lean in bond.ts (kind to rascal, -100 to +100); fame is fame.ts. This file holds what they do: kind walkers get discounts, gifts and free rides, rascals sell loot at fence prices but pay more. Crimes raise one police heat that follows him everywhere (GTA's wanted stars, Red Dead's bounty), the more so the better people know his face. Heat fades by itself; he can pay it off at a police station. Wanted, he may be spotted at a stop and chased: he gives up, runs, hides or bribes the officer, and if caught he pays a fine, or short |
| `src/core/rival.ts` | 169 | cut | His rival (Shadow of Mordor's nemesis, small): Viktor, another traveller who is in some of the cities he reaches (settled at his first stop there). While Viktor is in town a stop may bring a meeting: a contest for the same thing (a job, a table, a chess game), or now and then a friendly chat. Viktor remembers every meeting, levels up when he wins, and over many meetings a grudge or a friendship forms. All of it plays out by itself; while you watch, a contest opens as a mini-game you may play. Pure; Stats owns one. |
| `src/core/rng.ts` | 55 | kept | Seedable random numbers (mulberry32), so game logic is testable. |
| `src/core/route.ts` | 114 | kept | Route search for the walker: A* from a street corner towards a goal over the streets loaded so far. Corners whose surroundings are not loaded yet count as reachable in a straight line, so a route may end at the edge of the loaded map; the walker plans again there. |
| `src/core/ruins.ts` | 53 | cut | Ruin crawls, the part that is saved and loaded at startup: which real castles and ruins he crawled lately (once a week each) and the logs of his last crawls. The rooms themselves live in crawl.ts, loaded at idle. |
| `src/core/sightNotes.ts` | 108 | cut | Sight notes: at a big sight (map rank 1 or 2) he reads up on it, the first sentence of its Wikipedia article. English Wikipedia first, then the one in the country's language (data/words.json). Each sight is looked up once, a few an hour, and only while you watch, as it needs the network. |
| `src/core/skills.ts` | 91 | cut | Skills (The Sims' skills), apart from his four attributes: cooking, photography, music, chess, sport and art, each 0 to SKILL_MAX. An action with a `skill` trains it each time he does it, longer ones more; levels come slower the higher they get. A higher level makes its actions do more (and pay more), and some actions need a level (busking for a street concert needs music 4). Photography also makes his landmark cards shinier (see keepsakes.ts rollFinish). Pure; Stats owns one. |
| `src/core/sky.ts` | 190 | cut | The sky over his city: the city's clock, the season from the date and hemisphere, the sun's height and the day's sunrise and sunset (worked out on the device, no network), and what they and the weather (weather.ts) do to him: which places pull him, how fast he gets thirsty or tired, how fast he walks, and which actions he can do. Pure. |
| `src/core/skyEvents.ts` | 72 | cut | Sky events: now and then a night puts on a show, a full moon, shooting stars, a meteor shower, a comet, an aurora or an eclipse of the moon. They are the game's own, not the real sky's: each night in each city rolls its own dice, the rarer the show the smaller its odds. The first time it gets dark on such a night he looks up, whatever the weather: a feed line and a moodlet. Once a night (Stats.lookUp). Pure. |
| `src/core/soundscape.ts` | 15 | cut | Which soundscape the optional city sound plays: cafe chatter where he eats or drinks, birdsong in green places, the street hum anywhere else, and nothing while he rides between cities. The sound itself is app/sound.ts. |
| `src/core/speeds.ts` | 32 | cut | Realistic speeds in meters per second. |
| `src/core/spot.ts` | 79 | cut | His spot (Stardew's schedules): the real place he has reached most in a city, once he has been there SPOT_MIN times, is his spot. It shows a house on the map, pulls his goal SPOT_PULL times as hard in the morning and gives him a regular's discount there. Each city keeps its top SPOT_KEEP places by visits; a new place pushes out the least recently reached of the least visited. Pure; Stats owns one. |
| `src/core/stats.ts` | 2219 | kept | His body, wallet and progress: six meters (0-100), four attributes, coins, XP and level, timed buffs, gear and a bag of items, speed, his history and his keepsakes (landmark cards, Placedex, souvenirs, crawls), the storyteller that paces the incidents that happen to him, his quests, and the people in his life: friends, their clubs and news, and his anniversaries, what he has learned (skills, cooking and languages), and his life stages and family (life.ts): retire() hands over to an heir. Time passes in game minutes, which are real minutes while the app is open. |
| `src/core/storyteller.ts` | 87 | cut | The storyteller (RimWorld's AI storytellers): a tension number that rises while his life is calm, faster the richer he is, and paces the incidents that happen to him. Above FIRE_AT each stop may bring one, likelier the higher the tension; a bad one sets it back to zero and starts a lucky stretch with only good or odd ones. It remembers the last few incidents so they don't come round again too soon. Calm, Classic or Chaotic sets how fast it rises and how often an incident is bad. Pure; Stats owns one. |
| `src/core/streetBook.ts` | 37 | cut | Streets he walked: any stretch of a named street counts. Kept per city by name, so the Stats sheet can say "Sofia: 312 streets" and list them. |
| `src/core/tastes.ts` | 71 | cut | His hidden tastes (The Sims 4 likes and dislikes): LIKES kinds of place he loves and DISLIKES he can't stand, rolled once for each walker and secret until he first does something at one ("Turns out he loves zoos"). Known or not, a liked kind pulls his goal LIKE_PULL times as hard and a disliked one DISLIKE_PULL, and each visit brings a small moodlet. Unlike quirks they are never earned, only found. Pure; Stats owns one and rolls its own dice. |
| `src/core/townies.ts` | 79 | cut | Townies live on (The Sims 3's story progression): the friends he made keep living their own lives. Once a day there is a NEWS_CHANCE that one of them (NEWS_AT hearts or more, never his partner, who is with him) has news: they took up the guitar, got married, or moved to another city, where he may run into them from then on. Big news comes as a letter to him, small news as a line in the feed. Each piece of news happens to a friend once. The news lives in data/friends.json. Pure; Stats owns one. |
| `src/core/travelKit.ts` | 32 | cut | Packing: as he sets off for another city, by any way, he packs a travel kit on his own, by need: snacks when he is getting hungry, a water bottle when thirsty, a phrasebook when the trip goes abroad. Each is a timed buff that keeps working in the new city. He only packs what leaves him his reserve after the fare. |
| `src/core/trips.ts` | 402 | cut | Trips: each time he picks a new destination he may travel to another city in the same country (10%) or in another country (2.5%) instead, twice as often while his city has no places of note. Cities come from a bundled list and are picked weighted by population. He gets there by bus from a bus station, by plane from an airport, or in his own car after filling up at a gas station, and pays for the ride. Where the places allow it he takes the train from a railway station instead of the bus, now and then a ferry from a ferry terminal, and cycles to a near town on his bike. Broke, he |
| `src/core/visas.ts` | 79 | cut | Visas that grow (The Sims 3's World Adventures visas): each country he spends days in gives him a better visa there, from Tourist up to Citizen. A visa caps how long one stay in the country may last; as he nears the cap his trip dice lean abroad, so he moves on by himself, and a better visa allows longer stays and better pay at local jobs. Nothing is forced: he never has to leave, the odds just grow. |
| `src/core/walker.ts` | 788 | kept | The character's walk along the street graph: he picks a place of note (a shop, a cafe, a sight...), heads there by the shortest route over the streets loaded so far (re-planning as more load), stays a minute at most, then picks the next one. Places weigh by importance, by a medium walking distance, by lying ahead along his last leg, and less when he went there lately. With no places loaded yet he heads for a random spot near and ahead of him and walks on without stopping there. Instead of a new goal he may travel to another city (see trips.ts): he |
| `src/core/weather.ts` | 62 | cut | Real weather for his city from Open-Meteo (free, no key): one small request gives the city's clock offset and hourly weather from today to the end of tomorrow. Pure: the game fetches and caches it. |
| `src/core/week.ts` | 103 | cut | His week in numbers, for the weekly recap: how far he walked, where he stopped, new places and cities, and his money and level at the start. When a new week starts (Monday at midnight) the old one becomes the recap, shown once in the next reopen's welcome-back card. |
| `src/core/words.ts` | 52 | cut | Local words: in a country whose language is in data/words.json he now and then picks up an everyday word at a place that fits it ("кафе (kafe)" at a café, "hello" anywhere), and keeps what he learned per language. |
| `src/core/workCards.ts` | 128 | cut | Chance cards at work (The Sims' career chance cards): now and then a paid shift brings a small dilemma, such as the boss asking him to cover a double. It pops up as a timed moment you may answer; if you don't, he picks by himself, leaning on one of his attributes. The bold choice can pay off or go wrong, by the same attribute. The feed shows what was chosen and how it went. Pure; Stats.do draws one. |
| `src/game/game.ts` | 1575 | kept | The game: picks a city, keeps the walker moving in real time while the app is open (after time closed it runs faster for a while, see core/boost.ts), loads streets as he nears new ground, and now and then sends him on a trip to another city by bus, plane or car (he walks to the station first and pays the fare there). At each place he does an action that changes his stats. The sky over the city (sun, season, Open-Meteo weather, closed places) steers him. No DOM here: the app calls step() and the screens read the state. |
| `src/game/hud.ts` | 134 | kept | What the screens show about him, worked out once from the game: his look on the map, the soundscape, the top card (what he is doing, where he goes, how long until he moves again, why he waits, how he feels, the sky) and the facts Debug lists. Plain data, so the screens only lay it out and the numbers are tested without a browser. |
| `src/game/journey.ts` | 133 | cut | Trips to other cities, from the game's side: on each new destination the dice may send him off instead (never on the first pick in a new city), the trip is planned and its fare checked, the bus or car road is asked for in the background, and at the station he pays or stays to save up. The walker does the walking and the riding; this module decides and pays. |
| `src/game/saveFile.ts` | 225 | kept | The saved game and the settings on the device: what gets written, how old saves are repaired on the way back in, and why one can't be read. The game is kept under SAVE_KEY; settings (debug switches and the problem log) live apart under SETTINGS_KEY, so New city keeps them; so does the name you sign postcards with. The last weather forecast is kept under WEATHER_KEY, and the public holiday lists under HOLIDAYS_KEY. |
| `src/map/icons.ts` | 89 | cut | The game's own map icons: a white picture on a round badge whose colour says what kind of place it is (blue travel, green food and rest, amber work, purple story places, quests and events, indigo magic, gold his monuments, his orange for his spot and his home), drawn at 32 CSS px, and the map layer that shows them. Loaded as its own chunk the first time the map shows an icon (see MapView.setMapIcons). |
| `src/map/mapView.ts` | 519 | kept | The map: MapLibre with OpenFreeMap's Liberty style, him as a marker (a face with a bubble over his head), his goal as a pin, Viktor while he is about, his trail and the ride line as lines. MapLibre only draws when something changes, so the game moves the camera a few times a second instead of every frame (see app/loop.ts): the main thread stays idle. |
| `src/map/scene.ts` | 219 | kept | What the map shows and where its camera points. Each tick it puts him (his face, bubble and pose), his goal pin, the ride, his trail, the route line and the city area on the map, sending a layer to MapLibre only when it changed. The camera follows him; a tap on the goal chip shows him and his goal until he picks a new one; a trip zooms out to the whole ride until he lands; History fits his trail above its sheet, and Explored his squares above its own; the Stats sheet shows the ley lines. The map itself sits behind MapPort, so tests use a fake. |
| `src/net/api.ts` | 322 | kept | Network access to map services: OpenFreeMap vector tiles for streets (Overpass as backup), Photon (Nominatim as backup) for city search, OSRM for road routes between cities, Wikidata for city trivia and Nominatim for city outlines, Open-Meteo for his city's weather, Nager.Date for public holidays and Wikipedia for notes on sights. Fetch is injected, so it is easy to test. |
| `src/streets/client.ts` | 37 | kept | The game's side of the streets worker: one promise per cell request. |
| `src/streets/idb.ts` | 66 | kept | A tiny IndexedDB key-value store for street cells. |
| `src/streets/loader.ts` | 143 | kept | Keeps the street graph filled around the walker: the nearest cells go first, a few loads run at once, failed cells wait before a retry, and cells served from an old cache entry are fetched again when nothing else waits. |
| `src/streets/protocol.ts` | 14 | kept | Messages between the game and the streets worker. |
| `src/streets/source.ts` | 49 | kept | Where one street cell comes from: the on-device cache first, then its OpenFreeMap vector tile, then Overpass if the tile fails. Runs in the streets worker, so decoding never blocks a frame. |
| `src/streets/worker.ts` | 36 | kept | The streets worker: fetches, decodes and caches street cells off the main thread, so a big tile never costs the game a frame. |
| `src/sw/strategy.ts` | 43 | kept | Which cache answers which request, so the game opens offline and the map doesn't download the same tiles twice. Live services (search, Overpass, Wikidata, routes) always go to the network; streets have their own IndexedDB cache in the streets worker. |
| `src/sw/sw.ts` | 99 | kept | The service worker: keeps the game and the map tiles it has shown, so a returning player starts without waiting on the network and can play offline. <reference lib="webworker" /> |
| `src/ui/App.tsx` | 106 | kept | Which screen shows: the picker for a new player, the game for a saved one; a postcard in the link opens on top of either. |
| `src/ui/CareSheet.tsx` | 89 | cut | Care packages and the bond: your clovers, the gift on its way to him, the gifts clovers buy, his trust and lean, whispers, and praise or scold for his latest line. Everything here is optional; he lives the same without it. |
| `src/ui/CollectionSheet.tsx` | 206 | cut | The Collection: his overall %, badges and title on top, then a tab per topic. Each set is a card with a progress bar and a grid of tiles, like a dex: found entries show their name, the rest are ? tiles; tapping a tile shows its detail or hint. The Places tab ends with his last ruin crawls. The Feats tab lists badges, then his life story. Everything comes from core/collection.ts. Loaded only when the sheet first opens. |
| `src/ui/DebugSheet.tsx` | 151 | kept | Debug: what looks wrong with the city, what has loaded, the ways out, the trip dice, buttons that change the game at once, and three logs (trivia, problems, goal picks) whose entries open into their detail. |
| `src/ui/DiarySheet.tsx` | 15 | cut | His diary, newest day first: each day's title opens to the lines he wrote and the dreams he had that day (see core/diary.ts). |
| `src/ui/ExploredSheet.tsx` | 24 | cut | The 200 m squares he walked: how much of this city, and how many in the whole world. The map above the sheet shows them. |
| `src/ui/Family.tsx` | 143 | cut | His life and his family (core/life.ts): the Life card with his stage, the care so far and the family perk; the drawn family tree, whose walkers open into their farewell letter; and the farewell card shown once when one retires; and the hall of walkers (core/hall.ts). Part of the Stats sheet's chunk and the farewell's own. |
| `src/ui/GameScreen.tsx` | 640 | kept | The game screen: the map with him on it (dimmed at night), a compact card on top (where he is, where he goes, what he waits for, the weather), zoom on the right edge and the main buttons in a bar at the bottom, in reach of the thumb; a timed moment opens over it all. |
| `src/ui/HelpSheet.tsx` | 158 | kept | Help: a search box over a list of topics by section, and a page per topic made of cards. The code that fills the text in (help.ts, with every list and number it pulls from the game) is its own chunk, kept off the startup path (main.tsx fetches it, and the text, at idle once the service worker runs, so Help opens offline). The text's address carries a hash of it, so after a deploy that changes Help the service worker can't hand back the old text. |
| `src/ui/HistorySheet.tsx` | 23 | kept | His last events, newest first. Each row has the number of its marker on the map and the time; tapping it shows where it happened. |
| `src/ui/MomentSheet.tsx` | 125 | cut | A timed moment (core/moments.ts): a small choice or one of four mini-games (core/minigames.ts), with a bar for the time left. Loaded the first time one opens, to keep it out of startup JS. Nothing here waits for you: when the bar runs out the game takes his own pick. |
| `src/ui/Picker.tsx` | 89 | kept | The city picker: suggestions appear as you type (after 3 letters and a short pause), tap one to start there. |
| `src/ui/PostcardSheet.tsx` | 78 | cut | Postcards: send a card of where he is as a link, and read one a friend sent. The link carries the card itself (see core/postcard.ts), so sharing needs no server: the phone's share sheet when there is one, else the clipboard, else the link to copy by hand. |
| `src/ui/RecordsSheet.tsx` | 34 | cut | His records: his bests and lifetime totals, then the hall of walkers comparing the family's records once there is an heir. |
| `src/ui/StatsSheet.tsx` | 754 | kept | His character sheet: level and XP, his quests, what he saves up for, his weekly bills, six meters and Magic as bars, the sky over him, his visa, the spells he knows, the local words he has picked up, four attributes with what his gear adds, his skills and languages, his karma, fame and the police, every gear slot, the bag, pantry and his buffs, his rival, friends and pet, his mind (wants, fears and what moves his mood), his character (emotion, tastes found and perks), his quirks, his home, his spot and his mailbox. Items with a story open to show it. His life stage comes second, and his family tree closes it; his records have their own sheet (RecordsSheet.tsx). |
| `src/ui/WelcomeSheet.tsx` | 97 | cut | Welcome back: the card that opens on a reopen only when there is something to show beyond the boost, namely one small choice (a dilemma) or, after a week turns over, last week's recap (once). It also says how long you were away, how long he now runs BOOST x, and the clover this check-in earned. |
| `src/ui/format.ts` | 74 | kept | Short texts the screens show, in one place so they stay consistent. |
| `src/ui/help.ts` | 1108 | kept | The in-game Help: data/help.txt split into sections and pages, with {NAME} placeholders filled from the game's own numbers so the text never goes stale. "# Title" starts a section, "## Title {id}" a page, and the lines after it are the page's text. Fetched only when Help first opens. |
| `src/ui/kit.tsx` | 74 | kept | The pieces every screen is built from (docs/ui-guidelines.md): cards with an icon and heading, key/value rows, bars, zebra lists and sections that open when their heading is tapped. |
| `src/ui/snap.ts` | 18 | kept | How tall a dragged sheet ends up: where the finger let go, as a share of the screen, no taller than its tallest, or closed when let go below CLOSE_AT. A full sheet let go near the top fills the screen again, so its buttons don't end up under the phone's status bar. |
| `src/vite-env.d.ts` | 4 | kept | <reference types="vite/client" /> |

## Every change to master, in order

Squash-merged PRs show their number in the title; merge commits show the PR
number first. Lines starting "CLAUDE.md:" are changes to the project rules.

- 2026-10-22 Add CLAUDE.md with project workflow rules
- 2026-10-27 CLAUDE.md: run tests and merge to master manually once CI passes
- 2026-10-27 CLAUDE.md: ask choices via interactive multiple-choice widgets
- 2026-10-27 CLAUDE.md: use decision cards for choices, not HTML widgets
- 2026-10-27 CLAUDE.md: deploy web build to GitHub Pages after every PR merge
- 2026-10-27 CLAUDE.md: TDD and fast CI testing rule; describe the project
- 2026-10-27 First playable version of OSM Walker (#2)
- 2026-10-27 CI: manual redeploy and a live check of the Pages site (#3)
- 2026-10-27 Fix the catching-up message and street-loading stalls (#4)
- 2026-10-27 Add a loading bar for catching up and loading streets (#5)
- 2026-10-27 Speed up loading and catch-up (#6)
- 2026-10-27 Show detailed loading and catch-up info (#7)
- 2026-10-27 Keep street downloads going when Overpass servers struggle (#8)
- 2026-10-27 Get streets from OpenFreeMap vector tiles, with Overpass as backup (#9)
- 2026-10-28 Walk to random spots in the city instead of wandering (#10)
- 2026-10-28 Send him on trips to other cities and countries (#11)
- 2026-10-28 Remove catch-up: he waits in place while the app is closed (#12)
- 2026-10-28 CLAUDE.md: he waits in place while the app is closed
- 2026-10-28 Walk to places of note from the map tiles (#13)
- 2026-10-28 Give him stats, coins and XP, and actions at each place (#14)
- 2026-10-28 Add procedural items, gear and a bag, and shops that sell them (#15)
- 2026-10-28 Add a CI sweep that tallies real POI tags and examples (#16)
- 2026-10-28 Give the common real place types their own actions (#17)
- 2026-10-28 Add each country's own actions for 41 countries (#18)
- 2026-10-28 Turn Wikidata facts about each city into trivia at random spots (#19)
- 2026-10-28 Add a history log of his last 100 events with the walked trail (#20)
- 2026-10-28 Show a countdown while he stays somewhere, cap every stop at a minute, stop only at places (#21)
- 2026-10-28 Put the stay countdown in the top panel and test that texts never overlap (#22)
- 2026-10-28 Show his goal with a pin and a tappable line that zooms to it (#23)
- 2026-10-28 Add a debug panel with a goal-pick log and New goal / New city / New country buttons (#25)
- 2026-10-28 CLAUDE.md: every mechanic change updates the Help pages
- 2026-10-28 Search cities as you type, with caching and a clear failure message (#27)
- 2026-10-28 CLAUDE.md: city search uses Photon with Nominatim as backup
- 2026-10-28 CLAUDE.md: every screen follows docs/ui-guidelines.md
- 2026-10-28 CLAUDE.md: performance is a top priority
- 2026-10-28 Add a UI kit, 1:1 touch scrolling, icon fonts and UI guidelines (#31)
- 2026-10-28 Rewrite the game in TypeScript + MapLibre for speed (#35)
- 2026-10-28 CLAUDE.md: the game is now TypeScript + MapLibre (PR #35)
- 2026-10-28 Remove the long tasks after load that blocked the Pages deploy (#36)
- 2026-10-28 Glide him between steps, fold the map credit, add a camera follow switch (#38)
- 2026-10-28 Add search to the Help page (#37)
- 2026-10-29 Speed up CI: no Build job hop, all cores for e2e, skip docs-only runs (#39)
- 2026-10-29 #40 Deepen five modules from the architecture review
- 2026-10-29 #41 Retro fixes: layout guardrail, Biome lint, review step, skills on, architecture map
- 2026-10-29 CLAUDE.md: keep it to the user's rules, pointers and gotchas
- 2026-10-29 #42 Live through the time away and sum it up on reopen
- 2026-10-29 CLAUDE.md: the time away now passes on reopen (PR #42)
- 2026-10-29 #43 Rebalance money: wages grow, he saves for his next vehicle, cheaper hospital
- 2026-10-30 #44 Shorter trips: rides 10x faster (max 15 min), trip odds halved
- 2026-10-30 #46 Care packages: clovers for checking in buy small gifts
- 2026-10-30 #48 His face, a need/goal bubble and poses on the map
- 2026-10-30 #50 Guess the next trip: a right guess earns a clover
- 2026-10-30 #51 Day ribbon and weekly recap
- 2026-10-30 #53 Optional city sound, made in the browser
- 2026-10-30 #45 Keepsakes: landmark cards, Placedex, souvenirs, crawls and item stories
- 2026-10-30 Postcards via link: share where he is with a friend (#52)
- 2026-10-30 CLAUDE.md: after merge, only check the deploy passed
- 2026-10-30 One optional choice on a long reopen (#54)
- 2026-10-30 #55 Keepsakes follow-up: first-visit cards, souvenirs found at sights, crawl perks
- 2026-10-30 #56 City cards: packs, rarity by city size, Foil/Gold, spares, country sets
- 2026-10-30 #57 Ponytail review of the map-life changes: two city sound fixes, two cuts
- 2026-10-30 #59 Stop the old game loop for good when the game screen closes
- 2026-10-30 #61 Car trips set off from gas stations, never EV chargers
- 2026-10-30 Ponytail review fixes for care packages, guesses, postcards and dilemmas (#60)
- 2026-10-30 #63 Keep the street-tile decoder out of startup JS (60 → 56 KB)
- 2026-10-30 #64 Trim old build files from the offline cache
- 2026-10-30 #62 Daily forecast, deadpan jokes and selling runs
- 2026-10-30 Help never shows an old text after a deploy (#66)
- 2026-10-30 #65 Keep a copy of a save that can't be loaded
- 2026-10-30 #70 Make his needs drive what he does
- 2026-10-30 #67 Free up map space: draggable sheets, drop the day ribbon, credit under sheets
- 2026-10-30 #69 Made-up places per city and the game's own map icons
- 2026-10-30 #68 His trust in you, letters, whispers, and kind or rascal
- 2026-10-30 #72 Collection: tabs, dex grids, every collectible, badges and titles
- 2026-10-30 Golden bricks and his monuments, his life story, and Suggest a line (#74)
- 2026-10-30 Fantasy mounts: tortoise, broomstick, flying carpet and a dragon (#73)
- 2026-10-30 #75 Storyteller and incident deck (ideas 26-27)
- 2026-10-30 #58 Records: his life bests and totals (idea 95)
- 2026-10-30 #79 Border moments when he enters a new country
- 2026-10-30 Remove the startup JS size check from perf (#78)
- 2026-10-30 #77 Viktor, his rival, and night legends (ideas 30-31)
- 2026-10-30 #80 Packing: he packs a travel kit for each trip
- 2026-10-30 #81 Jet lag after a flight across time zones
- 2026-10-30 #83 Friends, a partner and travel companions (ideas 32-33)
- 2026-10-30 Place creatures: a troll at bridges, a water sprite at fountains, a dryad in parks (#76)
- 2026-10-30 #84 More ways to travel: night trains, ferries, cycling and hitchhiking
- 2026-10-30 #86 Clubs, friends' news, anniversaries and chance cards at work (ideas 84-86, 96)
- 2026-10-30 #85 Quests and world events: city quest boards, GW2-style events, map icons
- 2026-10-30 #87 Long walks: on foot he sometimes walks to a nearby town
- 2026-10-30 Ley lines and spells: a Magic meter, lines between churches and monuments, spells from library books (#88)
- 2026-10-30 #89 Ponytail fixes for travel: no jet lag on a free lift, one board and land path
- 2026-10-30 The shop after midnight: enchanted gear and magic trinkets at antique and second-hand shops, for euros plus Magic (#90)
- 2026-10-30 Portals: an old monument or castle ruin very rarely takes him, free and at once, to a city he has never been to (#91)
- 2026-10-30 Giants seen from afar: a sea serpent, a kraken and a sleeping giant at real waterfronts and viewpoints (#92)
- 2026-10-30 Fairy rings: a dawn nap in a real park, waking hours later with a fairy gift or Magic and a strange story (#93)
- 2026-10-31 E2e: steady the away quest test and the Collection tab walk (#94)
- 2026-10-31 Weather, seasons, real day and night, and night closures (#49)
- 2026-10-31 #47 Public holidays from Nager.Date
- 2026-10-31 #95 His pose moves again every minute while he stays
- 2026-10-31 #98 A pet that grows: a stray stays, levels with km, may be a fairy creature, grows old
- 2026-10-31 #102 Perf check: median of three cold loads
- 2026-10-31 #101 Weekly bills: phone, insurance and storage each Monday, a debt collector if he can't pay
- 2026-10-31 #71 Prune the street cache from a time index, not by reading every cell
- 2026-10-31 Local words: everyday words in 41 languages (#100)
- 2026-10-31 #105 Visas that grow: Tourist to Citizen, a stay's last day leans him abroad, better visas pay more
- 2026-10-31 #103 His mind: moodlets, wants and fears
- 2026-10-31 #97 Quests: capitals' own quests, quests can fail, fantasy one in four
- 2026-10-31 Skills, cooking and languages: six skills, a pantry and recipes, and languages he picks up (#106)
- 2026-10-31 #110 Quirks from habits and his spot
- 2026-10-31 #96: Careers: shifts rank him up, each rank pays more and brings its own shift
- 2026-10-31 #113 Careers: build rank shifts once, rank header uses his best career
- 2026-10-31 #112 His diary and dreams
- 2026-10-31 #107 Life stages, retirement and heirs
- 2026-10-31 #117 Ponytail review fixes for life stages
- 2026-10-31 #99 Karma, fame and the police: perks either way, a wanted heat, chases on the map, fines, jail and bribes
- 2026-10-31 Side income: businesses, shares in his spot and the lottery (#114)
- 2026-10-31 #118 Layout e2e: split the item story and map cards off the long screen walk
- 2026-10-31 #115 Letters and gifts from his friends
- 2026-10-31 Bucket list: game goals and real sights, with a gentle trip pull (#119)
- 2026-10-31 #120 Ponytail fixes for his inner life
- 2026-10-31 Ponytail fixes for skills, side income and the bucket list (#122)
- 2026-10-31 #121 His home and fame's greetings: rent as a Regular, buy, furnish, trips home, local paper
- 2026-10-31 #123 Checks run locally (npm run check / verify + pre-push hook); CI only deploys
- 2026-10-31 CLAUDE.md: checks run locally (npm run check / verify, pre-push hook); web.yml only deploys
- 2026-10-31 Hall of walkers: the family's records and who holds each (#116)
- 2026-10-31 #108 Timed moments: a choice or mini-game at every activity, with a timer and his own pick
- 2026-10-31 Ruin crawls: rooms at real castles and ruins, no combat (#82)
- 2026-10-31 Records get their own sheet in the menu, with the hall of walkers (#127)
- 2026-10-31 #125 Work chance cards ask you: an optional 5 s tap, his own pick otherwise
- 2026-10-31 Sight notes: he reads up on big sights on Wikipedia (#109)
- 2026-10-31 #128 Layout e2e: the every-screen walk in three tests (fixes verify timeout on master)
- 2026-10-31 Place creatures ask you: the troll, sprite and dryad come as a timed choice (#124)
- 2026-10-31 Street collector: every named street he walks, per city (#130)
- 2026-10-31 #126 You pick how a police chase ends: a timed choice when the car catches up
- 2026-10-31 CLAUDE.md: the pre-merge review is a ponytail review
- 2026-10-31 #133 CODING_STANDARDS: the review step is a ponytail review
- 2026-10-31 #104 Explored: the 200 m squares he walked, in a new sheet
- 2026-10-31 Ponytail fixes for holidays, sight notes and streets (#134)
- 2026-10-31 #111 Emotions, hidden tastes and lifetime rewards
- 2026-10-31 #132 Timed moments: none opens over the away card (fixes a flaky layout test)
- 2026-10-31 #129 Story choices and Viktor's contests as timed moments
- 2026-10-31 #135 Comforts: beauty of his surroundings, where he sleeps, meal tiers
- 2026-10-31 #138 Pacing: taxi or metro to far stations, 200 m goals, 10 min long walks, faster quests, events and incidents
- 2026-10-31 #139 Little moments: something happens about once a minute, shown as his speech bubble
- 2026-10-31 #137 Coffee habit, worn clothes and beliefs
- 2026-10-31 #136 Replace the offline catch-up with a 10x boost
- 2026-10-31 CLAUDE.md: reopen gives a 10x boost instead of a catch-up
- 2026-10-31 #131 Sky events: the game's own rare sky nights he looks up at (idea 97)
- 2026-11-08 CLAUDE.md: add the game design rules and the read-the-report rule
- 2026-11-08 CLAUDE.md: tighten the design-report lines
- 2026-11-08 #141 Add the game design research report to docs
- 2026-11-08 #142 Cut the game down to a small base loop
- 2026-11-08 CLAUDE.md: describe the base loop (time stops while closed)
- 2026-11-08 #143 Add the user's picks to the design report's open questions
- 2026-11-08 #144 Where next: pick his next place from 3 cards
- 2026-11-08 #145 Upgrade ladder: shop cards, 7 unlocks and an economy simulation
- 2026-11-08 #146 Screens and numbers: next-upgrade card, Stats ladder in groups, memory in the perf check
- 2026-11-08 #147 Remove dead code left by the refocus
- 2026-11-08 #148 Say when no shop for the ready upgrade is near
- 2026-11-08 #149 Fresh street map past 25 cells in one city
- 2026-11-08 #150 Join streets that cross with no shared node in the tile
- 2026-11-08 #151 Faster verify: perf beside e2e, screenshots on demand, review skill in repo
- 2026-11-08 CLAUDE.md: faster verify, review beside verify, vendored ponytail-review skill
- 2026-11-08 CLAUDE.md: design rules 5 and 7 for the incremental game
- 2026-11-08 CLAUDE.md: rule 11, about one upgrade every 5 minutes
- 2026-11-08 #152 Food delivery loop: wander, take orders, deliver, buy upgrades in the Shop
- 2026-11-24 #153 Fixed 60 s order wait, shown as a bar in the top card
- 2026-11-24 #154 Shop shares the bottom row with ⓘ and ☰, in plain paper
