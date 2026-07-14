// 文档阅读器（原 docReader.class.js 的忠实移植，安全架构）
// 原版在文件浏览器里双击 PDF 时弹出自定义模态框（.pdf_options / .pdf_container / .pdf_canvas），
// 再由 DocReader 类用 pdfjs 渲染页面；这里复刻同一套 DOM 与交互，样式复用原版 filesystem.css / modal.css。
// 安全架构：PDF 字节经 window.eDEX.fsReadFile IPC 取得，pdfjs 经 Vite 动态导入（缺失时给出友好提示）。

import { Modal } from './modal.js'
import icons from '../assets/icons/media-icons.json'

const ICONCOLOR = 'rgb(var(--color_r), var(--color_g), var(--color_b))'

function iconSvg(name) {
  const ic = icons[name]
  if (!ic) return ''
  return `<svg viewBox="0 0 ${ic.width} ${ic.height}" fill="${ICONCOLOR}">${ic.svg}</svg>`
}

export async function openDoc(path, name) {
  let res
  try {
    res = await window.eDEX.fsReadFile(path)
  } catch (e) {
    new Modal({ type: 'error', title: 'DOC READER', message: '无法读取文件：' + ((e && e.message) ? e.message : e) })
    return
  }
  const data = res.data instanceof ArrayBuffer ? new Uint8Array(res.data) : res.data

  const html = `<div>
    <div class="pdf_options">
      <button class="zoom_in">${iconSvg('zoom-in')}</button>
      <button class="zoom_out">${iconSvg('zoom-out')}</button>
      <button class="previous_page">${iconSvg('backwards')}</button>
      <span>Page: <span class="page_num"/></span><span>/</span> <span class="page_count"></span></span>
      <button class="next_page">${iconSvg('forwards')}</button>
    </div>
    <div class="pdf_container fsDisp_mediaDisp">
      <canvas class="pdf_canvas" />
    </div>
  </div>`

  const modal = new Modal({ type: 'custom', title: name, html })
  const body = modal.bodyEl
  const canvas = body.querySelector('.pdf_canvas')
  const ctx = canvas.getContext('2d')

  let pdfDoc = null
  let pageNum = 1
  let pageRendering = false
  let pageNumPending = null
  const scale = 1
  let zoom = 100

  const renderPage = (num) => {
    pageRendering = true
    pdfDoc.getPage(num).then((page) => {
      const viewport = page.getViewport({ scale })
      canvas.height = viewport.height
      canvas.width = viewport.width
      page.render({ canvasContext: ctx, viewport }).promise.then(() => {
        pageRendering = false
        if (pageNumPending !== null) {
          renderPage(pageNumPending)
          pageNumPending = null
        }
      })
    })
    body.querySelector('.page_num').textContent = num
  }
  const queueRenderPage = (num) => {
    if (pageRendering) pageNumPending = num
    else renderPage(num)
  }
  const onPrevPage = () => { if (pageNum > 1) { pageNum--; queueRenderPage(pageNum) } }
  const onNextPage = () => { if (pageNum < pdfDoc.numPages) { pageNum++; queueRenderPage(pageNum) } }
  const zoomIn = () => { if (zoom >= 200) return; zoom += 10; canvas.style.zoom = zoom + '%' }
  const zoomOut = () => { if (zoom <= 50) return; zoom -= 10; canvas.style.zoom = zoom + '%' }

  body.querySelector('.previous_page').addEventListener('click', onPrevPage)
  body.querySelector('.next_page').addEventListener('click', onNextPage)
  body.querySelector('.zoom_in').addEventListener('click', zoomIn)
  body.querySelector('.zoom_out').addEventListener('click', zoomOut)

  try {
    const pdfjsLib = await import('pdfjs-dist')
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default
    } catch (_) { /* 部分版本 worker 路径不同，忽略后由主线程回退 */ }

    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise
    pdfDoc = pdf
    body.querySelector('.page_count').textContent = pdf.numPages
    renderPage(pageNum)
  } catch (e) {
    console.error('[doc] open failed', e)
    new Modal({ type: 'error', title: 'DOC READER', message: '无法渲染 PDF：' + ((e && e.message) ? e.message : e) + '\n（若提示找不到模块，请先 npm install pdfjs-dist）' })
  }
}
