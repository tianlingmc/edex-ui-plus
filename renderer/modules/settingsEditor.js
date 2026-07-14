// 全屏独立设置页面（单次 ESC 打开/关闭）
// 支持 简体中文 / English 双语界面

import { esc } from '../ui.js'
import { t, currentLang } from '../locale.js'

let _isOpen = false

function boolOpt(id, val) {
  return `<select class="se_select" id="${id}"><option value="true" ${val === true ? 'selected' : ''}>true</option><option value="false" ${val !== true ? 'selected' : ''}>false</option></select>`
}

function field(key, label, desc, inputHtml) {
  return `<div class="se_row"><div class="se_label"><span class="se_key">${esc(label)}</span><span class="se_desc">${esc(desc)}</span></div><div class="se_input">${inputHtml}</div></div>`
}

function section(title) {
  return `<div class="se_section"><h2 class="se_section_title">${esc(title)}</h2></div>`
}

// 校验单个字段
function validate(id, rules) {
  const el = document.getElementById(id)
  if (!el) return ''
  const raw = el.tagName === 'SELECT' ? el.value : el.value
  if (!rules) return raw
  let val = raw
  if (rules.type === 'int') {
    const n = parseInt(raw, 10)
    if (isNaN(n)) return rules.default
    val = Math.max(rules.min ?? -Infinity, Math.min(rules.max ?? Infinity, n))
    if (rules.allowed && !rules.allowed.includes(val)) val = rules.default
    el.value = val
  } else if (rules.type === 'float') {
    const n = parseFloat(raw)
    if (isNaN(n)) return rules.default
    val = Math.max(rules.min ?? -Infinity, Math.min(rules.max ?? Infinity, n))
    el.value = val
  } else if (rules.type === 'bool') {
    val = raw === 'true'
  } else if (rules.type === 'str') {
    val = raw.trim() || (rules.default ?? '')
    el.value = val
  }
  return val
}

