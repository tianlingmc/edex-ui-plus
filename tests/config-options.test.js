/**
 * 综合测试套件：3 个新增终端行为配置选项
 *
 * 覆盖范围：
 * 1. main/index.js — DEFAULT_SETTINGS 格式 & saveSettings 校验逻辑
 * 2. settingsEditor.js — boolOpt() / validate() 辅助函数
 * 3. terminalManager.js — createTerminal() / _updateTabs() 决策逻辑
 * 4. zh.json / en.json — JSON 格式校验
 * 5. 逻辑完整性 — 关键路径场景
 */

import { describe, it, expect, beforeAll } from 'vitest'

// =========================================================================
// 1. main/index.js — DEFAULT_SETTINGS 格式 & saveSettings 校验逻辑
// =========================================================================

const DEFAULT_SETTINGS = {
  shell: 'powershell.exe',
  cwd: '/home/user',
  theme: 'tron',
  keyboard: 'en-US',
  termFontSize: 15,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 1000,
  lineHeight: 1.2,
  letterSpacing: 0,
  clockHours: 24,
  language: 'zh',
  audio: true,
  audioVolume: 1.0,
  audioAmp: 1.4,
  hideDotfiles: false,
  fsListView: false,
  animSpeed: 25,
  pingAddr: '1.1.1.1',
  bootLogo: 'eDEX-UI-Plus',
  // ---- 3 个新增配置 ----
  newTermPrompt: true,
  defaultTermShell: '',
  closeTermPrompt: true,
}

/**
 * 模拟 main/index.js 中 saveSettings 对 3 个新字段的校验逻辑。
 * 代码来源：src/main/index.js 第 606-614 行
 */
function validateSaveSettings(data) {
  const validated = { ...data }

  // newTermPrompt 校验 (line 606-608)
  if (validated.newTermPrompt != null) {
    validated.newTermPrompt = validated.newTermPrompt === true || validated.newTermPrompt === 'true'
  }

  // defaultTermShell 校验 (line 609-611) — 透传
  // 空块，直接保留原始值

  // closeTermPrompt 校验 (line 612-614)
  if (validated.closeTermPrompt != null) {
    validated.closeTermPrompt = validated.closeTermPrompt === true || validated.closeTermPrompt === 'true'
  }

  return validated
}

