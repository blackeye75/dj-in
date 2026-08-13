/**
 * Pre-injected catalogue, one playlist per category.
 *
 * Two kinds of entry:
 *  - source 'synth'  — generated in the browser by the built-in Web Audio deck
 *                      (lib/synth.js). Always playable, no network, and it
 *                      feeds the analyser so the rig reacts to a real signal.
 *  - source 'itunes' — resolved at runtime through the free iTunes Search API
 *                      (30 second previews, artwork, no API key). The stored
 *                      `query` is what gets resolved; the resolved preview URL
 *                      is cached back onto the document.
 *
 * The admin panel (/admin) is the supported way to extend any of these lists.
 */

const t = (theme, order, rest) => ({
  theme,
  order,
  album: '',
  sourceId: '',
  previewUrl: '',
  artworkUrl: '',
  duration: 0,
  bpm: 0,
  lyrics: [],
  ...rest,
});

/* Original lyrics written for the built-in synth decks. */
const RAMP_LYRICS = [
  { t: 0, text: '[intro — ramp lights up]' },
  { t: 5.6, text: 'Headlights low, the salon starts to glow' },
  { t: 11.2, text: 'Six heads turning, watch the beam go' },
  { t: 16.9, text: 'Fog on the floor, lasers on the wall' },
  { t: 22.5, text: 'Drop the fader — let it fall' },
  { t: 28.1, text: '[drop]' },
  { t: 33.8, text: 'Blinder on the crowd, one, two, three' },
  { t: 39.4, text: 'Everybody moving on the highway beat' },
];

const NIGHT_DRIVE_LYRICS = [
  { t: 0, text: '[soft pads]' },
  { t: 7.1, text: 'Windows down, the city runs behind' },
  { t: 14.3, text: 'Wash lights breathing, slow and kind' },
  { t: 21.4, text: 'No hurry now, just amber and blue' },
  { t: 30.0, text: 'Long road, quiet crew' },
  { t: 38.6, text: '[fade]' },
];

