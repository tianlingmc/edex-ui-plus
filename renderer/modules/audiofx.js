import { Howl, Howler } from 'howler'

// 音效系统：复用原版 audiofx.class.js 的全部 13 种 wav（public/audio/ 下）。
// 安全架构下无 nodeIntegration，改用相对路径加载：
//   - 用 import.meta.env.BASE_URL 拼接，dev(http:// localhost/audio/...) 与打包后(file://./audio/...)
//     都能正确解析到 audio 目录（electron-vite 把 renderer/public/ 拷贝到产物根）。
//   - html5: true 让 Howler 用 <audio> 元素加载，规避 Web Audio(XHR) 在 file:// 下被浏览器拦截。
// 自动播放策略：浏览器要求用户手势后才能出声。这里用"即时播放 + 解锁"策略：
//   - 所有调用 play() 的地方直接尝试播放；若浏览器处于未交互状态，音频会自动被静默。
//   - 首次 pointerdown/keydown 时解锁 Howler（恢复 AudioContext），避免首次交互后仍Muted。
//   - 不采用"解锁后补播队列"：之前队列会造成音效集中爆发、延迟、错误感。
// 全局优化（本轮）：
//   - 主音量（setVolume）+ 每音效分级音量（SOUND_VOL），避免部分 UI 音效过响刺耳。
//   - 连击节流（SOUND_GAP）：键盘等高频事件若每键都播会叠成噪声，按音效设最小重触发间隔。
//   - play() 内解锁安全网：即使首次手势监听漏掉，也能在第一次播放时尝试恢复上下文。
const SOUND_NAMES = [
  'stdout', 'stdin', 'folder', 'granted', 'keyboard', 'theme',
  'expand', 'panels', 'scan', 'denied', 'info', 'alarm', 'error'
]

// 每音效基础音量（0~1），部分 UI 音效调低，避免刺耳
const SOUND_VOL = {
  stdout: 0.35, stdin: 0.30, folder: 0.50, granted: 0.50, keyboard: 0.30,
  theme: 0.55, expand: 0.55, panels: 0.40, scan: 0.40, denied: 0.60,
  info: 0.50, alarm: 0.70, error: 0.70
}

// 同一音效最小重触发间隔(ms)：0 表示不节流。键盘类设较小值，提示类设较大值避免连发轰炸
const SOUND_GAP = {
  stdin: 35, keyboard: 35, stdout: 30, panels: 120, scan: 200, folder: 60
}

function soundUrl(name) {
  const base = (import.meta.env && import.meta.env.BASE_URL) || './'
  // base 可能是 '/' 或 './'；统一成 './audio/x.wav' 或 '/audio/x.wav'
  return base.replace(/\/?$/, '') + '/audio/' + name + '.wav'
}

function loadSound(name) {
  try {
    return new Howl({
      src: [soundUrl(name)],
      preload: true,
      html5: true
      // 不加固定 volume：由 play() 按 SOUND_VOL * master 动态设置，避免双重乘算
    })
  } catch (e) {
    // 加载失败返回空操作对象，调用方无需判空
    return { play() {}, volume() {} }
  }
}

class Audiofx {
  constructor() {
    this.enabled = true
    this.master = 1.0
    this.amp = 1.4 // 干音整体放大因子
    this.sounds = {}
    this._last = {}
    SOUND_NAMES.forEach((name) => { this.sounds[name] = loadSound(name) })

    // 首次用户交互时解锁音频上下文（浏览器自动播放策略）
    const unlock = () => {
      this.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  unlock() {
    try {
      if (Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume()
    } catch (_) {}
  }

  play(name) {
    if (!this.enabled) return
    this.unlock() // 安全网：首次播放即尝试恢复上下文（html5 模式下 Howler.ctx 可能为 null，此处无害）
    const s = this.sounds[name]
    if (!s) return
    try {
      const gap = SOUND_GAP[name] || 0
      if (gap) {
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now()
        if (this._last[name] && (now - this._last[name]) < gap) return
        this._last[name] = now
      }
      const base = (SOUND_VOL[name] != null) ? SOUND_VOL[name] : 0.5
      s.volume(Math.min(1, base * this.amp)) // 乘 amp 整体放大，上限 1
      s.play()
    } catch (e) {
      console.warn('[audiofx] play failed:', name, e && e.message)
    }
  }

  // 全局静音/取消静音（通过 Howler 全局音量实现，不影响各音效自身音量）
  setEnabled(v) {
    this.enabled = !!v
    try { Howler.volume(this.enabled ? this.master : 0.0) } catch (_) {}
  }

  // 主音量 0~1（全局乘算），与 setEnabled 共用 Howler 全局音量通道
  setVolume(v) {
    this.master = Math.max(0, Math.min(1, v))
    if (this.enabled) { try { Howler.volume(this.master) } catch (_) {} }
  }
}

export const audiofx = new Audiofx()