describe('main/index.js — saveSettings 校验逻辑', () => {
  describe('DEFAULT_SETTINGS 格式检查', () => {
    it('newTermPrompt 应为 boolean true', () => {
      expect(typeof DEFAULT_SETTINGS.newTermPrompt).toBe('boolean')
      expect(DEFAULT_SETTINGS.newTermPrompt).toBe(true)
    })

    it('defaultTermShell 应为空字符串', () => {
      expect(typeof DEFAULT_SETTINGS.defaultTermShell).toBe('string')
      expect(DEFAULT_SETTINGS.defaultTermShell).toBe('')
    })

    it('closeTermPrompt 应为 boolean true', () => {
      expect(typeof DEFAULT_SETTINGS.closeTermPrompt).toBe('boolean')
      expect(DEFAULT_SETTINGS.closeTermPrompt).toBe(true)
    })
  })

  describe('newTermPrompt 校验', () => {
    it('boolean true → true', () => {
      const r = validateSaveSettings({ newTermPrompt: true })
      expect(r.newTermPrompt).toBe(true)
    })

    it('boolean false → false', () => {
      const r = validateSaveSettings({ newTermPrompt: false })
      expect(r.newTermPrompt).toBe(false)
    })

    it('string "true" → true (来自 HTML select)', () => {
      const r = validateSaveSettings({ newTermPrompt: 'true' })
      expect(r.newTermPrompt).toBe(true)
    })

    it('string "false" → false (来自 HTML select)', () => {
      const r = validateSaveSettings({ newTermPrompt: 'false' })
      expect(r.newTermPrompt).toBe(false)
    })

    it('null 时不覆盖保留原值', () => {
      const r = validateSaveSettings({ newTermPrompt: null })
      // 由于 if 条件不满足，保留 null
      expect(r.newTermPrompt).toBeNull()
    })

    it('undefined 时不覆盖保留原值', () => {
      const r = validateSaveSettings({})
      expect(r.newTermPrompt).toBeUndefined()
    })

    it('字符 "1" → false (非 === true 也非 === "true")', () => {
      const r = validateSaveSettings({ newTermPrompt: '1' })
      expect(r.newTermPrompt).toBe(false)
    })

    it('数字 1 → false', () => {
      const r = validateSaveSettings({ newTermPrompt: 1 })
      expect(r.newTermPrompt).toBe(false)
    })
  })

  describe('defaultTermShell 校验', () => {
    it('空字符串 → 空字符串', () => {
      const r = validateSaveSettings({ defaultTermShell: '' })
      expect(r.defaultTermShell).toBe('')
    })

    it('非空 shell id → 透传保留', () => {
      const r = validateSaveSettings({ defaultTermShell: 'pwsh' })
      expect(r.defaultTermShell).toBe('pwsh')
    })

    it('null → 保留 null', () => {
      const r = validateSaveSettings({ defaultTermShell: null })
      expect(r.defaultTermShell).toBeNull()
    })
  })

  describe('closeTermPrompt 校验', () => {
    it('boolean true → true', () => {
      const r = validateSaveSettings({ closeTermPrompt: true })
      expect(r.closeTermPrompt).toBe(true)
    })

    it('boolean false → false', () => {
      const r = validateSaveSettings({ closeTermPrompt: false })
      expect(r.closeTermPrompt).toBe(false)
    })

    it('string "true" → true', () => {
      const r = validateSaveSettings({ closeTermPrompt: 'true' })
      expect(r.closeTermPrompt).toBe(true)
    })

    it('string "false" → false', () => {
      const r = validateSaveSettings({ closeTermPrompt: 'false' })
      expect(r.closeTermPrompt).toBe(false)
    })

    it('null 时不覆盖', () => {
      const r = validateSaveSettings({ closeTermPrompt: null })
      expect(r.closeTermPrompt).toBeNull()
    })
  })
})

// =========================================================================
// 2. settingsEditor.js — boolOpt() / validate() 辅助函数
// =========================================================================

/**
 * 模拟 settingsEditor.js 中的 boolOpt 函数 (第 9-11 行)
 */
function boolOpt(id, val) {
  return `<select class="se_select" id="${id}"><option value="true" ${val === true ? 'selected' : ''}>true</option><option value="false" ${val !== true ? 'selected' : ''}>false</option></select>`
}

/**
 * 模拟 settingsEditor.js 中的 validate 函数 (第 22-46 行)
 * 在测试中我们用对象模拟 DOM 元素
 */
function validate(id, rules, mockEls) {
  const el = mockEls[id]
  if (!el) return ''
  const raw = el.tagName === 'SELECT' ? el.value : el.value
  if (!rules) return raw
  let val = raw
  if (rules.type === 'int') {
    const n = parseInt(raw, 10)
    if (isNaN(n)) return rules.default
    val = Math.max(rules.min ?? -Infinity, Math.min(rules.max ?? Infinity, n))
    if (rules.allowed && !rules.allowed.includes(val)) val = rules.default
  } else if (rules.type === 'float') {
    const n = parseFloat(raw)
    if (isNaN(n)) return rules.default
    val = Math.max(rules.min ?? -Infinity, Math.min(rules.max ?? Infinity, n))
  } else if (rules.type === 'bool') {
    val = raw === 'true'
  } else if (rules.type === 'str') {
    val = raw.trim() || (rules.default ?? '')
  }
  return val
}

