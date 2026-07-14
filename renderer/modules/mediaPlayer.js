// 媒体播放器（原 mediaPlayer.class.js 的忠实移植，安全架构）
// 原版在文件浏览器里双击媒体文件时，弹出一个自定义模态框（.media_container / .media_controls …），
// 再由 MediaPlayer 类接管播放控制；这里复刻同一套 DOM 与交互，样式直接复用原版 media_player.css。
// 安全架构：文件字节经 window.eDEX.fsReadFile IPC 取得，转 Blob URL 喂给 <audio>/<video>，不引入 node API。

import { Modal } from './modal.js'
import { audiofx } from './audiofx.js'
import icons from '../assets/icons/media-icons.json'

const ICONCOLOR = 'rgb(var(--color_r), var(--color_g), var(--color_b))'

function iconSvg(name) {
  const ic = icons[name]
  if (!ic) return ''
  return `<svg viewBox="0 0 ${ic.width} ${ic.height}" fill="${ICONCOLOR}">${ic.svg}</svg>`
}

// 双击媒体文件时调用：audio/video 走自定义控件，image 直接预览
export async function openMedia({ name, path, type }) {
  const res = await window.eDEX.fsReadFile(path)
  const mime = res.mime || (type === 'video' ? 'video/*' : 'audio/*')
  const url = URL.createObjectURL(new Blob([res.data], { type: mime }))

  if (type === 'image') {
    return new Modal({
      type: 'custom',
      title: name,
      html: `<img class="fsDisp_mediaDisp" src="${url}" ondragstart="return false;">`,
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 200)
    })
  }

  const tag = type === 'video' ? 'video' : 'audio'
  const html = `<div>
    <div class="media_container" data-fullscreen="false">
      <${tag} class="media fsDisp_mediaDisp" preload="auto">
        <source src="${url}">
        Unsupported ${type} format!
      </${tag}>
      <div class="media_controls" data-state="visible">
        <div class="playpause media_button" data-state="play">${iconSvg('play')}</div>
        <div class="progress_container">
          <div class="progress"><span class="progress_bar"></span></div>
        </div>
        <div class="media_time">00:00:00</div>
        <div class="volume_icon">${iconSvg('volume')}</div>
        <div class="volume"><div class="volume_bkg"></div><div class="volume_bar"></div></div>
        ${type === 'video' ? `<div class="fs media_button" data-state="go-fullscreen">${iconSvg('fullscreen')}</div>` : ''}
      </div>
    </div>
  </div>`

  let cleanup = () => {}
  const modal = new Modal({
    type: 'custom',
    title: name,
    html,
    onClose: () => {
      try { cleanup() } catch (_) {}
      setTimeout(() => URL.revokeObjectURL(url), 200)
    }
  })
  cleanup = wireMediaControls(modal.bodyEl)
  if (audiofx) audiofx.play('theme')
  return modal
}

function wireMediaControls(root) {
  const mediaContainer = root.querySelector('.media_container')
  const media = root.querySelector('.media')
  const mediaControls = root.querySelector('.media_controls')
  const playpause = root.querySelector('.playpause')
  const volumeIcon = root.querySelector('.volume_icon')
  const volume = root.querySelector('.volume')
  const volumeBar = root.querySelector('.volume_bar')
  const progress = root.querySelector('.progress')
  const progressBar = root.querySelector('.progress_bar')
  const fullscreen = root.querySelector('.fs')
  const mediaTime = root.querySelector('.media_time')

  media.controls = false
  mediaControls.setAttribute('data-state', 'visible')

  const changeButtonState = () => {
    if (media.paused || media.ended) {
      playpause.setAttribute('data-state', 'play')
      playpause.innerHTML = iconSvg('play')
    } else {
      playpause.setAttribute('data-state', 'pause')
      playpause.innerHTML = iconSvg('pause')
    }
  }
  const setFullscreenData = (state) => {
    if (!fullscreen) return
    mediaContainer.setAttribute('data-fullscreen', !!state)
    fullscreen.setAttribute('data-state', !!state ? 'cancel-fullscreen' : 'go-fullscreen')
    fullscreen.innerHTML = iconSvg(!!state ? 'fullscreen-exit' : 'fullscreen')
  }
  const mediaTimeToHMS = (time) => {
    let s = parseInt(time) || 0
    const h = parseInt(s / 3600); s = s % 3600
    const m = parseInt(s / 60); s = s % 60
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
  }
  const updateVolume = (x) => {
    let vol = (x - (volumeBar.offsetLeft + volumeBar.offsetParent.offsetLeft)) / volumeBar.clientWidth
    if (vol > 1) vol = 1
    if (vol < 0) vol = 0
    volumeBar.style.clip = `rect(0px, ${(vol * 100) / 20}vw,2vh,0px)`
    media.volume = vol
    updateVolumeIcon(vol)
  }
  const updateVolumeIcon = (vol) => {
    volumeIcon.innerHTML = iconSvg(vol > 0 ? 'volume' : 'mute')
  }

  media.addEventListener('loadedmetadata', () => { mediaTime.textContent = '00:00:00' })
  media.addEventListener('play', () => changeButtonState())
  media.addEventListener('pause', () => changeButtonState())
  media.addEventListener('timeupdate', () => {
    if (media.duration) progressBar.style.width = Math.floor((media.currentTime / media.duration) * 100) + '%'
    mediaTime.textContent = mediaTimeToHMS(media.currentTime)
  })

  let volumeDrag = false
  const onVolDown = (e) => { volumeDrag = true; media.muted = false; updateVolume(e.pageX) }
  const onVolMove = (e) => { if (volumeDrag) updateVolume(e.pageX) }
  const onVolUp = (e) => { if (volumeDrag) { volumeDrag = false; updateVolume(e.pageX) } }

  volume.addEventListener('mousedown', onVolDown)
  volumeIcon.addEventListener('click', () => {
    media.muted = !media.muted
    updateVolumeIcon(media.muted ? 0 : media.volume)
  })
  progress.addEventListener('click', (e) => {
    const pos = (e.pageX - (progress.offsetLeft + progress.offsetParent.offsetLeft)) / progress.offsetWidth
    if (media.duration) media.currentTime = pos * media.duration
  })
  playpause.addEventListener('click', () => {
    if (media.paused || media.ended) media.play(); else media.pause()
  })
  if (fullscreen) fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) { document.exitFullscreen(); setFullscreenData(false) }
    else { mediaContainer.requestFullscreen(); setFullscreenData(true) }
  })
  const onFsChange = () => setFullscreenData(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('mouseup', onVolUp)
  document.addEventListener('mousemove', onVolMove)

  // 返回清理函数，模态关闭时移除全局监听，避免累积
  return () => {
    document.removeEventListener('fullscreenchange', onFsChange)
    document.removeEventListener('mouseup', onVolUp)
    document.removeEventListener('mousemove', onVolMove)
  }
}
