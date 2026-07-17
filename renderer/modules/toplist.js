import { mountMod, esc, setText } from '../ui.js'
import { Modal } from './modal.js'
import { onTelemetry } from '../telemetry.js'
import { t } from '../locale.js'
import { audiofx } from './audiofx.js'

// 进程排行：CPU 占用前 5 + 可视化柱条。点击展开完整进程列表（带排序）。
export class Toplist {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_toplist', `
      <h1>TOP PROCESSES<i>PID | NAME | CPU | MEM</i></h1><br>
      <div id="mod_toplist_body"></div>`)
    this.body = root.querySelector('#mod_toplist_body')
    this.lastKey = null
    this._procCache = new Map()
    root.addEventListener('click', () => this.showProcessList())
    onTelemetry((d) => this.render(d))
  }

  render(d) {
    if (!d || !d.processes || !Array.isArray(d.processes.list)) return
    const list = d.processes.list.slice(0, 5)
    const key = list.map((p) => `${p.pid}:${Math.round(p.cpu * 10) / 10}:${Math.round(p.mem * 10) / 10}`).join('|')
    if (key === this.lastKey) return
    this.lastKey = key
    const maxCpu = Math.max(1, ...list.map((p) => p.cpu || 0))
    const maxMem = Math.max(1, ...list.map((p) => p.mem || 0))
    this.body.innerHTML = list.map((p) => {
      const cpu = Math.round(p.cpu * 10) / 10
      const mem = Math.round(p.mem * 10) / 10
      const cpuPct = Math.min(100, (cpu / maxCpu) * 100)
      const memPct = Math.min(100, (mem / maxMem) * 100)
      return `<div class="tp_row">
        <span class="tp_pid">${p.pid}</span>
        <span class="tp_name" title="${esc(p.name)}">${esc(p.name)}</span>
        <span class="tp_val">${cpu}%<span class="tp_bar"><span class="tp_fill tp_cpu" style="width:${cpuPct}%"></span></span></span>
        <span class="tp_val">${mem}%<span class="tp_bar"><span class="tp_fill tp_mem" style="width:${memPct}%"></span></span></span>
      </div>`
    }).join('')
  }

  // 弹出完整进程列表（带排序 + 柱条 + 自动刷新）
  async showProcessList() {
    if (document.getElementById('mod_processList')) return

    let sortKey = 'CPU'
    let ascending = false
    let timer = null
    let closed = false

    const fmt = (p) => {
      const cpu = (p.cpu != null) ? Math.round(p.cpu * 10) / 10 : 0
      const mem = (p.mem != null) ? Math.round(p.mem * 10) / 10 : 0
      let runtime = '--'
      if (p.started) {
        const ms = Date.now() - Date.parse(p.started)
        const s = Math.floor(ms / 1000)
        const m = Math.floor(s / 60)
        const h = Math.floor(m / 60)
        const d = Math.floor(h / 24)
        runtime = `${String(d).padStart(2,'0')}:${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
      }
      return { cpu, mem, runtime, name: p.name, pid: p.pid, user: p.user || '--' }
    }

    const renderTable = (list) => {
      const sorted = [...list].sort((a, b) => {
        let cmp = 0
        switch (sortKey) {
          case 'PID': cmp = a.pid - b.pid; break
          case 'Name': cmp = a.name.localeCompare(b.name); break
          case 'CPU': cmp = a.cpu - b.cpu; break
          case 'MEM': cmp = a.mem - b.mem; break
          case 'Runtime': cmp = a.runtime.localeCompare(b.runtime); break
          case 'User': cmp = a.user.localeCompare(b.user); break
        }
        return ascending ? cmp : -cmp
      })
      const tbody = document.querySelector('#mod_processList_table tbody')
      if (!tbody) return
      const maxC = Math.max(1, ...sorted.map((p) => p.cpu))
      const maxM = Math.max(1, ...sorted.map((p) => p.mem))
      tbody.innerHTML = sorted.slice(0, 200).map((p, i) =>
        `<tr class="${i % 2 === 0 ? 'even' : 'odd'}" data-pid="${p.pid}">
          <td>${p.pid}</td>
          <td><span title="${esc(p.name)}">${esc(p.name)}</span></td>
          <td><span class="pl_wrap"><span class="pl_bar"><span class="pl_fill pl_cpu" style="width:${Math.min(100, (p.cpu/maxC)*100)}%"></span></span><span class="pl_val">${p.cpu}%</span></span></td>
          <td><span class="pl_wrap"><span class="pl_bar"><span class="pl_fill pl_mem" style="width:${Math.min(100, (p.mem/maxM)*100)}%"></span></span><span class="pl_val">${p.mem}%</span></span></td>
          <td>${esc(p.user)}</td>
          <td>${p.runtime}</td>
        </tr>`
      ).join('')
      if (modal) modal.recenter()
    }

    const fetchAndRender = async () => {
      if (closed) return
      try {
        const raw = await window.eDEX.si('processes')
        if (!raw || !raw.list) return
        raw.list.forEach((p) => this._procCache.set(p.pid, p))
        const data = raw.list.filter((p) => p.name && p.state !== 'idle').slice(0, 500).map(fmt)
        renderTable(data)
      } catch (_) {}
    }

    const th = (label, key) =>
      `<th data-sort="${key}">${label}${sortKey === key ? (ascending ? ' ▲' : ' ▼') : ''}</th>`

    const html = `
      <style>
        #mod_processList {
          width: 66vw; max-height: 56vh; overflow-y: auto;
          font-size: 1.2vh; font-family: var(--font_main, 'Fira Mono');
          margin: 0 auto;
          border-top: 0.08vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.08);
        }
        #mod_processList table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        #mod_processList thead { display: table; width: 100%; table-layout: fixed; }
        #mod_processList tbody { display: block; overflow-y: auto; max-height: 48vh; width: 100%; }
        #mod_processList tr { display: table; width: 100%; table-layout: fixed; }

        /* ===== 表头 ===== */
        #mod_processList th {
          padding: 0.6vh 0.6vw;
          border-bottom: 0.12vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.3);
          font-size: 1.1vh; letter-spacing: 0.12vw;
          cursor: pointer; user-select: none;
          background: var(--color_light_black, #0b0e14);
          color: rgb(var(--color_r),var(--color_g),var(--color_b));
          font-weight: bold;
          transition: background .1s ease;
        }
        #mod_processList th:hover { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.08); }
        #mod_processList th:active { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.12); }
        #mod_processList th { text-shadow: 0 0 0.4vh rgba(var(--color_r),var(--color_g),var(--color_b),0.35); }

        /* ===== 表体 ===== */
        #mod_processList td {
          padding: 0.45vh 0.6vw;
          border-bottom: 0.04vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.04);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: 1.15vh;
          transition: background .08s ease;
        }
        #mod_processList .even td { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.015); }
        #mod_processList tr:hover td { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.06); }
        #mod_processList tr:hover td:first-child { box-shadow: inset 0.2vh 0 0 rgb(var(--color_r),var(--color_g),var(--color_b)); }

        /* ===== 列宽 ===== */
        #mod_processList th:nth-child(1),
        #mod_processList td:nth-child(1) { width: 6%; text-align: center; color: rgba(var(--color_r),var(--color_g),var(--color_b),0.35); font-size: 1.05vh; }
        #mod_processList th:nth-child(2),
        #mod_processList td:nth-child(2) { width: 24%; }
        #mod_processList th:nth-child(3),
        #mod_processList td:nth-child(3),
        #mod_processList th:nth-child(4),
        #mod_processList td:nth-child(4) { width: 19%; text-align: right; }
        #mod_processList th:nth-child(5),
        #mod_processList td:nth-child(5) { width: 12%; color: rgba(var(--color_r),var(--color_g),var(--color_b),0.4); }
        #mod_processList th:nth-child(6),
        #mod_processList td:nth-child(6) { width: 20%; text-align: center; font-size: 1.1vh; color: rgba(var(--color_r),var(--color_g),var(--color_b),0.7); }

        /* ===== 柱条 ===== */
        .pl_wrap { display: inline-flex; align-items: center; gap: 0.3vw; width: 100%; justify-content: flex-end; }
        .pl_bar { display: inline-block; width: 3vw; height: 0.5vh; background: rgba(var(--color_r),var(--color_g),var(--color_b),0.06); border-radius: 0.15vh; overflow: hidden; }
        .pl_fill { display: block; height: 100%; border-radius: 0.15vh; transition: width .4s ease; min-width: 2%; }
        .pl_cpu { background: linear-gradient(90deg, rgba(var(--color_r),var(--color_g),var(--color_b),0.5), rgb(var(--color_r),var(--color_g),var(--color_b))); }
        .pl_mem { background: linear-gradient(90deg, rgba(var(--color_r),var(--color_g),var(--color_b),0.15), rgba(var(--color_r),var(--color_g),var(--color_b),0.4)); }
        .pl_val { font-size: 1.15vh; min-width: 3.5vw; text-align: right; }

        /* ===== 滚动条 ===== */
        #mod_processList::-webkit-scrollbar { width: 3px; }
        #mod_processList::-webkit-scrollbar-thumb { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.15); border-radius: 2px; transition: background .2s; }
        #mod_processList::-webkit-scrollbar-thumb:hover { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.3); }
        #mod_processList::-webkit-scrollbar-track { background: transparent; }
        #mod_processList .pl_loading_row td { text-align:center; opacity:.5; padding:2vh 0; letter-spacing:.25vw; font-size:1.2vh; animation: pl_pulse 1s ease-in-out infinite; }
        @keyframes pl_pulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
      </style>
      <div id="mod_processList">
        <table id="mod_processList_table">
          <thead><tr>${th('PID','PID')}${th('Name','Name')}${th('CPU','CPU')}${th('MEM','MEM')}${th('User','User')}${th('Runtime','Runtime')}</tr></thead>
          <tbody><tr class="pl_loading_row"><td colspan="6">${esc(t('process_loading'))}</td></tr></tbody>
        </table>
      </div>`

    const modal = new Modal({
      type: 'custom',
      title: 'PROCESS LIST',
      html,
      onClose: () => { closed = true; audiofx.play('panels'); this._procCache.clear(); if (timer) clearInterval(timer) }
    })
    audiofx.play('panels')

    setTimeout(() => {
      const modalEl = document.getElementById('mod_processList')
      if (!modalEl) return
      // 行点击 → 打开对应 pid 的全屏进程详情页
      const tbody = modalEl.querySelector('#mod_processList_table tbody')
      if (tbody && !tbody.dataset.pdBound) {
        tbody.dataset.pdBound = '1'
        tbody.addEventListener('click', (e) => {
          const tr = e.target.closest('tr[data-pid]')
          if (!tr) return
          const pid = Number(tr.getAttribute('data-pid'))
          if (!isNaN(pid)) this.openProcessDetail(pid, this._procCache ? this._procCache.get(pid) : undefined)
        })
      }
      modalEl.querySelectorAll('th[data-sort]').forEach((th) => {
        th.addEventListener('click', () => {
          const k = th.getAttribute('data-sort')
          if (sortKey === k) ascending = !ascending
          else { sortKey = k; ascending = false }
          modalEl.querySelectorAll('th[data-sort]').forEach((t) => {
            const sk = t.getAttribute('data-sort')
            t.textContent = sk + (sortKey === sk ? (ascending ? ' ▲' : ' ▼') : '')
          })
          fetchAndRender()
        })
      })
    }, 100)

    await fetchAndRender()
    // 数据加载后重新居中
    modal.recenter()
    timer = setInterval(fetchAndRender, 3000)
  }

  // 打开指定 pid 的全屏进程详情页（仿设置页风格），每 2.5 秒刷新实时字段
  async openProcessDetail(pid, proc) {
    if (document.getElementById('process-detail-page')) return

    const page = document.createElement('div')
    page.id = 'process-detail-page'
    page.innerHTML = `
      <style>
        #process-detail-page {
          position: fixed; inset: 0; z-index: 99999;
          background: var(--color_light_black, #0b0e14);
          color: rgb(var(--color_r), var(--color_g), var(--color_b));
          font-family: var(--font_main, 'Fira Mono');
          display: flex; flex-direction: column;
          animation: pd_fadeIn .2s ease;
          clip-path: polygon(0 0, 100% 0, 100% 100%, 1.5vh 100%, 0 calc(100% - 1.5vh));
        }
        @keyframes pd_fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        #pd_header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.2vh 2vw;
          border-bottom: 0.12vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.2);
          flex-shrink: 0;
        }
        #pd_header h1 { font-size: 2.2vh; margin: 0; letter-spacing: 0.3vw; font-weight: bold; }
        #pd_header h1 i { opacity: 0.5; font-size: 1.4vh; font-style: normal; margin-left: 0.5vw; }
        #pd_header .pd_hint { font-size: 1.1vh; opacity: 0.4; letter-spacing: 0.1vw; }
        #pd_content { flex: 1; overflow-y: auto; padding: 1.5vh 2vw; }
        #pd_content::-webkit-scrollbar { width: 3px; }
        #pd_content::-webkit-scrollbar-thumb { background: rgba(var(--color_r), var(--color_g), var(--color_b), 0.2); border-radius: 2px; }
        #pd_content::-webkit-scrollbar-track { background: transparent; }
        .pd_row {
          display: flex; align-items: flex-start;
          padding: 0.6vh 0;
          border-bottom: 0.05vh solid rgba(var(--color_r), var(--color_g), var(--color_b), 0.04);
        }
        .pd_row:last-child { border-bottom: none; }
        .pd_label { width: 16vw; flex-shrink: 0; font-size: 1.25vh; font-weight: bold; opacity: 0.85; text-transform: uppercase; letter-spacing: .05vw; }
        .pd_value { flex: 1; font-size: 1.2vh; word-break: break-all; padding-left: 1vw; }
        .pd_value.mono { font-family: var(--font_main, 'Fira Mono'); white-space: pre-wrap; }
        .pd_empty { text-align: center; opacity: 0.6; font-size: 1.4vh; padding: 4vh 0; }
        .pd_loading { text-align:center; opacity:.5; padding:4vh 0; letter-spacing:.25vw; font-size:1.3vh; animation: pd_pulse 1s ease-in-out infinite; }
        @keyframes pd_pulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
        .pd_group { font-size:1.05vh; letter-spacing:.3vw; text-transform:uppercase; opacity:.45; margin:1.4vh 0 .5vh; border-bottom:0.05vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.12); padding-bottom:.3vh; }
        .pd_row { border-left:0.2vh solid transparent; transition: background .1s ease, border-color .1s ease; }
        .pd_row:hover { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.04); border-left-color: rgb(var(--color_r),var(--color_g),var(--color_b)); }
      </style>
      <div id="pd_header">
        <h1>${t('process_detail_title')}<i>PID ${pid}</i></h1>
        <span class="pd_hint">${t('esc_close')}</span>
      </div>
      <div id="pd_content"><div class="pd_loading">${esc(t('process_loading'))}</div></div>`
    document.body.appendChild(page)
    audiofx.play('panels')

    let timer = null
    let closed = false

    // 字节转人类可读（B/KB/MB/GB/TB）
    const fmtBytes = (b) => {
      const n = Number(b)
      if (!isFinite(n) || n <= 0) return '--'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let i = 0, v = n
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return (i === 0 ? v : Math.round(v * 100) / 100) + ' ' + units[i]
    }
    // 启动时间转本地可读字符串
    const fmtTime = (started) => {
      if (!started) return '--'
      const dt = (started instanceof Date) ? started : new Date(started)
      if (isNaN(dt.getTime())) return '--'
      return dt.toLocaleString()
    }
    // 运行时长：当前时间 - 启动时间
    const fmtRuntime = (started) => {
      if (!started) return '--'
      const t0 = (started instanceof Date) ? started.getTime() : Date.parse(started)
      const ms = Date.now() - t0
      if (!isFinite(ms) || ms < 0) return '--'
      const s = Math.floor(ms / 1000)
      const m = Math.floor(s / 60)
      const h = Math.floor(m / 60)
      const d = Math.floor(h / 24)
      return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm ' + (s % 60) + 's'
    }
    const val = (v) => (v === null || v === undefined || v === '') ? '--' : v
    const row = (label, value, mono) => `
      <div class="pd_row">
        <div class="pd_label">${esc(label)}</div>
        <div class="pd_value${mono ? ' mono' : ''}">${esc(String(val(value)))}</div>
      </div>`
    const group = (title) => '<div class="pd_group">' + esc(title) + '</div>'

    const render = async (initial) => {
      if (closed) return
      const content = page.querySelector('#pd_content')
      if (!content) return
      let p = initial
      if (!p) {
        try {
          const raw = await window.eDEX.si('processes')
          if (!raw || !raw.list) return
          p = raw.list.find((x) => x.pid === pid)
        } catch (_) { return }
      }
      if (!p) {
        content.innerHTML = '<div class="pd_empty">' + esc(t('process_not_found')) + '</div>'
        return
      }
      content.innerHTML = [
        group(t('process_group_identity')),
        row(t('process_pid'), p.pid),
        row(t('process_ppid'), p.parentPid),
        row(t('process_name'), p.name),
        row(t('process_user'), p.user),
        group(t('process_group_resources')),
        row(t('process_cpu'), p.cpu != null ? (Math.round(p.cpu * 10) / 10) + '%' : null),
        row(t('process_mem'), p.mem != null ? (Math.round(p.mem * 10) / 10) + '%' : null),
        row(t('process_mem_rss'), fmtBytes(p.memRss)),
        row(t('process_mem_vsz'), fmtBytes(p.memVsz)),
        row(t('process_priority'), p.priority),
        row(t('process_state'), p.state),
        row(t('process_threads'), p.threads),
        group(t('process_group_runtime')),
        row(t('process_cmd'), p.command, true),
        row(t('process_path'), p.path, true),
        row(t('process_started'), fmtTime(p.started)),
        row(t('process_runtime'), fmtRuntime(p.started))
      ].join('')
    }

    const closeDetail = () => {
      if (closed) return
      closed = true
      if (timer) clearInterval(timer)
      window.removeEventListener('keydown', onKey, true)
      audiofx.play('panels')
      page.remove()
    }

    // ESC：在 window 捕获阶段拦截，阻止冒泡到全局 ESC 处理（避免误关底层的 PROCESS LIST 模态框）
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closeDetail()
    }
    window.addEventListener('keydown', onKey, true)

    if (proc) render(proc)
    else await render()
    timer = setInterval(() => render(), 2500)
  }
}
