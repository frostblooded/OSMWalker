# Build one great choice, then grow it

_Game design research report, 2026-11-08. The rules drawn from it are in `CLAUDE.md` under "Game design rules". The open questions at the end were put to the user; their answers decide where they differ from the favoured option._

The research supports the proposed loop: walk to a place, then pick the next one from a few real nearby places, each showing its reward and its distance. It works best when the pick is a real trade-off and the right answer changes with how he is doing right now. The biggest risk is not too few features. The biggest risk is a pick with one obvious best answer, which turns the game into "always tap the top card". Three rules do most of the work. Offer **3 options** at first. Show each one as an icon, one reward number and a walking time. Make sure going far always has a cost, for example his needs drop on the way, so far places do not always win. Upgrades feel big when they change *which places he can reach or what he can do there*, not when they add a few percent. That means a bike that brings across-the-river places into the list, not "+10% speed". Care should be visible and quick to fix. He slows down, he never dies, and he is glad to see you when you come back. A few things here are not settled by any source: whether 3 or 4 options is better, the "something every minute" pace, and how long catch-up should run after time away. These need a quick prototype and a log of every pick. The last section lists the decisions the user needs to make, with the option the research favours for each.

## A loop is only as good as the one decision inside it

Designers describe a loop as a small repeating cycle. The player looks at the situation, acts, the game reacts, and the player learns something before going round again ([Lostgarden, Loops and Arcs](https://lostgarden.com/2012/04/30/loops-and-arcs)). Daniel Cook calls this the "skill atom": decide, act, the game updates, feedback, then the player's mental model changes ([Lostgarden, Chemistry of Game Design](https://lostgarden.com/2021/03/13/the-chemistry-of-game-design-2/)). Raph Koster says fun *is* this learning. A game gets boring once the pattern is fully learned, unless the situations keep changing ([Koster, Theory of Fun 10 Years Later](https://www.raphkoster.com/wp-content/uploads/2026/07/Theory-of-Fun-10-Years-Later.pdf)).

For OSM Walker, the atom is: see 3 places, tap one, watch him walk, see what changed on arrival, and learn which places and distances pay off for his current state. Practitioners agree on the order of work. **If the core loop is not fun minute to minute, no extra system will save it.** So prototype the loop alone and cut anything that does not feed it ([Game Developer, Holly Green](https://www.gamedeveloper.com/design/how-supporting-core-loops-and-early-prototyping-are-key-to-your-game-s-success)). Small, polished games got there by cutting. Into the Breach dropped about **60% of its planned design**, including city building and research trees ([PC Gamer](https://pcgamer.com/into-the-breach-originally-had-city-building-and-tech-trees-creators-reveal)). Mini Metro lost about a year to features added later without a plan ([Game Developer, Mini Metro postmortem](https://gamedeveloper.com/audio/postmortem-dinosaur-polo-club-s-i-mini-metro-i-)).

Cook also warns about "arcs": one-time content such as story missions, which wear out fast and create a content treadmill ([Lostgarden](https://lostgarden.com/2012/04/30/loops-and-arcs)). Real OSM places help a lot here. Like Mini Metro's real-world transit map, the city gives free, varied content without anyone building levels by hand. It also helps to name the feeling the game is aiming for. The MDA framework lists eight target feelings, including "Submission" (the game as a calm pastime), "Fantasy" and "Discovery" ([MDA paper](https://users.cs.northwestern.edu/%7Ehunicke/MDA.pdf)). OSM Walker is mostly a calm pastime plus caring for him plus discovering a real city, with only light challenge. Every future feature can be checked against that list.

## Three cards, each a real trade-off

### How many options

Sid Meier's test is the clearest one. A choice is not interesting if the player always picks the first of three, or picks at random. Good choices involve a **trade-off**, and "good decisions are situational" ([Game Developer, GDC 2012 Sid Meier](https://gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)). More options are not better: three Pokémon starters is fun, fifty would be "a nightmare" ([Game Developer, Designing interesting decisions](https://www.gamedeveloper.com/design/designing-interesting-decisions-in-games-and-when-not-to-)). New players suffer most from too many options. In the well-known jam study, 6 jams sold far better than 24 ([Game Developer, Spoiled for choice](https://www.gamedeveloper.com/design/spoiled-for-choice-the-psychology-of-choice-overload-in-games-and-how-to-avoid-it)). **No source compares 3 options with 4 directly.** Three is the safe starting point, and 4 is fine. A neat idea, which is my own synthesis: start with 3 and make a 4th card an *unlock*. Then the number of options is itself part of progression.

### How to show rewards

Meier says to err "on the side of providing the player with too much information" ([Game Developer](https://gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)). Celia Hodent's UX advice points the same way. Put the key information where the eye already is, and keep text short, because "if you have a lot of text, it's likely that the player is not going to read it" ([Creative Bloq, Hodent](https://www.creativebloq.com/features/how-neuroscience-and-ux-impacts-video-game-design)). Hades shows each door's reward as an icon before you enter: a heart for healing, gold for money, an anvil for an upgrade. The choice becomes "what do I need most right now?" ([Game mechanics wiki, Hades](https://saschb2b.github.io/game-mechanics/games/hades/chamber-and-paths)). Into the Breach's rule is to "sacrifice cool ideas for the sake of clarity every time", and to *preview* what will happen before it happens ([Game Developer, Into the Breach UI](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-)). So each card should show: the real place's name, one icon for the reward type, one reward number, and the walking time. It can also preview the effect, for example his food meter glowing two pips ahead. A "new place" tag is cheap and strong. Wandrer gives points only for roads you have never travelled, and that alone pushed a self-described "creature of habit" onto new streets ([DC Rainmaker, Wandrer review](https://dcrainmaker.com/2020/12/reviews-wandrer-tracks.html)).

### Keeping any one option from always winning

This is the heart of the user's idea, and it has a trap. If reward grows exactly with distance, every place pays the same per minute, and the choice is fake. If far places pay *more* per minute, far always wins. In Slay the Spire, every node on the map costs something (health, gold), and its value depends on the player's state. If one node type is always worth taking, the map collapses into "find that node" ([Game mechanics wiki, branching map](https://saschb2b.github.io/game-mechanics/concepts/branching-dag-map)). OSM Walker's natural cost is that **his needs drop while he walks**. A far, rich place is great when he is fed and rested, and a bad idea when he is hungry. That makes the best pick change with his state, which is exactly Meier's "situational" rule. The same source suggests mixing the set on purpose. Some cards should be obvious wins, some obvious traps, and most real trade-offs. A little random variation keeps the best path from being solvable in seconds. Reigns adds a useful filter: leave out recently played cards and favour cards tied to what is going on now ([Game Developer, Reigns](https://gamedeveloper.com/design/game-design-deep-dive-creating-an-adaptive-narrative-in-i-reigns-i-)). For OSM Walker that means no repeats of the last few places, and at least one card that serves his lowest need. Real places also matter. Niantic seeded Pokémon GO's stops from places people already find notable, such as historic sites and much-photographed spots ([GamesRadar](https://www.gamesradar.com/why-your-local-church-and-water-towers-are-pokemon-go-gyms-and-pokestops)). Prefer named OSM places with meaningful tags over blank map points.

One more rule from Meier: always react to a choice. "The worst thing you can do is just move on" ([Game Developer](https://gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)). Arrival needs a visible pop: numbers fly into the meters, and he does a small happy animation.

## One resource, a few kinds of places, and upgrades that change the map

### Resource, trade and upgrade structure

Idle-game sources favour **few currencies** in a simple loop. A second currency is a tool for depth later ([Game Developer, Math of Idle Games Part II](https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii)). Pecorella points out that walking-time-style limits already act as a natural "energy system", so no energy currency is needed ([Game Developer, Rise of games you mostly don't play](https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play)). That fits what is already decided. Money comes from flat-wage jobs. Food, rest and health come from need places, which may cost money. Upgrades come from shops that turn money into gear. That is three kinds of place on one currency, and it already creates a small web: work to afford food, eat to afford walking to the far job, save for the bike.

The usual idle cost curve grows each price by about **1.07–1.15× per purchase**. That creates a seesaw: quick early buys, then longer waits, broken up by milestone jumps ([Game Developer, Math of Idle Games Part I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)). Small changes compound hugely. In Idle Idol, "even a 0.01 difference" mattered by the 20th upgrade ([Game Developer, Idle Idol](https://gamedeveloper.com/design/balancing-tips-how-we-managed-math-on-idle-idol)). OSM Walker has a short hand-made gear ladder, not hundreds of items. So each tier should cost clearly more hours of wages than the last, and the *step* between tiers should be the thing that feels big. A visible next goal ("Bike: 340 / 500") is what drives the seesaw. Idle Idol found that players called the game "slow" when the real problem was an upgrade screen that was hard to find ([Idle Idol](https://gamedeveloper.com/design/balancing-tips-how-we-managed-math-on-idle-idol)).

### Making upgrades feel big

The research backs the user's instinct strongly. A number only feels meaningful when it **crosses a threshold** that changes what happens: one hit to kill instead of two. If the world scales up to match, stronger gear soon feels like nothing ([The Escapist](https://www.escapistmagazine.com/roguelites-items-power-scale-game-development-vampire-survivors/)). The upgrades players remember change the *kind* of play. Mark Brown describes Metroidvania abilities as keys that open locks across a map you already know ([GMTK, Metroid Dread transcript](https://amara.org/subtitles/Aci4iDbgsAtY/en/1/download/Why%20You%20Didnt%20Get%20Lost%20in%20Metroid%20Dread.en.txt)). He also notes that unlocks which add "different ways to play" keep a sense of advancing without just making the game easier ([GMTK, Roguelikes](https://amara.org/subtitles/7doGHxwrhRpX/en/1/download/Roguelikes%20Persistency%20and%20Progression%20%20Game%20Makers%20Toolkit.en.dfxp)). Vampire Survivors' evolutions combine two things into a new behaviour, which gives a visible mid-term goal ([PC Gamer](https://www.pcgamer.com/uk/vampire-survivors-evolve-weapons-evolutions-guide)). AdVenture Capitalist's managers are a third kind: automation that removes a chore, the moment a clicker becomes an idle game ([Pocket Gamer](https://www.pocketgamer.com/adventure-capitalist/adventure-capitalist-tips-and-cheats-for-making-money/)).

On a real map, these ideas fit the decided "gear helps exploring" rule well (the examples are my synthesis):

| Upgrade | What it changes (not just a number) |
|---|---|
| Bike | Places beyond the walking radius start appearing on the cards: the market across the river |
| Bag | Carry goods from one place to sell at another, a new kind of two-stop trip |
| Boots | Parks and footpaths become usable routes and shortcuts |
| Map or compass | A 4th card, or a peek at what the next set will be |
| Level + gear combo | A new job type, for example courier jobs once he has a bike and reaches level 5 |
| Late automation | He picks sensible places himself during catch-up, or walks a "regular route" |

Two rules make these land. **Put the lock right next to the key.** Metroid Dread often places the lock just around the corner from the key ([GMTK](https://amara.org/subtitles/Aci4iDbgsAtY/en/1/download/Why%20You%20Didnt%20Get%20Lost%20in%20Metroid%20Dread.en.txt)). So the very first card set after buying a bike should include a place only the bike can reach. And show locks in the world's own words ("Market across the river: too far on foot"), not as a checklist. Designers warn that the worst thing a key system can do is make the player aware it is a key system ([Videogame Workshop](https://videogameworkshop.substack.com/p/directing-players-with-keys?r=5wu9r6)). XP and levels should unlock something the player can see, such as a new place type, job tier or card slot. Otherwise they become a number nobody looks at. Finally, do not let prices or distances grow as fast as the gear does, or every upgrade gets cancelled out.

## Care that shows, forgives and never punishes a life

Pet games run from hard failure to none. The original Tamagotchi could die in under half a day, and an empty meter left for 15 minutes counted as a "care mistake" ([Wikipedia](https://en.wikipedia.org/wiki/Tamagotchi); [Tamagotchi Wiki](https://tamagotchi.fandom.com/wiki/Care)). In Nintendogs, a neglected dog runs away but comes back ([StrategyWiki](https://strategywiki.org/wiki/Nintendogs/Pet_care)). Neko Atsume, Finch and Godville have no death at all, and those are the ones adults play for years ([Ludus Novus, Neko Atsume](https://ludusnovus.net/2015/07/30/the-feline-grace-of-neko-atsume); [Habitbox, Finch](https://habitbox.app/blog/finch-app-review); [TouchArcade, Godville](https://toucharcade.com/2014/04/08/godville-is-the-only-ios-game-ive-played-for-nearly-four-years-straight/)). OSM Walker's plan already sits in the forgiving middle: he slows, then stops, and his needs never reach zero while the app is closed. A 15-minute death clock only makes sense on a toy you wear all day, not a browser tab.

The withdrawal trap is real. A "compulsion loop" makes the player feel worse and then sells the fix ([Game Developer, Compulsion loop](https://www.gamedeveloper.com/design/compulsion-loop-is-withdrawal-driven)). Duolingo's "we haven't seen you in a while" messages are widely criticised as guilt-tripping, and an academic study flags "emotionally charged visuals" as a manipulative pattern ([Deceptive.design](https://deceptive.design/articles/teaching-or-manipulating-on-the-adoption-of-bright-and-deceptive-patterns-by-duolingo)). The best-loved model is **visible consequence plus warm forgiveness**. Animal Crossing grows weeds while you are away, but the villagers greet you joyfully and say they missed you ([Kill Screen](https://www.killscreen.com/rip-animal-crossing-weeds/)). So show neglect through his body: he walks slower and looks tired. Never use blaming text. Let one good pick fix most of it.

Keep needs readable. The classic pet uses small 4-heart meters and one "attention" icon, so the player never has to read numbers ([Tamagotchi Wiki](https://tamagotchi.fandom.com/wiki/Care)). Three needs is the upper end for a tiny pet. It works if each need maps to clearly different places (food to cafés, energy to benches or home, health to parks or pharmacies). Show them as 4–5 pips. Tamagotchi's cavity rule (about 15 snacks in a row is a care mistake) shows that over-care can carry a small cost, so care stays a choice rather than a spammed button ([Tamagotchi Wiki](https://tamagotchi.fandom.com/wiki/Care)). That is optional for the base. Don't make him too good at looking after himself, though. Will Wright found that early Sims AI was so good that "almost anything the player did was worse than the Sims running on autopilot" ([PC Gamer](https://www.pcgamer.com/games/the-sims/will-wright-says-the-original-sims-ai-was-actually-too-good-almost-anything-the-player-did-was-worse-than-the-sims-running-on-autopilot)). If the player does not pick, a fallback is fine. But the player's own pick should be clearly better.

## Coming back should feel like a gift

Most idle games cap offline progress. Cookie Clicker's base is 1 hour, Egg Inc's standard setup is about 6 hours, and Melvor and Idle Clans allow 12–24 hours. The cap itself is often something you upgrade, like Egg Inc's silos ([Cookie Clicker Wiki](https://cookieclicker.wiki.gg/wiki/Prestige); [Egg Inc Wiki](https://egg-inc.fandom.com/wiki/Grain_Silo); [Manu Games](https://manu-site-astro.pages.dev/offline-progression/)). A **24-hour cap** suits a daily check-in without punishing a missed day too hard ([Manu Games](https://manu-site-astro.pages.dev/offline-progression/)). Egg Inc pays offline at half the online rate, so being present still pays ([Egg Inc Wiki](https://egg-inc.fandom.com/wiki/Grain_Silo)). OSM Walker's 10× catch-up is a visible replay, not an instant skip. That is a nice show, but after a long absence the payoff arrives slowly. No source compares the two approaches. A reasonable mix, which is my synthesis, is a cap plus a short "while you were away" card shown first (km walked, places visited, money earned), with the sprint playing behind it.

The strongest return hooks are small surprises about what happened while you were gone. Neko Atsume's cats leave fish and gifts, Godville's hero keeps a diary, and Finch's pet comes home with adventure results ([Wikipedia, Neko Atsume](https://en.wikipedia.org/wiki/Neko_Atsume); [Wikipedia, Godville](https://en.wikipedia.org/wiki/Godville); [note.com, Finch](https://note.com/pubvoice/n/n9f2a0fe8d290?hl=en)). A short diary built from the real streets and places he passed during catch-up gives OSM Walker the same thing almost for free.

## Pace by walking time, and build the base as data

### About one interesting moment a minute

**No source gives a "one event per minute" rule.** It is a sensible target, but it has to be tuned by playtest. Walking distance is the dial: tune the nearest cards so most walks take about a minute, and let far cards take two to four. Meier warns that heavy decisions back to back feel overwhelming, while trivial ones in quiet moments bore people ([Game Developer](https://gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)). A short pick, then a calm walk, is a good rhythm. Zombies, Run! treats music as the "ad break" between story beats ([Den of Geek](https://www.denofgeek.com/?p=392316)). Here the walk is the calm part and arrival is the beat. Idle designers also layer clocks of different lengths, so something is always nearly ready ([Eric Guan](https://ericguan.substack.com/p/idle-game-design-principles)). Next arrival is about a minute, the next gear is a few sessions away, and a new unlock is days away. Then a 2-minute visit and a 20-minute visit both pay off. Top-quartile mobile games see sessions of about **5 minutes, 5–6 times a day** ([GameDev Reports, GameAnalytics 2026](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game)). A minute-long walk gives several picks in a typical session. Keep the walk itself low-pressure and hands-free, as Pikmin Bloom's team was proudest of ([Nintendo Life](https://www.nintendolife.com/features/pikmin-bloom-devs-on-the-joy-of-human-connection-and-the-absence-of-bulborbs)). Guide with a subtle in-world line on the street rather than a busy screen, as Ghost of Tsushima does ([Android Central](https://www.androidcentral.com/ghost-tsushima-creative-director-interview)).

### A base that extends

Define a place as plain data: its kind, the reward it gives, and its cost (distance, plus any money). Define an upgrade as something that changes *which places get offered* or *what a kind of place does*. Then later layers plug into the same pick screen without changing the loop: new place types, two-stop trade trips, risky "unknown reward" cards, a map of visited streets. Write down what v1 leaves out (quests, inventory, story) to guard against Mini Metro-style creep. Slay the Spire's team found that changing one card shifts everything around it, so re-check the whole economy after each change ([Game Developer, Slay the Spire metrics](https://gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder)).

### What to measure

Slay the Spire logged every pick from the prototype on. A card that is almost never picked is "basically not a card in our game" ([Game Developer](https://gamedeveloper.com/design/how-i-slay-the-spire-i-s-devs-use-data-to-balance-their-roguelike-deck-builder)). For OSM Walker, log every card set shown, which card was picked, its distance rank, and his needs at that moment. From that, check the following. What is the pick rate per place kind, and is any kind almost never picked, or almost always? Does the player pick the far card more when well-fed, which would show the trade-off is working? How often does the player not pick at all? What is the time to first wage, first level and first gear? Does the time between gear buys grow gently? How often does he get stopped? What are session length and away time, and does the player stay to watch the catch-up? Late-game pacing takes days to test by hand, so simulate the economy in a small script, as Idle Idol did ([Game Developer](https://gamedeveloper.com/design/balancing-tips-how-we-managed-math-on-idle-idol)). With few players, D1/D7 numbers will be noisy. For reference, D1 above 30% is top quartile on mobile ([GameDev Reports](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game)). Watching a few first-time players will teach more than the numbers. And before changing a number, check whether the real problem is unclear UI.

## Conclusion

The new insight is that the user's loop is really one decision with one dial. The trade-off between close and far only exists if going far *costs* something that depends on his state. Letting his needs drop on the way supplies that cost, and it ties care, money and exploration into a single choice. That means the needs system is not a separate tamagotchi layer added on top. It is the thing that makes the destination pick interesting. Seen this way, impactful upgrades follow naturally. On a real map, the most powerful upgrade is one that changes *which cards can appear*. A bike, a bag or a fourth slot changes the shape of the choice, while a speed bonus only shrinks a number.

What the research cannot settle: whether 3 or 4 options plays better, the right walk length, the catch-up cap, and how fast needs should drop. These are prototype questions. The fastest way to answer them is a crude build that logs every pick, played by people who have never seen the game.

## Open design questions

Each question has 2–4 options. **Favoured** marks the option the research leans to, with the reason.

**1. How many places to offer at each stop?**
A) Always 3. B) Always 4. C) Start at 3, with a 4th card as an upgrade. D) 2 to 4, varying.
**Favoured: C.** Three is the safe start for new players, and turning the 4th card into an unlock makes the number of options part of progression. No source compares 3 with 4 directly.

**2. How is the reward shown on each card?**
A) Icon only (reward type, like Hades doors). B) Icon plus an exact number. C) Icon plus a range ("2–4"). D) Icon plus a preview on his meters.
**Favoured: B, with D as a light touch.** The trade-off needs numbers to compare, and Meier says to err toward more information. A small random range (C) can come later, to keep picks from being solved in seconds.

**3. How is distance shown?**
A) Metres. B) Walking time in minutes. C) Both.
**Favoured: B** (my inference). Time is the real cost to the player. Gear that makes him faster then visibly shrinks the times.

**4. What stops the far, rich place from always winning?**
A) His needs drop while he walks, so far trips need a fed, rested walker. B) Far places pay less per minute. C) Far rewards are less certain. D) Nothing, the player decides.
**Favoured: A.** It makes the best pick depend on his state, Meier's "situational" rule, and ties care into every choice. Without some cost, the biggest reward always wins.

**5. How is each set of cards built?**
A) Purely random nearby places. B) A guaranteed mix: at least one need place, one job or money place, plus a wild card. C) Weighted toward his lowest need. D) B plus C, with no recent repeats.
**Favoured: D.** Reigns-style filtering, plus Slay the Spire's advice to mix obvious wins, traps and real trade-offs, keeps every set worth reading.

**6. How many currencies?**
A) Money only (plus XP as a separate track). B) Money plus place-specific goods (for example fruit to sell at a market). C) Several currencies from the start.
**Favoured: A for the base,** with B as the first big upgrade (the bag). Sources treat extra currencies as a later depth tool.

**7. What kind of upgrades come first?**
A) Stat boosts (+speed, +wage). B) Unlocks that change which places appear or what they do (bike radius, bag trade trips, extra card). C) A mix, but every tier must include one unlock.
**Favoured: B, or C with a strict rule.** Numbers only feel big when they cross a threshold. Keys that open new parts of a known map are what players remember.

**8. What do levels give?**
A) Only small stat increases. B) A new place type, job tier or card slot at set levels. C) Cosmetic rewards. D) Nothing on their own; they combine with gear for unlocks.
**Favoured: B, with D as a mid-term goal** (for example bike plus level 5 opens courier jobs). XP with no visible payoff becomes a number nobody looks at.

**9. What happens if the player does not pick?**
A) He waits at the place until the player picks. B) After a short wait he picks a plain, modest option himself. C) He wanders randomly.
**Favoured: B.** The game should still tick along without a choice, but his own pick should be clearly worse than the player's, so the player's choices matter (the Sims lesson).

