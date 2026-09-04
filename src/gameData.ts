/* The Hollow House — data: images, items, rites, examine texts, whispers. */

export const IMG = {
  scare: '/assets/scare.webp',
  hallway: '/assets/hallway.png',
  nursery: '/assets/nursery.png',
  basement: '/assets/basement.png',
  chapel: '/assets/chapel.png',
  attic: '/assets/attic.png',
  figure: '/assets/figure.png',
  doll: '/assets/doll.png',
  casket: '/assets/casket.png',
  chalk: '/assets/chalk.png',
};

export const ITEMS: Record<string, { name: string; desc: string }> = {
  matches: { name: 'Box of Matches', desc: '\u201CStrike anywhere,\u201D the box says. The box is warm.' },
  'iron-key': { name: 'Iron Key', desc: 'Cold enough to burn. It hums when you face the hatch.' },
  locket: { name: 'Mourning Locket', desc: 'Inside: a lock of child\u2019s hair and one small tooth.' },
  salt: { name: 'Salt Pouch', desc: 'Mother\u2019s ward. It will turn her once. Only once.' },
  sigil: { name: 'Chalk Sigil', desc: 'It writhes faintly in your palm, like something asleep.' },
};

export const MISSIONS: { id: string; text: string }[] = [
  { id: 'm1', text: 'Take the MATCHES from the hall mantelpiece. Nothing burns without them.' },
  { id: 'm2', text: 'Pry the IRON KEY from the porcelain doll in the nursery.' },
  { id: 'm3', text: 'Light the THREE BLACK CANDLES on the chapel altar.' },
  { id: 'm4', text: 'Take the MOURNING LOCKET from the casket in the cellar.' },
  { id: 'm5', text: 'Take the SALT POUCH from the cellar shelves \u2014 your one ward against her.' },
  { id: 'm6', text: 'Unlock the attic hatch. Claim the CHALK SIGIL from her circle.' },
  { id: 'm7', text: 'Strike the seal on the front door THREE TIMES \u2014 then RUN.' },
];

export const EXAMINES: Record<string, string[]> = {
  portrait: [
    'The Hollow family, 1889. The mother\u2019s face has been scratched out \u2014 from the inside of the frame.',
    'You lean closer. The eyes in the portrait are wet.',
    'Something breathes against the back of your neck. Do not turn around.',
  ],
  crib: [
    'The crib is empty. The mattress is indented, as if someone just stood up.',
    'Scratched into the wood, over and over: \u201CSHE COUNTS TO TWO.\u201D',
    'A small handprint grips the rail, in something dark. It is still warm.',
  ],
  musicbox: [
    'You wind the music box. It plays three notes\u2026 then a voice hums along.',
    'The humming stops the moment you stop watching it.',
  ],
  jars: [
    'Jars of preserves \u2014 and teeth. Hundreds of teeth, sorted by size.',
    'One jar is labeled, in a child\u2019s handwriting: \u201CFOR FATHER.\u201D',
  ],
  scratches: [
    'Deep gouges climb the wall from the floor. They were made from the inside.',
    'The scratches spell a word, if you tilt your head: \u201CSTAY.\u201D',
  ],
  bible: [
    'Every page has been erased except one line: \u201CShe was not the first, and she will not be the last.\u201D',
    'The ink is still drying.',
  ],
  trunk: [
    'Under the sheet: a wedding dress, folded wrong \u2014 as if folded by someone lying down.',
    'Something inside the trunk knocks once. Politely.',
  ],
  window: [
    'The yard below is empty. Then it isn\u2019t.',
    'She is standing in the moonlight, looking up. At this window. At you.',
  ],
  'nur-window': [
    'Frost on the inside of the glass. A child has drawn a family in it \u2014 four figures, and one of them is crossed out.',
    'You breathe on the glass to clear it. When the mist fades, a handprint is pressed to the other side. Yours is not.',
  ],
  journal: [
    'Father\u2019s cellar journal, soaked half-blind. One line survives: \u201CThe salt holds. God forgive us \u2014 we used it all on the small one.\u201D',
    'The last page is just the word \u201Csorry,\u201D written until the pen tore through.',
  ],
  diary: [
    'Her diary. Every entry is the same sentence in a finer and finer hand: \u201CToday I will be good. Today I will be good. Today I will be good.\u201D',
    'The final entry is pressed so hard the page is torn: \u201CHe says I am not his daughter anymore.\u201D',
  ],
  hymnal: [
    'A hymnal with all the verses erased but one: \u201CThough she walk beside you, count her not among the living.\u201D',
    'In the margin, a child\u2019s correction: \u201CShe is VERY much among the living.\u201D',
  ],
};

