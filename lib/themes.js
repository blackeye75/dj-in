/**
 * Theme catalogue. Every category owns a light "scene" (the state the control
 * desk boots into) plus the palette the rig paints with and the tempo the beat
 * clock falls back to when no audio analysis is available.
 */

export const FIXTURE_KEYS = [
  'spot',
  'wash',
  'beam',
  'ledPar',
  'classicPar',
  'strobe',
  'laser',
  'blinder',
  'fog',
];

export const FIXTURE_LABELS = {
  spot: 'Moving Head · Spot',
  wash: 'Moving Head · Wash',
  beam: 'Moving Head · Beam',
  ledPar: 'LED PAR Cans',
  classicPar: 'Classic PAR Cans',
  strobe: 'Strobes',
  laser: 'Lasers',
  blinder: 'Blinders',
  fog: 'Fog Machine',
};

export const FIXTURE_HINTS = {
  spot: 'Hard beam, gobo shapes on the floor',
  wash: 'Soft colour spread over the crowd',
  beam: 'Narrow blades cutting the haze',
  ledPar: 'Flat colour on the ramp and walls',
  classicPar: 'Hot tungsten glow, warm and slow',
  strobe: 'Fast flashes, slow-motion look',
  laser: 'Sharp lines drawn on the beat',
  blinder: 'Bright white straight at the crowd',
  fog: 'Haze so every beam is visible',
};

export const PATTERNS = [
  { id: 'figure8', label: 'Figure 8' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'circle', label: 'Circle' },
  { id: 'wave', label: 'Wave' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'lock', label: 'Locked' },
];

export const COLOR_MODES = [
  { id: 'theme', label: 'Theme' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'mono', label: 'Mono' },
  { id: 'warm', label: 'Warm' },
];

export const DIRECTIONS = [
  { id: 'cw', label: 'CW' },
  { id: 'ccw', label: 'CCW' },
  { id: 'pingpong', label: 'Ping-pong' },
];

const scene = (over = {}) => ({
  intensity: 85,
  speed: 55,
  contrast: 60,
  strobeRate: 40,
  laserDensity: 55,
  fogDensity: 50,
  beamWidth: 50,
  colorMode: 'theme',
  direction: 'cw',
  pattern: 'sweep',
  beatSync: true,
  blackout: false,
  fixtures: {
    spot: true,
    wash: true,
    beam: true,
    ledPar: true,
    classicPar: false,
    strobe: false,
    laser: false,
    blinder: false,
    fog: true,
  },
  ...over,
  fixtures: { ...{
    spot: true,
    wash: true,
    beam: true,
    ledPar: true,
    classicPar: false,
    strobe: false,
    laser: false,
    blinder: false,
    fog: true,
  }, ...(over.fixtures || {}) },
});

