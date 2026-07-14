// 语言系统：从 languages/*.json 加载翻译
// 使用 window.__edexSettings.language 或 'zh' 作为默认语言
// t(key) 返回当前语言的翻译

import zh from './languages/zh.json'
import en from './languages/en.json'

const _locale = { zh, en }

function locale() {
  const lang = (window.__edexSettings && window.__edexSettings.language) || 'zh'
  return _locale[lang] || _locale.zh
}

export function t(key) {
  const l = locale()
  return l[key] || key
}

export function currentLang() {
  return (window.__edexSettings && window.__edexSettings.language) || 'zh'
}