export function openSettings() {
  if (_isOpen) return
  _isOpen = true
  window.__settingsOpen = true

  Promise.all([
    window.eDEX.readSettings(),
    window.eDEX.getAvailableShells().catch(() => ({ shells: [] }))
  ]).then(([{ settings, themes, keyboards }, shellsResult]) => {
    const shells = (shellsResult && shellsResult.shells) || []
    const s = settings || {}
    const lang = s.language || 'zh'

    // 构建终端类型下拉选项
    const shellOptions = (shells || []).map((sh) =>
      `<option value="${esc(sh.id)}" ${(s.defaultTermShell === sh.id) ? 'selected' : ''}>${esc(sh.label)}</option>`
    ).join('')
    const defaultShellHtml = `<select class="se_select" id="se-defaultTermShell"><option value="" ${!s.defaultTermShell ? 'selected' : ''}>Auto (first available)</option>${shellOptions}</select>`

    // ===== 配置项分组 =====
    const terminal = section(t('nav_terminal')) +
      field('shell', t('shell'), t('shell_desc'), `<input type="text" id="se-shell" value="${esc(s.shell || '')}">`) +
      field('cwd', t('cwd'), t('cwd_desc'), `<input type="text" id="se-cwd" value="${esc(s.cwd || '')}">`) +
      field('termFontSize', t('termFontSize'), t('termFontSize_desc'), `<input type="number" id="se-termFontSize" value="${s.termFontSize || 15}" min="8" max="48">`) +
      field('cursorBlink', t('cursorBlink'), t('cursorBlink_desc'), boolOpt('se-cursorBlink', s.cursorBlink !== false)) +
      field('cursorStyle', t('cursorStyle'), t('cursorStyle_desc'), `<select class="se_select" id="se-cursorStyle"><option value="block" ${(s.cursorStyle||'block')==='block'?'selected':''}>Block</option><option value="underline" ${s.cursorStyle==='underline'?'selected':''}>Underline</option><option value="bar" ${s.cursorStyle==='bar'?'selected':''}>Bar</option></select>`) +
      field('scrollback', t('scrollback'), t('scrollback_desc'), `<input type="number" id="se-scrollback" value="${s.scrollback || 1000}" min="100" max="100000" step="100">`) +
      field('lineHeight', t('lineHeight'), t('lineHeight_desc'), `<input type="number" id="se-lineHeight" value="${s.lineHeight || 1.2}" min="1.0" max="2.0" step="0.1">`) +
      field('letterSpacing', t('letterSpacing'), t('letterSpacing_desc'), `<input type="number" id="se-letterSpacing" value="${s.letterSpacing || 0}" min="0" max="10" step="1">`) +
      field('newTermPrompt', t('newTermPrompt'), t('newTermPrompt_desc'), boolOpt('se-newTermPrompt', s.newTermPrompt !== false)) +
      field('defaultTermShell', t('defaultTermShell'), t('defaultTermShell_desc'), defaultShellHtml) +
      field('closeTermPrompt', t('closeTermPrompt'), t('closeTermPrompt_desc'), boolOpt('se-closeTermPrompt', s.closeTermPrompt !== false))

    const display = section(t('nav_display')) +
      field('theme', t('theme'), t('theme_desc'), `<input type="text" id="se-theme" value="${esc(s.theme || '')}" list="se-theme-list"><datalist id="se-theme-list">${(themes || []).map((t) => `<option>${esc(t)}</option>`).join('')}</datalist>`) +
      field('keyboard', t('keyboard'), t('keyboard_desc'), `<input type="text" id="se-keyboard" value="${esc(s.keyboard || '')}" list="se-kb-list"><datalist id="se-kb-list">${(keyboards || []).map((k) => `<option>${esc(k)}</option>`).join('')}</datalist>`) +
      field('clockHours', t('clockHours'), t('clockHours_desc'), `<select class="se_select" id="se-clockHours"><option value="24" ${s.clockHours === 24 ? 'selected' : ''}>${t('hour24')}</option><option value="12" ${s.clockHours === 12 ? 'selected' : ''}>${t('hour12')}</option></select>`) +
      field('language', t('lang_label'), t('lang_desc'), `<select class="se_select" id="se-language"><option value="zh" ${lang === 'zh' ? 'selected' : ''}>简体中文</option><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option></select>`) +
      field('bootLogo', t('bootLogo'), t('bootLogo_desc'), `<input type="text" id="se-bootLogo" value="${esc(s.bootLogo || 'eDEX-UI-Plus')}">`)

    const audio = section(t('nav_audio')) +
      field('audio', t('audio'), t('audio_desc'), boolOpt('se-audio', s.audio)) +
      field('audioVolume', t('audioVolume'), t('audioVolume_desc'), `<input type="number" id="se-audioVolume" value="${s.audioVolume || 1.0}" min="0" max="1" step="0.1">`) +
      field('audioAmp', t('audioAmp'), t('audioAmp_desc'), `<input type="number" id="se-audioAmp" value="${s.audioAmp || 1.4}" min="0.5" max="3.0" step="0.1">`)

    const file = section(t('nav_file')) +
      field('hideDotfiles', t('hideDotfiles'), t('hideDotfiles_desc'), boolOpt('se-hideDotfiles', s.hideDotfiles)) +
      field('fsListView', t('fsListView'), t('fsListView_desc'), boolOpt('se-fsListView', s.fsListView)) +
      field('animSpeed', t('animSpeed'), t('animSpeed_desc'), `<select class="se_select" id="se-animSpeed"><option value="0" ${s.animSpeed === 0 || s.animSpeed === '0' ? 'selected' : ''}>${t('animOff')}</option><option value="12" ${s.animSpeed === 12 || s.animSpeed === '12' ? 'selected' : ''}>${t('animFast')}</option><option value="25" ${(s.animSpeed === 25 || s.animSpeed === '25' || s.animSpeed == null) ? 'selected' : ''}>${t('animNormal')}</option><option value="50" ${s.animSpeed === 50 || s.animSpeed === '50' ? 'selected' : ''}>${t('animSlow')}</option></select>`)

    const network = section(t('nav_network')) +
      field('pingAddr', t('pingAddr'), t('pingAddr_desc'), `<input type="text" id="se-pingAddr" value="${esc(s.pingAddr || '1.1.1.1')}">`)

    const html = `
<div id="settings-page">
  <style>
    #settings-page {
      position: fixed; inset: 0; z-index: 99999;
      background: var(--color_light_black, #0b0e14);
      color: rgb(var(--color_r), var(--color_g), var(--color_b));
      font-family: var(--font_main, 'Fira Mono');
      display: flex; flex-direction: column;
      animation: se_fadeIn .2s ease;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 1.5vh 100%, 0 calc(100% - 1.5vh));
    }
    @keyframes se_fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
    #se_header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.2vh 2vw;
      border-bottom: 0.12vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.2);
      flex-shrink: 0;
    }
    #se_header h1 { font-size: 2.2vh; margin: 0; letter-spacing: 0.3vw; font-weight: bold; }
    #se_header h1 i { opacity: 0.5; font-size: 1.4vh; font-style: normal; margin-left: 0.5vw; }
    #se_header .se_hint { font-size: 1.1vh; opacity: 0.4; letter-spacing: 0.1vw; }
    #se_body { display: flex; flex: 1; overflow: hidden; }
    #se_nav {
      width: 14vw; flex-shrink: 0;
      padding: 1.5vh 0.8vw;
      border-right: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.12);
      overflow-y: auto;
    }
    #se_nav .se_nav_item {
      padding: 0.7vh 0.6vw; margin-bottom: 0.3vh;
      font-size: 1.3vh; cursor: pointer;
      border-left: 0.2vh solid transparent;
      transition: all .12s ease; opacity: 0.6;
    }
    #se_nav .se_nav_item:hover { opacity: 0.9; }
    #se_nav .se_nav_item.active {
      opacity: 1; border-left-color: rgb(var(--color_r), var(--color_g), var(--color_b));
      background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.06);
    }
    #se_content { flex: 1; overflow-y: auto; padding: 1.5vh 2vw; }
    #se_content::-webkit-scrollbar { width: 3px; }
    #se_content::-webkit-scrollbar-thumb { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.2); border-radius: 2px; }
    #se_content::-webkit-scrollbar-track { background: transparent; }
    .se_section_title {
      font-size: 1.5vh; font-weight: bold; margin: 1.2vh 0 0.8vh 0;
      padding-bottom: 0.4vh; border-bottom: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
      letter-spacing: 0.15vw;
    }
    .se_row {
      display: flex; align-items: center;
      padding: 0.5vh 0;
      border-bottom: 0.05vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.04);
    }
    .se_row:last-child { border-bottom: none; }
    .se_label { width: 16vw; flex-shrink: 0; display: flex; flex-direction: column; }
    .se_label .se_key { font-size: 1.25vh; font-weight: bold; }
    .se_label .se_desc { font-size: 1.0vh; opacity: 0.45; margin-top: 0.1vh; }
    .se_input { flex: 1; text-align: right; }
    .se_input input, .se_input select {
      background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.06);
      color: rgb(var(--color_r), var(--color_g), var(--color_b));
      border: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.18);
      padding: 0.3vh 0.5vw; font-size: 1.2vh; font-family: var(--font_main);
      width: 60%; box-sizing: border-box; border-radius: 0.15vh;
      transition: border-color .12s ease;
    }
    .se_input input:focus, .se_input select:focus {
      outline: none; border-color: rgb(var(--color_r), var(--color_g), var(--color_b));
      background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.1);
    }
    .se_input input[type="number"] { width: 8vw; }
    .se_input select { cursor: pointer; }
    .se_input .se_invalid { border-color: rgb(230,60,60) !important; }
    #se_footer {
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      padding: 1vh 2vw; border-top: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.15);
      gap: 1.5vw;
    }
    #se_footer button {
      background: rgb(var(--color_r), var(--color_g), var(--color_b));
      color: var(--color_light_black); border: none; padding: 0.6vh 2.5vw;
      font-size: 1.4vh; font-family: var(--font_main);
      cursor: pointer; font-weight: bold; letter-spacing: 0.1vw;
      transition: opacity .12s ease;
      clip-path: polygon(0.4vh 0, 100% 0, 100% 100%, 0 100%, 0 0.4vh);
    }
    #se_footer button:hover { opacity: 0.85; }
    #se_footer button:active { opacity: 0.6; }
    #se_footer .se_status { font-size: 1.1vh; min-height: 1.4vh; }
    #se_footer .se_status.error { color: rgb(230, 60, 60); }
    #se_footer .se_status.ok { color: rgb(var(--color_r), var(--color_g), var(--color_b)); }
    #se_footer #se-reset-btn {
      background: transparent;
      color: rgb(var(--color_r), var(--color_g), var(--color_b));
      border: 0.08vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.3);
      padding: 0.6vh 1.5vw;
      font-size: 1.2vh; font-family: var(--font_main);
      cursor: pointer; letter-spacing: 0.1vw;
      transition: all .12s ease;
      clip-path: polygon(0.4vh 0, 100% 0, 100% 100%, 0 100%, 0 0.4vh);
    }
    #se_footer #se-reset-btn:hover { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.1); border-color: rgb(var(--color_r), var(--color_g), var(--color_b)); }
  </style>
  <div id="se_header">
    <h1>${t('settings_title')}<i>eDEX-UI-Plus</i></h1>
    <span class="se_hint">${t('esc_close')}</span>
  </div>
  <div id="se_body">
    <div id="se_nav">
      <div class="se_nav_item active" data-section="terminal">${t('nav_terminal')}</div>
      <div class="se_nav_item" data-section="display">${t('nav_display')}</div>
      <div class="se_nav_item" data-section="audio">${t('nav_audio')}</div>
      <div class="se_nav_item" data-section="file">${t('nav_file')}</div>
      <div class="se_nav_item" data-section="network">${t('nav_network')}</div>
    </div>
    <div id="se_content">
      ${terminal}${display}${audio}${file}${network}
    </div>
  </div>
  <div id="se_footer">
    <button id="se-reset-btn">${t('reset_defaults')}</button>
    <button id="se-save-btn">${t('save')}</button>
    <span id="se_status" class="se_status"></span>
  </div>
</div>`

    const existing = document.getElementById('settings-page')
    if (existing) existing.remove()
    document.body.insertAdjacentHTML('beforeend', html)

    // 分类导航点击跳转
    document.querySelectorAll('.se_nav_item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.se_nav_item').forEach((n) => n.classList.remove('active'))
        item.classList.add('active')
        const target = item.getAttribute('data-section')
        document.querySelectorAll('#se_content .se_section_title').forEach((t) => {
          if (t.textContent.trim().toLowerCase() === target.toLowerCase()) {
            t.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      })
    })

    // 校验规则定义（save + reset 共用）
    const rules = {
      'se-shell': { type: 'str', default: (window.eDEX && window.eDEX.platform === 'win32') ? 'powershell.exe' : 'bash' },
      'se-cwd': { type: 'str', default: '' },
      'se-termFontSize': { type: 'int', min: 8, max: 48, default: 15 },
      'se-cursorBlink': { type: 'bool', default: true },
      'se-cursorStyle': { type: 'str', default: 'block' },
      'se-scrollback': { type: 'int', min: 100, max: 100000, default: 1000 },
      'se-lineHeight': { type: 'float', min: 1.0, max: 2.0, default: 1.2 },
      'se-letterSpacing': { type: 'int', min: 0, max: 10, default: 0 },
      'se-theme': { type: 'str', default: 'tron' },
      'se-keyboard': { type: 'str', default: 'en-US' },
      'se-clockHours': { type: 'int', allowed: [12, 24], default: 24 },
      'se-language': { type: 'str', default: 'zh' },
      'se-bootLogo': { type: 'str', default: 'eDEX-UI-Plus' },
      'se-audio': { type: 'bool', default: true },
      'se-audioVolume': { type: 'float', min: 0, max: 1, default: 1.0 },
      'se-audioAmp': { type: 'float', min: 0.5, max: 3.0, default: 1.4 },
      'se-hideDotfiles': { type: 'bool', default: false },
      'se-fsListView': { type: 'bool', default: false },
      'se-animSpeed': { type: 'int', allowed: [0, 12, 25, 50], default: 25 },
      'se-pingAddr': { type: 'str', default: '1.1.1.1' },
      'se-newTermPrompt': { type: 'bool', default: true },
      'se-defaultTermShell': { type: 'str', default: '' },
      'se-closeTermPrompt': { type: 'bool', default: true }
    }

    // 恢复默认配置按钮
    document.getElementById('se-reset-btn').addEventListener('click', () => {
      const statusEl = document.getElementById('se_status')
      for (const [id, rule] of Object.entries(rules)) {
        const el = document.getElementById(id)
        if (!el) continue
        const defVal = rule.default ?? ''
        el.value = typeof defVal === 'boolean' ? String(defVal) : String(defVal)
      }
      statusEl.className = 'se_status ok'
      statusEl.textContent = t('reset_done')
      setTimeout(() => { if (statusEl) statusEl.textContent = '' }, 2000)
    })

    // Save 按钮：带前端校验
    document.getElementById('se-save-btn').addEventListener('click', async () => {
      const statusEl = document.getElementById('se_status')

      const data = {}
      let hasError = false
      for (const [id, rule] of Object.entries(rules)) {
        const val = validate(id, rule)
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '' && rule.type !== 'str')) {
          // 空值还原默认
          data[id.replace('se-', '')] = rule.default ?? ''
        } else {
          data[id.replace('se-', '')] = val
        }
      }

      if (hasError) {
        statusEl.className = 'se_status error'
        statusEl.textContent = t('saveFailed')
        return
      }

      try {
        const ok = await window.eDEX.writeSettings(data)
        if (ok) {
          window.__edexSettings = data
          statusEl.className = 'se_status ok'
          statusEl.textContent = t('saved')
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('settings-hot-reload', { detail: data }))
            closeSettings()
          }, 400)
        } else {
          statusEl.className = 'se_status error'
          statusEl.textContent = t('saveFailed')
        }
      } catch (e) {
        statusEl.className = 'se_status error'
        statusEl.textContent = t('error') + (e.message || e)
      }
    })

  }).catch((e) => {
    console.error('[settingsEditor] load error:', e)
    _isOpen = false; window.__settingsOpen = false
  })
}

export function closeSettings() {
  if (!_isOpen) return
  _isOpen = false; window.__settingsOpen = false
  const el = document.getElementById('settings-page')
  if (el) el.remove()
}