**10. Who picks during the 10× catch-up after time away?**
A) He picks automatically, with a summary on return. B) Catch-up pauses at each arrival for the player to pick. C) Catch-up is skipped and replaced by a summary.
**Favoured: A,** with the player's first live pick right after the summary. Pausing every minute would turn a gift into a chore. Smarter auto-picks can become a later automation upgrade.

**11. How long can catch-up run?**
A) No limit. B) Capped at about 8 hours. C) Capped at about 24 hours. D) Starts short, and the cap is an upgrade.
**Favoured: C, or D starting near 8 to 24 hours.** A 24-hour cap supports a daily check-in without punishing a missed day. Making the cap upgradable (like Egg Inc silos) gives a natural goal. No source measures which cap retains best.

**12. What does "stopped" from neglect mean, and how does he recover?**
A) He stops until one care trip, then walks again at once. B) He recovers slowly over several trips. C) He loses some money or XP as well.
**Favoured: A.** A visible, mild, quickly fixed setback matches Nintendogs and Animal Crossing. Lost progress turns care into guilt.

**13. How does the game greet a returning player?**
A) Just the catch-up sprint. B) A "while you were away" card with numbers. C) B plus a short diary from the real streets and places he passed, and a happy greeting.
**Favoured: C.** Return hooks that show what happened, delivered warmly, are what Neko Atsume, Godville and Animal Crossing get right.

**14. Is there a cost to over-caring?**
A) No, care is always good. B) A small cost (for example a full stomach makes the next walk slower).
**Favoured: A for the base.** B is an optional later layer that keeps care a choice and not a spammed button.

**15. Should never-visited places be marked?**
A) No. B) Yes, a "new" tag on the card plus a small bonus. C) Yes, plus a visited-places count per city.
**Favoured: B for the base, C soon after.** Wandrer shows that rewarding only new ground reliably gets habitual people to go somewhere new.