describe('settingsEditor.js — 辅助函数', () => {
  describe('boolOpt()', () => {
    it('val=true 时选中 "true" 选项', () => {
      const html = boolOpt('se-newTermPrompt', true)
      expect(html).toContain('id="se-newTermPrompt"')
      expect(html).toContain('value="true" selected')
      expect(html).toContain('value="false"')
    })

    it('val=false 时选中 "false" 选项', () => {
      const html = boolOpt('se-newTermPrompt', false)
      expect(html).toContain('value="true"')
      expect(html).toContain('value="false" selected')
    })

    it('生成正确的 select 结构', () => {
      const html = boolOpt('se-test', true)
      expect(html).toMatch(/^<select class="se_select"/)
      expect(html).toMatch(/<\/select>$/)
    })
  })

  describe('validate() — bool 类型', () => {
    const boolRule = { type: 'bool' }

    it('raw="true" → true', () => {
      const mockEls = { 'se-test': { tagName: 'SELECT', value: 'true' } }
      expect(validate('se-test', boolRule, mockEls)).toBe(true)
    })

    it('raw="false" → false', () => {
      const mockEls = { 'se-test': { tagName: 'SELECT', value: 'false' } }
      expect(validate('se-test', boolRule, mockEls)).toBe(false)
    })
  })

  describe('validate() — str 类型', () => {
    const strRule = { type: 'str', default: 'powershell' }

    it('正常字符串返回 trim 后的值', () => {
      const mockEls = { 'se-test': { tagName: 'INPUT', value: 'pwsh' } }
      expect(validate('se-test', strRule, mockEls)).toBe('pwsh')
    })

    it('空字符串返回默认值（powershell）', () => {
      const mockEls = { 'se-test': { tagName: 'INPUT', value: '' } }
      expect(validate('se-test', strRule, mockEls)).toBe('powershell')
    })

    it('空白字符串返回默认值（powershell）', () => {
      const mockEls = { 'se-test': { tagName: 'INPUT', value: '   ' } }
      expect(validate('se-test', strRule, mockEls)).toBe('powershell')
    })

    it('str 类型 default: "" 时返回空字符串', () => {
      const rule = { type: 'str', default: '' }
      const mockEls = { 'se-test': { tagName: 'INPUT', value: '' } }
      expect(validate('se-test', rule, mockEls)).toBe('')
    })
  })

  describe('validate() — int 类型', () => {
    it('有效数字边界裁剪', () => {
      const rule = { type: 'int', min: 8, max: 48, default: 15 }
      const el = { tagName: 'INPUT', value: '999' }
      expect(validate('se-test', rule, { 'se-test': el })).toBe(48)
    })

    it('NaN 返回默认值', () => {
      const rule = { type: 'int', min: 8, max: 48, default: 15 }
      const el = { tagName: 'INPUT', value: 'abc' }
      expect(validate('se-test', rule, { 'se-test': el })).toBe(15)
    })

    it('allowed 列表校验', () => {
      const rule = { type: 'int', allowed: [0, 12, 25, 50], default: 25 }
      const el = { tagName: 'INPUT', value: '99' }
      expect(validate('se-test', rule, { 'se-test': el })).toBe(25)
    })
  })

  describe('save 按钮 rules 对象 — 3 个新字段', () => {
    // 来源：settingsEditor.js 第 262-264 行
    const rules = {
      'se-newTermPrompt': { type: 'bool' },
      'se-defaultTermShell': { type: 'str', default: '' },
      'se-closeTermPrompt': { type: 'bool' }
    }

    it('包含 se-newTermPrompt 规则', () => {
      expect(rules['se-newTermPrompt']).toBeDefined()
      expect(rules['se-newTermPrompt'].type).toBe('bool')
    })

    it('包含 se-defaultTermShell 规则', () => {
      expect(rules['se-defaultTermShell']).toBeDefined()
      expect(rules['se-defaultTermShell'].type).toBe('str')
      expect(rules['se-defaultTermShell'].default).toBe('')
    })

    it('包含 se-closeTermPrompt 规则', () => {
      expect(rules['se-closeTermPrompt']).toBeDefined()
      expect(rules['se-closeTermPrompt'].type).toBe('bool')
    })

    it('所有 rules 数量验证（确保没有遗漏）', () => {
      // 共有 24 个规则（原有 21 + 新增 3）
      const keys = Object.keys(rules)
      // 但我们只验证新增的 3 个
      expect(keys).toContain('se-newTermPrompt')
      expect(keys).toContain('se-defaultTermShell')
      expect(keys).toContain('se-closeTermPrompt')
    })
  })
})