export const SEED_TRACKS = [
  /* ------------------------------------------------------------ DJ Night */
  t('dj-night', 0, {
    title: 'Ramp Ignition',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'ignition',
    bpm: 128,
    duration: 45,
    lyrics: RAMP_LYRICS,
  }),
  t('dj-night', 1, { title: 'Levels', artist: 'Avicii', source: 'itunes', query: 'Avicii Levels' }),
  t('dj-night', 2, { title: 'Titanium', artist: 'David Guetta', source: 'itunes', query: 'David Guetta Titanium' }),
  t('dj-night', 3, { title: 'Animals', artist: 'Martin Garrix', source: 'itunes', query: 'Martin Garrix Animals' }),
  t('dj-night', 4, { title: 'Turn Down for What', artist: 'DJ Snake', source: 'itunes', query: 'DJ Snake Turn Down for What' }),
  t('dj-night', 5, { title: 'Illegal Weapon 2.0', artist: 'Tanishk Bagchi', source: 'itunes', query: 'Illegal Weapon 2.0' }),

  /* --------------------------------------------------------------- Party */
  t('party', 0, {
    title: 'Salon Bounce',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'bounce',
    bpm: 112,
    duration: 47,
  }),
  t('party', 1, { title: 'Kala Chashma', artist: 'Badshah', source: 'itunes', query: 'Kala Chashma Baar Baar Dekho' }),
  t('party', 2, { title: 'Nashe Si Chadh Gayi', artist: 'Arijit Singh', source: 'itunes', query: 'Nashe Si Chadh Gayi' }),
  t('party', 3, { title: 'Uptown Funk', artist: 'Mark Ronson', source: 'itunes', query: 'Mark Ronson Uptown Funk' }),
  t('party', 4, { title: 'Gallan Goodiyaan', artist: 'Dil Dhadakne Do', source: 'itunes', query: 'Gallan Goodiyaan' }),
  t('party', 5, { title: 'Cheap Thrills', artist: 'Sia', source: 'itunes', query: 'Sia Cheap Thrills' }),

  /* --------------------------------------------------------------- Relax */
  t('relax', 0, {
    title: 'Night Drive',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'drive',
    bpm: 84,
    duration: 46,
    lyrics: NIGHT_DRIVE_LYRICS,
  }),
  t('relax', 1, { title: 'Sunset Lover', artist: 'Petit Biscuit', source: 'itunes', query: 'Petit Biscuit Sunset Lover' }),
  t('relax', 2, { title: 'Weightless', artist: 'Marconi Union', source: 'itunes', query: 'Marconi Union Weightless' }),
  t('relax', 3, { title: 'Kun Faya Kun', artist: 'A. R. Rahman', source: 'itunes', query: 'Kun Faya Kun Rockstar' }),
  t('relax', 4, { title: 'Ocean Eyes', artist: 'Billie Eilish', source: 'itunes', query: 'Billie Eilish Ocean Eyes' }),

  /* --------------------------------------------------------------- Focus */
  t('focus', 0, {
    title: 'Steady State',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'steady',
    bpm: 96,
    duration: 45,
  }),
  t('focus', 1, { title: 'Experience', artist: 'Ludovico Einaudi', source: 'itunes', query: 'Ludovico Einaudi Experience' }),
  t('focus', 2, { title: 'Time', artist: 'Hans Zimmer', source: 'itunes', query: 'Hans Zimmer Time Inception' }),
  t('focus', 3, { title: 'Strobe', artist: 'deadmau5', source: 'itunes', query: 'deadmau5 Strobe' }),
  t('focus', 4, { title: 'Divenire', artist: 'Ludovico Einaudi', source: 'itunes', query: 'Ludovico Einaudi Divenire' }),

  /* --------------------------------------------------------------- Sleep */
  t('sleep', 0, {
    title: 'Low Amber',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'amber',
    bpm: 60,
    duration: 48,
  }),
  t('sleep', 1, { title: 'Nuvole Bianche', artist: 'Ludovico Einaudi', source: 'itunes', query: 'Nuvole Bianche' }),
  t('sleep', 2, { title: 'Clair de Lune', artist: 'Debussy', source: 'itunes', query: 'Debussy Clair de Lune' }),
  t('sleep', 3, { title: 'Gymnopédie No. 1', artist: 'Erik Satie', source: 'itunes', query: 'Satie Gymnopedie No 1' }),
  t('sleep', 4, { title: 'Rain Sounds', artist: 'Nature', source: 'itunes', query: 'gentle rain sleep sounds' }),

  /* ------------------------------------------------------- Priyanshu List */
  t('priyanshu-list', 0, {
    title: 'Priyanshu Anthem',
    artist: 'House Deck',
    source: 'synth',
    sourceId: 'anthem',
    bpm: 120,
    duration: 50,
    lyrics: [
      { t: 0, text: '[gold ramp, laser fan opens]' },
      { t: 8, text: 'Name on the console, hand on the fade' },
      { t: 16, text: 'Every light in the salon obeyed' },
      { t: 24, text: 'Magenta, gold — the whole road knows' },
      { t: 32, text: 'This is how the night show goes' },
      { t: 42, text: '[laser tunnel]' },
    ],
  }),
  t('priyanshu-list', 1, { title: 'Apna Bana Le', artist: 'Arijit Singh', source: 'itunes', query: 'Apna Bana Le Bhediya' }),
  t('priyanshu-list', 2, { title: 'Blinding Lights', artist: 'The Weeknd', source: 'itunes', query: 'The Weeknd Blinding Lights' }),
  t('priyanshu-list', 3, { title: 'Jhoome Jo Pathaan', artist: 'Arijit Singh', source: 'itunes', query: 'Jhoome Jo Pathaan' }),
  t('priyanshu-list', 4, { title: 'Starboy', artist: 'The Weeknd', source: 'itunes', query: 'The Weeknd Starboy' }),
  t('priyanshu-list', 5, { title: 'Believer', artist: 'Imagine Dragons', source: 'itunes', query: 'Imagine Dragons Believer' }),
];
