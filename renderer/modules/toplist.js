import { mountMod, esc, setText } from '../ui.js'
import { Modal } from './modal.js'
import { onTelemetry } from '../telemetry.js'

// 进程排行：CPU 占用前 5 + 可视化柱条。点击展开完整进程列表（带排序）。
export class Toplist {
  constructor(parentId) {
    const root = mountMod(parentId, 'mod_toplist', `
      <h1>TOP PROCESSES<i>PID | NAME | CPU | MEM</i></h1><br>
      <div id="mod_toplist_body"></div>`)
    this.body = root.querySelector('#mod_toplist_body')
    this.lastKey = null
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
        `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">
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

        /* ===== 表体 ===== */
        #mod_processList td {
          padding: 0.3vh 0.6vw;
          border-bottom: 0.04vh solid rgba(var(--color_r),var(--color_g),var(--color_b),0.04);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: 1.15vh;
          transition: background .08s ease;
        }
        #mod_processList .even td { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.015); }
        #mod_processList tr:hover td { background: rgba(var(--color_r),var(--color_g),var(--color_b),0.06); }

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
      </style>
      <div id="mod_processList">
        <table id="mod_processList_table">
          <thead><tr>${th('PID','PID')}${th('Name','Name')}${th('CPU','CPU')}${th('MEM','MEM')}${th('User','User')}${th('Runtime','Runtime')}</tr></thead>
          <tbody></tbody>
        </table>
      </div>`

    const modal = new Modal({
      type: 'custom',
      title: 'PROCESS LIST',
      html,
      onClose: () => { closed = true; if (timer) clearInterval(timer) }
    })

    setTimeout(() => {
      const modalEl = document.getElementById('mod_processList')
      if (!modalEl) return
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
}