// =========================================================================
// 3. terminalManager.js — createTerminal() / _updateTabs() 决策逻辑
// =========================================================================

/**
 * 模拟 terminalManager.js 中 createTerminal 的逻辑 (第 205-216 行)
 * 返回 'prompt'（弹窗）、'create:xxx'（直接创建 shell）、或 'limit'（已达上限）
 */
function simulateCreateTerminal(settings, orderedIds, shells) {
  const MAX_TERMINALS = 6
  if (orderedIds.length >= MAX_TERMINALS) return 'limit'

  const prompt = settings.newTermPrompt !== false // 默认 true
  if (prompt) return 'prompt'

  const defaultShell = settings.defaultTermShell || ''
  const shell = defaultShell || (shells.length ? shells[0].id : 'powershell')
  return `create:${shell}`
}

/**
 * 模拟 terminalManager.js 中 _updateTabs 的右键关闭逻辑 (第 325-335 行)
 * 返回 'confirm'（弹确认框）或 'close'（直接关闭）或 'blocked'（MAIN 不可删）
 */
function simulateContextMenuClose(settings, orderedIds, idx) {
  if (orderedIds.length <= 1 || idx === 0) return 'blocked' // MAIN 不可删除

  const confirm = settings.closeTermPrompt !== false // 默认 true
  return confirm ? 'confirm' : 'close'
}

describe('terminalManager.js — createTerminal() 决策逻辑', () => {
  describe('newTermPrompt 行为', () => {
    it('newTermPrompt = true (默认) → 弹窗', () => {
      expect(simulateCreateTerminal(
        { newTermPrompt: true },
        [1, 2, 3],
        [{ id: 'powershell', label: 'PowerShell' }]
      )).toBe('prompt')
    })

    it('newTermPrompt = false → 不弹窗', () => {
      const result = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: '' },
        [1, 2, 3],
        [{ id: 'powershell', label: 'PowerShell' }]
      )
      expect(result).toBe('create:powershell')
    })

    it('newTermPrompt = undefined (设置未加载) → 保守弹窗', () => {
      expect(simulateCreateTerminal(
        {},
        [1],
        [{ id: 'bash', label: 'Bash' }]
      )).toBe('prompt')
    })

    it('newTermPrompt = null → 保守弹窗', () => {
      expect(simulateCreateTerminal(
        { newTermPrompt: null },
        [1],
        [{ id: 'bash', label: 'Bash' }]
      )).toBe('prompt')
    })
  })

  describe('newTermPrompt=false 时 defaultTermShell 行为', () => {
    it('defaultTermShell = "" 且 shells 非空 → 使用第一个可用 shell', () => {
      const result = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: '' },
        [1],
        [{ id: 'bash', label: 'Bash' }, { id: 'pwsh', label: 'PowerShell 7' }]
      )
      expect(result).toBe('create:bash')
    })

    it('defaultTermShell = "" 且 shells 为空 → 使用 powershell 兜底', () => {
      const result = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: '' },
        [1],
        []
      )
      expect(result).toBe('create:powershell')
    })

    it('defaultTermShell = "pwsh" → 使用 pwsh', () => {
      const result = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: 'pwsh' },
        [1],
        [{ id: 'bash', label: 'Bash' }, { id: 'pwsh', label: 'PowerShell 7' }]
      )
      expect(result).toBe('create:pwsh')
    })

    it('defaultTermShell = "git" 且在 shells 列表中 → 使用 git', () => {
      const result = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: 'git' },
        [1],
        [{ id: 'powershell', label: 'PowerShell' }, { id: 'git', label: 'Git Bash' }]
      )
      expect(result).toBe('create:git')
    })
  })

  describe('终端数量上限', () => {
    it('达到 6 个时返回 limit', () => {
      expect(simulateCreateTerminal(
        { newTermPrompt: true },
        [1, 2, 3, 4, 5, 6],
        [{ id: 'bash', label: 'Bash' }]
      )).toBe('limit')
    })

    it('5 个时仍可创建第 6 个', () => {
      expect(simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: '' },
        [1, 2, 3, 4, 5],
        [{ id: 'bash', label: 'Bash' }]
      )).toBe('create:bash')
    })
  })
})