export const WHISPERS: string[] = [
  'A floorboard settles overhead. Then another. Then footsteps.',
  'The temperature drops. Your breath turns to smoke.',
  'Somewhere, a child counts to three. She only ever reaches two.',
  'The wallpaper is breathing. Slowly. In. Out.',
  'You smell lilies and wet earth.',
  'A whisper, very close to your ear: \u201C\u2026stay\u2026\u201D',
  'Every flame in the house leans toward you at once.',
  'Something heavy drags itself across the ceiling.',
  'The house groans, like a ship. Like a throat.',
  'You hear your own name, said kindly. That is worse.',
  'Behind you. No \u2014 don\u2019t look. Keep walking.',
  'The candles you lit are burning black smoke now.',
];

/* ---------------- the story ---------------- */

export const INTRO_CARDS: { kicker: string; body: string }[] = [
  {
    kicker: 'Ashfell County \u2014 October 14, 1889',
    body: 'The Hollow family vanished in a single night. No bodies. No note. Just the house, standing at the end of Miller Road with every door open \u2014 and every candle burning.',
  },
  {
    kicker: 'From the parish record',
    body: 'Margaret Hollow never left the nursery. Her daughter Clara counted the dark out loud to keep it away, the way children do. She only ever reached two.',
  },
  {
    kicker: 'Your commission',
    body: 'You are the county\u2019s last appraiser. The deed demands the house be sealed by dawn \u2014 seven rites of chalk and candle, iron and salt \u2014 or the county burns it with you still inside.',
  },
  {
    kicker: 'Tonight',
    body: 'The front door closes behind you, softly, like a page turning. From upstairs, something begins to hum a lullaby it could not have learned from anyone living.',
  },
];

export const CHAPTERS: { id: string; title: string; line: string }[] = [
  { id: 'ch-nursery', title: 'Chapter I \u2014 The Doll', line: 'Clara\u2019s doll sits facing the door. Dolls do not turn themselves.' },
  { id: 'ch-key', title: 'Chapter II \u2014 Iron', line: 'The key is colder than the room. Upstairs, the humming stops. It is listening now.' },
  { id: 'ch-cellar', title: 'Chapter III \u2014 The Cellar', line: 'The casket was never nailed shut. Someone wanted a way back in.' },
  { id: 'ch-altar', title: 'Chapter IV \u2014 The Altar', line: 'Each flame is a sentence of Margaret\u2019s confession. Light all three, and she finishes it.' },
  { id: 'ch-unbound', title: 'Chapter V \u2014 Unbound', line: 'The third flame goes out on its own \u2014 then returns. It no longer belongs to you.' },
  { id: 'ch-locket', title: 'Chapter VI \u2014 The Locket', line: 'A lock of a child\u2019s hair. A small tooth. A name engraved backwards, so it reads correctly from the other side.' },
  { id: 'ch-attic', title: 'Chapter VII \u2014 The Circle', line: 'She drew the circle from the inside. The chalk is still warm.' },
  { id: 'ch-broken', title: 'Chapter VIII \u2014 Broken', line: 'The circle lets out a soundless cry. Nothing is left to hold her to the attic.' },
  { id: 'ch-run', title: 'Chapter IX \u2014 Run', line: 'The seal cracks. Every door in the house opens at once.' },
  { id: 'ch-matches', title: 'Chapter X \u2014 Strike Anywhere', line: 'The matchbox was full, though no fire has been lit here since 1889. Something keeps the house supplied. Something wants the candles lit.' },
  { id: 'ch-salt', title: 'Chapter XI \u2014 Mother\u2019s Ward', line: 'The pouch is heavy with blessed salt. It will turn her once \u2014 the old women swore it. They also swore she could not climb stairs.' },
];
