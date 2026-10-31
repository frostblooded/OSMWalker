# Builds public/data/beats.json, the little moments between bigger ones (src/core/beats.ts): python3 tools/beats.py public/data/beats.json
import json, sys
B = []
def b(id, icon, at, text, say, fx=None, **g):
    e = {"id": id, "icon": icon, "at": at, "text": text, "say": say}
    fx = {k: v for k, v in (fx or {}).items() if v}
    if fx: e["fx"] = fx
    e.update(g)
    B.append(e)
W = "walk"; R = "ride"; S = "rest"; A = "any"
# On the street, anywhere.
street = [
 ("pigeon", "🐦", "A pigeon eyed his snack on {STREET}", "Shoo, pigeon!", {"mood": 1}),
 ("busker", "🎸", "A busker on {STREET} played his favourite song", "I love this one!", {"mood": 3}),
 ("lost_tourist", "🗺", "A lost tourist asked him the way, and he pointed confidently", "That way. I think.", {"cha": 0, "xp": 2}),
 ("dog_sniff", "🐕", "A dog on {STREET} sniffed his shoes with great interest", "Good dog!", {"mood": 2}),
 ("cat_follow", "🐈", "A street cat followed him for half a block", "Hello, kitty", {"mood": 2}),
 ("shoelace", "👟", "His shoelace came undone on {STREET}", "Not again…", {"mood": -1}),
 ("puddle", "💧", "He hopped over a puddle and nearly made it", "Whoops", {"hygiene": -1}),
 ("wave_kid", "👋", "A kid on a balcony waved at him, and he waved back", "Hi there!", {"mood": 2}),
 ("smell_bread", "🥖", "The smell of fresh bread drifted down {STREET}", "Mmm, bread…", {"mood": 1}),
 ("scooter", "🛴", "A scooter whizzed past a bit too close", "Hey, careful!", {"mood": -1}),
 ("pothole", "🕳", "He nearly stepped into a pothole on {STREET}", "Phew", {}),
 ("old_man_chess", "♟", "Two old men argued over a chess move on a bench", "Knight to f3!", {"wit": 0, "xp": 2}),
 ("street_art", "🎨", "He stopped to admire a mural on {STREET}", "Pretty!", {"mood": 2}),
 ("coin_heads", "🪙", "He flipped a coin to choose left or right. Heads", "Heads it is", {}),
 ("selfie", "🤳", "He photobombed a couple's selfie by accident", "Sorry!", {"mood": 1}),
 ("delivery", "🛵", "A delivery rider asked him for directions", "Second left", {"xp": 2}),
 ("balloon", "🎈", "A red balloon floated over the rooftops of {CITY}", "Where's it going?", {"mood": 1}),
 ("whistle", "🎶", "He whistled a tune he can't name", "La la la…", {"mood": 1}),
 ("bench_rest", "🪑", "He sat on a bench for a moment to watch {CITY} go by", "Nice spot", {"energy": 1}),
 ("window_shop", "🪟", "He looked into a shop window at things he can't afford", "One day…", {}),
 ("flyer", "📄", "Someone handed him a flyer for a concert", "Maybe I'll go", {}),
 ("church_bell", "🔔", "Church bells rang across {CITY}", "Already?", {}),
 ("ant_line", "🐜", "He stepped around a line of ants carrying crumbs", "Busy little guys", {"mood": 1}),
 ("squirrel", "🐿", "A squirrel stared at him from a tree", "What are you looking at?", {"mood": 1}),
 ("grandma", "👵", "He helped an old lady carry her shopping across {STREET}", "Here you go", {"mood": 3, "karma": 1}),
 ("double_take", "😮", "He thought he saw an old friend, but it was a stranger", "Oh. Never mind", {}),
 ("map_check", "🧭", "He checked his map, turned it upside down and checked again", "Hmm…", {}),
 ("bus_miss", "🚏", "A city bus pulled away just as he reached the stop", "Didn't want it anyway", {}),
 ("graffiti", "✍", "He read a funny bit of graffiti on {STREET}", "Ha!", {"mood": 2}),
 ("sneeze", "🤧", "He sneezed three times in a row", "Achoo!", {}),
 ("hum_neighbour", "🎵", "Someone was practising the piano behind an open window", "Not bad", {"mood": 1}),
 ("wrong_turn", "↩", "He took a wrong turn and had to double back", "Oops", {"energy": -1}),
 ("market_stall", "🍎", "A stallholder gave him a free taste of fruit", "Thank you!", {"fullness": 2, "mood": 1}),
 ("drop_phone", "📱", "He fumbled his phone and caught it just in time", "Saved it!", {}),
 ("chalk_game", "🔢", "He hopped through a chalk hopscotch on the pavement", "One, two, three!", {"mood": 2}),
 ("parade_honk", "📯", "A wedding convoy drove past, honking", "Congratulations!", {"mood": 2}),
 ("spider_web", "🕸", "He walked face first into a spider web", "Bleh!", {"mood": -1}),
 ("flowers_balcony", "🌸", "Flower boxes made {STREET} smell lovely", "Smells nice", {"mood": 1}),
 ("boules", "⚪", "He watched a game of boules in a square", "Ooh, close one", {"mood": 1}),
 ("lost_glove", "🧤", "He put a lost glove on a railing so its owner could find it", "There you go", {"karma": 1}),
 ("cyclist_bell", "🚲", "A cyclist rang a bell at him and he jumped aside", "Sorry!", {}),
 ("street_sign", "🪧", "He tried to pronounce a street sign out loud", "{STREET}… right?", {"xp": 2}),
 ("ice_cream_kid", "🍦", "A kid dropped an ice cream and he looked away politely", "Oh no…", {}),
 ("queue", "🧍", "He walked past a long queue and wondered what it was for", "What's in there?", {}),
 ("bird_song", "🐦", "A blackbird sang on a lamp post", "Pretty song", {"mood": 1}),
 ("construction", "🚧", "Roadworks closed half of {STREET}", "Always roadworks", {"mood": -1}),
 ("free_wifi", "📶", "His phone found free wifi for a moment", "Ooh, wifi!", {}),
 ("high_five", "✋", "A stranger gave him a high five for no reason", "Yeah!", {"mood": 3}),
 ("statue_pose", "🗿", "He copied a statue's pose for a second", "Like this?", {"mood": 1}),
 ("window_cat", "🐱", "A cat watched him from a windowsill", "Hello up there", {"mood": 1}),
 ("puddle_splash", "🚗", "A car splashed a puddle right next to him", "Hey!", {"hygiene": -2, "mood": -1}),
 ("lucky_penny", "🍀", "He found a lucky clover between the paving stones", "Lucky!", {"mood": 2}),
 ("shop_bell", "🛎", "A shop door's bell jingled as he walked by", "Ding!", {}),
 ("bus_wave", "🚌", "He waved at a bus driver, who waved back", "Hi!", {"mood": 1}),
 ("lady_dog_names", "🐩", "A lady introduced her three dogs to him by name", "Nice to meet you all", {"mood": 2, "cha": 0}),
 ("stroll_couple", "💑", "An old couple walked by holding hands", "Aww", {"mood": 1}),
 ("frisbee", "🥏", "A frisbee landed at his feet, and he threw it back", "Got it!", {"mood": 2, "str": 0}),
 ("trash_bin", "🗑", "He picked up a can and put it in a bin", "Keep {CITY} tidy", {"karma": 1}),
 ("posters", "📰", "He read old posters peeling off a wall", "Missed that one", {}),
 ("tourist_photo", "📷", "Tourists asked him to take their photo", "Say cheese!", {"mood": 1, "xp": 2}),
 ("puzzle_door", "🚪", "He pushed a door that said pull", "Oops", {}),
 ("ringtone", "📳", "Everyone checked their phones at the same ringtone", "Not mine", {}),
 ("kids_race", "🏃", "Two kids raced him to the corner and won", "You win!", {"mood": 2, "energy": -1}),
 ("music_car", "🔊", "A car drove by with loud music, and he nodded along", "Tune!", {"mood": 1}),
 ("fountain_coin", "⛲", "He watched someone toss a coin into a fountain", "Make a wish", {}),
 ("neighbours_talk", "🗣", "He overheard neighbours gossiping in a doorway", "Oh really?", {}),
 ("cobbles", "🧱", "The cobblestones of {STREET} were hard on his feet", "Ouch", {"energy": -1}),
 ("rooftop_view", "🏙", "He caught a view of {CITY}'s rooftops between two buildings", "Wow", {"mood": 2}),
 ("street_dance", "💃", "A street dancer drew a small crowd", "Look at that!", {"mood": 2}),
 ("bookstall", "📚", "He flipped through books at a street stall", "Interesting…", {"wit": 0, "xp": 2}),
 ("gum_shoe", "🩴", "He stepped in chewing gum", "Ugh, gum", {"mood": -1}),
 ("cake_window", "🎂", "He pressed his nose to a bakery window", "So many cakes…", {"fullness": -1}),
 ("helping_bike", "🔧", "He helped someone put their bike chain back on", "Good as new", {"karma": 1, "xp": 2}),
 ("alarm", "🚨", "A car alarm went off, and nobody looked", "Typical", {}),
 ("bubbles", "🫧", "Soap bubbles floated across {STREET}", "Bubbles!", {"mood": 2}),
 ("fruit_drop", "🍊", "An orange rolled off a cart and he caught it for the seller", "Catch!", {"karma": 1}),
 ("hat_wind", "🎩", "A gust nearly took someone's hat, and he caught it", "Got it!", {"karma": 1, "mood": 1}),
 ("door_hold", "🚪", "He held a door for a stranger with a pram", "After you", {"karma": 1}),
 ("street_quiz", "❓", "A student with a clipboard asked him survey questions", "Hmm, three?", {"xp": 2}),
 ("misheard", "👂", "Someone called a name that sounded like his", "Me? No…", {}),
 ("tiny_dog_bark", "🐶", "A tiny dog barked at him like a lion", "Easy, tiger", {"mood": 1}),
 ("crossword", "📝", "He glanced at a man's crossword and knew an answer", "Seven down is 'atlas'", {"wit": 0, "xp": 2}),
 ("smell_coffee", "☕", "Coffee smell poured out of a café door", "Mmm, coffee", {"mood": 1}),
 ("shadow", "🌗", "He noticed his own shadow walking beside him", "Hi, me", {}),
 ("motorcade", "🚓", "A police car sped past with its siren on", "Wonder what that was", {}),
 ("shop_cat", "😺", "A shop cat sat in the doorway like it owned the street", "Your highness", {"mood": 1}),
 ("tree_shade", "🌳", "He walked under a big old tree on {STREET}", "Nice shade", {"mood": 1}),
 ("bike_lock", "🔒", "A bike was locked to a lamp post with only its wheel left", "Poor bike", {}),
 ("child_question", "🧒", "A child asked him why the sky is blue", "Uh… science?", {"wit": 0}),
 ("echo", "📣", "He shouted hello into an echoing underpass", "Hellooo!", {"mood": 1}),
]
# Street life that needs daylight.
DAY = {"busker", "wave_kid", "old_man_chess", "chalk_game", "market_stall", "parade_honk", "boules", "street_quiz", "kids_race", "frisbee", "tourist_photo", "street_dance", "bookstall", "lady_dog_names", "bubbles", "stroll_couple", "grandma", "flyer", "delivery", "hum_neighbour", "window_shop", "selfie", "child_question", "helping_bike", "fruit_drop", "squirrel", "ant_line", "bird_song", "lost_tourist", "crossword", "neighbours_talk", "shadow"}
for id, ic, t, s, fx in street:
    b(id, ic, W, t, s, fx, **({"sky": "day"} if id in DAY else {}))