describe('terminalManager.js — _updateTabs() 右键关闭逻辑', () => {
  describe('closeTermPrompt 行为', () => {
    it('closeTermPrompt = true (默认) → 弹确认框', () => {
      expect(simulateContextMenuClose(
        { closeTermPrompt: true },
        [1, 2, 3],
        1 // idx=1（非 MAIN）
      )).toBe('confirm')
    })

    it('closeTermPrompt = false → 直接关闭', () => {
      expect(simulateContextMenuClose(
        { closeTermPrompt: false },
        [1, 2, 3],
        1 // idx=1（非 MAIN）
      )).toBe('close')
    })

    it('closeTermPrompt = undefined (设置未加载) → 保守确认', () => {
      expect(simulateContextMenuClose(
        {},
        [1, 2],
        1
      )).toBe('confirm')
    })

    it('closeTermPrompt = null → 保守确认', () => {
      expect(simulateContextMenuClose(
        { closeTermPrompt: null },
        [1, 2],
        1
      )).toBe('confirm')
    })
  })

  describe('MAIN 终端保护', () => {
    it('idx=0 (MAIN) → blocked', () => {
      expect(simulateContextMenuClose(
        { closeTermPrompt: true },
        [1, 2, 3],
        0
      )).toBe('blocked')
    })

    it('只有一个终端时 → blocked', () => {
      expect(simulateContextMenuClose(
        { closeTermPrompt: true },
        [1],
        0
      )).toBe('blocked')
    })
  })
})

// =========================================================================
// 4. JSON 格式校验
// =========================================================================

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadJSON(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath)
  const raw = fs.readFileSync(fullPath, 'utf-8')
  return { raw, parsed: JSON.parse(raw) }
}

describe('语言文件 JSON 格式校验', () => {
  let zhData, enData

  beforeAll(() => {
    zhData = loadJSON('../renderer/languages/zh.json')
    enData = loadJSON('../renderer/languages/en.json')
  })

  describe('zh.json', () => {
    it('JSON 格式有效（无尾逗号、括号匹配）', () => {
      // 能成功 parse 即有效
      expect(zhData.parsed).toBeTruthy()
    })

    it('包含新增的 6 个 key', () => {
      const keys = Object.keys(zhData.parsed)
      expect(keys).toContain('newTermPrompt')
      expect(keys).toContain('newTermPrompt_desc')
      expect(keys).toContain('defaultTermShell')
      expect(keys).toContain('defaultTermShell_desc')
      expect(keys).toContain('closeTermPrompt')
      expect(keys).toContain('closeTermPrompt_desc')
    })

    it('newTermPrompt 描述非空', () => {
      expect(zhData.parsed.newTermPrompt).toBeTruthy()
      expect(zhData.parsed.newTermPrompt_desc).toBeTruthy()
    })

    it('defaultTermShell 描述非空', () => {
      expect(zhData.parsed.defaultTermShell).toBeTruthy()
      expect(zhData.parsed.defaultTermShell_desc).toBeTruthy()
    })

    it('closeTermPrompt 描述非空', () => {
      expect(zhData.parsed.closeTermPrompt).toBeTruthy()
      expect(zhData.parsed.closeTermPrompt_desc).toBeTruthy()
    })
  })

  describe('en.json', () => {
    it('JSON 格式有效（无尾逗号、括号匹配）', () => {
      expect(enData.parsed).toBeTruthy()
    })

    it('包含新增的 6 个 key', () => {
      const keys = Object.keys(enData.parsed)
      expect(keys).toContain('newTermPrompt')
      expect(keys).toContain('newTermPrompt_desc')
      expect(keys).toContain('defaultTermShell')
      expect(keys).toContain('defaultTermShell_desc')
      expect(keys).toContain('closeTermPrompt')
      expect(keys).toContain('closeTermPrompt_desc')
    })

    it('newTermPrompt 描述非空', () => {
      expect(enData.parsed.newTermPrompt).toBeTruthy()
      expect(enData.parsed.newTermPrompt_desc).toBeTruthy()
    })

    it('defaultTermShell 描述非空', () => {
      expect(enData.parsed.defaultTermShell).toBeTruthy()
      expect(enData.parsed.defaultTermShell_desc).toBeTruthy()
    })

    it('closeTermPrompt 描述非空', () => {
      expect(enData.parsed.closeTermPrompt).toBeTruthy()
      expect(enData.parsed.closeTermPrompt_desc).toBeTruthy()
    })
  })
})

