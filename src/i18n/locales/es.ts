import type fr from './fr'

/**
 * Rioplatense Spanish (voseo). The `typeof fr` type is the lock: a forgotten or
 * misspelled key is a named compile error, not a missing string discovered on screen.
 */
const es: typeof fr = {
  app: {
    name: 'Sol de Mayo',
    title: 'Sol de Mayo',
    botAria: 'Sol de Mayo animado'
  },

  gallery: {
    back: 'Volver al reproductor'
  },

  rail: {
    nav: 'Secciones',
    customize: 'Personalizar',
    animations: 'Animaciones',
    settings: 'Ajustes'
  },

  panel: {
    animations: 'Animación',
    shape: 'Forma',
    expression: 'Expresión',
    expressionsMenu: 'Expresiones',
    color: 'Color'
  },

  export: {
    action: 'Exportar como PNG',
    more: 'Otros formatos',
    png: 'Descargar PNG',
    svg: 'Descargar SVG',
    animated: 'Descargar SVG animado',
    gif: 'Descargar GIF animado',
    cycleDetail: 'El video es más liviano y fluido; el GIF se ve en cualquier lado.',
    cycleFormat: 'Formato',
    cycle_mp4: 'Video MP4',
    cycle_mp4_help: 'Liviano y fluido, necesita fondo',
    cycle_gif: 'GIF animado',
    cycle_gif_help: 'Se ve en cualquier lado, más pesado',
    cycleProgress: 'Exportando…',
    cycleRetry: 'Reintentar',
    gifTitle: 'Descargar GIF animado',
    gifDetail:
      'En un GIF la transparencia es todo o nada: sin fondo, el borde de la bola queda un poco duro.',
    gifBackground: 'Fondo',
    background_white: 'Fondo blanco',
    background_white_help: 'Borde suave, para superficies claras',
    background_transparent: 'Fondo transparente',
    background_transparent_help: 'Va sobre cualquier fondo, borde un poco duro',
    gifConfirm: 'Descargar',
    copy: 'Copiar imagen',
    copySvg: 'Copiar SVG',
    done: 'Exportado',
    copied: 'Copiado',
    failed: 'No se pudo exportar'
  },

  sunrise: {
    start: 'Entrar'
  },

  preview: {
    exit: 'Salir de la vista previa',
    key: 'Esc'
  },

  timeline: {
    play: 'Reproducir',
    pause: 'Pausar',
    addAnimation: 'Agregar una animación',
    preview: 'Vista previa',
    export: 'Exportar el montaje',
    zoom: 'Zoom de la pista',
    blockAria: '{state}, {duration}',
    blockDurationAria: 'Duración de {state}, {duration}',
    blockRemoveAria: 'Quitar {state}'
  },

  dialog: {
    cancel: 'Cancelar',
    nameCreateTitle: 'Nuevo ciclo',
    nameRenameTitle: 'Renombrar ciclo',
    nameField: 'Nombre del ciclo',
    nameCreate: 'Crear',
    nameRename: 'Renombrar',
    removeTitle: '¿Borrar "{name}"?',
    removeDetail:
      'Se va a perder esta secuencia, con su animación. | Se va a perder esta secuencia, con sus {n} animaciones.',
    removeConfirm: 'Borrar'
  },

  cycles: {
    defaultName: 'Ciclo por defecto',
    newName: 'Mi ciclo',
    menuNew: 'Nuevo ciclo',
    menuRenameAria: 'Renombrar {name}',
    menuRemoveAria: 'Borrar {name}'
  },

  units: {
    seconds: '{n} s',
    secondsShort: '{n}s'
  },

  settings: {
    title: 'Ajustes',
    language: 'Idioma'
  },

  states: {
    idle: 'Reposo',
    thinking: 'Pensando',
    wink: 'Guiño',
    wide: 'Ojos grandes',
    alert: 'Alerta',
    notify: 'Notificación',
    exclaim: 'Exclamación',
    sleep: 'Dormido',
    egg: 'Huevo',
    hexagon: 'Hexágono',
    play: 'Play',
    orbit: 'Órbita',
    burst: 'Estallido',
    comet: 'Cometa',
    swirl: 'Remolino'
  },

  shapes: {
    circle: 'Círculo',
    pebble: 'Piedra',
    squircle: 'Squircle',
    capsule: 'Cápsula',
    triangle: 'Triángulo',
    hexagonal: 'Hexágono',
    cloud: 'Nube',
    droplet: 'Gota'
  },

  colors: {
    ink: 'Tinta',
    cream: 'Crema',
    brown: 'Marrón',
    red: 'Rojo',
    orange: 'Naranja',
    amber: 'Ámbar',
    green: 'Verde',
    turquoise: 'Turquesa',
    blue: 'Azul',
    violet: 'Violeta',
    rose: 'Rosa',
    gray: 'Gris'
  },

  expressions: {
    neutral: 'Neutral',
    attentive: 'Atento',
    surprised: 'Sorprendido',
    excited: 'Entusiasmado',
    happy: 'Feliz',
    hilarious: 'Risueño',
    angry: 'Enojado',
    sad: 'Triste',
    scared: 'Asustado',
    wary: 'Desconfiado',
    confused: 'Confundido',
    curious: 'Curioso',
    proud: 'Orgulloso',
    shy: 'Tímido',
    jaded: 'Indiferente',
    sleepy: 'Con sueño'
  }
}

export default es