# Street, by weather or time of day.
sky = [
 ("rain_umbrella", "☂", "wet", "A stranger shared an umbrella with him for a block", "Thanks!", {"mood": 2}),
 ("rain_run", "🌧", "wet", "He ran from one awning to the next to dodge the rain", "Go go go!", {"energy": -1}),
 ("rain_puddle_kid", "🌧", "wet", "Kids stomped in puddles and he joined in, just once", "Splash!", {"mood": 2, "hygiene": -1}),
 ("rain_smell", "🌦", "wet", "He breathed in the smell of rain on warm stone", "Petrichor", {"mood": 1}),
 ("rain_drip", "💦", "wet", "A drip from a gutter landed right on his neck", "Brr!", {"mood": -1}),
 ("snow_ball", "❄", "snow", "Someone's snowball missed him by an inch", "Ha, missed!", {"mood": 1}),
 ("snow_angel", "⛄", "snow", "He saw a tiny snowman on a car bonnet", "Cute!", {"mood": 2}),
 ("snow_slip", "🧊", "snow", "He slid on a patch of ice and kept his balance", "Whoa!", {}),
 ("sun_squint", "😎", "sunny", "He squinted into the sun and grinned", "Lovely day", {"mood": 2}),
 ("sun_cafe_tables", "☀", "sunny", "Every café table on {STREET} was full in the sun", "Busy today", {}),
 ("sun_cat", "🐈", "sunny", "A cat lay flat out in a patch of sunshine", "Living the dream", {"mood": 1}),
 ("hot_shade", "🥵", "hot", "He crossed the street just to walk in the shade", "So hot…", {"thirst": -2}),
 ("hot_sprinkler", "💦", "hot", "A sprinkler caught him, and it felt great", "Ahh, cool!", {"mood": 2, "thirst": 1}),
 ("hot_icecream_van", "🍦", "hot", "An ice cream van played its tune nearby", "Tempting…", {}),
 ("cold_breath", "🥶", "cold", "He could see his breath in the cold air", "Brrr", {}),
 ("cold_hands", "🧤", "cold", "He blew on his hands to warm them up", "Freezing!", {"energy": -1}),
 ("street_vendor", "🌰", "cold", "Roasted chestnuts smelled great on {STREET}", "Smells like winter", {"mood": 1}),
 ("cold_chestnut", "🌰", "cold", "A chestnut seller's fire looked so warm", "Toasty", {"mood": 1}),
 ("night_stars", "✨", "night", "He spotted a few stars above {CITY}'s lights", "Make a wish", {"mood": 2}),
 ("night_neon", "🌃", "night", "Neon signs buzzed along {STREET}", "Pretty at night", {"mood": 1}),
 ("night_owl", "🦉", "night", "An owl hooted somewhere in the dark", "Who's there?", {}),
 ("night_quiet", "🌙", "night", "{STREET} was so quiet he could hear his own steps", "Spooky…", {}),
 ("night_kebab", "🥙", "night", "A late-night kebab shop glowed on the corner", "Maybe later", {}),
 ("night_moon", "🌕", "night", "The moon rose over the rooftops", "Big moon tonight", {"mood": 1}),
 ("morning_bins", "🚛", "day", "A rubbish truck clanked down {STREET}", "Noisy!", {}),
 ("day_school", "🏫", "day", "School bells rang and kids poured onto the street", "So many!", {}),
]
for id, ic, g, t, s, fx in sky:
    b(id, ic, W, t, s, fx, sky=g)