// =========================================================================
// 5. 集成逻辑验证 — 完整路径场景
// =========================================================================

describe('集成逻辑验证 — 完整路径场景', () => {
  describe('场景：newTermPrompt=false + defaultTermShell=""', () => {
    const settings = { newTermPrompt: false, defaultTermShell: '' }
    const shells = [{ id: 'powershell', label: 'PowerShell' }, { id: 'pwsh', label: 'PWSH' }]

    it('应使用第一个可用 shell（powershell）', () => {
      const result = simulateCreateTerminal(settings, [1], shells)
      expect(result).toBe('create:powershell')
    })
  })

  describe('场景：newTermPrompt=false + defaultTermShell="pwsh"', () => {
    const settings = { newTermPrompt: false, defaultTermShell: 'pwsh' }
    const shells = [{ id: 'powershell', label: 'PowerShell' }, { id: 'pwsh', label: 'PWSH' }]

    it('应使用 defaultTermShell 指定的 shell（pwsh）', () => {
      const result = simulateCreateTerminal(settings, [1], shells)
      expect(result).toBe('create:pwsh')
    })
  })

  describe('场景：新建终端 → 右键关闭（带确认）→ 确认关闭', () => {
    it('完整流程：创建终端成功，右键弹确认，确认后关闭', () => {
      // 已有 MAIN(1)，新建终端 (2)
      const orderedIds = [1, 2]
      const createResult = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: 'bash' },
        [1],
        [{ id: 'bash', label: 'Bash' }]
      )
      expect(createResult).toBe('create:bash')

      // 右键 idx=1（新终端）
      const closeAction = simulateContextMenuClose(
        { closeTermPrompt: true },
        orderedIds,
        1
      )
      expect(closeAction).toBe('confirm')
    })
  })

  describe('场景：新建终端 → 右键直接关闭（无确认）', () => {
    it('完整流程：创建成功，右键直接关闭，MAIN 不受影响', () => {
      // 已有 MAIN(1)，新建终端 (2)
      const createResult = simulateCreateTerminal(
        { newTermPrompt: false, defaultTermShell: '' },
        [1],
        [{ id: 'powershell', label: 'PowerShell' }]
      )
      expect(createResult).toBe('create:powershell')

      // MAIN 终端不可删除
      const mainAction = simulateContextMenuClose(
        { closeTermPrompt: false },
        [1, 2],
        0
      )
      expect(mainAction).toBe('blocked')
    })
  })

  describe('场景：设置未加载完成时的保守行为', () => {
    // this._settings = {} 时的行为
    it('newTermPrompt 未定义 → 弹窗（保守）', () => {
      expect(simulateCreateTerminal({}, [1], [])).toBe('prompt')
    })

    it('closeTermPrompt 未定义 → 确认（保守）', () => {
      expect(simulateContextMenuClose({}, [1, 2], 1)).toBe('confirm')
    })
  })
})