export const THEMES = [
  {
    id: 'dj-night',
    label: 'DJ Night',
    tagline: 'Full rig, everything moving, nothing subtle.',
    icon: '🎧',
    bpm: 128,
    accent: '#ff2d6f',
    palette: ['#ff2d6f', '#00e5ff', '#8b5cf6', '#ffd400', '#22ff88'],
    bg: ['#04040b', '#1a0430', '#05060f'],
    scene: scene({
      intensity: 100,
      speed: 82,
      contrast: 78,
      strobeRate: 62,
      laserDensity: 80,
      fogDensity: 70,
      beamWidth: 38,
      colorMode: 'rainbow',
      pattern: 'figure8',
      direction: 'cw',
      fixtures: { spot: true, wash: true, beam: true, ledPar: true, classicPar: false, strobe: true, laser: true, blinder: true, fog: true },
    }),
  },
  {
    id: 'party',
    label: 'Party',
    tagline: 'Warm colour, big washes, friendly chaos.',
    icon: '🪩',
    bpm: 112,
    accent: '#ff8a00',
    palette: ['#ff8a00', '#ff3d81', '#ffe066', '#38e8ff', '#b14cff'],
    bg: ['#0a0410', '#2a0a1c', '#07050d'],
    scene: scene({
      intensity: 92,
      speed: 62,
      contrast: 62,
      strobeRate: 30,
      laserDensity: 45,
      fogDensity: 55,
      beamWidth: 62,
      colorMode: 'theme',
      pattern: 'wave',
      direction: 'pingpong',
      fixtures: { spot: true, wash: true, beam: false, ledPar: true, classicPar: true, strobe: false, laser: true, blinder: true, fog: true },
    }),
  },
  {
    id: 'relax',
    label: 'Relax',
    tagline: 'Slow washes drifting across the salon.',
    icon: '🌊',
    bpm: 84,
    accent: '#3ddcff',
    palette: ['#3ddcff', '#5f6cff', '#28c2a0', '#9d7bff'],
    bg: ['#03060d', '#07203a', '#040a14'],
    scene: scene({
      intensity: 62,
      speed: 20,
      contrast: 38,
      strobeRate: 0,
      laserDensity: 12,
      fogDensity: 42,
      beamWidth: 78,
      colorMode: 'theme',
      pattern: 'breathe',
      direction: 'ccw',
      fixtures: { spot: false, wash: true, beam: false, ledPar: true, classicPar: false, strobe: false, laser: false, blinder: false, fog: true },
    }),
  },
  {
    id: 'focus',
    label: 'Focus',
    tagline: 'Clean, steady light. No flicker, no drama.',
    icon: '🎯',
    bpm: 96,
    accent: '#c8d6ff',
    palette: ['#c8d6ff', '#8fb3ff', '#e8f0ff', '#6f8bd6'],
    bg: ['#05070c', '#0d1526', '#04060b'],
    scene: scene({
      intensity: 70,
      speed: 8,
      contrast: 30,
      strobeRate: 0,
      laserDensity: 0,
      fogDensity: 18,
      beamWidth: 70,
      colorMode: 'mono',
      pattern: 'lock',
      direction: 'cw',
      beatSync: false,
      fixtures: { spot: true, wash: true, beam: false, ledPar: true, classicPar: false, strobe: false, laser: false, blinder: false, fog: true },
    }),
  },
  {
    id: 'sleep',
    label: 'Sleep',
    tagline: 'Almost dark. One slow amber breath.',
    icon: '🌙',
    bpm: 60,
    accent: '#ff9d5c',
    palette: ['#ff9d5c', '#b0562d', '#54307a', '#2b2352'],
    bg: ['#020306', '#0a0713', '#010203'],
    scene: scene({
      intensity: 30,
      speed: 6,
      contrast: 22,
      strobeRate: 0,
      laserDensity: 0,
      fogDensity: 30,
      beamWidth: 88,
      colorMode: 'warm',
      pattern: 'breathe',
      direction: 'ccw',
      beatSync: false,
      fixtures: { spot: false, wash: true, beam: false, ledPar: false, classicPar: true, strobe: false, laser: false, blinder: false, fog: true },
    }),
  },
  {
    id: 'priyanshu-list',
    label: 'Priyanshu List',
    tagline: 'The house selection — gold, magenta and a lot of laser.',
    icon: '👑',
    bpm: 120,
    accent: '#ffd54a',
    palette: ['#ffd54a', '#ff2fa0', '#00ffd0', '#7a5cff', '#ff5c2f'],
    bg: ['#06040a', '#231103', '#0a0410'],
    scene: scene({
      intensity: 96,
      speed: 70,
      contrast: 72,
      strobeRate: 48,
      laserDensity: 92,
      fogDensity: 66,
      beamWidth: 44,
      colorMode: 'theme',
      pattern: 'circle',
      direction: 'pingpong',
      fixtures: { spot: true, wash: true, beam: true, ledPar: true, classicPar: true, strobe: true, laser: true, blinder: true, fog: true },
    }),
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function defaultSceneFor(id) {
  const t = getTheme(id);
  return { ...t.scene, fixtures: { ...t.scene.fixtures } };
}