# On board, by way of travel.
ride = {
 "plane": [
  ("window_clouds", "☁", "He watched the clouds slide under the wing", "Like cotton", {"mood": 2}),
  ("snack_trolley", "🥨", "The trolley came by with pretzels", "Pretzels, please", {"fullness": 2}),
  ("turbulence", "✈", "A bit of turbulence rattled the cabin", "Hold on!", {"mood": -1}),
  ("crying_baby", "👶", "A baby cried three rows back", "Poor thing", {"energy": -1}),
  ("ear_pop", "👂", "His ears popped as the plane climbed", "Pop!", {}),
  ("seat_neighbour_plane", "💬", "His seat neighbour told him their whole life story", "Wow, really?", {"cha": 0, "xp": 3}),
  ("pilot_joke", "🎙", "The pilot made a joke over the speakers", "Ha!", {"mood": 1}),
  ("map_screen", "🗺", "He watched the little plane crawl across the map screen", "Almost there", {}),
  ("aisle_dance", "🧍", "He did the aisle shuffle to let someone out", "Sorry, sorry", {}),
  ("sunset_wing", "🌅", "The sun set over the wing in orange and pink", "Beautiful", {"mood": 3}),
  ("nap_plane", "😴", "He nodded off with his mouth open", "Zzz…", {"energy": 3}),
  ("tray_table", "🍽", "His tray table refused to stay up", "Come on…", {}),
 ],
 "bus": [
  ("bus_window", "🚌", "Fields and villages slid past the bus window", "So green", {"mood": 1}),
  ("bus_stop_village", "🏘", "The bus stopped in a tiny village for a minute", "Where are we?", {}),
  ("bus_driver_radio", "📻", "The driver's radio played old hits", "Classic!", {"mood": 1}),
  ("bus_snore", "😪", "The man next to him snored all the way", "Seriously…", {"energy": -1}),
  ("bus_sandwich", "🥪", "He ate a squashed sandwich from his pocket", "Still good", {"fullness": 2}),
  ("bus_bump", "🕳", "The bus hit a bump and everyone bounced", "Whee!", {}),
  ("bus_chat", "💬", "A grandma offered him a sweet and a chat", "Thank you!", {"mood": 2, "fullness": 1}),
  ("bus_cows", "🐄", "Cows watched the bus go by", "Moo", {"mood": 1}),
  ("bus_rest_stop", "⛽", "The bus took a short break at a petrol station", "Stretch time", {"energy": 1}),
 ],
 "train": [
  ("train_window", "🚆", "Hills rolled past the train window", "Lovely view", {"mood": 2}),
  ("train_tea", "🍵", "The lady across the aisle offered him tea from her flask", "Ahh, thanks", {"thirst": 3}),
  ("train_tunnel", "🌑", "The train dived into a long tunnel", "Dark!", {}),
  ("train_cards", "🃏", "A family in his carriage played cards and dealt him in", "Snap!", {"mood": 2}),
  ("train_conductor", "🎫", "The conductor punched his ticket with a flourish", "Thanks!", {}),
  ("train_rhythm", "🎶", "The rhythm of the rails nearly put him to sleep", "Clack-clack…", {"energy": 2}),
  ("train_river", "🌉", "The train crossed a big river on a high bridge", "Whoa, high!", {"mood": 1}),
  ("train_station_small", "🚉", "The train paused at a tiny station with flower pots", "Cute station", {}),
  ("train_book", "📖", "He read a chapter of a book someone left on the seat", "Page-turner", {"wit": 0, "xp": 3}),
 ],
 "ferry": [
  ("ferry_gulls", "🕊", "Seagulls followed the ferry, begging", "No chips for you", {"mood": 1}),
  ("ferry_wind", "🌬", "The sea wind messed up his hair", "Fresh!", {"mood": 2}),
  ("ferry_dolphin", "🐬", "Someone shouted about dolphins, but he missed them", "Where?!", {}),
  ("ferry_waves", "🌊", "The ferry rocked on a big wave", "Uh-oh, my tummy", {"mood": -1}),
  ("ferry_deck", "🛳", "He stood at the rail and watched the land shrink", "Bye, land", {"mood": 1}),
  ("ferry_lighthouse", "🗼", "They passed a lighthouse on the rocks", "Ahoy!", {"mood": 1}),
 ],
 "car": [
  ("car_singalong", "🎤", "He sang along to the car radio, loudly", "♪ Don't stop me now ♪", {"mood": 2}),
  ("car_traffic", "🚗", "He sat in a short traffic jam", "Come on, move", {"mood": -1}),
  ("car_view", "🏞", "The road curved along a beautiful valley", "Wow", {"mood": 2}),
  ("car_snack", "🍫", "He ate a chocolate bar at a red light", "Fuel", {"fullness": 1}),
  ("car_wrong_exit", "↪", "He nearly took the wrong exit", "Phew, no", {}),
  ("car_tractor", "🚜", "He got stuck behind a tractor for a while", "Slow and steady", {}),
 ],
 "bike": [
  ("bike_hill", "⛰", "He pedalled up a long hill", "Almost… there…", {"energy": -2, "str": 0}),
  ("bike_downhill", "🚲", "He freewheeled down a long hill", "Wheee!", {"mood": 3}),
  ("bike_bug", "🪰", "A bug flew into his mouth", "Pfft!", {"mood": -1}),
  ("bike_tractor_wave", "🚜", "A farmer on a tractor waved at him", "Hello!", {"mood": 1}),
  ("bike_sheep", "🐑", "Sheep watched him ride past", "Baa to you too", {"mood": 1}),
 ],
 "hitch": [
  ("hitch_stories", "💬", "The driver told him stories from the road", "No way!", {"mood": 2, "xp": 3}),
  ("hitch_dog", "🐕", "The driver's dog put its head on his lap", "Good boy", {"mood": 3}),
  ("hitch_music", "📻", "The driver's music taste was… interesting", "Uh, nice", {}),
  ("hitch_snack", "🍪", "The driver shared a box of biscuits", "Thanks!", {"fullness": 2}),
  ("hitch_quiet", "🤐", "The driver didn't say a single word", "…", {}),
 ],
 "walk": [
  ("trail_field", "🌾", "He walked past a field of sunflowers", "So tall!", {"mood": 2}),
  ("trail_sign", "🪧", "A road sign said it's still a long way", "Keep going", {}),
  ("trail_farm_dog", "🐕", "A farm dog barked at him from behind a fence", "I'm just passing!", {}),
  ("trail_apple", "🍎", "He picked an apple from a tree by the road", "Crunchy", {"fullness": 2}),
  ("trail_truck", "🚛", "A truck honked hello as it passed", "Hi!", {"mood": 1}),
  ("trail_blister", "🦶", "He felt a blister coming on", "Ouch", {"mood": -1}),
  ("trail_hiker", "🥾", "He met another hiker and they walked together a bit", "Where are you headed?", {"mood": 2}),
  ("trail_stream", "💧", "He splashed his face in a cold stream", "Refreshing!", {"hygiene": 1, "thirst": 2}),
  ("trail_view", "⛰", "The road topped a hill with a view for miles", "Wow!", {"mood": 3}),
 ],
 "taxi": [
  ("taxi_driver_talk", "🚕", "The taxi driver had strong opinions about football", "Uh-huh…", {}),
  ("taxi_radio", "📻", "The taxi radio played folk music", "Catchy", {"mood": 1}),
  ("taxi_shortcut", "🛣", "The driver took a mysterious shortcut", "Is this right?", {}),
  ("taxi_city_view", "🏙", "{CITY} flashed past the taxi window", "Bye, {CITY}", {"mood": 1}),
  ("taxi_meter", "💶", "He watched the taxi meter tick up nervously", "Uh-oh", {"mood": -1}),
 ],
 "metro": [
  ("metro_busker", "🎻", "A violinist played in the metro carriage", "Bravo!", {"mood": 2}),
  ("metro_crowd", "🚇", "The metro was packed like a tin of sardines", "Squeeze…", {"mood": -1}),
  ("metro_map", "🗺", "He counted the stops on the metro map", "Three more", {}),
  ("metro_seat", "💺", "He gave his metro seat to an old man", "Please, sit", {"karma": 1}),
  ("metro_doors", "🚪", "He just made it through the closing metro doors", "Made it!", {"mood": 1}),
 ],
}
for mode, rows in ride.items():
    for id, ic, t, s, fx in rows:
        b(id, ic, R, t, s, {k: v for k, v in fx.items() if v}, modes=[mode])
