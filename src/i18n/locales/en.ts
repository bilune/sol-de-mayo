import type fr from './fr'

/**
 * The `typeof fr` type is the lock: a forgotten or misspelled key is a named
 * compile error, not a missing string discovered on screen.
 */
const en: typeof fr = {
  app: {
    name: 'Sol de Mayo',
    title: 'Sol de Mayo — animated SVG avatar',
    botAria: 'Animated Sol de Mayo'
  },

  gallery: {
    back: 'Back to the player'
  },

  rail: {
    nav: 'Sections',
    customize: 'Customise',
    animations: 'Animations',
    settings: 'Settings'
  },

  panel: {
    animations: 'Animation',
    shape: 'Shape',
    expression: 'Expression',
    expressionsMenu: 'Expressions',
    color: 'Colour'
  },

  export: {
    action: 'Export as PNG',
    more: 'Other formats',
    png: 'Download PNG',
    svg: 'Download SVG',
    animated: 'Download animated SVG',
    gif: 'Download animated GIF',
    cycleDetail: 'The video is lighter and smoother; the GIF plays anywhere.',
    cycleFormat: 'Format',
    cycle_mp4: 'MP4 video',
    cycle_mp4_help: 'Light and smooth, needs a background',
    cycle_gif: 'Animated GIF',
    cycle_gif_help: 'Plays anywhere, heavier',
    cycleProgress: 'Exporting…',
    cycleRetry: 'Try again',
    gifTitle: 'Download animated GIF',
    gifDetail:
      'GIF transparency is all-or-nothing: with no background, the ball\u2019s edge comes out a little hard.',
    gifBackground: 'Background',
    background_white: 'White background',
    background_white_help: 'Smooth edge, for light surfaces',
    background_transparent: 'Transparent background',
    background_transparent_help: 'Fits any background, edge a little hard',
    gifConfirm: 'Download',
    copy: 'Copy image',
    copySvg: 'Copy SVG',
    done: 'Exported',
    copied: 'Copied',
    failed: 'Export failed'
  },

  sunrise: {
    start: 'Enter'
  },

  preview: {
    exit: 'Exit preview',
    key: 'Esc'
  },

  timeline: {
    play: 'Start playback',
    pause: 'Stop playback',
    addAnimation: 'Add an animation',
    preview: 'Preview',
    export: 'Export the montage',
    zoom: 'Track zoom',
    blockAria: '{state}, {duration}',
    blockDurationAria: 'Duration of {state}, {duration}',
    blockRemoveAria: 'Remove {state}'
  },

  dialog: {
    cancel: 'Cancel',
    nameCreateTitle: 'New cycle',
    nameRenameTitle: 'Rename cycle',
    nameField: 'Cycle name',
    nameCreate: 'Create',
    nameRename: 'Rename',
    removeTitle: 'Delete "{name}"?',
    removeDetail:
      'This sequence will be lost, along with its animation. | This sequence will be lost, along with its {n} animations.',
    removeConfirm: 'Delete'
  },

  cycles: {
    defaultName: 'Default cycle',
    newName: 'My cycle',
    menuNew: 'New cycle',
    menuRenameAria: 'Rename {name}',
    menuRemoveAria: 'Delete {name}'
  },

  units: {
    seconds: '{n} s',
    secondsShort: '{n}s'
  },

  settings: {
    title: 'Settings',
    language: 'Language'
  },

  states: {
    idle: 'Idle',
    thinking: 'Thinking',
    wink: 'Wink',
    wide: 'Wide eyes',
    alert: 'Alert',
    notify: 'Notification',
    exclaim: 'Exclamation',
    sleep: 'Sleep',
    egg: 'Egg',
    hexagon: 'Hexagon',
    play: 'Play',
    orbit: 'Orbit',
    burst: 'Burst',
    comet: 'Comet',
    swirl: 'Swirl'
  },

  shapes: {
    circle: 'Circle',
    pebble: 'Pebble',
    squircle: 'Squircle',
    capsule: 'Capsule',
    triangle: 'Triangle',
    hexagonal: 'Hexagon',
    cloud: 'Cloud',
    droplet: 'Droplet'
  },

  colors: {
    ink: 'Ink',
    cream: 'Cream',
    brown: 'Brown',
    red: 'Red',
    orange: 'Orange',
    amber: 'Amber',
    green: 'Green',
    turquoise: 'Turquoise',
    blue: 'Blue',
    violet: 'Purple',
    rose: 'Pink',
    gray: 'Grey'
  },

  expressions: {
    neutral: 'Neutral',
    attentive: 'Attentive',
    surprised: 'Surprised',
    excited: 'Excited',
    happy: 'Happy',
    hilarious: 'Laughing',
    angry: 'Angry',
    sad: 'Sad',
    scared: 'Scared',
    wary: 'Suspicious',
    confused: 'Confused',
    curious: 'Curious',
    proud: 'Proud',
    shy: 'Shy',
    jaded: 'Unimpressed',
    sleepy: 'Sleepy'
  }
}

export default en
