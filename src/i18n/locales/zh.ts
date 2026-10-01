import type fr from './fr'

/**
 * Simplified Chinese. Three typographic differences carried by the translation
 * and not by the code:
 *
 * - full-width punctuation (， 。 ？ “ ”), including in templates;
 * - no plural: `removeDetail` has only one form, and the classifier `个` is
 *   mandatory before the counted noun;
 * - a thin space separates Latin digits from Chinese characters, except in the
 *   ruler tick marks where space is short.
 */
const zh: typeof fr = {
  app: {
    name: 'Sol de Mayo',
    title: 'Sol de Mayo — 动画 SVG 头像',
    botAria: 'Sol de Mayo 动画头像'
  },

  gallery: {
    back: '返回播放器'
  },

  rail: {
    nav: '版块',
    customize: '个性化',
    animations: '动画',
    settings: '设置'
  },

  panel: {
    animations: '动画',
    shape: '形状',
    expression: '表情',
    expressionsMenu: '表情',
    color: '颜色'
  },

  export: {
    action: '导出 PNG',
    more: '其他格式',
    png: '下载 PNG',
    svg: '下载 SVG',
    animated: '下载 SVG 动图',
    gif: '下载 GIF 动图',
    cycleDetail: '视频更轻更流畅；GIF 到处都能播放。',
    cycleFormat: '格式',
    cycle_mp4: 'MP4 视频',
    cycle_mp4_help: '轻巧流畅，必须有背景',
    cycle_gif: 'GIF 动图',
    cycle_gif_help: '到处可播，体积更大',
    cycleProgress: '正在导出…',
    cycleRetry: '重试',
    gifTitle: '下载 GIF 动图',
    gifDetail: 'GIF 的透明只有全有或全无：不加背景时，球体边缘会略显生硬。',
    gifBackground: '背景',
    background_white: '白色背景',
    background_white_help: '边缘平滑，适合浅色底',
    background_transparent: '透明背景',
    background_transparent_help: '适配任何背景，边缘略硬',
    gifConfirm: '下载',
    copy: '复制图片',
    copySvg: '复制 SVG',
    done: '已导出',
    copied: '已复制',
    failed: '导出失败'
  },

  sunrise: {
    start: '进入'
  },

  preview: {
    exit: '退出预览',
    key: 'Esc'
  },

  timeline: {
    play: '开始播放',
    pause: '停止播放',
    addAnimation: '添加动画',
    preview: '预览',
    export: '导出动画序列',
    zoom: '轨道缩放',
    blockAria: '{state}，{duration}',
    blockDurationAria: '{state} 的时长，{duration}',
    blockRemoveAria: '移除 {state}'
  },

  dialog: {
    cancel: '取消',
    nameCreateTitle: '新建序列',
    nameRenameTitle: '重命名序列',
    nameField: '序列名称',
    nameCreate: '创建',
    nameRename: '重命名',
    removeTitle: '删除“{name}”？',
    removeDetail: '该序列将被删除，其中包含的 {n} 个动画也将一并丢失。',
    removeConfirm: '删除'
  },

  cycles: {
    defaultName: '默认序列',
    newName: '我的序列',
    menuNew: '新建序列',
    menuRenameAria: '重命名 {name}',
    menuRemoveAria: '删除 {name}'
  },

  units: {
    seconds: '{n} 秒',
    secondsShort: '{n}秒'
  },

  settings: {
    title: '设置',
    language: '语言'
  },

  states: {
    idle: '静止',
    thinking: '思考',
    wink: '眨眼',
    wide: '睁大眼睛',
    alert: '警示',
    notify: '通知',
    exclaim: '感叹号',
    sleep: '休眠',
    egg: '蛋形',
    hexagon: '六边形',
    play: '播放',
    orbit: '轨道',
    burst: '爆散',
    comet: '彗星',
    swirl: '漩涡'
  },

  shapes: {
    circle: '圆形',
    pebble: '卵石',
    squircle: '圆角方形',
    capsule: '胶囊',
    triangle: '三角形',
    hexagonal: '六边形',
    cloud: '云朵',
    droplet: '水滴'
  },

  colors: {
    ink: '墨黑',
    cream: '奶油白',
    brown: '棕色',
    red: '红色',
    orange: '橙色',
    amber: '琥珀色',
    green: '绿色',
    turquoise: '青绿色',
    blue: '蓝色',
    violet: '紫色',
    rose: '粉色',
    gray: '灰色'
  },

  expressions: {
    neutral: '平静',
    attentive: '专注',
    surprised: '惊讶',
    excited: '兴奋',
    happy: '开心',
    hilarious: '大笑',
    angry: '生气',
    sad: '难过',
    scared: '害怕',
    wary: '怀疑',
    confused: '困惑',
    curious: '好奇',
    proud: '得意',
    shy: '羞怯',
    jaded: '无趣',
    sleepy: '困倦'
  }
}

export default zh
