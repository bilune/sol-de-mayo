/**
 * Reference locale. The other two are typed `typeof fr`, so this file defines
 * the contract: adding a key here makes `tsc` fail on `en.ts` and `zh.ts` until
 * they are translated.
 *
 * Above all NO `as const`: each value would become its own literal type, and
 * every translation would then be rejected for not being the French string.
 *
 * Quotation marks and spaces are part of the translation, not of the code: French
 * wants « ... » with non-breaking spaces, English "...", Chinese has no space
 * before its units. No component must add them.
 */
export default {
  app: {
    /**
     * Product name. A proper noun, so it is not translated; the capitals of `NOM`
     * (App.tsx) are a logotype, not the name. `title` is used as `document.title`. See also the
     * static `metadata.title` in `app/layout.tsx`.
     */
    name: 'Sol de Mayo',
    title: 'Sol de Mayo — avatar SVG animé',
    botAria: 'Sol de Mayo animé'
  },

  gallery: {
    back: 'Retour au lecteur'
  },

  rail: {
    nav: 'Sections',
    customize: 'Personnaliser',
    animations: 'Animations',
    settings: 'Réglages'
  },

  panel: {
    /**
     * In the SINGULAR, like the other three: a grid title names what a click
     * sets, not the number of thumbnails offered. The plural stays on the rail,
     * which names the view and not the choice (`rail.animations`).
     */
    animations: 'Animation',
    shape: 'Forme',
    expression: 'Expression',
    expressionsMenu: 'Expressions',
    color: 'Couleur'
  },

  /**
   * Export bar of the Personnaliser view. The menu labels are ACTIONS and not
   * format names: « Télécharger le PNG » is understandable without knowing what a
   * PNG is, « PNG · 1024 px » asks the user to settle a question that is not
   * theirs.
   */
  export: {
    action: 'Exporter en PNG',
    more: 'Autres formats',
    png: 'Télécharger le PNG',
    svg: 'Télécharger le SVG',
    animated: "Télécharger l'animation SVG",
    gif: 'Télécharger le GIF animé',
    cycleDetail: 'La vidéo est plus légère et plus fluide ; le GIF passe partout.',
    cycleFormat: 'Format',
    cycle_mp4: 'Vidéo MP4',
    cycle_mp4_help: 'Léger et fluide, fond obligatoire',
    cycle_gif: 'GIF animé',
    cycle_gif_help: 'Lu partout, plus lourd',
    cycleProgress: 'Export en cours…',
    cycleRetry: 'Réessayer',
    gifTitle: 'Télécharger le GIF animé',
    gifDetail:
      "Le GIF ne gère la transparence qu'en tout ou rien : sans fond, le contour de la boule est un peu dur.",
    gifBackground: 'Fond',
    background_white: 'Fond blanc',
    background_white_help: 'Contour lisse, à poser sur du clair',
    background_transparent: 'Fond transparent',
    background_transparent_help: "S'adapte à tout fond, contour un peu dur",
    gifConfirm: 'Télécharger',
    copy: "Copier l'image",
    copySvg: 'Copier le SVG',
    done: 'Exporté',
    copied: 'Copié',
    failed: "Échec de l'export"
  },

  sunrise: {
    start: 'Entrer'
  },

  preview: {
    exit: "Quitter l'aperçu",
    /** Key name as engraved on the language's keyboard. */
    key: 'Échap'
  },

  timeline: {
    play: 'Lancer la lecture',
    pause: 'Arrêter la lecture',
    addAnimation: 'Ajouter une animation',
    preview: 'Aperçu',
    export: 'Exporter le montage',
    zoom: 'Zoom de la piste',
    blockAria: '{state}, {duration}',
    blockDurationAria: 'Durée de {state}, {duration}',
    blockRemoveAria: 'Retirer {state}'
  },

  dialog: {
    cancel: 'Annuler',
    nameCreateTitle: 'Nouveau cycle',
    nameRenameTitle: 'Renommer le cycle',
    nameField: 'Nom du cycle',
    nameCreate: 'Créer',
    nameRename: 'Renommer',
    removeTitle: 'Supprimer « {name} » ?',
    removeDetail:
      'Ce montage sera perdu, avec son animation. | Ce montage sera perdu, avec ses {n} animations.',
    removeConfirm: 'Supprimer'
  },

  cycles: {
    defaultName: 'Cycle par défaut',
    newName: 'Mon cycle',
    menuNew: 'Nouveau cycle',
    menuRenameAria: 'Renommer {name}',
    menuRemoveAria: 'Supprimer {name}'
  },

  units: {
    seconds: '{n} s',
    /** Ruler tick mark: tight, the number is already small. */
    secondsShort: '{n}s'
  },

  settings: {
    title: 'Réglages',
    language: 'Langue'
  },

  states: {
    idle: 'Repos',
    thinking: 'Réflexion',
    wink: "Clin d'œil",
    wide: 'Yeux écarquillés',
    alert: 'Alerte',
    notify: 'Notification',
    exclaim: 'Exclamation',
    sleep: 'Veille',
    egg: 'Œuf',
    hexagon: 'Hexagone',
    play: 'Lecture',
    orbit: 'Orbite',
    burst: 'Éclatement',
    comet: 'Comète',
    swirl: 'Tourbillon'
  },

  shapes: {
    circle: 'Cercle',
    pebble: 'Galet',
    squircle: 'Squircle',
    capsule: 'Capsule',
    triangle: 'Triangle',
    hexagonal: 'Hexagone',
    cloud: 'Nuage',
    droplet: 'Goutte'
  },

  colors: {
    ink: 'Encre',
    cream: 'Crème',
    brown: 'Brun',
    red: 'Rouge',
    orange: 'Orange',
    amber: 'Ambre',
    green: 'Vert',
    turquoise: 'Turquoise',
    blue: 'Bleu',
    violet: 'Violet',
    rose: 'Rose',
    gray: 'Gris'
  },

  expressions: {
    neutral: 'Neutre',
    attentive: 'Attentif',
    surprised: 'Surpris',
    excited: 'Excité',
    happy: 'Heureux',
    hilarious: 'Hilare',
    angry: 'En colère',
    sad: 'Triste',
    scared: 'Effrayé',
    wary: 'Méfiant',
    confused: 'Confus',
    curious: 'Curieux',
    proud: 'Fier',
    shy: 'Timide',
    jaded: 'Blasé',
    sleepy: 'Somnolent'
  }
}
