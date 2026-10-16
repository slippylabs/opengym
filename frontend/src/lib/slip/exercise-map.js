// SlipFit's exercise library, each row tied to the openGym catalogue entry that is the same
// movement with the same equipment. SlipFit's plan generator picks exercises by movement pattern
// and equipment, which the openGym catalogue does not carry, so that metadata travels here,
// next to the id it resolves to.
//
//   [slipId, SlipFit name, pattern, equip, type, openGym id | null]
//     pattern  the movement slot the plan generator fills (squat, hinge, hpush…)
//     equip    barbell | dumbbell | machine | cable | kettlebell | band | bodyweight | cardio
//     type     w = load × reps, b = bodyweight reps, t = timed hold (s),
//              c = cardio (minutes), m = mobility (minutes)
//
// The rows are in SlipFit's own order (js/exercises.js) and must stay in it: the generator takes
// the first candidate of a pattern and rotates through the rest in this order, so reordering
// would quietly change every generated plan.
//
// Every id was first matched by a script (name tokens, compatible equipment) and then checked by
// hand against the catalogue's instructions. null means nothing in the catalogue is that
// exercise, and it stays unmapped rather than a near miss: a "Full-Body Stretch" routine is not
// one lying stretch, a 25 m pool swim is not a standing crawl-stroke drill. Plans skip a null.
// Judgement calls, where the catalogue has no exact twin:
//   kb-press      → kettlebell alternating press (standing rack press, one bell per hand)
//   run-intervals → run (the run/walk split lives in the session's note)
//   bike          → stationary bike (SlipFit's "indoor or outdoor")
//   ab-wheel      → wheel rollerout (SlipFit filed it as bodyweight; it needs the wheel)
//   yoga          → sun salutation A (a flow)
//   shoulder-mob  → resistance band pass-through (SlipFit's cue leads with band dislocates)
const ROWS = [
  // ---- chest ----
  ['bench', 'Barbell Bench Press', 'hpush', 'barbell', 'w', '0025'],
  ['incline-bench', 'Incline Barbell Bench', 'hpush', 'barbell', 'w', '0047'],
  ['db-bench', 'Dumbbell Bench Press', 'hpush', 'dumbbell', 'w', '0289'],
  ['db-incline', 'Incline Dumbbell Press', 'hpush', 'dumbbell', 'w', '0314'],
  ['machine-press', 'Machine Chest Press', 'hpush', 'machine', 'w', '0576'],
  ['pushup', 'Push-Up', 'hpush', 'bodyweight', 'b', '0662'],
  ['incline-pushup', 'Incline Push-Up', 'hpush', 'bodyweight', 'b', '0493'],
  ['dips', 'Dips', 'hpush', 'bodyweight', 'b', '0251'],
  ['cable-fly', 'Cable Fly', 'chest_iso', 'cable', 'w', '0227'],
  ['db-fly', 'Dumbbell Fly', 'chest_iso', 'dumbbell', 'w', '0308'],
  ['pec-deck', 'Pec Deck', 'chest_iso', 'machine', 'w', '1030'],
  ['band-press', 'Band Chest Press', 'hpush', 'band', 'b', '3780'],

  // ---- back ----
  ['deadlift', 'Deadlift', 'hinge', 'barbell', 'w', '0032'],
  ['row', 'Barbell Row', 'hpull', 'barbell', 'w', '0027'],
  ['db-row', 'One-Arm Dumbbell Row', 'hpull', 'dumbbell', 'w', '2393'],
  ['cable-row', 'Seated Cable Row', 'hpull', 'cable', 'w', '0861'],
  ['chest-row', 'Chest-Supported Row', 'hpull', 'machine', 'w', '6513'],
  ['pullup', 'Pull-Up', 'vpull', 'bodyweight', 'b', '0652'],
  ['chinup', 'Chin-Up', 'vpull', 'bodyweight', 'b', '1326'],
  ['lat-pulldown', 'Lat Pulldown', 'vpull', 'cable', 'w', '2291'],
  ['assisted-pullup', 'Assisted Pull-Up', 'vpull', 'machine', 'w', '0017'],
  ['inverted-row', 'Inverted Row', 'hpull', 'bodyweight', 'b', '0499'],
  ['band-row', 'Band Row', 'hpull', 'band', 'b', '0930'],
  ['band-pulldown', 'Band Pulldown', 'vpull', 'band', 'b', '0905'],
  ['kb-row', 'Kettlebell Row', 'hpull', 'kettlebell', 'w', '0541'],
  ['rdl', 'Romanian Deadlift', 'hinge', 'barbell', 'w', '0085'],
  ['db-rdl', 'Dumbbell Romanian Deadlift', 'hinge', 'dumbbell', 'w', '1459'],
  ['back-ext', 'Back Extension', 'hinge', 'machine', 'b', '0489'],
  ['superman', 'Superman', 'hinge', 'bodyweight', 'b', '3436'],
  ['shrug', 'Dumbbell Shrug', 'shrug', 'dumbbell', 'w', '0406'],
  ['face-pull', 'Face Pull', 'rear_delt', 'cable', 'w', '5609'],

  // ---- shoulders ----
  ['ohp', 'Overhead Press', 'vpush', 'barbell', 'w', '1162'],
  ['db-ohp', 'Dumbbell Shoulder Press', 'vpush', 'dumbbell', 'w', '0405'],
  ['machine-ohp', 'Machine Shoulder Press', 'vpush', 'machine', 'w', '0603'],
  ['pike-pushup', 'Pike Push-Up', 'vpush', 'bodyweight', 'b', '2921'],
  ['kb-press', 'Kettlebell Press', 'vpush', 'kettlebell', 'w', '0520'],
  ['band-ohp', 'Band Overhead Press', 'vpush', 'band', 'b', '0997'],
  ['lateral-raise', 'Lateral Raise', 'lat_raise', 'dumbbell', 'w', '0334'],
  ['cable-lateral', 'Cable Lateral Raise', 'lat_raise', 'cable', 'w', '0178'],
  ['band-lateral', 'Band Lateral Raise', 'lat_raise', 'band', 'b', '0907'],
  ['rear-fly', 'Rear Delt Fly', 'rear_delt', 'dumbbell', 'w', '2487'],
  ['band-pull-apart', 'Band Pull-Apart', 'rear_delt', 'band', 'b', '1503'],
  ['arnold', 'Arnold Press', 'vpush', 'dumbbell', 'w', '2137'],

  // ---- arms ----
  ['curl', 'Barbell Curl', 'bicep', 'barbell', 'w', '0031'],
  ['db-curl', 'Dumbbell Curl', 'bicep', 'dumbbell', 'w', '0294'],
  ['hammer-curl', 'Hammer Curl', 'bicep', 'dumbbell', 'w', '0313'],
  ['cable-curl', 'Cable Curl', 'bicep', 'cable', 'w', '0868'],
  ['band-curl', 'Band Curl', 'bicep', 'band', 'b', '4063'],
  ['triceps-pushdown', 'Triceps Pushdown', 'tricep', 'cable', 'w', '0201'],
  ['skullcrusher', 'Skull Crusher', 'tricep', 'barbell', 'w', '0060'],
  ['oh-extension', 'Overhead Triceps Extension', 'tricep', 'dumbbell', 'w', '2188'],
  ['close-bench', 'Close-Grip Bench Press', 'hpush', 'barbell', 'w', '0030'],
  ['diamond-pushup', 'Diamond Push-Up', 'tricep', 'bodyweight', 'b', '0283'],
  ['bench-dip', 'Bench Dip', 'tricep', 'bodyweight', 'b', '0129'],
  ['band-pushdown', 'Band Pushdown', 'tricep', 'band', 'b', '1502'],

  // ---- legs ----
  ['squat', 'Back Squat', 'squat', 'barbell', 'w', '0043'],
  ['front-squat', 'Front Squat', 'squat', 'barbell', 'w', '0042'],
  ['goblet-squat', 'Goblet Squat', 'squat', 'dumbbell', 'w', '1760'],
  ['kb-goblet', 'Kettlebell Goblet Squat', 'squat', 'kettlebell', 'w', '0534'],
  ['leg-press', 'Leg Press', 'squat', 'machine', 'w', '0739'],
  ['hack-squat', 'Hack Squat', 'squat', 'machine', 'w', '0743'],
  ['bw-squat', 'Bodyweight Squat', 'squat', 'bodyweight', 'b', '1197'],
  ['jump-squat', 'Jump Squat', 'plyo', 'bodyweight', 'b', '0514'],
  ['lunge', 'Walking Lunge', 'lunge', 'dumbbell', 'w', '4295'],
  ['bw-lunge', 'Bodyweight Lunge', 'lunge', 'bodyweight', 'b', '0612'],
  ['split-squat', 'Bulgarian Split Squat', 'lunge', 'dumbbell', 'w', '2290'],
  ['bw-split-squat', 'Bodyweight Split Squat', 'lunge', 'bodyweight', 'b', '3743'],
  ['step-up', 'Step-Up', 'lunge', 'dumbbell', 'w', '0431'],
  ['leg-ext', 'Leg Extension', 'quad_iso', 'machine', 'w', '0585'],
  ['leg-curl', 'Leg Curl', 'ham_iso', 'machine', 'w', '0586'],
  ['nordic', 'Nordic Curl (assisted)', 'ham_iso', 'bodyweight', 'b', '7746'],
  ['slider-curl', 'Slider Hamstring Curl', 'ham_iso', 'bodyweight', 'b', '3395'],
  ['hip-thrust', 'Hip Thrust', 'glute', 'barbell', 'w', '1060'],
  ['glute-bridge', 'Glute Bridge', 'glute', 'bodyweight', 'b', '2471'],
  ['kb-swing', 'Kettlebell Swing', 'hinge', 'kettlebell', 'w', '0549'],
  ['calf-raise', 'Standing Calf Raise', 'calf', 'machine', 'w', '0605'],
  ['db-calf', 'Dumbbell Calf Raise', 'calf', 'dumbbell', 'w', '0417'],
  ['bw-calf', 'Bodyweight Calf Raise', 'calf', 'bodyweight', 'b', '1373'],
  ['wall-sit', 'Wall Sit', 'squat', 'bodyweight', 't', '0734'],
  ['sumo-dl', 'Sumo Deadlift', 'hinge', 'barbell', 'w', '0117'],
  ['db-sumo', 'Dumbbell Sumo Squat', 'squat', 'dumbbell', 'w', '5121'],
  ['single-leg-rdl', 'Single-Leg RDL', 'hinge', 'bodyweight', 'b', '4971'],
  ['band-good-morning', 'Band Good Morning', 'hinge', 'band', 'b', '1513'],

  // ---- core ----
  ['plank', 'Plank', 'core', 'bodyweight', 't', '0463'],
  ['side-plank', 'Side Plank', 'core', 'bodyweight', 't', '0715'],
  ['dead-bug', 'Dead Bug', 'core', 'bodyweight', 'b', '0276'],
  ['hanging-raise', 'Hanging Leg Raise', 'core', 'bodyweight', 'b', '0472'],
  ['crunch', 'Crunch', 'core', 'bodyweight', 'b', '0274'],
  ['cable-crunch', 'Cable Crunch', 'core', 'cable', 'w', '0175'],
  ['ab-wheel', 'Ab Wheel Rollout', 'core', 'bodyweight', 'b', '0857'],
  ['russian-twist', 'Russian Twist', 'core', 'bodyweight', 'b', '0687'],
  ['pallof', 'Pallof Press', 'core', 'cable', 'w', '1202'],
  ['mountain-climber', 'Mountain Climbers', 'core', 'bodyweight', 'b', '0630'],
  ['bird-dog', 'Bird Dog', 'core', 'bodyweight', 'b', '1241'],
  ['hollow-hold', 'Hollow Body Hold', 'core', 'bodyweight', 't', '1246'],
  ['farmer-carry', "Farmer's Carry", 'carry', 'dumbbell', 'w', '2133'],
  ['kb-carry', 'Kettlebell Carry', 'carry', 'kettlebell', 'w', '3576'],

  // ---- cardio ----
  ['run', 'Run', 'cardio', 'cardio', 'c', '0685'],
  ['walk', 'Walk', 'cardio', 'cardio', 'c', '2258'],
  ['run-intervals', 'Run / Walk Intervals', 'cardio', 'cardio', 'c', '0685'],
  ['treadmill', 'Treadmill', 'cardio', 'cardio', 'c', '2197'],
  ['bike', 'Cycling', 'cardio', 'cardio', 'c', '2138'],
  ['rower', 'Rowing Machine', 'cardio', 'cardio', 'c', '1161'],
  ['elliptical', 'Elliptical', 'cardio', 'cardio', 'c', '2141'],
  ['stairs', 'Stair Climber', 'cardio', 'cardio', 'c', '2311'],
  ['swim', 'Swim', 'cardio', 'cardio', 'c', null],
  ['jump-rope', 'Jump Rope', 'cardio', 'cardio', 'c', '2612'],
  ['hiit', 'HIIT Circuit', 'cardio', 'cardio', 'c', null],
  ['burpee', 'Burpee', 'plyo', 'bodyweight', 'b', '1160'],
  ['jumping-jack', 'Jumping Jacks', 'plyo', 'bodyweight', 'b', '3094'],
  ['high-knees', 'High Knees', 'plyo', 'bodyweight', 'b', '3556'],
  ['hike', 'Hike', 'cardio', 'cardio', 'c', null],

  // ---- mobility ----
  ['stretch', 'Full-Body Stretch', 'mobility', 'bodyweight', 'm', null],
  ['yoga', 'Yoga Flow', 'mobility', 'bodyweight', 'm', '5980'],
  ['foam-roll', 'Foam Rolling', 'mobility', 'bodyweight', 'm', null],
  ['hip-opener', 'Hip Opener Routine', 'mobility', 'bodyweight', 'm', null],
  ['shoulder-mob', 'Shoulder Mobility', 'mobility', 'band', 'm', '8365'],
  ['cat-cow', 'Cat-Cow', 'mobility', 'bodyweight', 'b', '4580'],
  ['worlds-greatest', "World's Greatest Stretch", 'mobility', 'bodyweight', 'b', '4633'],
  ['meditate', 'Breathing / Meditation', 'mobility', 'bodyweight', 'm', '5895'],
]

/** Every SlipFit exercise in SlipFit's order: { id, name, pattern, equip, type, og }. */
export const SLIP_EXERCISES = ROWS.map(([id, name, pattern, equip, type, og]) => ({ id, name, pattern, equip, type, og }))

const BY_ID = Object.fromEntries(SLIP_EXERCISES.map(e => [e.id, e]))

/** The SlipFit exercise behind an id, or null. */
export const slipExercise = id => BY_ID[id] || null

/** The openGym catalogue id for a SlipFit exercise id, or null when it has none. */
export const ogIdOf = id => BY_ID[id]?.og ?? null