# Any ride.
# Any ride but these ways.
NOT = {"ride_count": {"plane", "ferry", "bike", "walk", "metro"}, "ride_stretch": {"bike", "walk"}, "ride_playlist": {"bike", "walk"}, "ride_postcard": {"bike"}}
WAYS = ["plane", "bus", "train", "ferry", "car", "bike", "hitch", "walk", "taxi", "metro"]
for id, ic, t, s, fx in [
  ("ride_daydream", "💭", "He daydreamed about the city he is heading to", "Hmm…", {}),
  ("ride_postcard", "✉", "He wrote a postcard in his head", "Dear Mum…", {}),
  ("ride_stretch", "🙆", "He stretched his legs as far as they would go", "Ahh", {"energy": 1}),
  ("ride_playlist", "🎧", "He made a travel playlist on his phone", "Perfect", {"mood": 1}),
  ("ride_count", "🔢", "He counted red cars to pass the time. Twelve", "Thirteen!", {}),
]:
    no = NOT.get(id)
    b(id, ic, R, t, s, fx, **({"modes": [w for w in WAYS if w not in no]} if no else {}))
# While he stays at a place.
for id, ic, t, s, fx in [
  ("rest_people", "👀", "He people-watched at {PLACE}", "Interesting crowd", {"mood": 1}),
  ("rest_music", "🎵", "A song he loves came on at {PLACE}", "My song!", {"mood": 2}),
  ("rest_staff_smile", "😊", "Someone at {PLACE} smiled at him", "Hi!", {"mood": 1}),
  ("rest_overhear", "👂", "He overheard a strange conversation at {PLACE}", "Did they just say…?", {}),
  ("rest_spill", "🫗", "Someone spilled a drink near him at {PLACE}", "Close call", {}),
  ("rest_phone", "📱", "He checked his phone. No messages", "Nobody loves me", {"mood": -1}),
  ("rest_selfie", "🤳", "He took a selfie at {PLACE}", "Cheese!", {"mood": 1}),
  ("rest_stretch", "🙆", "He stretched and cracked his back at {PLACE}", "Ahh", {"energy": 1}),
  ("rest_kid_stare", "🧒", "A little kid stared at him at {PLACE}", "Boo!", {}),
  ("rest_dog_visit", "🐕", "Someone's dog came over to say hi at {PLACE}", "Hello, buddy!", {"mood": 2}),
  ("rest_notebook", "📓", "He wrote a few lines in his notebook at {PLACE}", "Note to self…", {"xp": 2}),
  ("rest_queue", "🧍", "He waited behind someone who couldn't decide at {PLACE}", "Any day now…", {}),
  ("rest_wifi", "📶", "He asked for the wifi password at {PLACE}", "Thanks!", {}),
  ("rest_compliment", "💐", "Someone at {PLACE} liked his shoes", "Oh, thanks!", {"mood": 2}),
  ("rest_lost_found", "🧷", "He handed in a lost scarf at {PLACE}", "Someone left this", {"karma": 1}),
]:
    b(id, ic, S, t, s, fx)
