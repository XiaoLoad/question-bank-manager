/**
 * Format a date string to 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm' depending on detail level.
 * @param {string} dateStr - ISO date string
 * @param {'date'|'datetime'} mode
 * @returns {string}
 */
export function formatDate(dateStr, mode = 'date') {
  if (!dateStr) return '-'
  if (mode === 'datetime') {
    return dateStr.slice(0, 16).replace('T', ' ')
  }
  return dateStr.slice(0, 10)
}

/**
 * Calculate how many days have passed since a date string.
 * Returns a human-readable Chinese string like '今天', '昨天', '3 天前'.
 * @param {string} dateStr
 * @returns {string}
 */
export function daysSince(dateStr) {
  if (!dateStr) return ''
  const deleted = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - deleted) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${diff} 天前`
}

/**
 * Normalize answer for comparison — converts letter indices (A/B/C/D) to full option text,
 * strips letter prefixes like "A. xxx" → "xxx", and normalizes semantic equivalents.
 * @param {Array} answers
 * @param {Array} [options] - option list for letter→text mapping
 * @returns {string[]}
 */
export function normalizeAnswer(answers, options) {
  if (!answers || !Array.isArray(answers)) return []
  return answers.map(a => {
    let trimmed = String(a).trim()
    // Strip leading letter prefix: "C." "C、" "C:" "C " etc.
    trimmed = trimmed.replace(/^[A-Z][.\s、·:：]+/, '').trim()
    // Letter index to option text
    if (/^[A-Z]$/.test(trimmed) && options && options.length > 0) {
      const idx = trimmed.charCodeAt(0) - 65
      if (idx >= 0 && idx < options.length) {
        return options[idx].replace(/^[A-Z][.\s、·:：]+/, '').trim()
      }
    }
    // Normalize semantic equivalents for judgment questions
    if (trimmed === '正确' || trimmed === '√' || trimmed === 'T' || trimmed === 'true' || trimmed === 'True') {
      return '对'
    }
    if (trimmed === '错误' || trimmed === '×' || trimmed === 'F' || trimmed === 'false' || trimmed === 'False') {
      return '错'
    }
    return trimmed
  })
}

/**
 * Compare two answers after normalization; null if either side is empty.
 * @param {string[]|string} answersA
 * @param {string[]|string} answersB
 * @param {string[]} [options] - option list for letter→text mapping
 * @returns {boolean|null}
 */
export function answersMatch(answersA, answersB, options) {
  if (!answersA || !answersB) return null
  const arrA = Array.isArray(answersA) ? answersA : [answersA]
  const arrB = Array.isArray(answersB) ? answersB : [answersB]
  if (arrA.length === 0 || arrB.length === 0) return null
  const a = [...normalizeAnswer(arrA, options)].sort()
  const b = [...normalizeAnswer(arrB, options)].sort()
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Highlight search keyword in text with <mark> tags.
 * @param {string} text
 * @param {string} keyword
 * @returns {string}
 */
export function highlightText(text, keyword) {
  if (!text) return text
  const safe = escapeHtml(text)
  if (!keyword) return safe
  const trimmed = keyword.trim()
  if (!trimmed) return safe
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return safe.replace(regex, '<mark class="search-highlight">$1</mark>')
}

/**
 * Format a JSON string with pretty-print and syntax highlighting.
 * Returns an HTML string with colored spans for JSON elements.
 * Falls back to the original text if not valid JSON.
 * @param {string} text - raw JSON string
 * @returns {string} HTML string
 */
export function formatJson(text) {
  if (!text) return ''
  try {
    const obj = typeof text === 'string' ? JSON.parse(text) : text
    const pretty = JSON.stringify(obj, null, 2)
    return syntaxHighlightJson(pretty)
  } catch {
    // Not valid JSON, try to fix common issues and retry
    try {
      // Handle single quotes, trailing commas etc.
      const fixed = text.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1')
      const obj = JSON.parse(fixed)
      return syntaxHighlightJson(JSON.stringify(obj, null, 2))
    } catch {
      return escapeHtml(String(text))
    }
  }
}

/**
 * Add syntax highlighting spans to a pretty-printed JSON string.
 * @param {string} json - already formatted JSON string
 * @returns {string} HTML string
 */
function syntaxHighlightJson(json) {
  return json.replace(
    /("(?:[^"\\]|\\.)*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, str, colon, bool, num) => {
      if (str) {
        if (colon) {
          // Key
          return `<span class="json-key">${escapeHtml(str)}</span>:`
        }
        // String value
        return `<span class="json-str">${escapeHtml(str)}</span>`
      }
      if (bool) return `<span class="json-bool">${match}</span>`
      if (num) return `<span class="json-num">${match}</span>`
      return match
    }
  )
}

/**
 * Escape HTML special characters.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
