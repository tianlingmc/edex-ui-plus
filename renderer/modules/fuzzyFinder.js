// 命令面板 / 模糊查找器（原 fuzzyFinder.class.js 简化版，安全架构）
// Ctrl+Shift+F 唤起：列出可用命令（主题切换）与文件（按路径插入终端），
// 输入即时过滤，方向键选择，回车执行。文件插入经 TerminalManager 写入当前终端。

import { Modal } from './modal.js'
import { THEME_NAMES, setTheme, nextTheme } from '../theme.js'
import { getTerminalManager } from './terminalManager.js'

export class FuzzyFinder {
  constructor() {
    if (document.getElementById('fuzzyFinder')) return
    this.commands = []
    this.selected = 0
    this.buildBaseCommands()
    const m = new Modal({
      type: 'custom',
      title: 'COMMAND PALETTE',
      width: 560,
      html: `
        <input type="search" id="fuzzyFinder" placeholder="输入命令或文件名..." autocomplete="off" spellcheck="false" />
        <ul id="fuzzyFinder-results"></ul>`,
      buttons: [{ label: 'Run', onClick: () => this.submit() }]
    })
    this.modal = m
    this.input = m.bodyEl.querySelector('#fuzzyFinder')
    this.results = m.bodyEl.querySelector('#fuzzyFinder-results')
    this.input.addEventListener('input', () => { this.selected = 0; this.render() })
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.render()
    this.loadFiles()
    setTimeout(() => this.input.focus(), 30)
  }

  buildBaseCommands() {
    this.commands = [
      { label: 'Theme: cycle to next', run: () => setTheme(nextTheme()) }
    ]
    THEME_NAMES.forEach((name) => {
      this.commands.push({ label: `Theme: ${name}`, run: () => setTheme(name) })
    })
  }

  async loadFiles() {
    try {
      const home = await window.eDEX.fsGetHome()
      const addDir = async (rel) => {
        const entries = await window.eDEX.fsReadDir(home + '/' + rel)
        entries.slice(0, 150).forEach((e) => {
          const path = home + '/' + rel + '/' + e.name
          this.commands.push({
            label: `Insert path: ${rel}/${e.name}`,
            detail: e.isDir ? 'dir' : 'file',
            run: () => {
              const tm = getTerminalManager()
              if (tm) tm.sendInput(`'${path.replace(/'/g, "''")}'`)
            }
          })
        })
      }
      await addDir('')
      try { await addDir('Music') } catch (_) {}
      try { await addDir('Documents') } catch (_) {}
    } catch (e) {
      console.warn('[fuzzy] file index failed', e.message)
    }
    this.render()
  }

  filtered() {
    const q = this.input.value.trim().toLowerCase()
    if (!q) return this.commands
    return this.commands.filter((c) => c.label.toLowerCase().includes(q))
  }

  render() {
    const list = this.filtered()
    if (list.length === 0) {
      this.results.innerHTML = `<li class="fuzzy_empty">无匹配</li>`
      return
    }
    if (this.selected >= list.length) this.selected = list.length - 1
    if (this.selected < 0) this.selected = 0
    // 复用原版 mod_fuzzyFinder.css：选中项加 .fuzzyFinderMatchSelected
    this.results.innerHTML = list.map((c, i) => `
      <li class="${i === this.selected ? 'fuzzyFinderMatchSelected' : ''}" data-i="${i}">
        <span>${this.esc(c.label)}</span>
        ${c.detail ? `<i>${c.detail}</i>` : ''}
      </li>`).join('')
    this.results.querySelectorAll('li[data-i]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selected = Number(el.dataset.i)
        this.submit()
      })
      el.addEventListener('mousemove', () => {
        this.selected = Number(el.dataset.i)
        this.render()
      })
    })
  }

  onKey(e) {
    const list = this.filtered()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        this.selected = Math.min(list.length - 1, this.selected + 1)
        this.render()
        break
      case 'ArrowUp':
        e.preventDefault()
        this.selected = Math.max(0, this.selected - 1)
        this.render()
        break
      case 'Enter':
        e.preventDefault()
        this.submit()
        break
      case 'Escape':
        e.preventDefault()
        this.modal.close()
        break
      default:
    }
  }

  submit() {
    const list = this.filtered()
    const cmd = list[this.selected]
    if (cmd && cmd.run) {
      try { cmd.run() } catch (e) { console.error('[fuzzy] run error', e) }
    }
    this.modal.close()
  }

  esc(s) {
    return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}