# Thoughts, by how he feels (anywhere).
for id, ic, low, t, s, fx in [
  ("think_food", "🍔", "fullness", "His stomach rumbled loudly", "So hungry…", {}),
  ("think_food2", "🍕", "fullness", "He couldn't stop thinking about pizza", "Pizza…", {}),
  ("think_thirst", "🥤", "thirst", "His mouth felt dry as sand", "Water…", {}),
  ("think_tired", "🥱", "energy", "He yawned so wide his jaw clicked", "Need a nap", {}),
  ("think_tired2", "😴", "energy", "His eyelids felt heavy", "Just five minutes…", {}),
  ("think_sad", "🌧", "mood", "He felt a bit blue for no reason", "Sigh", {}),
  ("think_sad2", "😔", "mood", "He missed home a little", "Wish I was home", {}),
  ("think_smell", "🧼", "hygiene", "He sniffed his own shirt and winced", "I need a shower", {}),
  ("think_hurt", "🤕", "health", "His knee ached a little", "Ow, ow", {}),
]:
    b(id, ic, A, t, s, fx, low=low)
for id, ic, t, s, fx in [
  ("think_joke", "😄", "He remembered a joke and laughed out loud", "Ha! Good one", {"mood": 2}),
  ("think_plan", "💭", "He made big plans for tomorrow", "Tomorrow, for sure", {}),
  ("think_song", "🎶", "A song got stuck in his head", "Na na na…", {}),
  ("think_grateful", "🙏", "He felt grateful for a good day", "Life is good", {"mood": 2}),
  ("think_question", "🤔", "He wondered who decides the names of streets", "Who, though?", {"wit": 0}),
  ("think_memory", "🕰", "He remembered his first day out walking", "Good times", {"mood": 1}),
  ("think_dream", "🌠", "He wondered what it would be like to fly", "One day…", {}),
  ("think_lists", "📋", "He made a mental list of places to see in {CITY}", "So much to see", {}),
]:
    b(id, ic, A, t, s, fx)
# Passing comments on a place he walks by ({NEAR} = its name).
C = []
for id, t, s in [
  ("near_later", "He walked past {NEAR} and made a note to come back", "Maybe later"),
  ("near_peek", "He peeked into {NEAR} as he passed", "Ooh, nice"),
  ("near_heard", "He'd heard good things about {NEAR}", "Next time!"),
  ("near_busy", "{NEAR} looked busy today", "Popular place"),
  ("near_name", "He liked the name of {NEAR}", "Good name"),
  ("near_smell", "Something smelled good near {NEAR}", "What's that smell?"),
  ("near_photo", "He took a photo of {NEAR} for later", "Click"),
  ("near_point", "He pointed at {NEAR} like he'd discovered it", "Look!"),
]:
    C.append({"id": id, "text": t, "say": s})
ids = [e["id"] for e in B] + [c["id"] for c in C]
assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
json.dump({"beats": B, "comments": C}, open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(B), len(C))
