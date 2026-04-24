import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Papa from 'papaparse'
// Virtualization can be reintroduced later if needed.
import './App.css'

const STORAGE_KEY = 'kanji_organizer_v1'
const STORAGE_SLICES = {
  familiarity: 'kanji_organizer_familiarity_v1',
  flaggedKanji: 'kanji_organizer_flagged_kanji_v1',
  flaggedRadicals: 'kanji_organizer_flagged_radicals_v1',
  radicalFamiliarity: 'kanji_organizer_radical_familiarity_v1',
  readingStatusByKanji: 'kanji_organizer_readings_v1',
  contentEditsByKanji: 'kanji_organizer_content_edits_v1',
  groups: 'kanji_organizer_groups_v1',
  sprints: 'kanji_organizer_sprints_v1',
  highlightedVocabByKanji: 'kanji_organizer_vocab_highlights_v1',
  vocabOrderByKanji: 'kanji_organizer_vocab_order_v1',
  ui: 'kanji_organizer_ui_v1',
}
const STORAGE_OWNER_KEY = 'kanji_organizer_owner_v1'
const STORAGE_OWNER_TTL_MS = 15000
const LEGACY_STORAGE_KEY = 'wk_organizer_v1'
const CSV_PATH = `${import.meta.env.BASE_URL}data/kanji.csv`
const KANJI_COMPARE_CSV_PATH = `${import.meta.env.BASE_URL}data/kanji_new.csv`
const VOCAB_CSV_PATH = `${import.meta.env.BASE_URL}data/wk_vocab.csv`
const RADICAL_CSV_PATH = `${import.meta.env.BASE_URL}data/radicals.csv`

const STATUS = {
  NEEDS: 'needs_work',
  LUKEWARM: 'lukewarm',
  COMFORTABLE: 'comfortable',
  UNMARKED: 'unmarked',
}

const STATUS_ORDER = [STATUS.NEEDS, STATUS.LUKEWARM, STATUS.COMFORTABLE]
const STATUS_ORDER_WITH_UNMARKED = [
  STATUS.NEEDS,
  STATUS.LUKEWARM,
  STATUS.COMFORTABLE,
  STATUS.UNMARKED,
]
const EMPTY_ARRAY = Object.freeze([])
const EMPTY_OBJECT = Object.freeze({})

const STATUS_LABELS = {
  [STATUS.NEEDS]: 'Needs Work',
  [STATUS.LUKEWARM]: 'Lukewarm',
  [STATUS.COMFORTABLE]: 'Comfortable',
  [STATUS.UNMARKED]: 'Unmarked',
}

const STATUS_CLASS = {
  [STATUS.NEEDS]: 'status-needs',
  [STATUS.LUKEWARM]: 'status-lukewarm',
  [STATUS.COMFORTABLE]: 'status-comfortable',
  [STATUS.UNMARKED]: 'status-default',
}

const DEFAULT_RANDOM_REVIEW_INCLUDE = {
  flagged: true,
  statuses: {
    [STATUS.NEEDS]: false,
    [STATUS.LUKEWARM]: false,
    [STATUS.COMFORTABLE]: false,
    [STATUS.UNMARKED]: false,
  },
}

const DEFAULT_RANDOM_REVIEW_FILTER = {
  flagged: false,
  statuses: {
    [STATUS.NEEDS]: false,
    [STATUS.LUKEWARM]: false,
    [STATUS.COMFORTABLE]: false,
    [STATUS.UNMARKED]: false,
  },
}

const DEFAULT_RANDOM_REVIEW_CONFIG = {
  include: DEFAULT_RANDOM_REVIEW_INCLUDE,
  filter: DEFAULT_RANDOM_REVIEW_FILTER,
}

const GROUP_CATEGORIES = [
  'Look-Alikes',
  'Similar Meanings',
  'Similar Sounding',
  'Commonly Associated',
  'Commonly Misread',
  'Similar Radicals',
  'Miscellaneous',
]

const DEFAULT_UI = {
  page: 'levels',
  selectedLevel: 1,
  selectedRadicalLevel: 1,
  selectedGroupId: null,
  levelMode: 'normal',
  radicalMode: 'normal',
  storageLocked: false,
  modeByLevel: {},
  radicalModeByLevel: {},
  orderByLevel: {},
  radicalOrderByLevel: {},
  familiarityOrderByLevel: {},
  radicalFamiliarityOrderByLevel: {},
  prevByLevel: {},
  lightningMode: false,
  globalQuizLevels: '',
  globalQuizStatuses: {
    [STATUS.NEEDS]: false,
    [STATUS.LUKEWARM]: false,
    [STATUS.COMFORTABLE]: false,
  },
  groupCategoryCollapsed: {},
  rangeLevels: '',
  rangeView: 'kanji',
  rangeMode: 'normal',
  familiarityView: 'kanji',
  familiarityFlaggedOpen: false,
  familiarityOpenByStatus: {},
  randomReviewConfig: DEFAULT_RANDOM_REVIEW_CONFIG,
  detailMnemonicsOpen: true,
  detailMnemonicCompareOpen: false,
  detailRadicalComponentsOpen: true,
  detailVisuallySimilarOpen: true,
  sprintActiveId: null,
  sprintDayIndex: 0,
  sprintViewMode: 'levels',
  sprintSortMode: 'normal',
  sprintOrderByLevel: {},
  sprintAllOrder: [],
  radicalPrevByLevel: {},
}

const READING_STATUS = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
}

function normalizeRandomReviewSection(section, defaults) {
  const statuses = section?.statuses || EMPTY_OBJECT
  return {
    flagged:
      section?.flagged === undefined ? defaults.flagged : Boolean(section.flagged),
    statuses: {
      [STATUS.NEEDS]: Boolean(statuses[STATUS.NEEDS]),
      [STATUS.LUKEWARM]: Boolean(statuses[STATUS.LUKEWARM]),
      [STATUS.COMFORTABLE]: Boolean(statuses[STATUS.COMFORTABLE]),
      [STATUS.UNMARKED]: Boolean(statuses[STATUS.UNMARKED]),
    },
  }
}

function normalizeRandomReviewConfig(config, legacyFilters = null) {
  if (config?.include || config?.filter) {
    return {
      include: normalizeRandomReviewSection(config.include, DEFAULT_RANDOM_REVIEW_INCLUDE),
      filter: normalizeRandomReviewSection(config.filter, DEFAULT_RANDOM_REVIEW_FILTER),
    }
  }
  if (legacyFilters) {
    return {
      include: normalizeRandomReviewSection(legacyFilters, DEFAULT_RANDOM_REVIEW_INCLUDE),
      filter: normalizeRandomReviewSection(null, DEFAULT_RANDOM_REVIEW_FILTER),
    }
  }
  return {
    include: normalizeRandomReviewSection(null, DEFAULT_RANDOM_REVIEW_INCLUDE),
    filter: normalizeRandomReviewSection(null, DEFAULT_RANDOM_REVIEW_FILTER),
  }
}

function getRandomReviewSelectedStatuses(section) {
  return STATUS_ORDER_WITH_UNMARKED.filter((status) => Boolean(section?.statuses?.[status]))
}

function hasActiveRandomReviewSection(section) {
  return Boolean(section?.flagged) || getRandomReviewSelectedStatuses(section).length > 0
}

const ALLOWED_MNEMONIC_INLINE_TAGS = new Set(['radical', 'kanji', 'reading', 'vocabulary'])
const STANDALONE_MNEMONIC_TAGS = new Set(['divider'])

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)

    // Slice-based storage (new default for lower write overhead).
    const sliceValues = Object.entries(STORAGE_SLICES).reduce((acc, [field, key]) => {
      const sliceRaw = localStorage.getItem(key)
      if (!sliceRaw) return acc
      try {
        acc[field] = JSON.parse(sliceRaw)
      } catch {
        // ignore malformed slice
      }
      return acc
    }, {})
    if (Object.keys(sliceValues).length > 0) return sliceValues

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) return JSON.parse(legacy)
    return null
  } catch {
    return null
  }
}

function loadStorageOwner() {
  try {
    const raw = localStorage.getItem(STORAGE_OWNER_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveStorageOwner(payload) {
  localStorage.setItem(STORAGE_OWNER_KEY, JSON.stringify(payload))
}

function saveStorageSlice(key, payload) {
  localStorage.setItem(key, JSON.stringify(payload))
}

function normalizeMeaning(text) {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeReadingToken(text) {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .trim()
}

function slugifyValue(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseJsonArray(text) {
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseIdArray(text) {
  if (!text) return []
  const parsedJson = parseJsonArray(text)
  if (parsedJson.length) {
    return parsedJson
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  }
  return String(text)
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function parseMnemonicSegments(text) {
  if (!text) return []
  const normalizeText = (value) =>
    String(value || '')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const normalizeTextSegment = (value) => {
    const source = String(value || '').replace(/<\/?[^>]+>/g, '')
    const collapsed = source.replace(/\s+/g, ' ')
    const trimmed = collapsed.trim()
    if (!trimmed) return ''
    const leadingSpace = /^\s/.test(source) ? ' ' : ''
    const trailingSpace = /\s$/.test(source) ? ' ' : ''
    return `${leadingSpace}${trimmed}${trailingSpace}`
  }
  const tokens = []
  const source = String(text)
  const re = /<(radical|kanji|reading|vocabulary)>([\s\S]*?)<\/\1>|<divider\s*>/gi
  let last = 0
  let match
  while ((match = re.exec(source)) !== null) {
    if (match.index > last) {
      const cleaned = normalizeTextSegment(source.slice(last, match.index))
      if (cleaned) {
        tokens.push({
          type: 'text',
          value: cleaned,
        })
      }
    }
    if (match[0]?.match(/^<divider\s*>$/i)) {
      tokens.push({
        type: 'divider',
        value: '',
      })
    } else {
      const chipValue = normalizeText(match[2] || '')
      if (chipValue) {
        tokens.push({
          type: match[1].toLowerCase(),
          value: chipValue,
        })
      }
    }
    last = re.lastIndex
  }
  if (last < source.length) {
    const cleaned = normalizeTextSegment(source.slice(last))
    if (cleaned) {
      tokens.push({ type: 'text', value: cleaned })
    }
  }
  return tokens
}

function containsJapaneseText(text) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(String(text || ''))
}

function isOpeningJapaneseWrapper(char) {
  return char === '(' || char === '（'
}

function isClosingJapaneseWrapper(char) {
  return char === ')' || char === '）'
}

function splitTextByJapaneseRuns(text) {
  const source = String(text || '')
  if (!source) return []
  const runs = []
  let currentValue = ''
  let currentKind = null

  const pushCurrentRun = () => {
    if (!currentValue) return
    runs.push({
      value: currentValue,
      kind: currentKind,
      hasJapanese: currentKind === 'japanese',
    })
    currentValue = ''
    currentKind = null
  }

  for (const char of source) {
    const nextKind = isOpeningJapaneseWrapper(char) || isClosingJapaneseWrapper(char)
      ? 'wrapper'
      : containsJapaneseText(char)
        ? 'japanese'
        : 'text'

    if (nextKind === 'wrapper') {
      pushCurrentRun()
      runs.push({
        value: char,
        kind: 'wrapper',
        hasJapanese: false,
      })
      continue
    }

    if (currentKind === null || currentKind === nextKind) {
      currentValue += char
      currentKind = nextKind
      continue
    }
    pushCurrentRun()
    currentValue = char
    currentKind = nextKind
  }

  pushCurrentRun()
  return runs
}

function shouldStyleWrapperForAdjacentSegment(segment) {
  if (!segment || segment.type === 'text' || segment.type === 'divider') return false
  return true
}

function shouldStyleMnemonicRunAsJapanese(run, runIndex, runs, segmentIndex, segments) {
  if (!run) return false
  if (run.hasJapanese) return true
  if (run.kind !== 'wrapper') return false

  if (isOpeningJapaneseWrapper(run.value)) {
    const nextRun = runs[runIndex + 1]
    if (nextRun?.hasJapanese) return true
    if (nextRun) return false
    return shouldStyleWrapperForAdjacentSegment(segments[segmentIndex + 1])
  }

  if (isClosingJapaneseWrapper(run.value)) {
    const previousRun = runs[runIndex - 1]
    if (previousRun?.hasJapanese) return true
    if (previousRun) return false
    return shouldStyleWrapperForAdjacentSegment(segments[segmentIndex - 1])
  }

  return false
}

function isKanjiCharacter(char) {
  return /[\p{Script=Han}]/u.test(String(char || ''))
}

function renderMnemonicRunContent(
  run,
  keyPrefix,
  autoLinkKnownKanji = false,
  kanjiByCharacter = null,
  onOpenKanjiDetail = null,
  currentKanjiId = null
) {
  const value = String(run?.value || '')
  if (!value) return null
  if (!autoLinkKnownKanji || !kanjiByCharacter || typeof onOpenKanjiDetail !== 'function') {
    return value
  }

  const parts = []
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const item = isKanjiCharacter(char) ? kanjiByCharacter.get(char) : null
    if (!item || item.id === currentKanjiId) {
      parts.push(
        <span key={`${keyPrefix}-text-${index}`}>{char}</span>
      )
      continue
    }
    parts.push(
      <button
        key={`${keyPrefix}-link-${index}`}
        type="button"
        className={`mnemonic-inline-kanji-link${run?.hasJapanese ? ' has-japanese' : ''}`}
        onClick={() => onOpenKanjiDetail(item)}
      >
        {char}
      </button>
    )
  }
  return parts
}

function splitMnemonicSubsections(segments) {
  const subsections = []
  let current = []
  let hasLeadingDivider = false

  segments.forEach((segment) => {
    if (segment.type === 'divider') {
      if (current.length) {
        subsections.push({ segments: current, hasLeadingDivider })
        current = []
      }
      hasLeadingDivider = true
      return
    }
    current.push(segment)
  })

  if (current.length) {
    subsections.push({ segments: current, hasLeadingDivider })
  }

  return subsections
}

function splitReadingTokens(text) {
  if (!text) return []
  return text
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

function hasHighlightedReadingStatus(status) {
  return status === READING_STATUS.COMMON || status === READING_STATUS.UNCOMMON
}

function getHighlightedReadingTokens(text, readingStatus = {}) {
  return splitReadingTokens(text).filter((token) => {
    const key = normalizeReadingToken(token)
    return key ? hasHighlightedReadingStatus(readingStatus[key]) : false
  })
}

function splitKanjiTokens(text) {
  if (!text) return []
  return String(text)
    .split(/[,、]/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function normalizeMnemonicForCompare(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function isOptionalMnemonicSectionEmpty(text) {
  const normalized = String(text || '').trim()
  return !normalized || normalized === '—'
}

function uniqueNumberList(values) {
  return [...new Set((values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))]
}

function uniqueStringList(values) {
  const seen = new Set()
  return (values || []).reduce((acc, value) => {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized)) return acc
    seen.add(normalized)
    acc.push(normalized)
    return acc
  }, [])
}

function createKanjiContentDraft(item) {
  return {
    meaningMnemonic: String(item?.meaningMnemonic || ''),
    readingMnemonic: String(item?.readingMnemonic || ''),
    extraReadingMnemonic: String(item?.extraReadingMnemonic || ''),
    relatedMnemonicReadings: String(item?.relatedMnemonicReadings || ''),
    onyomi: String(item?.onyomi || ''),
    kunyomi: String(item?.kunyomi || ''),
    nanori: String(item?.nanori || ''),
    radicalSubjectIds: uniqueNumberList(item?.radicalSubjectIds || []),
    visuallySimilarKanji: uniqueStringList(splitKanjiTokens(item?.visuallySimilarKanji || '')).join(', '),
  }
}

function areNumberListsEqual(left, right) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function buildKanjiContentEdit(baseItem, draft) {
  const base = createKanjiContentDraft(baseItem)
  const next = createKanjiContentDraft(draft)
  const edit = {}
  if (base.meaningMnemonic !== next.meaningMnemonic) edit.meaningMnemonic = next.meaningMnemonic
  if (base.readingMnemonic !== next.readingMnemonic) edit.readingMnemonic = next.readingMnemonic
  if (base.extraReadingMnemonic !== next.extraReadingMnemonic) {
    edit.extraReadingMnemonic = next.extraReadingMnemonic
  }
  if (base.relatedMnemonicReadings !== next.relatedMnemonicReadings) {
    edit.relatedMnemonicReadings = next.relatedMnemonicReadings
  }
  if (base.onyomi !== next.onyomi) edit.onyomi = next.onyomi
  if (base.kunyomi !== next.kunyomi) edit.kunyomi = next.kunyomi
  if (base.nanori !== next.nanori) edit.nanori = next.nanori
  if (!areNumberListsEqual(base.radicalSubjectIds, next.radicalSubjectIds)) {
    edit.radicalSubjectIds = next.radicalSubjectIds
  }
  if (base.visuallySimilarKanji !== next.visuallySimilarKanji) {
    edit.visuallySimilarKanji = next.visuallySimilarKanji
  }
  return Object.keys(edit).length ? edit : null
}

function normalizeContentEditEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const next = {}
  if ('meaningMnemonic' in entry) next.meaningMnemonic = String(entry.meaningMnemonic || '')
  if ('readingMnemonic' in entry) next.readingMnemonic = String(entry.readingMnemonic || '')
  if ('extraReadingMnemonic' in entry) {
    next.extraReadingMnemonic = String(entry.extraReadingMnemonic || '')
  }
  if ('relatedMnemonicReadings' in entry) {
    next.relatedMnemonicReadings = String(entry.relatedMnemonicReadings || '')
  }
  if ('onyomi' in entry) next.onyomi = String(entry.onyomi || '')
  if ('kunyomi' in entry) next.kunyomi = String(entry.kunyomi || '')
  if ('nanori' in entry) next.nanori = String(entry.nanori || '')
  if ('radicalSubjectIds' in entry) {
    next.radicalSubjectIds = uniqueNumberList(entry.radicalSubjectIds)
  }
  if ('visuallySimilarKanji' in entry) {
    next.visuallySimilarKanji = uniqueStringList(splitKanjiTokens(entry.visuallySimilarKanji)).join(', ')
  }
  return Object.keys(next).length ? next : null
}

function normalizeContentEditsMap(map) {
  const next = {}
  Object.entries(map || {}).forEach(([kanjiId, entry]) => {
    const normalized = normalizeContentEditEntry(entry)
    if (normalized) next[kanjiId] = normalized
  })
  return next
}

function applyContentEdits(items, contentEditsByKanji) {
  if (!items.length) return items
  if (!contentEditsByKanji || Object.keys(contentEditsByKanji).length === 0) return items
  return items.map((item) => {
    const edit = contentEditsByKanji[item.id]
    if (!edit) return item
    return {
      ...item,
      ...(edit.meaningMnemonic !== undefined ? { meaningMnemonic: edit.meaningMnemonic } : null),
      ...(edit.readingMnemonic !== undefined ? { readingMnemonic: edit.readingMnemonic } : null),
      ...(edit.extraReadingMnemonic !== undefined
        ? { extraReadingMnemonic: edit.extraReadingMnemonic }
        : null),
      ...(edit.relatedMnemonicReadings !== undefined
        ? { relatedMnemonicReadings: edit.relatedMnemonicReadings }
        : null),
      ...(edit.onyomi !== undefined ? { onyomi: edit.onyomi } : null),
      ...(edit.kunyomi !== undefined ? { kunyomi: edit.kunyomi } : null),
      ...(edit.nanori !== undefined ? { nanori: edit.nanori } : null),
      ...(edit.radicalSubjectIds !== undefined
        ? { radicalSubjectIds: uniqueNumberList(edit.radicalSubjectIds) }
        : null),
      ...(edit.visuallySimilarKanji !== undefined
        ? { visuallySimilarKanji: edit.visuallySimilarKanji }
        : null),
    }
  })
}

function validateMnemonicMarkup(text) {
  const source = String(text || '')
  const issues = []
  const stack = []
  const tagPattern = /<([^<>]+)>/g
  let match
  while ((match = tagPattern.exec(source)) !== null) {
    const rawBody = match[1].trim()
    if (!rawBody) {
      issues.push('Empty tag <> is not allowed.')
      continue
    }
    const isClosing = rawBody.startsWith('/')
    const tagName = (isClosing ? rawBody.slice(1) : rawBody).trim().toLowerCase()
    if (!/^[a-z]+$/.test(tagName)) {
      issues.push(`Unsupported tag <${rawBody}>.`)
      continue
    }
    if (STANDALONE_MNEMONIC_TAGS.has(tagName)) {
      if (isClosing) {
        issues.push(`Closing tag </${tagName}> is not allowed.`)
      }
      continue
    }
    if (!ALLOWED_MNEMONIC_INLINE_TAGS.has(tagName)) {
      issues.push(`Unsupported tag <${rawBody}>.`)
      continue
    }
    if (isClosing) {
      const last = stack.pop()
      if (!last) {
        issues.push(`Closing tag </${tagName}> does not have a matching opening tag.`)
        continue
      }
      if (last !== tagName) {
        issues.push(`Expected </${last}> before </${tagName}>.`)
      }
      continue
    }
    stack.push(tagName)
  }
  if (source.replace(tagPattern, '').match(/[<>]/)) {
    issues.push('Stray < or > found outside supported tags.')
  }
  while (stack.length) {
    const tagName = stack.pop()
    issues.push(`Missing closing tag </${tagName}>.`)
  }
  return [...new Set(issues)]
}

function getDigitFromEvent(event) {
  const code = event.code || ''
  const digitMatch = code.match(/^Digit(\d)$/)
  if (digitMatch) return digitMatch[1]
  const numpadMatch = code.match(/^Numpad(\d)$/)
  if (numpadMatch) return numpadMatch[1]
  const keyCode = event.keyCode || event.which || event.charCode
  if (keyCode >= 48 && keyCode <= 57) return String(keyCode - 48)
  if (keyCode >= 96 && keyCode <= 105) return String(keyCode - 96)
  if (typeof event.key === 'string' && event.key.length === 1 && /\d/.test(event.key)) {
    return event.key
  }
  if (event.key && /^[0-9]$/.test(event.key)) return event.key
  return null
}

function getStatusHotkey(event) {
  const digit = getDigitFromEvent(event)
  if (digit === '1') return STATUS.NEEDS
  if (digit === '2') return STATUS.LUKEWARM
  if (digit === '3') return STATUS.COMFORTABLE
  if (digit === '4') return null
  return undefined
}

function getVocabHotkey(event) {
  const digit = getDigitFromEvent(event)
  if (digit === '2') return STATUS.LUKEWARM
  if (digit === '3') return STATUS.COMFORTABLE
  if (digit === '4') return null
  return undefined
}

function isMnemonicToggleHotkey(event) {
  return event.code === 'Comma' || event.key === ','
}

function getNextStatus(currentStatus) {
  const currentIndex = STATUS_ORDER_WITH_UNMARKED.indexOf(currentStatus || STATUS.UNMARKED)
  if (currentIndex === -1 || currentIndex === STATUS_ORDER_WITH_UNMARKED.length - 1) {
    return STATUS.NEEDS
  }
  return STATUS_ORDER_WITH_UNMARKED[currentIndex + 1]
}

function isTextEditingTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function expandLevelRange(values) {
  const numeric = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!numeric.length) return []
  const max = Math.max(...numeric)
  return Array.from({ length: max }, (_, index) => index + 1)
}

function getGroupCategoryId(category) {
  const slug = String(category || 'uncategorized')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `group-category-${slug || 'uncategorized'}`
}

function sortItemsByLevel(items) {
  return [...items].sort((left, right) => {
    const leftLevel = Number.isFinite(left?.level) ? left.level : Number.POSITIVE_INFINITY
    const rightLevel = Number.isFinite(right?.level) ? right.level : Number.POSITIVE_INFINITY
    return leftLevel - rightLevel
  })
}

function getSearchDisplayMeaning(primaryMeaning, otherMeanings, query) {
  const primary = String(primaryMeaning || '')
  const normalizedQuery = String(query || '').toLowerCase()
  if (!normalizedQuery) return primary
  const otherMatch = (otherMeanings || []).find((meaning) =>
    meaning.toLowerCase().includes(normalizedQuery)
  )
  return otherMatch && !primary.toLowerCase().includes(normalizedQuery) ? otherMatch : primary
}


function shuffleArray(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function getIdSignature(ids) {
  return [...ids].sort((a, b) => a - b).join(',')
}

function buildRandomQueue(ids, currentId = null) {
  const shuffled = shuffleArray(ids)
  if (!currentId || shuffled.length < 2 || shuffled[0] !== currentId) return shuffled
  const nextIndex = shuffled.findIndex((id) => id !== currentId)
  if (nextIndex <= 0) return shuffled
  const [nextId] = shuffled.splice(nextIndex, 1)
  shuffled.unshift(nextId)
  return shuffled
}

function scrollWindowToTop(top) {
  if (typeof window.scrollTo !== 'function') return
  try {
    window.scrollTo({ top, behavior: 'auto' })
  } catch {
    // jsdom does not implement window scrolling
  }
}

function isMobileDetailViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 760
}

function sanitizeOrder(order, ids) {
  const valid = new Set(ids)
  const seen = new Set()
  const result = []
  if (Array.isArray(order)) {
    order.forEach((id) => {
      if (!valid.has(id)) return
      if (seen.has(id)) return
      seen.add(id)
      result.push(id)
    })
  }
  ids.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    result.push(id)
  })
  return result
}

function normalizeVocabHighlights(vocabHighlights) {
  const source = vocabHighlights || {}
  return Object.entries(source).reduce((acc, [kanji, value]) => {
    if (Array.isArray(value)) {
      acc[kanji] = value.reduce(
        (map, id) => ({ ...map, [id]: { status: STATUS.COMFORTABLE, updated_at: null } }),
        {}
      )
      return acc
    }
    const next = Object.entries(value || {}).reduce((map, [id, entry]) => {
      if (typeof entry === 'string') {
        map[id] = { status: entry, updated_at: null }
      } else if (entry && typeof entry === 'object') {
        map[id] = {
          status: entry.status || STATUS.COMFORTABLE,
          updated_at: entry.updated_at || null,
        }
      }
      return map
    }, {})
    acc[kanji] = next
    return acc
  }, {})
}

function normalizeFlaggedEntries(entries, idField = 'kanji_id') {
  if (Array.isArray(entries)) {
    return entries.reduce((acc, entry) => {
      const id =
        typeof entry === 'number'
          ? entry
          : typeof entry === 'string'
            ? Number(entry)
            : Number(entry?.[idField])
      if (Number.isFinite(id) && id > 0) acc[id] = true
      return acc
    }, {})
  }
  return Object.entries(entries || {}).reduce((acc, [id, value]) => {
    const numericId = Number(id)
    if (!Number.isFinite(numericId) || numericId <= 0 || !value) return acc
    acc[numericId] = true
    return acc
  }, {})
}

function parseLevelsInput(input) {
  if (!input) return []
  const parts = input.split(',').map((part) => part.trim()).filter(Boolean)
  const levels = new Set()
  parts.forEach((part) => {
    if (part.includes('...')) {
      const [startRaw, endRaw] = part.split('...')
      const start = Number(startRaw)
      const end = Number(endRaw)
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        const min = Math.min(start, end)
        const max = Math.max(start, end)
        for (let lvl = min; lvl <= max; lvl += 1) levels.add(lvl)
      }
    } else {
      const value = Number(part)
      if (!Number.isNaN(value)) levels.add(value)
    }
  })
  return [...levels].sort((a, b) => a - b)
}

function isWeekday(date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}

function toLocalISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSprintLabel(date) {
  const datePart = date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  return `${datePart} ${weekday}`
}

function buildSprint(levelPool, startDate) {
  const sprintDays = []
  const start = new Date(startDate)
  while (!isWeekday(start)) start.setDate(start.getDate() + 1)
  const totalDays = 10
  let cursor = new Date(start)
  while (sprintDays.length < totalDays) {
    if (isWeekday(cursor)) {
      sprintDays.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  const base = Math.floor(levelPool.length / totalDays)
  const remainder = levelPool.length % totalDays
  return {
    id: `sprint-${Date.now()}`,
    start_date: toLocalISODate(start),
    level_pool: levelPool,
    day_base: base,
    day_remainder: remainder,
    days: sprintDays.map((day, index) => ({
      date: toLocalISODate(day),
      label: formatSprintLabel(day),
      size: base + (index < remainder ? 1 : 0),
      levels: [],
      draft_levels: null,
      committed_at: null,
      completed_at: null,
    })),
  }
}

async function loadKanjiCsvRows() {
  const response = await fetch(CSV_PATH)
  const text = await response.text()
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
  return {
    rows: parsed.data,
    fields: parsed.meta?.fields || Object.keys(parsed.data[0] || {}),
  }
}

const STORAGE_SYNC_FIELDS = [
  { field: 'familiarity', key: STORAGE_SLICES.familiarity, emptyValue: {} },
  { field: 'flaggedKanji', key: STORAGE_SLICES.flaggedKanji, emptyValue: {} },
  { field: 'flaggedRadicals', key: STORAGE_SLICES.flaggedRadicals, emptyValue: {} },
  { field: 'radicalFamiliarity', key: STORAGE_SLICES.radicalFamiliarity, emptyValue: {} },
  { field: 'readingStatusByKanji', key: STORAGE_SLICES.readingStatusByKanji, emptyValue: {} },
  { field: 'contentEditsByKanji', key: STORAGE_SLICES.contentEditsByKanji, emptyValue: {} },
  { field: 'groups', key: STORAGE_SLICES.groups, emptyValue: [] },
  { field: 'sprints', key: STORAGE_SLICES.sprints, emptyValue: [] },
  {
    field: 'highlightedVocabByKanji',
    key: STORAGE_SLICES.highlightedVocabByKanji,
    emptyValue: {},
  },
  { field: 'vocabOrderByKanji', key: STORAGE_SLICES.vocabOrderByKanji, emptyValue: {} },
  { field: 'ui', key: STORAGE_SLICES.ui, emptyValue: {} },
]

function useLocalStorageSync(slices, locked, canWrite) {
  const prevSlicesRef = useRef({})
  const latestSlicesRef = useRef(slices)

  useEffect(() => {
    latestSlicesRef.current = slices
  }, [slices])

  useEffect(() => {
    if (!slices || locked || !canWrite) return

    const pendingWrites = STORAGE_SYNC_FIELDS.filter(({ field }) => prevSlicesRef.current[field] !== slices[field])
    if (pendingWrites.length === 0) return

    const frameId = window.requestAnimationFrame(() => {
      pendingWrites.forEach(({ field, key, emptyValue }) => {
        saveStorageSlice(key, slices[field] || emptyValue)
        prevSlicesRef.current[field] = slices[field]
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [slices, locked, canWrite])

  // Keep a backward-compatible aggregate snapshot for existing tooling/tests.
  // Debounced and flushed on page exit to avoid repeated full serialization mid-interaction.
  useEffect(() => {
    if (!slices || locked || !canWrite) return
    const flushAggregateSnapshot = () => {
      const currentSlices = latestSlicesRef.current
      if (!currentSlices) return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSlices))
    }
    const timer = window.setTimeout(() => {
      flushAggregateSnapshot()
    }, 180)
    window.addEventListener('pagehide', flushAggregateSnapshot)
    window.addEventListener('beforeunload', flushAggregateSnapshot)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', flushAggregateSnapshot)
      window.removeEventListener('beforeunload', flushAggregateSnapshot)
    }
  }, [slices, locked, canWrite])
}

function useKeydown(handler) {
  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}

function useSupportsCardHover() {
  const [supportsCardHover, setSupportsCardHover] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => {
      setSupportsCardHover(mediaQuery.matches)
    }
    update()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(update)
      return () => mediaQuery.removeListener(update)
    }
    return undefined
  }, [])

  return supportsCardHover
}

function Modal({ isOpen, onClose, title, children, className = '' }) {
  const modalRef = useRef(null)

  const onKeyDown = useCallback(
    (event) => {
      if (!isOpen) return
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [isOpen, onClose]
  )

  useKeydown(onKeyDown)

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
      >
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  )
}

function getScrollParent(element) {
  let current = element?.parentElement || null
  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY || ''
    if (overflowY === 'auto' || overflowY === 'scroll') return current
    current = current.parentElement
  }
  return window
}

function MeasuredVirtualGridRow({
  rowIndex,
  top,
  rowItems,
  columnWidth,
  columnGap,
  renderItem,
  onHeightChange,
}) {
  const rowRef = useRef(null)

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return

    const measure = () => {
      const nextHeight = Math.ceil(row.getBoundingClientRect().height)
      onHeightChange(rowIndex, nextHeight)
    }

    measure()

    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(row)

    return () => observer.disconnect()
  }, [columnWidth, onHeightChange, rowIndex, rowItems.length])

  return (
    <div
      ref={rowRef}
      className="virtual-grid-row"
      style={{ top, gap: columnGap }}
    >
      {rowItems.map((item, itemIndex) => (
        <div
          key={item.id || `${rowIndex}-${itemIndex}`}
          className="virtual-grid-cell"
          style={{ width: columnWidth }}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  )
}

function VirtualGridInner({
  items,
  renderItem,
  estimatedRowHeight = 138,
  minColumnWidth = 105,
  maxColumnWidth = 150,
  columnGap = 12,
  rowGap = 12,
  overscanRows = 2,
}) {
  const VIRTUALIZE_THRESHOLD = 400
  const shouldVirtualize = items.length > VIRTUALIZE_THRESHOLD
  const containerRef = useRef(null)
  const rafRef = useRef(0)
  const scrollParentRef = useRef(null)
  const [rowHeights, setRowHeights] = useState({})
  const [layout, setLayout] = useState({
    containerWidth: 0,
    viewportHeight: 0,
    scrollTop: 0,
    offsetTop: 0,
  })
  const simpleGridStyle = useMemo(
    () => ({
      columnGap,
      rowGap,
      gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, ${maxColumnWidth}px))`,
    }),
    [columnGap, maxColumnWidth, minColumnWidth, rowGap]
  )

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const scrollParent = getScrollParent(container)
    scrollParentRef.current = scrollParent

    const containerRect = container.getBoundingClientRect()
    const isWindow = scrollParent === window
    const parentRect = isWindow
      ? { top: 0 }
      : scrollParent.getBoundingClientRect()
    const scrollTop = isWindow ? window.scrollY || window.pageYOffset : scrollParent.scrollTop
    const viewportHeight = isWindow ? window.innerHeight : scrollParent.clientHeight
    const offsetTop = containerRect.top - parentRect.top + scrollTop
    const containerWidth = container.clientWidth

    setLayout((prev) => {
      if (
        prev.containerWidth === containerWidth &&
        prev.viewportHeight === viewportHeight &&
        prev.scrollTop === scrollTop &&
        prev.offsetTop === offsetTop
      ) {
        return prev
      }
      return {
        containerWidth,
        viewportHeight,
        scrollTop,
        offsetTop,
      }
    })
  }, [])

  useLayoutEffect(() => {
    if (!shouldVirtualize) return
    measure()
  }, [measure, shouldVirtualize, items.length])

  useEffect(() => {
    if (!shouldVirtualize) return
    const container = containerRef.current
    if (!container) return

    const scheduleMeasure = () => {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0
        measure()
      })
    }

    const scrollParent = getScrollParent(container)
    scrollParentRef.current = scrollParent
    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(container)
    if (scrollParent !== window) {
      resizeObserver.observe(scrollParent)
    }

    const scrollTarget = scrollParent === window ? window : scrollParent
    scrollTarget.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      resizeObserver.disconnect()
      scrollTarget.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [measure, shouldVirtualize])

  const handleRowHeightChange = useCallback((rowIndex, nextHeight) => {
    if (!nextHeight || !Number.isFinite(nextHeight)) return
    setRowHeights((prev) => {
      if (prev[rowIndex] === nextHeight) return prev
      return { ...prev, [rowIndex]: nextHeight }
    })
  }, [])

  if (!shouldVirtualize) {
    return (
      <div ref={containerRef} className="simple-grid" style={simpleGridStyle}>
        {items.map(renderItem)}
      </div>
    )
  }

  const { containerWidth, viewportHeight, scrollTop, offsetTop } = layout
  if (containerWidth <= 0 || viewportHeight <= 0) {
    return (
      <div ref={containerRef} className="simple-grid" style={simpleGridStyle}>
        {items.map(renderItem)}
      </div>
    )
  }

  const columnCount = Math.max(
    1,
    Math.floor((containerWidth + columnGap) / (minColumnWidth + columnGap))
  )
  const columnWidth = Math.min(
    maxColumnWidth,
    Math.floor((containerWidth - columnGap * (columnCount - 1)) / columnCount)
  )
  const rowCount = Math.ceil(items.length / columnCount)
  const rowMetrics = []
  let totalHeight = 0
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const height = rowHeights[rowIndex] || estimatedRowHeight
    rowMetrics.push({ top: totalHeight, height })
    totalHeight += height
    if (rowIndex < rowCount - 1) totalHeight += rowGap
  }
  const viewportStart = scrollTop - offsetTop
  const viewportEnd = viewportStart + viewportHeight
  const overscanDistance = overscanRows * (estimatedRowHeight + rowGap)
  const renderStart = Math.max(0, viewportStart - overscanDistance)
  const renderEnd = viewportEnd + overscanDistance

  const rows = []
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowMeta = rowMetrics[rowIndex]
    const rowBottom = rowMeta.top + rowMeta.height
    if (rowBottom < renderStart || rowMeta.top > renderEnd) continue
    const startIndex = rowIndex * columnCount
    const rowItems = items.slice(startIndex, startIndex + columnCount)
    rows.push(
      <MeasuredVirtualGridRow
        key={`row-${rowIndex}`}
        rowIndex={rowIndex}
        top={rowMeta.top}
        rowItems={rowItems}
        columnWidth={columnWidth}
        columnGap={columnGap}
        renderItem={renderItem}
        onHeightChange={handleRowHeightChange}
      />
    )
  }

  return (
    <div ref={containerRef} className="virtual-grid-window" style={{ height: totalHeight }}>
      {rows}
    </div>
  )
}

function VirtualGrid({
  items,
  renderItem,
  estimatedRowHeight,
  columnGap,
  rowGap,
  minColumnWidth,
  maxColumnWidth,
}) {
  const resetKey = `${items.length}:${items[0]?.id ?? 'none'}`
  return (
    <VirtualGridInner
      key={resetKey}
      items={items}
      renderItem={renderItem}
      estimatedRowHeight={estimatedRowHeight}
      columnGap={columnGap}
      rowGap={rowGap}
      minColumnWidth={minColumnWidth}
      maxColumnWidth={maxColumnWidth}
    />
  )
}

function ReadingTokens({
  label,
  value,
  readingStatus,
  onToggle,
  className,
  kanjiId,
  allowShift = false,
}) {
  const tokens = splitReadingTokens(value)
  return (
    <div className={className}>
      <span className="reading-label">{label}:</span>
      {tokens.length === 0 ? (
        <span className="reading-empty" />
      ) : (
        tokens.map((token, index) => {
          const key = normalizeReadingToken(token)
          const status = key ? readingStatus[key] : null
          const statusClass =
            status === READING_STATUS.COMMON
              ? 'reading-common'
              : status === READING_STATUS.UNCOMMON
                ? 'reading-uncommon'
                : ''
          return (
            <span key={`${label}-${token}-${index}`} className="reading-token-wrapper">
              <button
                type="button"
                className={`reading-token ${statusClass}`}
                onMouseDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggle(kanjiId, token, event, { allowShift })
                }}
              >
                {token}
              </button>
              {index < tokens.length - 1 && <span className="reading-sep">, </span>}
            </span>
          )
        })
      )}
    </div>
  )
}

function CompactReadingSummary({ onyomi, kunyomi, readingStatus = {}, className = '' }) {
  const rows = [
    { label: 'O', value: onyomi },
    { label: 'K', value: kunyomi },
  ].filter((row) => row.value?.trim())

  if (rows.length === 0) return null

  return (
    <span className={`compact-reading-list ${className}`.trim()}>
      {rows.map((row) => {
        const tokens = splitReadingTokens(row.value)
        return (
          <span key={`${row.label}-${row.value}`} className="compact-reading-row" title={row.value}>
            <span className="compact-reading-label">{row.label}:</span>
            <span className="compact-reading-values">
              {tokens.map((token, index) => {
                const key = normalizeReadingToken(token)
                const status = key ? readingStatus[key] : null
                const statusClass =
                  status === READING_STATUS.COMMON
                    ? 'reading-common'
                    : status === READING_STATUS.UNCOMMON
                      ? 'reading-uncommon'
                      : ''
                return (
                  <span key={`${row.label}-${token}-${index}`} className="compact-reading-token-wrap">
                    <span className={`compact-reading-token ${statusClass}`}>{token}</span>
                    {index < tokens.length - 1 && <span className="compact-reading-sep">, </span>}
                  </span>
                )
              })}
            </span>
          </span>
        )
      })}
    </span>
  )
}

function KanjiCard({
  item,
  hideDetails,
  status,
  isFlagged,
  onOpen,
  onOpenDetail,
  onSetStatus,
  onToggleFlag,
  showMenu,
  onMenuToggle,
  onHover,
  hotkeySinkRef,
  supportsHover,
  readingStatus,
  onToggleReading,
  getHighlightedVocab,
  getVisuallySimilarKanji,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  showDragHandle,
  onMouseDownCapture,
  onMouseEnterExternal,
  classNameOverride,
}) {
  const [hoverAlign, setHoverAlign] = useState('center')
  const [hoverReady, setHoverReady] = useState(false)
  const highlightedNanori = useMemo(
    () => getHighlightedReadingTokens(item.nanori, readingStatus),
    [item.nanori, readingStatus]
  )
  const highlightedNanoriValue = highlightedNanori.join(', ')
  const hoverHighlightedVocab = useMemo(
    () => (hoverReady ? getHighlightedVocab?.(item.kanji) || [] : []),
    [getHighlightedVocab, hoverReady, item.kanji]
  )
  const hoverVisuallySimilarKanji = useMemo(
    () => (hoverReady ? getVisuallySimilarKanji?.(item) || [] : []),
    [getVisuallySimilarKanji, hoverReady, item]
  )
  const handleMouseEnter = (event) => {
    if (!supportsHover) return
    const rect = event.currentTarget.getBoundingClientRect()
    const hoverWidth = Math.min(800, Math.max(320, window.innerWidth - 32))
    if (rect.left < hoverWidth * 0.8) {
      setHoverAlign('left')
    } else if (rect.right + hoverWidth * 0.8 > window.innerWidth) {
      setHoverAlign('right')
    } else {
      setHoverAlign('center')
    }
    setHoverReady(true)
  }

  const focusHotkeySink = () => {
    hotkeySinkRef?.current?.focus?.()
  }

  return (
    <div
      className={`kanji-card ${STATUS_CLASS[status] || 'status-default'} ${
        isFlagged ? 'is-flagged' : ''
      } ${classNameOverride || ''}`}
      data-kanji-id={item.id}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onOpen(item)
          return
        }
        onOpenDetail?.(item)
      }}
      onMouseEnter={(event) => {
        if (!supportsHover) return
        handleMouseEnter(event)
        if (onHover) onHover(item.id, event.currentTarget)
        focusHotkeySink()
        if (onMouseEnterExternal) onMouseEnterExternal()
      }}
      onPointerEnter={(event) => {
        if (!supportsHover) return
        if (onHover) onHover(item.id, event.currentTarget)
        focusHotkeySink()
      }}
      onMouseLeave={() => {
        setHoverReady(false)
      }}
      onMouseDownCapture={(event) => {
        if (event.target?.closest?.('.reading-token')) return
        if (onMouseDownCapture) onMouseDownCapture(event)
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpenDetail?.(item)
        const digit = getDigitFromEvent(event)
        if (!digit) return
        event.preventDefault()
        if (digit === '1') onSetStatus(item.id, STATUS.NEEDS)
        if (digit === '2') onSetStatus(item.id, STATUS.LUKEWARM)
        if (digit === '3') onSetStatus(item.id, STATUS.COMFORTABLE)
        if (digit === '4') onSetStatus(item.id, null)
        if (digit === '5') onToggleFlag?.(item.id)
      }}
    >
      <div className="card-header">
        {isFlagged ? <span className="card-flag-tab" aria-hidden="true" /> : null}
        <span className="kanji-character">{item.kanji}</span>
        {showDragHandle && (
          <span
            className="drag-handle"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Drag to reorder"
            role="button"
            tabIndex={0}
          >
            ⇅
          </span>
        )}
        <button
          className="card-menu-trigger"
          onClick={(event) => {
            event.stopPropagation()
            onMenuToggle(item.id)
          }}
          aria-label="Open card menu"
        >
          ···
        </button>
        {showMenu && (
          <div className="card-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => onSetStatus(item.id, STATUS.NEEDS)}>Needs Work</button>
            <button onClick={() => onSetStatus(item.id, STATUS.LUKEWARM)}>Lukewarm</button>
            <button onClick={() => onSetStatus(item.id, STATUS.COMFORTABLE)}>Comfortable</button>
            <button onClick={() => onSetStatus(item.id, null)}>Clear</button>
            <button onClick={() => onToggleFlag?.(item.id)}>{isFlagged ? 'Unflag' : 'Flag'}</button>
          </div>
        )}
      </div>
      {!hideDetails && (
        <div className="card-details">
          <div className="meaning">{item.primaryMeaning}</div>
          <ReadingTokens
            label="O"
            value={item.onyomi}
            readingStatus={readingStatus}
            onToggle={onToggleReading}
            className="reading-line"
            kanjiId={item.id}
            allowShift
          />
          <ReadingTokens
            label="K"
            value={item.kunyomi}
            readingStatus={readingStatus}
            onToggle={onToggleReading}
            className="reading-line"
            kanjiId={item.id}
            allowShift
          />
          {highlightedNanori.length > 0 ? (
            <ReadingTokens
              label="N"
              value={highlightedNanoriValue}
              readingStatus={readingStatus}
              onToggle={onToggleReading}
              className="reading-line"
              kanjiId={item.id}
              allowShift
            />
          ) : null}
        </div>
      )}
      {supportsHover &&
        hoverReady &&
        (item.otherMeanings?.length > 0 ||
          item.onyomi ||
          item.kunyomi ||
          highlightedNanori.length > 0 ||
          item.strokeImg ||
          hoverVisuallySimilarKanji.length > 0 ||
          hoverHighlightedVocab.length > 0) && (
          <div
            className="hover-card"
            data-align={hoverAlign}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="hover-header">
              <div />
              {onOpenDetail && (
                <div className="hover-actions">
                  <button
                    type="button"
                    className="hover-detail-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenDetail(item)
                    }}
                  >
                    Open details
                  </button>
                </div>
              )}
            </div>
            <div className="hover-title">Primary meaning</div>
            <div className="hover-text">{item.primaryMeaning}</div>
            <div className="hover-title">Other meanings</div>
            <div className="hover-text">{item.otherMeanings.join(', ')}</div>
            <div className="hover-title">Readings</div>
            <div className="hover-reading-line">
              <ReadingTokens
                label="O"
                value={item.onyomi}
                readingStatus={readingStatus}
                onToggle={onToggleReading}
                className="reading-line hover-reading"
                kanjiId={item.id}
                allowShift
              />
            </div>
            <div className="hover-reading-line">
              <ReadingTokens
                label="K"
                value={item.kunyomi}
                readingStatus={readingStatus}
                onToggle={onToggleReading}
                className="reading-line hover-reading"
                kanjiId={item.id}
                allowShift
              />
            </div>
            {highlightedNanori.length > 0 ? (
              <div className="hover-reading-line">
                <ReadingTokens
                  label="N"
                  value={highlightedNanoriValue}
                  readingStatus={readingStatus}
                  onToggle={onToggleReading}
                  className="reading-line hover-reading"
                  kanjiId={item.id}
                  allowShift
                />
              </div>
            ) : null}
            {item.strokeImg && (
              <>
                <div className="hover-divider" />
                <div className="hover-stroke">
                  <img
                    src={`${import.meta.env.BASE_URL}strokes_media/${item.strokeImg}`}
                    alt="Stroke order"
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
              </>
            )}
            {hoverVisuallySimilarKanji.length > 0 && (
              <div className="hover-similar">
                <div className="hover-title">
                  Visually similar kanji ({hoverVisuallySimilarKanji.length})
                </div>
                <div className="hover-similar-list">
                  {hoverVisuallySimilarKanji.map((similar) => (
                    <button
                      key={similar.id}
                      type="button"
                      className="hover-similar-item"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenDetail?.(similar)
                      }}
                    >
                      <span className="hover-similar-char">{similar.kanji}</span>
                      <span className="hover-similar-meaning">{similar.primaryMeaning}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hoverHighlightedVocab.length > 0 && (
              <div className="hover-vocab">
                <div className="hover-title hover-vocab-title">Highlighted vocab</div>
                <div className="hover-vocab-list">
                  {hoverHighlightedVocab.map((vocab) => (
                    <div
                      key={vocab.id}
                      className={`hover-vocab-item ${vocab.highlightStatus || ''}`.trim()}
                    >
                      <div className="hover-vocab-top">
                        <span className="hover-vocab-word">{vocab.word}</span>
                        <span className="hover-vocab-reading">{vocab.primaryReading || ''}</span>
                      </div>
                      <div className="hover-vocab-bottom">
                        <span className="hover-vocab-meaning">{vocab.primaryMeaning}</span>
                        {vocab.partsOfSpeech?.length ? (
                          <span className="hover-vocab-pos">{vocab.partsOfSpeech.join(', ')}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  )
}

function RadicalCard({
  item,
  hideDetails,
  status,
  isFlagged,
  onOpen,
  onOpenDetail,
  onSetStatus,
  onToggleFlag,
  showMenu,
  onMenuToggle,
  onHover,
  hotkeySinkRef,
  supportsHover,
}) {
  return (
    <div
      className={`kanji-card radical-card ${STATUS_CLASS[status] || 'status-default'} ${
        isFlagged ? 'is-flagged' : ''
      }`}
      data-radical-id={item.id}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onOpen(item)
          return
        }
        onOpenDetail?.(item)
      }}
      onMouseEnter={(event) => {
        if (!supportsHover) return
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
      }}
      onPointerEnter={(event) => {
        if (!supportsHover) return
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpenDetail?.(item)
        const digit = getDigitFromEvent(event)
        if (!digit) return
        event.preventDefault()
        if (digit === '1') onSetStatus(item.id, STATUS.NEEDS)
        if (digit === '2') onSetStatus(item.id, STATUS.LUKEWARM)
        if (digit === '3') onSetStatus(item.id, STATUS.COMFORTABLE)
        if (digit === '4') onSetStatus(item.id, null)
        if (digit === '5') onToggleFlag?.(item.id)
      }}
    >
      <div className="card-header">
        {isFlagged ? <span className="card-flag-tab" aria-hidden="true" /> : null}
        <span className="kanji-character">{item.radical || item.primaryMeaning.slice(0, 1)}</span>
        <button
          className="card-menu-trigger"
          onClick={(event) => {
            event.stopPropagation()
            onMenuToggle(item.id)
          }}
          aria-label="Open card menu"
        >
          ···
        </button>
        {showMenu && (
          <div className="card-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => onSetStatus(item.id, STATUS.NEEDS)}>Needs Work</button>
            <button onClick={() => onSetStatus(item.id, STATUS.LUKEWARM)}>Lukewarm</button>
            <button onClick={() => onSetStatus(item.id, STATUS.COMFORTABLE)}>Comfortable</button>
            <button onClick={() => onSetStatus(item.id, null)}>Clear</button>
            <button onClick={() => onToggleFlag?.(item.id)}>{isFlagged ? 'Unflag' : 'Flag'}</button>
          </div>
        )}
      </div>
      {!hideDetails && (
        <div className="card-details">
          <div className="meaning">{item.primaryMeaning}</div>
        </div>
      )}
    </div>
  )
}

function MnemonicText({
  text,
  autoLinkKnownKanji = false,
  kanjiByCharacter = null,
  onOpenKanjiDetail = null,
  currentKanjiId = null,
}) {
  const paragraphs = useMemo(
    () =>
      String(text || '')
        .split(/\n\s*\n+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    [text]
  )
  if (!paragraphs.length) return <span>—</span>
  return (
    <div className="mnemonic-rich">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const segments = parseMnemonicSegments(paragraph)
        const subsections = splitMnemonicSubsections(segments)
        const isGroupedParagraph = subsections.length > 1
        return (
          <div key={`paragraph-${paragraphIndex}`} className="mnemonic-paragraph">
            {subsections.map((subsection, subsectionIndex) => (
              <div
                key={`subsection-${paragraphIndex}-${subsectionIndex}`}
                className={`mnemonic-subsection${
                  subsection.hasLeadingDivider ? ' is-divided' : ''
                }`}
              >
                {subsection.hasLeadingDivider ? (
                  <div className="mnemonic-divider" aria-hidden="true" />
                ) : null}
                <div
                  className={`mnemonic-subsection-content${
                    isGroupedParagraph ? ' is-grouped' : ''
                  }${
                    subsection.hasLeadingDivider ? ' is-divided' : ''
                  }`}
                >
                  {subsection.segments.map((segment, index) => {
                    if (segment.type === 'text') {
                      const runs = splitTextByJapaneseRuns(segment.value)
                      return (
                        <span
                          key={`text-${paragraphIndex}-${subsectionIndex}-${index}`}
                          className="mnemonic-text-fragment"
                        >
                          {runs.map((run, runIndex) => (
                            <span
                              key={`text-run-${paragraphIndex}-${subsectionIndex}-${index}-${runIndex}`}
                              className={`mnemonic-inline-run${
                                shouldStyleMnemonicRunAsJapanese(
                                  run,
                                  runIndex,
                                  runs,
                                  index,
                                  subsection.segments
                                )
                                  ? ' has-japanese'
                                  : ''
                              }`}
                            >
                              {renderMnemonicRunContent(
                                run,
                                `text-run-${paragraphIndex}-${subsectionIndex}-${index}-${runIndex}`,
                                autoLinkKnownKanji,
                                kanjiByCharacter,
                                onOpenKanjiDetail,
                                currentKanjiId
                              )}
                            </span>
                          ))}
                        </span>
                      )
                    }
                    return (
                      <span
                        key={`${segment.type}-${paragraphIndex}-${subsectionIndex}-${index}`}
                        className={`mnemonic-chip ${segment.type}${
                          containsJapaneseText(segment.value) ? ' has-japanese' : ''
                        }`}
                      >
                        {segment.value}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function QuizModal({
  isOpen,
  onClose,
  items,
  lightningMode,
  setLightningMode,
  familiarity,
  readingStatusByKanji,
  onToggleReading,
}) {
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState({})
  const [hideStatus, setHideStatus] = useState(true)

  const current = items[index]
  const currentResult = current ? results[current.id] : null

  const checkAnswer = useCallback(() => {
    if (!current) return
    const expected = normalizeMeaning(current.primaryMeaning)
    const given = normalizeMeaning(input)
    const correct = expected && expected === given
    setResults((prev) => ({ ...prev, [current.id]: correct ? 'correct' : 'incorrect' }))
    if (correct && lightningMode) {
      setInput('')
      setRevealed(false)
      setIndex((prev) => Math.min(prev + 1, items.length - 1))
    } else {
      setRevealed(true)
    }
  }, [current, input, items.length, lightningMode])

  const goNext = useCallback(() => {
    if (current && results[current.id] === undefined) {
      setResults((prev) => ({ ...prev, [current.id]: 'incorrect' }))
    }
    setIndex((prev) => Math.min(prev + 1, items.length - 1))
    setInput('')
    setRevealed(false)
  }, [current, items.length, results])

  const goPrev = useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0))
    setInput('')
    setRevealed(false)
  }, [])

  const totalCount = items.length
  const correctCount = Object.values(results).filter((value) => value === 'correct').length
  const quizComplete = totalCount > 0 && Object.keys(results).length >= totalCount
  const percentCorrect = totalCount ? Math.round((correctCount / totalCount) * 100) : 0

  const restartQuiz = useCallback(() => {
    setIndex(0)
    setInput('')
    setRevealed(false)
    setResults({})
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handler = (event) => {
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'Enter') {
        if (quizComplete) {
          restartQuiz()
          return
        }
        if (revealed) {
          goNext()
          return
        }
        checkAnswer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, checkAnswer, revealed, quizComplete, goNext, goPrev, restartQuiz])

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quiz">
      {quizComplete ? (
        <div className="quiz-summary">
          <div className="quiz-summary-title">Quiz Complete</div>
          <div className="quiz-summary-score">{percentCorrect}% correct</div>
          <div className="quiz-missed">
            <div className="quiz-missed-title">Missed</div>
            <div className="quiz-missed-grid">
              {items
                .filter((item) => results[item.id] === 'incorrect')
                .map((item) => (
                  <div key={item.id} className="quiz-missed-item">
                    <span className="quiz-missed-kanji">{item.kanji}</span>
                    <span className="quiz-missed-meaning">{item.primaryMeaning}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="quiz-correct">
            <div className="quiz-missed-title">Correct</div>
            <div className="quiz-missed-grid">
              {items
                .filter((item) => results[item.id] === 'correct')
                .map((item) => (
                  <div key={item.id} className="quiz-missed-item">
                    <span className="quiz-missed-kanji">{item.kanji}</span>
                    <span className="quiz-missed-meaning">{item.primaryMeaning}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="quiz-summary-actions">
            <div>[Enter] New Quiz</div>
            <div>[Esc] Return</div>
          </div>
        </div>
      ) : current ? (
        <div className="quiz-content">
          <div className="quiz-kanji">{current.kanji}</div>
          <div className="quiz-input">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type meaning"
              autoFocus
            />
            <button onClick={checkAnswer}>Submit</button>
          </div>
          <div className="quiz-actions">
            <button onClick={() => setRevealed(true)}>Reveal Answer</button>
            <button onClick={() => setLightningMode(!lightningMode)}>
              Lightning: {lightningMode ? 'On' : 'Off'}
            </button>
            <button onClick={() => setHideStatus((prev) => !prev)}>
              {hideStatus ? 'Show' : 'Hide'} Status
            </button>
          </div>
          {revealed && (
            <div className="quiz-reveal">
              <div className="quiz-meaning">{current.primaryMeaning}</div>
              <div className="quiz-readings">
                <ReadingTokens
                  label="O"
                  value={current.onyomi}
                  readingStatus={readingStatusByKanji[current.id] || {}}
                  onToggle={onToggleReading}
                  className="reading-line"
                  kanjiId={current.id}
                />
                <ReadingTokens
                  label="K"
                  value={current.kunyomi}
                  readingStatus={readingStatusByKanji[current.id] || {}}
                  onToggle={onToggleReading}
                  className="reading-line"
                  kanjiId={current.id}
                />
              </div>
            </div>
          )}
          {currentResult && (
            <div className={`quiz-result ${currentResult}`}>
              {currentResult === 'correct' ? 'Correct' : 'Incorrect'}
            </div>
          )}
          <div className="quiz-footer">
            <button onClick={goPrev} disabled={index === 0}>
              Prev
            </button>
            <button onClick={goNext} disabled={index === items.length - 1}>
              Next
            </button>
            <span className="quiz-status">
              {index + 1} / {items.length}
            </span>
          </div>
          {!hideStatus && (
            <div className="quiz-familiarity">
              Status:{' '}
              <span
                className={`quiz-familiarity-value ${
                  STATUS_CLASS[familiarity[current.id] || STATUS.UNMARKED]
                }`}
              >
                {STATUS_LABELS[familiarity[current.id]] || 'Unmarked'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="quiz-empty">No items to quiz.</div>
      )}
    </Modal>
  )
}

function GroupAddModal({ isOpen, onClose, kanjiList, groupItems, onAdd }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const results = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase()
    if (!normalized) return []
    const nextResults = []
    for (const item of kanjiList) {
      if (!(item.primaryMeaning || '').toLowerCase().includes(normalized)) continue
      nextResults.push(item)
      if (nextResults.length >= 30) break
    }
    return nextResults
  }, [deferredQuery, kanjiList])

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to Group">
      <div className="modal-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by meaning"
          autoFocus
        />
      </div>
      <div className="modal-results">
        {results.length === 0 && <div className="modal-empty">No results.</div>}
        {results.map((item) => {
          const isAdded = groupItems.includes(item.id)
          return (
            <button
              key={item.id}
              className="modal-result"
              onClick={() => onAdd(item.id)}
              disabled={isAdded}
            >
              <span className="modal-kanji">{item.kanji}</span>
              <span>{item.primaryMeaning}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

const SIDEBAR_WIDTH_DEFAULT = 220
const SIDEBAR_WIDTH_MIN = 180
const SIDEBAR_WIDTH_MAX = 360

function clampSidebarWidth(width) {
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, width))
}

function SidebarResizeHandle({ layoutRef, width, onCommitWidth }) {
  const dragWidthRef = useRef(clampSidebarWidth(width || SIDEBAR_WIDTH_DEFAULT))
  const cleanupRef = useRef(null)

  useEffect(() => {
    dragWidthRef.current = clampSidebarWidth(width || SIDEBAR_WIDTH_DEFAULT)
    const layout = layoutRef.current
    if (layout) {
      layout.style.setProperty('--sidebar-width', `${dragWidthRef.current}px`)
    }
  }, [layoutRef, width])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const handleMouseDown = useCallback(
    (event) => {
      event.preventDefault()
      cleanupRef.current?.()

      const layout = layoutRef.current
      const startX = event.clientX
      const startWidth = dragWidthRef.current

      const applyWidth = (nextWidth) => {
        const clamped = clampSidebarWidth(nextWidth)
        dragWidthRef.current = clamped
        if (layout) {
          layout.style.setProperty('--sidebar-width', `${clamped}px`)
        }
      }

      const onMove = (moveEvent) => {
        applyWidth(startWidth + (moveEvent.clientX - startX))
      }

      const onUp = () => {
        const finalWidth = dragWidthRef.current
        cleanup()
        onCommitWidth(finalWidth)
      }

      const cleanup = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        cleanupRef.current = null
      }

      cleanupRef.current = cleanup
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [layoutRef, onCommitWidth]
  )

  return (
    <div
      className="sidebar-resizer"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  )
}

const LevelsPage = memo(function LevelsPage({
  layoutRef,
  sidebarWidth,
  levelSidebarLevels,
  levels,
  selectedLevel,
  selectLevel,
  levelItems,
  levelCounts,
  openLevelQuiz,
  shuffleLevel,
  toggleAlpha,
  toggleFamiliarity,
  mode,
  groupedByFamiliarity,
  orderedItems,
  renderCard,
  renderFamiliarityCard,
  kanjiGridRowHeight,
  cardMinColumnWidth,
  cardMaxColumnWidth,
  commitSidebarWidth,
}) {
  return (
    <div
      ref={layoutRef}
      className="page layout levels-page"
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
    >
      <aside className="sidebar">
        <div className="sidebar-title">Levels</div>
        <div className="sidebar-level-grid">
          {levelSidebarLevels.map((level) => (
            <button
              key={level}
              className={level === selectedLevel ? 'active' : ''}
              onClick={() => selectLevel(level)}
              aria-label={`Level ${level}`}
              title={`Level ${level}`}
              disabled={!levels.includes(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </aside>
      <SidebarResizeHandle
        layoutRef={layoutRef}
        width={sidebarWidth}
        onCommitWidth={commitSidebarWidth}
      />
      <section className="content">
        <div className="level-header">
          <div>
            <h1>Level {selectedLevel}</h1>
            <div className="level-counts">
              <span className="count-total">Total: {levelItems.length}</span>
              <div className="count-badges">
                <span className="count-badge status-needs">{levelCounts[STATUS.NEEDS]}</span>
                <span className="count-badge status-lukewarm">{levelCounts[STATUS.LUKEWARM]}</span>
                <span className="count-badge status-comfortable">
                  {levelCounts[STATUS.COMFORTABLE]}
                </span>
                <span className="count-badge status-default">{levelCounts[STATUS.UNMARKED]}</span>
              </div>
            </div>
          </div>
          <div className="level-actions">
            <button onClick={openLevelQuiz}>Quiz</button>
            <button onClick={shuffleLevel}>Shuffle</button>
            <button onClick={toggleAlpha}>Sort Alphabetically</button>
            <button onClick={toggleFamiliarity}>Sort by Familiarity</button>
          </div>
        </div>
        <div className="progress-bar" />
        <div className="level-grid-limit">
          <div className="grid-wrapper">
            {mode === 'familiarity' ? (
              <div className="familiarity-split">
                {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                  <div key={status} className="split-section">
                    <VirtualGrid
                      items={groupedByFamiliarity[status]}
                      renderItem={(item) => renderFamiliarityCard(item, 'level')}
                      estimatedRowHeight={kanjiGridRowHeight}
                      minColumnWidth={cardMinColumnWidth}
                      maxColumnWidth={cardMaxColumnWidth}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <VirtualGrid
                items={orderedItems}
                renderItem={renderCard}
                estimatedRowHeight={kanjiGridRowHeight}
                minColumnWidth={cardMinColumnWidth}
                maxColumnWidth={cardMaxColumnWidth}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
})

const RadicalsPage = memo(function RadicalsPage({
  layoutRef,
  sidebarWidth,
  radicalSidebarLevels,
  radicalLevels,
  selectedRadicalLevel,
  selectRadicalLevel,
  radicalLevelItems,
  radicalLevelCounts,
  shuffleRadicals,
  toggleRadicalAlpha,
  toggleRadicalFamiliarity,
  radicalMode,
  groupedRadicalsByFamiliarity,
  orderedRadicalItems,
  renderRadicalCard,
  radicalGridRowHeight,
  cardMinColumnWidth,
  cardMaxColumnWidth,
  commitSidebarWidth,
}) {
  return (
    <div
      ref={layoutRef}
      className="page layout levels-page radicals-page"
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
    >
      <aside className="sidebar">
        <div className="sidebar-title">Radicals</div>
        <div className="sidebar-level-grid">
          {radicalSidebarLevels.map((level) => (
            <button
              key={level}
              className={level === selectedRadicalLevel ? 'active' : ''}
              onClick={() => selectRadicalLevel(level)}
              aria-label={`Level ${level}`}
              title={`Level ${level}`}
              disabled={!radicalLevels.includes(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </aside>
      <SidebarResizeHandle
        layoutRef={layoutRef}
        width={sidebarWidth}
        onCommitWidth={commitSidebarWidth}
      />
      <section className="content">
        <div className="level-header">
          <div>
            <h1>Level {selectedRadicalLevel}</h1>
            <div className="level-counts">
              <span className="count-total">Total: {radicalLevelItems.length}</span>
              <div className="count-badges">
                <span className="count-badge status-needs">
                  {radicalLevelCounts[STATUS.NEEDS]}
                </span>
                <span className="count-badge status-lukewarm">
                  {radicalLevelCounts[STATUS.LUKEWARM]}
                </span>
                <span className="count-badge status-comfortable">
                  {radicalLevelCounts[STATUS.COMFORTABLE]}
                </span>
                <span className="count-badge status-default">
                  {radicalLevelCounts[STATUS.UNMARKED]}
                </span>
              </div>
            </div>
          </div>
          <div className="level-actions">
            <button onClick={shuffleRadicals}>Shuffle</button>
            <button onClick={toggleRadicalAlpha}>Sort Alphabetically</button>
            <button onClick={toggleRadicalFamiliarity}>Sort by Familiarity</button>
          </div>
        </div>
        <div className="progress-bar" />
        <div className="level-grid-limit">
          <div className="grid-wrapper">
            {radicalMode === 'familiarity' ? (
              <div className="familiarity-split">
                {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                  <div key={status} className="split-section">
                    <VirtualGrid
                      items={groupedRadicalsByFamiliarity[status]}
                      renderItem={renderRadicalCard}
                      estimatedRowHeight={radicalGridRowHeight}
                      minColumnWidth={cardMinColumnWidth}
                      maxColumnWidth={cardMaxColumnWidth}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <VirtualGrid
                items={orderedRadicalItems}
                renderItem={renderRadicalCard}
                estimatedRowHeight={radicalGridRowHeight}
                minColumnWidth={cardMinColumnWidth}
                maxColumnWidth={cardMaxColumnWidth}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
})

function App() {
  const [kanjiBaseList, setKanjiBaseList] = useState([])
  const [radicalList, setRadicalList] = useState([])
  const [loading, setLoading] = useState(true)
  const [familiarity, setFamiliarity] = useState({})
  const [flaggedKanji, setFlaggedKanji] = useState({})
  const [flaggedRadicals, setFlaggedRadicals] = useState({})
  const [radicalFamiliarity, setRadicalFamiliarity] = useState({})
  const [readingStatusByKanji, setReadingStatusByKanji] = useState({})
  const [contentEditsByKanji, setContentEditsByKanji] = useState({})
  const [groups, setGroups] = useState([])
  const [sprints, setSprints] = useState([])
  const [vocabEntriesByKanji, setVocabEntriesByKanji] = useState(() => new Map())
  const [highlightedVocabByKanji, setHighlightedVocabByKanji] = useState({})
  const [vocabOrderByKanji, setVocabOrderByKanji] = useState({})
  const [ui, setUi] = useState(DEFAULT_UI)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [openHeaderMenu, setOpenHeaderMenu] = useState(null)
  const [quizItems, setQuizItems] = useState([])
  const [quizOpen, setQuizOpen] = useState(false)
  const [globalQuizOpen, setGlobalQuizOpen] = useState(false)
  const [randomReviewSettingsOpen, setRandomReviewSettingsOpen] = useState(false)
  const [globalQuizLevels, setGlobalQuizLevels] = useState('')
  const [globalQuizStatuses, setGlobalQuizStatuses] = useState({
    [STATUS.NEEDS]: false,
    [STATUS.LUKEWARM]: false,
    [STATUS.COMFORTABLE]: false,
  })
  const [draftRandomReviewConfig, setDraftRandomReviewConfig] = useState(() =>
    normalizeRandomReviewConfig(DEFAULT_RANDOM_REVIEW_CONFIG)
  )
  const [aboutOpen, setAboutOpen] = useState(false)
  const [sprintHistoryOpen, setSprintHistoryOpen] = useState(false)
  const [sprintLevelStatusOpen, setSprintLevelStatusOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const headerMenusRef = useRef(null)
  const [familiarityLevelFilter, setFamiliarityLevelFilter] = useState('')
  const deferredFamiliarityLevelFilter = useDeferredValue(familiarityLevelFilter)
  const [deletedGroup, setDeletedGroup] = useState(null)
  const [groupAddOpen, setGroupAddOpen] = useState(false)
  const [detailKanji, setDetailKanji] = useState(null)
  const [detailRadical, setDetailRadical] = useState(null)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailEditDraft, setDetailEditDraft] = useState(null)
  const [detailRadicalPickerIds, setDetailRadicalPickerIds] = useState([])
  const [detailRadicalSearch, setDetailRadicalSearch] = useState('')
  const deferredDetailRadicalSearch = useDeferredValue(detailRadicalSearch)
  const [detailSimilarPickerIds, setDetailSimilarPickerIds] = useState([])
  const [detailSimilarSearch, setDetailSimilarSearch] = useState('')
  const deferredDetailSimilarSearch = useDeferredValue(detailSimilarSearch)
  const [detailComponentPendingRemoveId, setDetailComponentPendingRemoveId] = useState(null)
  const [detailSimilarPendingRemoveKanji, setDetailSimilarPendingRemoveKanji] = useState(null)
  const [detailRadicalEditMode, setDetailRadicalEditMode] = useState(false)
  const [detailRadicalKanjiSearch, setDetailRadicalKanjiSearch] = useState('')
  const [detailRadicalPendingRemoveId, setDetailRadicalPendingRemoveId] = useState(null)
  const [compareKanjiByCharacter, setCompareKanjiByCharacter] = useState(null)
  const [compareKanjiLoading, setCompareKanjiLoading] = useState(false)
  const [compareKanjiError, setCompareKanjiError] = useState('')
  const compareKanjiLoadStartedRef = useRef(false)
  const hoveredVocabRef = useRef(null)
  const [vocabDragId, setVocabDragId] = useState(null)
  const [vocabDragOverId, setVocabDragOverId] = useState(null)
  const [vocabDragPosition, setVocabDragPosition] = useState('before')
  const [hydrated, setHydrated] = useState(false)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverGroupId, setDragOverGroupId] = useState(null)
  const hoveredRadicalRef = useRef(null)
  const lastPointerTargetRef = useRef(null)
  const hotkeySinkRef = useRef(null)
  const ownerIdRef = useRef(`tab-${Math.random().toString(36).slice(2)}`)
  const [isStorageOwner, setIsStorageOwner] = useState(true)
  const [globalHide, setGlobalHide] = useState(false)
  const [decolor, setDecolor] = useState(false)
  const [dragFamiliarityId, setDragFamiliarityId] = useState(null)
  const [dragTargetId, setDragTargetId] = useState(null)
  const [dragContext, setDragContext] = useState(null)
  const [shiftPressed, setShiftPressed] = useState(false)
  const [altPressed, setAltPressed] = useState(false)
  const [hasRandomFlaggedQueue, setHasRandomFlaggedQueue] = useState(false)
  const [randomFlaggedProgress, setRandomFlaggedProgress] = useState({ current: 0, total: 0 })
  const levelShuffleRef = useRef({ level: null, signature: '', order: [] })
  const randomFlaggedQueueRef = useRef({ ids: [], index: 0, signature: '' })
  const detailScrollTargetRef = useRef('top')
  const familiarityDetailScrollRef = useRef(null)
  const familiarityRestorePendingRef = useRef(null)
  const familiarityContentRef = useRef(null)
  const groupSidebarRef = useRef(null)
  const groupSidebarTopRef = useRef(null)
  const sidebarLayoutRef = useRef(null)
  const detailEditModeRef = useRef(false)
  const detailEditDirtyRef = useRef(false)
  const detailKanjiRef = useRef(null)
  const detailRadicalRef = useRef(null)
  const supportsCardHover = useSupportsCardHover()
  const sidebarWidth = clampSidebarWidth(ui.sidebarWidth || SIDEBAR_WIDTH_DEFAULT)
  const kanjiList = useMemo(
    () => applyContentEdits(kanjiBaseList, contentEditsByKanji),
    [kanjiBaseList, contentEditsByKanji]
  )

  const updateHoveredCard = useCallback((id, target = null) => {
    if (target) lastPointerTargetRef.current = target
  }, [])

  const updateHoveredRadical = useCallback((id, target = null) => {
    hoveredRadicalRef.current = id
    if (target) lastPointerTargetRef.current = target
  }, [])

  const updateHoveredVocab = useCallback((id, target = null) => {
    hoveredVocabRef.current = id
    if (target) lastPointerTargetRef.current = target
  }, [])

  useEffect(() => {
    let active = true
    const hydrateFromPayload = (stored) => {
      setFamiliarity(stored.familiarity || {})
      setFlaggedKanji(normalizeFlaggedEntries(stored.flaggedKanji || stored.flagged_kanji))
      setFlaggedRadicals(
        normalizeFlaggedEntries(stored.flaggedRadicals || stored.flagged_radicals, 'radical_id')
      )
      setRadicalFamiliarity(stored.radicalFamiliarity || {})
      setReadingStatusByKanji(stored.readingStatusByKanji || {})
      setContentEditsByKanji(
        normalizeContentEditsMap(stored.contentEditsByKanji || stored.content_edits_by_kanji)
      )
      setGroups(stored.groups || [])
      setSprints(stored.sprints || [])
      setHighlightedVocabByKanji(normalizeVocabHighlights(stored.highlightedVocabByKanji))
      setVocabOrderByKanji(stored.vocabOrderByKanji || {})
      setUi((prev) => {
        const nextUi = { ...prev, ...stored.ui }
        if (!stored.ui?.randomReviewConfig && stored.ui?.randomReviewFilters) {
          nextUi.randomReviewConfig = normalizeRandomReviewConfig(null, stored.ui.randomReviewFilters)
        }
        return nextUi
      })
    }
    const load = async () => {
      const stored = loadStorage()
      if (stored) {
        if (active) {
          hydrateFromPayload(stored)
          setHydrated(true)
        }
        return
      }
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}default-data.json`)
        const text = await response.text()
        const parsed = JSON.parse(text)
        if (parsed.version === 1 && active) {
          const next = {
            familiarity: {},
            flaggedKanji: {},
            flaggedRadicals: {},
            radicalFamiliarity: {},
            readingStatusByKanji: {},
            groups: [],
            ui: {},
            ...parsed,
          }
          hydrateFromPayload(next)
        }
      } catch {
        // ignore missing/invalid default data
      } finally {
        if (active) setHydrated(true)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const tabId = ownerIdRef.current
    const now = Date.now()
    const current = loadStorageOwner()
    const isExpired = !current || !current.ts || now - current.ts > STORAGE_OWNER_TTL_MS
    if (!current || current.id === tabId || isExpired) {
      saveStorageOwner({ id: tabId, ts: now })
      setIsStorageOwner(true)
    } else {
      setIsStorageOwner(false)
    }

    const interval = setInterval(() => {
      const owner = loadStorageOwner()
      if (owner && owner.id === tabId) {
        saveStorageOwner({ id: tabId, ts: Date.now() })
      }
    }, 5000)

    const onStorage = (event) => {
      if (event.key !== STORAGE_OWNER_KEY) return
      const owner = loadStorageOwner()
      if (!owner) return
      setIsStorageOwner(owner.id === tabId)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (ui.globalQuizLevels !== undefined && ui.globalQuizLevels !== globalQuizLevels) {
      setGlobalQuizLevels(ui.globalQuizLevels || '')
    }
    if (ui.globalQuizStatuses && ui.globalQuizStatuses !== globalQuizStatuses) {
      setGlobalQuizStatuses(ui.globalQuizStatuses)
    }
  }, [hydrated, ui.globalQuizLevels, ui.globalQuizStatuses, globalQuizLevels, globalQuizStatuses])

  const randomReviewConfig = useMemo(
    () => normalizeRandomReviewConfig(ui.randomReviewConfig, ui.randomReviewFilters),
    [ui.randomReviewConfig, ui.randomReviewFilters]
  )

  useEffect(() => {
    if (!randomReviewSettingsOpen) return
    setDraftRandomReviewConfig(randomReviewConfig)
  }, [randomReviewConfig, randomReviewSettingsOpen])

  useEffect(() => {
    let ignore = false
    async function loadCsv() {
      setLoading(true)
      const { rows } = await loadKanjiCsvRows()
      const formatted = rows.map((row, index) => {
        const other = row.other_meanings
          ? row.other_meanings.split(',').map((item) => item.trim()).filter(Boolean)
          : []
        const strokeMatch = row.StrokeImg ? row.StrokeImg.match(/src="([^"]+)"/) : null
        return {
          id: index + 1,
          wkSubjectId: Number(row.wk_subject_id) || 0,
          kanji: row.kanji,
          primaryMeaning: row.primary_meaning,
          otherMeanings: other,
          onyomi: row.onyomi,
          kunyomi: row.kunyomi,
          nanori: row.nanori || '',
          meaningMnemonic: row.meaning_mnemonic || row.meaningMnemonic || '',
          extraReadingMnemonic:
            row.extra_reading_mnemonic || row.extraReadingMnemonic || '',
          relatedMnemonicReadings:
            row.related_kanji_and_readings ||
            row.related_mnemonic_readings ||
            row.relatedMnemonicReadings ||
            '',
          readingMnemonic: row.reading_mnemonic || row.readingMnemonic || '',
          url: row.url,
          level: Number(row.wk_level),
          radicalSubjectIds: parseIdArray(row.radical_subject_ids),
          visuallySimilarKanji: row.visually_similar_kanji,
          strokeImg: strokeMatch ? strokeMatch[1] : '',
        }
      })
      if (!ignore) {
        setKanjiBaseList(formatted)
        setLoading(false)
      }
    }
    loadCsv()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    async function loadVocabCsv() {
      try {
        const response = await fetch(VOCAB_CSV_PATH)
        const text = await response.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        const entriesByKanji = new Map()
        parsed.data.forEach((row) => {
          const other = row.other_meanings
            ? row.other_meanings.split(',').map((item) => item.trim()).filter(Boolean)
            : []
          const parts = row.parts_of_speech
            ? row.parts_of_speech.split(',').map((item) => item.trim()).filter(Boolean)
            : []
          let componentKanji = []
          if (row.component_subject_kanji_json) {
            try {
              componentKanji = JSON.parse(row.component_subject_kanji_json)
            } catch {
              componentKanji = []
            }
          }
          const entry = {
            id: Number(row.wk_subject_id),
            word: row.word,
            primaryReading: row.primary_reading,
            primaryMeaning: row.primary_meaning,
            otherMeanings: other,
            partsOfSpeech: parts,
            url: row.url || row.document_url,
          }
          uniqueStringList(componentKanji).forEach((kanji) => {
            if (!entriesByKanji.has(kanji)) entriesByKanji.set(kanji, [])
            entriesByKanji.get(kanji).push(entry)
          })
        })
        if (!ignore) setVocabEntriesByKanji(entriesByKanji)
      } catch {
        if (!ignore) setVocabEntriesByKanji(new Map())
      }
    }
    loadVocabCsv()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!ui.detailMnemonicCompareOpen) return
    if (compareKanjiByCharacter || compareKanjiLoadStartedRef.current) return
    compareKanjiLoadStartedRef.current = true
    let ignore = false
    async function loadCompareKanjiCsv() {
      try {
        setCompareKanjiLoading(true)
        setCompareKanjiError('')
        const response = await fetch(KANJI_COMPARE_CSV_PATH)
        if (!response.ok) throw new Error(`HTTP_${response.status}`)
        const text = await response.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        const map = new Map()
        parsed.data.forEach((row) => {
          const kanji = row.kanji
          if (!kanji) return
          map.set(kanji, {
            meaningMnemonic: row.meaning_mnemonic || row.meaningMnemonic || '',
            readingMnemonic: row.reading_mnemonic || row.readingMnemonic || '',
            extraReadingMnemonic:
              row.extra_reading_mnemonic || row.extraReadingMnemonic || '',
            relatedMnemonicReadings:
              row.related_kanji_and_readings ||
              row.related_mnemonic_readings ||
              row.relatedMnemonicReadings ||
              '',
            radicalSubjectIds: parseIdArray(row.radical_subject_ids),
            visuallySimilarKanji: row.visually_similar_kanji || '',
          })
        })
        if (!ignore) setCompareKanjiByCharacter(map)
      } catch (error) {
        if (ignore) return
        const message = String(error?.message || '')
        if (message.includes('HTTP_404')) {
          setCompareKanjiError(
            'Compare file not found: public/data/kanji_new.csv. Add it to enable side-by-side compare.'
          )
          return
        }
        setCompareKanjiError(
          'Could not load kanji_new.csv for comparison. The app will continue without compare data.'
        )
      } finally {
        setCompareKanjiLoading(false)
      }
    }
    loadCompareKanjiCsv()
    return () => {
      ignore = true
    }
  }, [ui.detailMnemonicCompareOpen, compareKanjiByCharacter])

  useEffect(() => {
    let ignore = false
    async function loadRadicalCsv() {
      try {
        const response = await fetch(RADICAL_CSV_PATH)
        const text = await response.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        const rows = parsed.data
        const formatted = rows.map((row, index) => {
          const other = row.other_meanings
            ? row.other_meanings.split(',').map((item) => item.trim()).filter(Boolean)
            : []
          return {
            id: Number(row.wk_subject_id) || index + 1,
            radical: row.radical_character || '',
            primaryMeaning: row.primary_meaning || '',
            otherMeanings: other,
            meaningMnemonic: row.meaning_mnemonic || '',
            level: Number(row.wk_level) || 0,
            url: row.url || '',
            slug: slugifyValue(row.primary_meaning || ''),
            imageFile: row.downloaded_image_files || '',
            amalgamationKanji: parseJsonArray(row.amalgamation_kanji_json),
          }
        })
        if (!ignore) setRadicalList(formatted)
      } catch {
        if (!ignore) setRadicalList([])
      }
    }
    loadRadicalCsv()
    return () => {
      ignore = true
    }
  }, [])

  useLocalStorageSync(
    hydrated
      ? {
          familiarity,
          flaggedKanji,
          flaggedRadicals,
          radicalFamiliarity,
          readingStatusByKanji,
          contentEditsByKanji,
          groups,
          sprints,
          ui,
          highlightedVocabByKanji,
          vocabOrderByKanji,
        }
      : null,
    ui.storageLocked,
    isStorageOwner
  )

  useEffect(() => {
    setOpenMenuId(null)
  }, [ui.page, ui.selectedLevel])

  const levels = useMemo(() => {
    const levelSet = new Set(kanjiList.map((item) => item.level))
    return [...levelSet].sort((a, b) => a - b)
  }, [kanjiList])

  const rangeLevels = ui.rangeLevels || ''
  const rangeView = ui.rangeView || 'kanji'
  const rangeLevelsList = useMemo(() => {
    if (!rangeLevels.trim()) return []
    return parseLevelsInput(rangeLevels)
  }, [rangeLevels])

  const activeSprint = useMemo(
    () => sprints.find((sprint) => sprint.id === ui.sprintActiveId) || null,
    [sprints, ui.sprintActiveId]
  )

  const activeSprintDay = activeSprint?.days?.[ui.sprintDayIndex] || null
  const sprintDayLevels = useMemo(() => {
    if (!activeSprintDay) return []
    if (activeSprintDay.committed_at) return activeSprintDay.levels || []
    return activeSprintDay.draft_levels || []
  }, [activeSprintDay])
  const sprintViewMode = ui.sprintViewMode || 'levels'
  const sprintSortMode = ui.sprintSortMode || 'normal'
  const sprintOrderByLevel = ui.sprintOrderByLevel || {}
  const sprintAllOrder = ui.sprintAllOrder || []
  const sprintSummaries = useMemo(
    () =>
      sprints.map((sprint, index) => {
        const first = sprint.days[0]
        const last = sprint.days[sprint.days.length - 1]
        return {
          id: sprint.id,
          number: index + 1,
          startLabel: first?.label || sprint.start_date,
          endLabel: last?.label || sprint.start_date,
        }
      }),
    [sprints]
  )

  useEffect(() => {
    if (!activeSprint) return
    if (ui.sprintDayIndex < 0 || ui.sprintDayIndex >= activeSprint.days.length) {
      setUi((prev) => ({ ...prev, sprintDayIndex: 0 }))
    }
  }, [activeSprint, ui.sprintDayIndex])

  const setOrderForLevel = useCallback((level, order) => {
    if (ui.storageLocked || !isStorageOwner) return
    setUi((prev) => ({
      ...prev,
      orderByLevel: { ...prev.orderByLevel, [level]: order },
    }))
  }, [ui.storageLocked, isStorageOwner])

  const setGlobalOrder = useCallback((order) => {
    if (ui.storageLocked || !isStorageOwner) return
    setUi((prev) => ({ ...prev, familiarityOrder: order }))
  }, [ui.storageLocked, isStorageOwner])

  const setFamiliarityOrderForLevel = useCallback((level, order) => {
    if (ui.storageLocked || !isStorageOwner) return
    setUi((prev) => ({
      ...prev,
      familiarityOrderByLevel: { ...prev.familiarityOrderByLevel, [level]: order },
    }))
  }, [ui.storageLocked, isStorageOwner])

  const setRadicalOrderForLevel = useCallback((level, order) => {
    if (ui.storageLocked || !isStorageOwner) return
    setUi((prev) => ({
      ...prev,
      radicalOrderByLevel: { ...prev.radicalOrderByLevel, [level]: order },
    }))
  }, [ui.storageLocked, isStorageOwner])

  const commitSidebarWidth = useCallback((nextWidth) => {
    const clamped = clampSidebarWidth(nextWidth)
    setUi((prev) => {
      if ((prev.sidebarWidth || SIDEBAR_WIDTH_DEFAULT) === clamped) return prev
      return { ...prev, sidebarWidth: clamped }
    })
  }, [])

  const setRadicalFamiliarityOrderForLevel = useCallback((level, order) => {
    if (ui.storageLocked || !isStorageOwner) return
    setUi((prev) => ({
      ...prev,
      radicalFamiliarityOrderByLevel: {
        ...prev.radicalFamiliarityOrderByLevel,
        [level]: order,
      },
    }))
  }, [ui.storageLocked, isStorageOwner])

  const familiarityOrder = useMemo(() => {
    const ids = kanjiList.map((item) => item.id)
    const existing = ui.familiarityOrder || []
    const missing = ids.filter((id) => !existing.includes(id))
    return existing.length ? [...existing, ...missing] : ids
  }, [kanjiList, ui.familiarityOrder])

  useEffect(() => {
    if (!kanjiList.length || ui.familiarityOrder) return
    setGlobalOrder(kanjiList.map((item) => item.id))
  }, [kanjiList, ui.familiarityOrder, setGlobalOrder])

  const selectedLevel = ui.selectedLevel
  const selectedRadicalLevel = ui.selectedRadicalLevel || 1
  const levelItemsByLevel = useMemo(() => {
    const map = new Map()
    kanjiList.forEach((item) => {
      if (!map.has(item.level)) map.set(item.level, [])
      map.get(item.level).push(item)
    })
    return map
  }, [kanjiList])
  const getLevelItems = useCallback(
    (level) => levelItemsByLevel.get(level) || [],
    [levelItemsByLevel]
  )
  const radicalLevels = useMemo(() => {
    const set = new Set(radicalList.map((item) => item.level).filter((lvl) => Number.isFinite(lvl) && lvl > 0))
    return Array.from(set).sort((a, b) => a - b)
  }, [radicalList])
  const levelSidebarLevels = useMemo(() => expandLevelRange(levels), [levels])
  const radicalSidebarLevels = useMemo(() => expandLevelRange(radicalLevels), [radicalLevels])
  const radicalItemsByLevel = useMemo(() => {
    const map = new Map()
    radicalList.forEach((item) => {
      if (!map.has(item.level)) map.set(item.level, [])
      map.get(item.level).push(item)
    })
    return map
  }, [radicalList])
  const getRadicalItems = useCallback(
    (level) => radicalItemsByLevel.get(level) || [],
    [radicalItemsByLevel]
  )
  const radicalLevelItems = useMemo(
    () => getRadicalItems(selectedRadicalLevel),
    [getRadicalItems, selectedRadicalLevel]
  )
  const radicalBySlug = useMemo(() => {
    const map = new Map()
    radicalList.forEach((item) => {
      if (!item.slug) return
      map.set(item.slug, item)
    })
    return map
  }, [radicalList])
  const radicalById = useMemo(() => {
    const map = new Map()
    radicalList.forEach((item) => {
      if (!item.id) return
      map.set(item.id, item)
    })
    return map
  }, [radicalList])
  const sprintAllItems = useMemo(() => {
    if (!sprintDayLevels.length) return []
    const map = new Map()
    sprintDayLevels.forEach((level) => {
      const items = getLevelItems(level)
      items.forEach((item) => {
        if (!map.has(item.id)) map.set(item.id, item)
      })
    })
    return Array.from(map.values())
  }, [getLevelItems, sprintDayLevels])
  const sprintDayKanjiCount = sprintAllItems.length
  const sprintAllLevelNumbers = useMemo(() => {
    if (!activeSprint?.days?.length) return []
    const unique = new Set()
    activeSprint.days.forEach((day) => {
      const levels = day.committed_at ? day.levels || [] : day.draft_levels || []
      levels.forEach((level) => {
        if (Number.isFinite(level)) unique.add(level)
      })
    })
    return Array.from(unique).sort((a, b) => a - b)
  }, [activeSprint])
  const sprintLevelStatusByLevel = useMemo(() => {
    if (!activeSprint?.days?.length) return {}
    const statusMap = {}
    activeSprint.days.forEach((day, index) => {
      const levels = day.committed_at ? day.levels || [] : day.draft_levels || []
      const status = day.completed_at
        ? 'completed'
        : day.committed_at
          ? 'committed'
          : index === ui.sprintDayIndex
            ? 'in-progress'
            : 'draft'
      levels.forEach((level) => {
        if (!Number.isFinite(level)) return
        statusMap[level] = status
      })
    })
    return statusMap
  }, [activeSprint, ui.sprintDayIndex])
  const levelItems = useMemo(() => getLevelItems(selectedLevel), [getLevelItems, selectedLevel])

  useLayoutEffect(() => {
    if (levelItems.length === 0) return
    setUi((prev) => {
      const existingOrder = prev.orderByLevel[selectedLevel]
      const existingFamiliarityOrder = prev.familiarityOrderByLevel?.[selectedLevel]
      const ids = levelItems.map((item) => item.id)
      const missing = existingOrder ? ids.filter((id) => !existingOrder.includes(id)) : ids
      const missingFamiliarity = existingFamiliarityOrder
        ? ids.filter((id) => !existingFamiliarityOrder.includes(id))
        : ids
      if (existingOrder && missing.length === 0 && existingFamiliarityOrder && missingFamiliarity.length === 0) {
        return prev
      }
      const shuffled = shuffleArray(ids)
      const nextNormalOrder =
        existingOrder && missing.length === 0 ? existingOrder : shuffled
      const nextFamiliarityOrder =
        existingFamiliarityOrder && missingFamiliarity.length === 0
          ? existingFamiliarityOrder
          : existingFamiliarityOrder
            ? [...existingFamiliarityOrder, ...missingFamiliarity]
            : nextNormalOrder
      levelShuffleRef.current = {
        level: selectedLevel,
        signature: ids.join(','),
        order: nextNormalOrder,
      }
      return {
        ...prev,
        orderByLevel: { ...prev.orderByLevel, [selectedLevel]: nextNormalOrder },
        familiarityOrderByLevel: {
          ...prev.familiarityOrderByLevel,
          [selectedLevel]: nextFamiliarityOrder,
        },
        modeByLevel: { ...prev.modeByLevel, [selectedLevel]: 'normal' },
      }
    })
  }, [levelItems, selectedLevel])

  useLayoutEffect(() => {
    if (radicalLevelItems.length === 0) return
    setUi((prev) => {
      const existingOrder = prev.radicalOrderByLevel?.[selectedRadicalLevel]
      const existingFamiliarityOrder = prev.radicalFamiliarityOrderByLevel?.[selectedRadicalLevel]
      const ids = radicalLevelItems.map((item) => item.id)
      const missing = existingOrder ? ids.filter((id) => !existingOrder.includes(id)) : ids
      const missingFamiliarity = existingFamiliarityOrder
        ? ids.filter((id) => !existingFamiliarityOrder.includes(id))
        : ids
      if (
        existingOrder &&
        missing.length === 0 &&
        existingFamiliarityOrder &&
        missingFamiliarity.length === 0
      ) {
        return prev
      }
      const shuffled = shuffleArray(ids)
      const nextNormalOrder = existingOrder && missing.length === 0 ? existingOrder : shuffled
      const nextFamiliarityOrder =
        existingFamiliarityOrder && missingFamiliarity.length === 0
          ? existingFamiliarityOrder
          : existingFamiliarityOrder
            ? [...existingFamiliarityOrder, ...missingFamiliarity]
            : nextNormalOrder
      return {
        ...prev,
        radicalOrderByLevel: {
          ...prev.radicalOrderByLevel,
          [selectedRadicalLevel]: nextNormalOrder,
        },
        radicalFamiliarityOrderByLevel: {
          ...prev.radicalFamiliarityOrderByLevel,
          [selectedRadicalLevel]: nextFamiliarityOrder,
        },
        radicalModeByLevel: {
          ...prev.radicalModeByLevel,
          [selectedRadicalLevel]: prev.radicalModeByLevel?.[selectedRadicalLevel] || 'normal',
        },
      }
    })
  }, [radicalLevelItems, selectedRadicalLevel])

  useLayoutEffect(() => {
    if (ui.page !== 'groups') return
    const sidebar = groupSidebarRef.current
    const top = groupSidebarTopRef.current
    if (!sidebar || !top) return
    const updateOffset = () => {
      const height = top.offsetHeight || 0
      sidebar.style.setProperty('--sidebar-top-offset', `${height}px`)
    }
    updateOffset()
    let observer
    if (window.ResizeObserver) {
      observer = new ResizeObserver(updateOffset)
      observer.observe(top)
    }
    window.addEventListener('resize', updateOffset)
    return () => {
      window.removeEventListener('resize', updateOffset)
      if (observer) observer.disconnect()
    }
  }, [ui.page, groups.length])

  useEffect(() => {
    if (!radicalLevels.length) return
    if (!radicalLevels.includes(selectedRadicalLevel)) {
      setUi((prev) => ({ ...prev, selectedRadicalLevel: radicalLevels[0] }))
    }
  }, [radicalLevels, selectedRadicalLevel])

  const selectLevel = useCallback(
    (level) => {
      if (level === selectedLevel) return
      setUi((prev) => ({
        ...prev,
        selectedLevel: level,
      }))
    },
    [selectedLevel]
  )

  const selectRadicalLevel = useCallback(
    (level) => {
      if (level === selectedRadicalLevel) return
      setUi((prev) => ({
        ...prev,
        selectedRadicalLevel: level,
      }))
    },
    [selectedRadicalLevel]
  )

  useEffect(() => {
    const handler = (event) => {
      if (detailKanji || detailRadical) return
      if (ui.page !== 'levels' && ui.page !== 'radicals') return
      if (quizOpen || globalQuizOpen || groupAddOpen) return
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (ui.page === 'levels') {
          const idx = levels.indexOf(selectedLevel)
          const next = levels[idx + 1]
          if (next) selectLevel(next)
        } else if (ui.page === 'radicals') {
          const idx = radicalLevels.indexOf(selectedRadicalLevel)
          const next = radicalLevels[idx + 1]
          if (next) selectRadicalLevel(next)
        }
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (ui.page === 'levels') {
          const idx = levels.indexOf(selectedLevel)
          const prevLevel = levels[idx - 1]
          if (prevLevel) selectLevel(prevLevel)
        } else if (ui.page === 'radicals') {
          const idx = radicalLevels.indexOf(selectedRadicalLevel)
          const prevLevel = radicalLevels[idx - 1]
          if (prevLevel) selectRadicalLevel(prevLevel)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    levels,
    selectedLevel,
    detailKanji,
    detailRadical,
    ui.page,
    quizOpen,
    globalQuizOpen,
    groupAddOpen,
    selectLevel,
    radicalLevels,
    selectedRadicalLevel,
    selectRadicalLevel,
  ])


  const setVocabHighlight = useCallback((kanjiChar, vocabId, status) => {
    if (ui.storageLocked || !isStorageOwner) return
    setHighlightedVocabByKanji((prev) => {
      const current = prev[kanjiChar] || {}
      if (!status) {
        if (!current[vocabId]) return prev
        const next = { ...current }
        delete next[vocabId]
        return { ...prev, [kanjiChar]: next }
      }
      return {
        ...prev,
        [kanjiChar]: {
          ...current,
          [vocabId]: { status, updated_at: new Date().toISOString() },
        },
      }
    })
  }, [ui.storageLocked, isStorageOwner])

  const toggleVocabHighlight = useCallback((kanjiChar, vocabId) => {
    if (ui.storageLocked || !isStorageOwner) return
    setHighlightedVocabByKanji((prev) => {
      const current = prev[kanjiChar] || {}
      const currentEntry = current[vocabId]
      const currentStatus = currentEntry?.status || null
      const nextStatus =
        currentStatus === STATUS.LUKEWARM
          ? STATUS.COMFORTABLE
          : currentStatus === STATUS.COMFORTABLE
            ? null
            : STATUS.LUKEWARM
      const nextMap = { ...current }
      if (nextStatus) {
        nextMap[vocabId] = { status: nextStatus, updated_at: new Date().toISOString() }
      } else {
        delete nextMap[vocabId]
      }
      return { ...prev, [kanjiChar]: nextMap }
    })
  }, [ui.storageLocked, isStorageOwner])



  useEffect(() => {
    const down = (event) => {
      if (event.key === 'Shift') setShiftPressed(true)
      if (event.key === 'Alt') setAltPressed(true)
    }
    const up = (event) => {
      if (event.key === 'Shift') setShiftPressed(false)
      if (event.key === 'Alt') setAltPressed(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (levelItems.length === 0) return
    setUi((prev) => {
      const existingOrder = prev.orderByLevel[selectedLevel]
      if (!existingOrder) return prev
      const ids = levelItems.map((item) => item.id)
      const missing = ids.filter((id) => !existingOrder.includes(id))
      if (missing.length === 0) return prev
      return {
        ...prev,
        orderByLevel: {
          ...prev.orderByLevel,
          [selectedLevel]: [...existingOrder, ...missing],
        },
      }
    })
  }, [levelItems, selectedLevel])

  const getCurrentOrderForLevel = useCallback(
    (level) => {
      const items = getLevelItems(level)
      const ids = items.map((item) => item.id)
      const order = ui.orderByLevel[level]
      return sanitizeOrder(order, ids)
    },
    [getLevelItems, ui.orderByLevel]
  )

  const getCurrentFamiliarityOrderForLevel = useCallback(
    (level) => {
      const items = getLevelItems(level)
      const ids = items.map((item) => item.id)
      const order = ui.familiarityOrderByLevel?.[level]
      return sanitizeOrder(order, ids)
    },
    [getLevelItems, ui.familiarityOrderByLevel]
  )

  const currentOrder = getCurrentOrderForLevel(selectedLevel)
  const currentFamiliarityOrder = getCurrentFamiliarityOrderForLevel(selectedLevel)
  const getCurrentRadicalOrderForLevel = useCallback(
    (level) => {
      const items = getRadicalItems(level)
      const ids = items.map((item) => item.id)
      const order = ui.radicalOrderByLevel?.[level]
      return sanitizeOrder(order, ids)
    },
    [getRadicalItems, ui.radicalOrderByLevel]
  )

  const getCurrentRadicalFamiliarityOrderForLevel = useCallback(
    (level) => {
      const items = getRadicalItems(level)
      const ids = items.map((item) => item.id)
      const order = ui.radicalFamiliarityOrderByLevel?.[level]
      return sanitizeOrder(order, ids)
    },
    [getRadicalItems, ui.radicalFamiliarityOrderByLevel]
  )

  const currentRadicalOrder = getCurrentRadicalOrderForLevel(selectedRadicalLevel)
  const currentRadicalFamiliarityOrder =
    getCurrentRadicalFamiliarityOrderForLevel(selectedRadicalLevel)
  const radicalMode = ui.radicalModeByLevel?.[selectedRadicalLevel] || 'normal'
  const activeRadicalOrder =
    radicalMode === 'familiarity' ? currentRadicalFamiliarityOrder : currentRadicalOrder
  const radicalFamiliarityOrderGlobal = useMemo(() => {
    const seen = new Set()
    const ordered = []
    radicalLevels.forEach((level) => {
      const ids = getCurrentRadicalFamiliarityOrderForLevel(level)
      ids.forEach((id) => {
        if (seen.has(id)) return
        seen.add(id)
        ordered.push(id)
      })
    })
    return ordered
  }, [radicalLevels, getCurrentRadicalFamiliarityOrderForLevel])
  const orderedRadicalItems = useMemo(() => {
    const map = new Map(radicalLevelItems.map((item) => [item.id, item]))
    return activeRadicalOrder.map((id) => map.get(id)).filter(Boolean)
  }, [activeRadicalOrder, radicalLevelItems])
  const groupedRadicalsByFamiliarity = useMemo(() => {
    const groupsMap = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    orderedRadicalItems.forEach((item) => {
      const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [orderedRadicalItems, radicalFamiliarity])
  const mode = ui.levelMode || ui.modeByLevel[selectedLevel] || 'normal'
  const activeOrder = mode === 'familiarity' ? currentFamiliarityOrder : currentOrder
  const orderedItems = useMemo(() => {
    const map = new Map(levelItems.map((item) => [item.id, item]))
    return activeOrder.map((id) => map.get(id)).filter(Boolean)
  }, [activeOrder, levelItems])
  const effectiveHide = globalHide
  const canPersistEdits = isStorageOwner && !ui.storageLocked

  const levelCounts = useMemo(() => {
    const counts = {
      [STATUS.NEEDS]: 0,
      [STATUS.LUKEWARM]: 0,
      [STATUS.COMFORTABLE]: 0,
      [STATUS.UNMARKED]: 0,
    }
    levelItems.forEach((item) => {
      const status = familiarity[item.id] || STATUS.UNMARKED
      if (counts[status] !== undefined) counts[status] += 1
    })
    return counts
  }, [levelItems, familiarity])

  const radicalLevelCounts = useMemo(() => {
    const counts = {
      [STATUS.NEEDS]: 0,
      [STATUS.LUKEWARM]: 0,
      [STATUS.COMFORTABLE]: 0,
      [STATUS.UNMARKED]: 0,
    }
    radicalLevelItems.forEach((item) => {
      const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
      if (counts[status] !== undefined) counts[status] += 1
    })
    return counts
  }, [radicalLevelItems, radicalFamiliarity])

  const getCountsForLevel = useCallback(
    (items) => {
      const counts = {
        [STATUS.NEEDS]: 0,
        [STATUS.LUKEWARM]: 0,
        [STATUS.COMFORTABLE]: 0,
        [STATUS.UNMARKED]: 0,
      }
      items.forEach((item) => {
        const status = familiarity[item.id] || STATUS.UNMARKED
        if (counts[status] !== undefined) counts[status] += 1
      })
      return counts
    },
    [familiarity]
  )

  const getCountsForRadicalLevel = useCallback(
    (items) => {
      const counts = {
        [STATUS.NEEDS]: 0,
        [STATUS.LUKEWARM]: 0,
        [STATUS.COMFORTABLE]: 0,
        [STATUS.UNMARKED]: 0,
      }
      items.forEach((item) => {
        const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
        if (counts[status] !== undefined) counts[status] += 1
      })
      return counts
    },
    [radicalFamiliarity]
  )

  const getOrderedItemsForLevel = useCallback(
    (level) => {
      const items = getLevelItems(level)
      if (items.length === 0) return []
      const order = getCurrentOrderForLevel(level)
      const map = new Map(items.map((item) => [item.id, item]))
      return order.map((id) => map.get(id)).filter(Boolean)
    },
    [getLevelItems, getCurrentOrderForLevel]
  )

  const getFamiliarityOrderedItemsForLevel = useCallback(
    (level) => {
      const items = getLevelItems(level)
      if (items.length === 0) return []
      const order = getCurrentFamiliarityOrderForLevel(level)
      const map = new Map(items.map((item) => [item.id, item]))
      return order.map((id) => map.get(id)).filter(Boolean)
    },
    [getLevelItems, getCurrentFamiliarityOrderForLevel]
  )

  const getOrderedRadicalsForLevel = useCallback(
    (level) => {
      const items = getRadicalItems(level)
      if (items.length === 0) return []
      const order = getCurrentRadicalOrderForLevel(level)
      const map = new Map(items.map((item) => [item.id, item]))
      return order.map((id) => map.get(id)).filter(Boolean)
    },
    [getRadicalItems, getCurrentRadicalOrderForLevel]
  )

  const getFamiliarityOrderedRadicalsForLevel = useCallback(
    (level) => {
      const items = getRadicalItems(level)
      if (items.length === 0) return []
      const order = getCurrentRadicalFamiliarityOrderForLevel(level)
      const map = new Map(items.map((item) => [item.id, item]))
      return order.map((id) => map.get(id)).filter(Boolean)
    },
    [getRadicalItems, getCurrentRadicalFamiliarityOrderForLevel]
  )

  const toggleRadicalAlpha = () => {
    const items = getRadicalItems(selectedRadicalLevel)
    if (!items.length) return
    if (radicalMode === 'alpha') {
      setUi((prev) => ({
        ...prev,
        radicalModeByLevel: { ...prev.radicalModeByLevel, [selectedRadicalLevel]: 'normal' },
      }))
      return
    }
    const sortedIds = [...items]
      .sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
      .map((item) => item.id)
    setRadicalOrderForLevel(selectedRadicalLevel, sortedIds)
    setUi((prev) => ({
      ...prev,
      radicalModeByLevel: { ...prev.radicalModeByLevel, [selectedRadicalLevel]: 'alpha' },
    }))
  }

  const toggleRadicalFamiliarity = () => {
    const items = getRadicalItems(selectedRadicalLevel)
    if (!items.length) return
    if (radicalMode === 'familiarity') {
      setUi((prev) => ({
        ...prev,
        radicalModeByLevel: { ...prev.radicalModeByLevel, [selectedRadicalLevel]: 'normal' },
      }))
      return
    }
    const ids = items.map((item) => item.id)
    const sortByStatus = (list) => {
      const groupsByStatus = {
        [STATUS.NEEDS]: [],
        [STATUS.LUKEWARM]: [],
        [STATUS.COMFORTABLE]: [],
        [STATUS.UNMARKED]: [],
      }
      list.forEach((id) => {
        const status = radicalFamiliarity[id] || STATUS.UNMARKED
        groupsByStatus[status].push(id)
      })
      return [
        ...groupsByStatus[STATUS.NEEDS],
        ...groupsByStatus[STATUS.LUKEWARM],
        ...groupsByStatus[STATUS.COMFORTABLE],
        ...groupsByStatus[STATUS.UNMARKED],
      ]
    }
    const existing = getCurrentRadicalFamiliarityOrderForLevel(selectedRadicalLevel)
    const source = existing.length ? existing : ids
    const sortedIds = sortByStatus(source)
    setRadicalFamiliarityOrderForLevel(selectedRadicalLevel, sortedIds)
    setUi((prev) => ({
      ...prev,
      radicalModeByLevel: { ...prev.radicalModeByLevel, [selectedRadicalLevel]: 'familiarity' },
    }))
  }

  const shuffleRadicals = () => {
    const items = getRadicalItems(selectedRadicalLevel)
    if (!items.length) return
    const ids = items.map((item) => item.id)
    setRadicalOrderForLevel(selectedRadicalLevel, shuffleArray(ids))
    setUi((prev) => ({
      ...prev,
      radicalModeByLevel: { ...prev.radicalModeByLevel, [selectedRadicalLevel]: 'normal' },
    }))
  }

  const toggleReadingStatus = useCallback((kanjiId, token, event, options = {}) => {
    if (ui.storageLocked || !isStorageOwner) return
    const key = normalizeReadingToken(token)
    if (!key) return
    if (event?.shiftKey && !options.allowShift) return
    setReadingStatusByKanji((prev) => {
      const currentMap = prev[kanjiId] || {}
      const current = currentMap[key] || null
      let nextStatus = current
      if (current === READING_STATUS.COMMON) {
        nextStatus = READING_STATUS.UNCOMMON
      } else if (current === READING_STATUS.UNCOMMON) {
        nextStatus = null
      } else {
        nextStatus = READING_STATUS.COMMON
      }
      const nextMap = { ...currentMap }
      if (!nextStatus) {
        delete nextMap[key]
      } else {
        nextMap[key] = nextStatus
      }
      const updated = { ...prev }
      if (Object.keys(nextMap).length === 0) {
        delete updated[kanjiId]
        return updated
      }
      updated[kanjiId] = nextMap
      return updated
    })
  }, [ui.storageLocked, isStorageOwner])

  const reorderWithinStatus = useCallback(
    (status, fromId, toId) => {
      if (fromId === toId) return
      const statusIds = orderedItems
        .filter((item) => (familiarity[item.id] || STATUS.UNMARKED) === status)
        .map((item) => item.id)
      const statusSet = new Set(statusIds)
      const fromIndex = statusIds.indexOf(fromId)
      const toIndex = statusIds.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return
      statusIds.splice(fromIndex, 1)
      statusIds.splice(toIndex, 0, fromId)
      let pointer = 0
      const baseOrder = getCurrentFamiliarityOrderForLevel(selectedLevel)
      const nextOrder = baseOrder.map((id) =>
        statusSet.has(id) ? statusIds[pointer++] : id
      )
      setFamiliarityOrderForLevel(selectedLevel, nextOrder)
    },
    [
      orderedItems,
      familiarity,
      selectedLevel,
      getCurrentFamiliarityOrderForLevel,
      setFamiliarityOrderForLevel,
    ]
  )

  const reorderWithinStatusGlobal = useCallback(
    (status, fromId, toId) => {
      const baseOrder = ui.familiarityOrder || kanjiList.map((item) => item.id)
      const statusIds = baseOrder
        .filter((id) => (familiarity[id] || STATUS.UNMARKED) === status)
      const statusSet = new Set(statusIds)
      const fromIndex = statusIds.indexOf(fromId)
      const toIndex = statusIds.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return
      statusIds.splice(fromIndex, 1)
      statusIds.splice(toIndex, 0, fromId)
      let pointer = 0
      const nextOrder = baseOrder.map((id) =>
        statusSet.has(id) ? statusIds[pointer++] : id
      )
      setGlobalOrder(nextOrder)
    },
    [ui.familiarityOrder, kanjiList, familiarity, setGlobalOrder]
  )

  useEffect(() => {
    const handleUp = () => {
      if (dragFamiliarityId && dragTargetId) {
        const fromStatus = familiarity[dragFamiliarityId] || STATUS.UNMARKED
        const toStatus = familiarity[dragTargetId] || STATUS.UNMARKED
        if (fromStatus === toStatus) {
          if (dragContext === 'global') {
            reorderWithinStatusGlobal(fromStatus, dragFamiliarityId, dragTargetId)
          } else {
            reorderWithinStatus(fromStatus, dragFamiliarityId, dragTargetId)
          }
        }
      }
      setDragFamiliarityId(null)
      setDragTargetId(null)
      setDragContext(null)
    }
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [
    dragFamiliarityId,
    dragTargetId,
    familiarity,
    dragContext,
    reorderWithinStatus,
    reorderWithinStatusGlobal,
  ])

  const setModeForLevel = (level, nextMode) => {
    setUi((prev) => ({
      ...prev,
      modeByLevel: { ...prev.modeByLevel, [level]: nextMode },
    }))
  }

  const setRadicalModeForLevel = (level, nextMode) => {
    setUi((prev) => ({
      ...prev,
      radicalModeByLevel: { ...prev.radicalModeByLevel, [level]: nextMode },
    }))
  }

  const setPrevForLevel = (level, payload) => {
    setUi((prev) => ({
      ...prev,
      prevByLevel: { ...prev.prevByLevel, [level]: payload },
    }))
  }

  const setRadicalPrevForLevel = (level, payload) => {
    setUi((prev) => ({
      ...prev,
      radicalPrevByLevel: { ...prev.radicalPrevByLevel, [level]: payload },
    }))
  }

  useEffect(() => {
    if (ui.page !== 'levels') return
    if (!selectedLevel) return
    const globalMode = ui.levelMode || 'normal'
    const levelMode = ui.modeByLevel[selectedLevel] || 'normal'
    if (globalMode === 'alpha' && levelMode !== 'alpha') {
      const items = getLevelItems(selectedLevel)
      if (items.length === 0) return
      const current = getCurrentOrderForLevel(selectedLevel)
      setPrevForLevel(selectedLevel, { order: current, mode: levelMode })
      const sorted = [...items].sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
      setOrderForLevel(
        selectedLevel,
        sorted.map((item) => item.id)
      )
      setModeForLevel(selectedLevel, 'alpha')
      return
    }
    if (globalMode === 'familiarity' && levelMode !== 'familiarity') {
      const current = getCurrentOrderForLevel(selectedLevel)
      setPrevForLevel(selectedLevel, { order: current, mode: levelMode })
      setModeForLevel(selectedLevel, 'familiarity')
      return
    }
    if (globalMode === 'normal' && levelMode !== 'normal') {
      const prev = ui.prevByLevel[selectedLevel]
      if (prev) {
        setOrderForLevel(selectedLevel, prev.order)
        setModeForLevel(selectedLevel, prev.mode)
      } else {
        setModeForLevel(selectedLevel, 'normal')
      }
    }
  }, [
    ui.page,
    ui.levelMode,
    ui.modeByLevel,
    ui.prevByLevel,
    selectedLevel,
    getLevelItems,
    getCurrentOrderForLevel,
    setOrderForLevel,
  ])

  const toggleAlpha = () => {
    if (ui.levelMode === 'alpha') {
      setUi((prev) => ({ ...prev, levelMode: 'normal' }))
      return
    }
    setUi((prev) => ({ ...prev, levelMode: 'alpha' }))
  }

  const toggleFamiliarity = () => {
    if (ui.levelMode === 'familiarity') {
      setUi((prev) => ({ ...prev, levelMode: 'normal' }))
      return
    }
    setUi((prev) => {
      const existing = prev.familiarityOrderByLevel?.[selectedLevel]
      if (existing && existing.length) return { ...prev, levelMode: 'familiarity' }
      return {
        ...prev,
        levelMode: 'familiarity',
        familiarityOrderByLevel: {
          ...prev.familiarityOrderByLevel,
          [selectedLevel]: prev.orderByLevel[selectedLevel] || getCurrentOrderForLevel(selectedLevel),
        },
      }
    })
  }

  const shuffleLevel = () => {
    if (ui.storageLocked || !isStorageOwner) return
    const next = shuffleArray(currentOrder)
    setUi((prev) => ({
      ...prev,
      orderByLevel: { ...prev.orderByLevel, [selectedLevel]: next },
      modeByLevel: { ...prev.modeByLevel, [selectedLevel]: 'normal' },
      levelMode: 'normal',
    }))
  }

  const toggleGlobalHide = () => {
    setGlobalHide((prev) => !prev)
  }

  const setFamiliarityStatusOpen = useCallback((status, isOpen) => {
    setUi((prev) => ({
      ...prev,
      familiarityOpenByStatus: {
        ...prev.familiarityOpenByStatus,
        [status]: isOpen,
      },
    }))
  }, [])

  const scrollToFamiliarity = useCallback(
    (status, options = {}) => {
      const { behavior = 'smooth', ensureOpen = true } = options

      const doScroll = () => {
        const target = document.getElementById(`familiarity-${status}`)
        if (!target) return
        const container = target.closest('.content')
        const header = document.querySelector('.app-header')
        const offset = (header?.offsetHeight || 0) + 24
        if (container && container.scrollHeight > container.clientHeight + 2) {
          const containerRect = container.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const top = Math.max(
            0,
            container.scrollTop + (targetRect.top - containerRect.top) - offset
          )
          container.scrollTo({ top, behavior })
          return
        }
        const targetRect = target.getBoundingClientRect()
        const top = window.scrollY + targetRect.top - offset
        window.scrollTo({ top, behavior })
      }

      if (ensureOpen && !ui.familiarityOpenByStatus?.[status]) {
        setFamiliarityStatusOpen(status, true)
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(doScroll)
        })
        return
      }

      doScroll()
    },
    [setFamiliarityStatusOpen, ui.familiarityOpenByStatus]
  )

  const getActiveFamiliarityStatus = useCallback((statuses = STATUS_ORDER_WITH_UNMARKED) => {
    const sections = statuses.map((status) => ({
      status,
      element: document.getElementById(`familiarity-${status}`),
    })).filter((entry) => entry.element)
    if (!sections.length) return null

    const container = document.querySelector('.content')
    const header = document.querySelector('.app-header')
    const offset = (header?.offsetHeight || 0) + 24
    const anchorTop =
      container && container.scrollHeight > container.clientHeight + 2
        ? container.getBoundingClientRect().top + offset
        : offset

    let active = sections[0].status
    let minDistance = Number.POSITIVE_INFINITY

    sections.forEach(({ status, element }) => {
      const rect = element.getBoundingClientRect()
      const withinSection = rect.top <= anchorTop && rect.bottom >= anchorTop
      const distance = withinSection ? 0 : Math.abs(rect.top - anchorTop)
      if (distance < minDistance) {
        minDistance = distance
        active = status
      }
    })

    return active
  }, [])

  const toggleRangeAlpha = () => {
    const isRadicalView = (ui.rangeView || 'kanji') === 'radicals'
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : isRadicalView ? radicalLevels : levels
    if (ui.rangeMode === 'alpha') {
      levelsToUse.forEach((level) => {
        if (isRadicalView) {
          const prev = ui.radicalPrevByLevel?.[level]
          if (prev) {
            setRadicalOrderForLevel(level, prev.order)
            setRadicalModeForLevel(level, prev.mode)
          } else {
            setRadicalModeForLevel(level, 'normal')
          }
        } else {
          const prev = ui.prevByLevel[level]
          if (prev) {
            setOrderForLevel(level, prev.order)
            setModeForLevel(level, prev.mode)
          } else {
            setModeForLevel(level, 'normal')
          }
        }
      })
      setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
      return
    }
    levelsToUse.forEach((level) => {
      const items = isRadicalView ? getRadicalItems(level) : getLevelItems(level)
      if (items.length === 0) return
      const current = isRadicalView
        ? getCurrentRadicalOrderForLevel(level)
        : getCurrentOrderForLevel(level)
      if (isRadicalView) {
        setRadicalPrevForLevel(level, {
          order: current,
          mode: ui.radicalModeByLevel?.[level] || 'normal',
        })
      } else {
        setPrevForLevel(level, { order: current, mode: ui.modeByLevel[level] || 'normal' })
      }
      const sorted = [...items].sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
      if (isRadicalView) {
        setRadicalOrderForLevel(level, sorted.map((item) => item.id))
        setRadicalModeForLevel(level, 'alpha')
      } else {
        setOrderForLevel(level, sorted.map((item) => item.id))
        setModeForLevel(level, 'alpha')
      }
    })
    setUi((prev) => ({ ...prev, rangeMode: 'alpha' }))
  }

  const toggleRangeFamiliarity = () => {
    const isRadicalView = (ui.rangeView || 'kanji') === 'radicals'
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : isRadicalView ? radicalLevels : levels
    if (ui.rangeMode === 'familiarity') {
      levelsToUse.forEach((level) => {
        if (isRadicalView) {
          const prev = ui.radicalPrevByLevel?.[level]
          if (prev) {
            setRadicalOrderForLevel(level, prev.order)
            setRadicalModeForLevel(level, prev.mode)
          } else {
            setRadicalModeForLevel(level, 'normal')
          }
        } else {
          const prev = ui.prevByLevel[level]
          if (prev) {
            setOrderForLevel(level, prev.order)
            setModeForLevel(level, prev.mode)
          } else {
            setModeForLevel(level, 'normal')
          }
        }
      })
      setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
      return
    }
    levelsToUse.forEach((level) => {
      const current = isRadicalView
        ? getCurrentRadicalOrderForLevel(level)
        : getCurrentOrderForLevel(level)
      if (isRadicalView) {
        setRadicalPrevForLevel(level, {
          order: current,
          mode: ui.radicalModeByLevel?.[level] || 'normal',
        })
        setUi((prev) => {
          const existing = prev.radicalFamiliarityOrderByLevel?.[level]
          if (existing && existing.length) return prev
          return {
            ...prev,
            radicalFamiliarityOrderByLevel: {
              ...prev.radicalFamiliarityOrderByLevel,
              [level]: current,
            },
          }
        })
        setRadicalModeForLevel(level, 'familiarity')
      } else {
        setPrevForLevel(level, { order: current, mode: ui.modeByLevel[level] || 'normal' })
        setUi((prev) => {
          const existing = prev.familiarityOrderByLevel?.[level]
          if (existing && existing.length) return prev
          return {
            ...prev,
            familiarityOrderByLevel: {
              ...prev.familiarityOrderByLevel,
              [level]: current,
            },
          }
        })
        setModeForLevel(level, 'familiarity')
      }
    })
    setUi((prev) => ({ ...prev, rangeMode: 'familiarity' }))
  }

  const shuffleRange = () => {
    const isRadicalView = (ui.rangeView || 'kanji') === 'radicals'
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : isRadicalView ? radicalLevels : levels
    levelsToUse.forEach((level) => {
      if (isRadicalView) {
        const current = getCurrentRadicalOrderForLevel(level)
        setRadicalOrderForLevel(level, shuffleArray(current))
        setRadicalModeForLevel(level, 'normal')
      } else {
        const current = getCurrentOrderForLevel(level)
        setOrderForLevel(level, shuffleArray(current))
        setModeForLevel(level, 'normal')
      }
    })
    setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
  }

  const getCommittedSprintLevels = useCallback((sprint) => {
    if (!sprint) return new Set()
    const committed = new Set()
    sprint.days.forEach((day) => {
      if (day.levels?.length) {
        day.levels.forEach((level) => committed.add(level))
      }
    })
    return committed
  }, [])

  const generateSprintDrafts = useCallback(
    (sprint, overrideDayIndex = null) => {
      if (!sprint) return []
      const committed = getCommittedSprintLevels(sprint)
      const remaining = sprint.level_pool.filter((level) => !committed.has(level))
      const shuffled = shuffleArray(remaining)
      let cursor = 0
      return sprint.days.map((day, index) => {
        if (day.committed_at) return day
        if (overrideDayIndex !== null && index !== overrideDayIndex && day.draft_levels) {
          return day
        }
        const size = Math.min(day.size, shuffled.length - cursor)
        const next = shuffled.slice(cursor, cursor + size)
        cursor += size
        return { ...day, draft_levels: next }
      })
    },
    [getCommittedSprintLevels]
  )

  const updateSprintDay = useCallback((sprintId, dayIndex, updater) => {
    setSprints((prev) =>
      prev.map((sprint) => {
        if (sprint.id !== sprintId) return sprint
        const days = sprint.days.map((day, index) =>
          index === dayIndex ? updater(day) : day
        )
        return { ...sprint, days }
      })
    )
  }, [])

  const startNewSprint = useCallback(() => {
    if (!levels.length) return
    const sprint = buildSprint([...levels], new Date())
    setSprints((prev) => [sprint, ...prev])
    setUi((prev) => ({ ...prev, sprintActiveId: sprint.id, sprintDayIndex: 0 }))
  }, [levels])
  const deleteSprint = useCallback((sprintId) => {
    setSprints((prev) => prev.filter((sprint) => sprint.id !== sprintId))
    setUi((prev) => {
      if (prev.sprintActiveId !== sprintId) return prev
      return { ...prev, sprintActiveId: null, sprintDayIndex: 0 }
    })
  }, [])

  const refreshSprintDay = useCallback(() => {
    if (!activeSprint || !activeSprintDay) return
    if (activeSprintDay.committed_at) return
    setSprints((prev) =>
      prev.map((sprint) => {
        if (sprint.id !== activeSprint.id) return sprint
        const updatedDays = generateSprintDrafts(sprint)
        return { ...sprint, days: updatedDays }
      })
    )
  }, [activeSprint, activeSprintDay, generateSprintDrafts])

  const commitSprintDay = useCallback(() => {
    if (!activeSprint || !activeSprintDay) return
    if (activeSprintDay.committed_at) return
    setSprints((prev) =>
      prev.map((sprint) => {
        if (sprint.id !== activeSprint.id) return sprint
        const updatedDays = generateSprintDrafts(sprint, ui.sprintDayIndex)
        const day = updatedDays[ui.sprintDayIndex]
        const draft = day.draft_levels || []
        const nextDays = updatedDays.map((item, index) =>
          index === ui.sprintDayIndex
            ? {
                ...item,
                levels: draft,
                draft_levels: null,
                committed_at: new Date().toISOString(),
              }
            : item
        )
        return { ...sprint, days: nextDays }
      })
    )
  }, [activeSprint, activeSprintDay, generateSprintDrafts, ui.sprintDayIndex])

  const completeSprintDay = useCallback(() => {
    if (!activeSprint || !activeSprintDay?.committed_at) return
    updateSprintDay(activeSprint.id, ui.sprintDayIndex, (day) => ({
      ...day,
      completed_at: day.completed_at || new Date().toISOString(),
    }))
    setUi((prev) => ({
      ...prev,
      sprintDayIndex: Math.min(activeSprint.days.length - 1, prev.sprintDayIndex + 1),
    }))
  }, [activeSprint, activeSprintDay, ui.sprintDayIndex, updateSprintDay])

  const jumpToNextSprintDay = useCallback(() => {
    if (!activeSprint) return
    const nextIndex = activeSprint.days.findIndex((day) => !day.completed_at)
    setUi((prev) => ({
      ...prev,
      sprintDayIndex: nextIndex === -1 ? 0 : nextIndex,
    }))
  }, [activeSprint])

  const setSprintViewMode = useCallback((mode) => {
    setUi((prev) => ({ ...prev, sprintViewMode: mode }))
  }, [])

  const applySprintSort = useCallback(
    (mode) => {
      if (!sprintDayLevels.length) return
      if (mode === 'normal') {
        setUi((prev) => ({
          ...prev,
          sprintSortMode: 'normal',
          sprintOrderByLevel: {},
          sprintAllOrder: [],
        }))
        return
      }
      if (mode === 'familiarity') {
        setUi((prev) => ({ ...prev, sprintSortMode: 'familiarity' }))
        return
      }
      const nextOrderByLevel = {}
      sprintDayLevels.forEach((level) => {
        const items = getLevelItems(level)
        if (items.length === 0) return
        if (mode === 'alpha') {
          nextOrderByLevel[level] = [...items]
            .sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
            .map((item) => item.id)
        } else if (mode === 'shuffle') {
          nextOrderByLevel[level] = shuffleArray(items.map((item) => item.id))
        }
      })
      let nextAllOrder = []
      if (mode === 'alpha') {
        nextAllOrder = sprintAllItems
          .slice()
          .sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
          .map((item) => item.id)
      } else if (mode === 'shuffle') {
        nextAllOrder = shuffleArray(sprintAllItems.map((item) => item.id))
      }
      setUi((prev) => ({
        ...prev,
        sprintSortMode: mode,
        sprintOrderByLevel: nextOrderByLevel,
        sprintAllOrder: nextAllOrder,
      }))
    },
    [sprintDayLevels, sprintAllItems, getLevelItems]
  )

  useEffect(() => {
    if (!activeSprint || !activeSprintDay) return
    if (activeSprintDay.committed_at || (activeSprintDay.draft_levels || []).length > 0) return
    setSprints((prev) =>
      prev.map((sprint) => {
        if (sprint.id !== activeSprint.id) return sprint
        const updatedDays = generateSprintDrafts(sprint, ui.sprintDayIndex)
        return { ...sprint, days: updatedDays }
      })
    )
  }, [activeSprint, activeSprintDay, generateSprintDrafts, ui.sprintDayIndex])

  const startQuiz = (items) => {
    const randomized = shuffleArray(items)
    setQuizItems(randomized)
    setQuizOpen(true)
  }

  const openLevelQuiz = () => {
    startQuiz(orderedItems)
  }

  const openGlobalQuiz = () => {
    const requestedLevels = parseLevelsInput(globalQuizLevels)
    const levelsToUse = requestedLevels.length > 0 ? requestedLevels : levels
    const statusFilters = Object.entries(globalQuizStatuses)
      .filter(([, value]) => value)
      .map(([key]) => key)

    let filtered = kanjiList.filter((item) => levelsToUse.includes(item.level))

    if (statusFilters.length > 0) {
      filtered = filtered.filter((item) => statusFilters.includes(familiarity[item.id]))
    }

    startQuiz(filtered)
    setGlobalQuizOpen(false)
  }

  const resetToDefault = async () => {
    const confirmed = window.confirm('Reset local data to default? This will overwrite local changes.')
    if (!confirmed) return
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}default-data.json`)
      const text = await response.text()
      const parsed = JSON.parse(text)
      if (parsed.version !== 1) return
      setFamiliarity({})
      setFlaggedKanji(normalizeFlaggedEntries(parsed.flagged_kanji || parsed.flaggedKanji))
      setFlaggedRadicals(
        normalizeFlaggedEntries(parsed.flagged_radicals || parsed.flaggedRadicals, 'radical_id')
      )
      setRadicalFamiliarity({})
      setReadingStatusByKanji(parsed.reading_status_by_kanji || {})
      setContentEditsByKanji(
        normalizeContentEditsMap(parsed.content_edits_by_kanji || parsed.contentEditsByKanji)
      )
      setGroups(
        (parsed.groups || []).map((group) => ({
          id: group.id,
          name: group.name,
          kanjiIds: group.kanji_ids || [],
        }))
      )
      setUi((prev) => ({
        ...prev,
        ...(parsed.ui || {}),
        lightningMode: parsed.preferences?.lightning_mode || false,
      }))
    } catch {
      window.alert('Failed to load default data.')
    }
  }

  const setStatus = useCallback(
    (id, status) => {
      if (ui.storageLocked || !isStorageOwner) return
      setFamiliarity((prev) => ({
        ...prev,
        [id]: status || undefined,
      }))
      setOpenMenuId(null)
    },
    [ui.storageLocked, isStorageOwner]
  )

  const toggleFlaggedKanji = useCallback(
    (id) => {
      if (ui.storageLocked || !isStorageOwner) return
      setFlaggedKanji((prev) => {
        if (prev[id]) {
          const next = { ...prev }
          delete next[id]
          return next
        }
        return { ...prev, [id]: true }
      })
      setOpenMenuId(null)
    },
    [ui.storageLocked, isStorageOwner]
  )

  const toggleFlaggedRadical = useCallback(
    (id) => {
      if (ui.storageLocked || !isStorageOwner) return
      setFlaggedRadicals((prev) => {
        if (prev[id]) {
          const next = { ...prev }
          delete next[id]
          return next
        }
        return { ...prev, [id]: true }
      })
      setOpenMenuId(null)
    },
    [ui.storageLocked, isStorageOwner]
  )

  const setRadicalStatus = useCallback(
    (id, status) => {
      if (ui.storageLocked || !isStorageOwner) return
      setRadicalFamiliarity((prev) => ({
        ...prev,
        [id]: status || undefined,
      }))
      setOpenMenuId(null)
    },
    [ui.storageLocked, isStorageOwner]
  )

  const toggleDetailMnemonics = useCallback(() => {
    if (!detailKanji || detailRadical) return
    setUi((prev) => ({
      ...prev,
      detailMnemonicsOpen: !(prev.detailMnemonicsOpen !== false),
    }))
  }, [detailKanji, detailRadical])

  const applyDigitHotkey = useCallback(
    (digit) => {
      if (!digit) return
      if (detailKanji && digit === 'mnemonic-toggle') {
        toggleDetailMnemonics()
        return
      }
      if (!isStorageOwner || ui.storageLocked) return
      const isFlagToggle = digit === '5'
      const vocabAction = getVocabHotkey({ key: digit, code: `Digit${digit}` })
      const statusAction = getStatusHotkey({ key: digit, code: `Digit${digit}` })

      if (detailKanji && isFlagToggle) {
        toggleFlaggedKanji(detailKanji.id)
        return
      }
      if (detailRadical && isFlagToggle) {
        toggleFlaggedRadical(detailRadical.id)
        return
      }

      const hoverVocabEl = document.querySelector('.kanji-vocab-item:hover')
      const target = lastPointerTargetRef.current
      const vocabTarget = hoverVocabEl || target?.closest?.('.kanji-vocab-item')
      const vocabId =
        Number(vocabTarget?.getAttribute?.('data-vocab-id')) || hoveredVocabRef.current
      if (detailKanji && vocabId) {
        if (vocabAction !== undefined) {
          setVocabHighlight(detailKanji.kanji, vocabId, vocabAction)
        }
        return
      }

      if (detailKanji) return
      if (detailRadical) {
        if (statusAction !== undefined) {
          setRadicalStatus(detailRadical.id, statusAction)
        }
        return
      }
      const hoverCardEl = document.querySelector('.kanji-card:hover')
      const cardTarget = hoverCardEl || target?.closest?.('.kanji-card')
      const cardAttrId = Number(cardTarget?.getAttribute?.('data-kanji-id'))
      const cardId = Number.isFinite(cardAttrId) && cardAttrId > 0 ? cardAttrId : null
      if (isFlagToggle) {
        const hoverRadicalEl = document.querySelector('.radical-card:hover')
        const radicalTarget = hoverRadicalEl || target?.closest?.('.radical-card')
        const radicalAttrId = Number(radicalTarget?.getAttribute?.('data-radical-id'))
        const radicalId =
          Number.isFinite(radicalAttrId) && radicalAttrId > 0
            ? radicalAttrId
            : ui.page === 'radicals'
              ? hoveredRadicalRef.current || null
              : null
        if (cardId) toggleFlaggedKanji(cardId)
        if (radicalId) toggleFlaggedRadical(radicalId)
        return
      }
      if (statusAction === undefined) return
      const hoverRadicalEl = document.querySelector('.radical-card:hover')
      const radicalTarget = hoverRadicalEl || target?.closest?.('.radical-card')
      const radicalAttrId = Number(radicalTarget?.getAttribute?.('data-radical-id'))
      const radicalId =
        Number.isFinite(radicalAttrId) && radicalAttrId > 0
          ? radicalAttrId
          : ui.page === 'radicals'
            ? hoveredRadicalRef.current || null
            : null
      if (cardId) {
        setStatus(cardId, statusAction)
        return
      }
      if (radicalId) {
        setRadicalStatus(radicalId, statusAction)
      }
    },
    [
      detailKanji,
      detailRadical,
      setStatus,
      setRadicalStatus,
      setVocabHighlight,
      isStorageOwner,
      toggleFlaggedKanji,
      toggleFlaggedRadical,
      toggleDetailMnemonics,
      ui.storageLocked,
      ui.page,
    ]
  )

  const handleDigitHotkey = useCallback(
    (event) => {
      if (event.type !== 'keydown') return
      if (event.repeat) return
      if (isTextEditingTarget(event.target)) return
      if (isMnemonicToggleHotkey(event)) {
        applyDigitHotkey('mnemonic-toggle')
        event.preventDefault()
        return
      }
      const digit = getDigitFromEvent(event)
      if (!digit) return
      applyDigitHotkey(digit)
      event.preventDefault()
    },
    [applyDigitHotkey]
  )

  useEffect(() => {
    const keydown = (event) => handleDigitHotkey(event)
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
    }
  }, [handleDigitHotkey])

  const openCard = useCallback((item) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const openRadicalCard = useCallback((item) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const confirmDiscardDetailEdits = useCallback(
    (action = 'leave this detail page') => {
      const currentDetailKanji = detailKanjiRef.current
      if (
        !detailEditModeRef.current ||
        !detailEditDirtyRef.current ||
        !currentDetailKanji ||
        'missingToken' in currentDetailKanji
      ) {
        return true
      }
      return window.confirm(
        `Discard unsaved changes for ${currentDetailKanji.kanji} before you ${action}?`
      )
    },
    []
  )

  const getKanjiDetailPath = useCallback((item) => {
    const base = import.meta.env.BASE_URL || '/'
    return `${base}#/kanji/${encodeURIComponent(item.kanji)}`
  }, [])

  const getRadicalDetailPath = useCallback((item) => {
    const base = import.meta.env.BASE_URL || '/'
    const token = encodeURIComponent(item.slug || slugifyValue(item.primaryMeaning))
    return `${base}#/radical/${token}`
  }, [])

  const restoreCurrentDetailRoute = useCallback(() => {
    const base = import.meta.env.BASE_URL || '/'
    if (detailKanji && !('missingToken' in detailKanji)) {
      window.history.pushState({}, '', getKanjiDetailPath(detailKanji))
      return
    }
    if (detailRadical && !('missingToken' in detailRadical)) {
      window.history.pushState({}, '', getRadicalDetailPath(detailRadical))
      return
    }
    window.history.pushState({}, '', base)
  }, [detailKanji, detailRadical, getKanjiDetailPath, getRadicalDetailPath])

  const captureFamiliarityScrollPosition = useCallback(() => {
    if (ui.page !== 'familiarity' || detailKanji || detailRadical) return
    const container = familiarityContentRef.current || document.querySelector('.content')
    if (!container) return
    familiarityDetailScrollRef.current = {
      scrollTop: container.scrollTop || 0,
      windowScrollY: window.scrollY || window.pageYOffset || 0,
    }
  }, [detailKanji, detailRadical, ui.page])

  const restoreFamiliarityScrollPosition = useCallback(() => {
    const saved = familiarityDetailScrollRef.current
    if (!saved) return
    familiarityRestorePendingRef.current = saved
  }, [])

  const openKanjiDetail = useCallback((item, options = {}) => {
    if (!item) return
    if (detailKanji?.id === item.id && !('missingToken' in detailKanji)) return
    if (!confirmDiscardDetailEdits(`open ${item.kanji}`)) return
    detailScrollTargetRef.current = options.scrollTarget || 'top'
    captureFamiliarityScrollPosition()
    window.history.pushState({}, '', getKanjiDetailPath(item))
    lastPointerTargetRef.current = null
    setUi((prev) => ({
      ...prev,
      lastDetailLevel: prev.selectedLevel,
    }))
    setDetailKanji(item)
    setDetailRadical(null)
  }, [captureFamiliarityScrollPosition, confirmDiscardDetailEdits, detailKanji, getKanjiDetailPath])

  const openRadicalDetail = useCallback((item, options = {}) => {
    if (!item) return
    const currentToken =
      detailRadical && !('missingToken' in detailRadical)
        ? detailRadical.slug || slugifyValue(detailRadical.primaryMeaning)
        : null
    const nextToken = item.slug || slugifyValue(item.primaryMeaning)
    if (currentToken === nextToken) return
    if (!confirmDiscardDetailEdits(`open the ${item.primaryMeaning} radical`)) return
    detailScrollTargetRef.current = options.scrollTarget || 'top'
    captureFamiliarityScrollPosition()
    window.history.pushState({}, '', getRadicalDetailPath(item))
    hoveredRadicalRef.current = null
    lastPointerTargetRef.current = null
    setUi((prev) => ({ ...prev, selectedRadicalLevel: item.level || prev.selectedRadicalLevel }))
    setDetailKanji(null)
    setDetailRadical(item)
  }, [captureFamiliarityScrollPosition, confirmDiscardDetailEdits, detailRadical, getRadicalDetailPath])

  const closeKanjiDetail = () => {
    if (!confirmDiscardDetailEdits('go back')) return
    const base = import.meta.env.BASE_URL || '/'
    window.history.pushState({}, '', base)
    setUi((prev) => {
      if (detailKanji && prev.lastDetailLevel && prev.lastDetailLevel !== prev.selectedLevel) {
        return { ...prev, selectedLevel: prev.lastDetailLevel }
      }
      return prev
    })
    setDetailKanji(null)
    setDetailRadical(null)
    restoreFamiliarityScrollPosition()
  }

  const updateDetailDraftField = useCallback((field, value) => {
    setDetailEditDraft((prev) => ({
      ...(prev || createKanjiContentDraft(detailKanji)),
      [field]: value,
    }))
  }, [detailKanji])

  const addSelectedDetailRadicals = useCallback(() => {
    if (!detailRadicalPickerIds.length) return
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      return {
        ...current,
        radicalSubjectIds: uniqueNumberList([...current.radicalSubjectIds, ...detailRadicalPickerIds]),
      }
    })
    setDetailComponentPendingRemoveId(null)
    setDetailRadicalPickerIds([])
    setDetailRadicalSearch('')
  }, [detailKanji, detailRadicalPickerIds])

  const removeDetailRadical = useCallback((radicalId) => {
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      return {
        ...current,
        radicalSubjectIds: current.radicalSubjectIds.filter((id) => id !== radicalId),
      }
    })
    setDetailComponentPendingRemoveId(null)
  }, [detailKanji])

  const moveDetailRadical = useCallback((radicalId, direction) => {
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      const ids = [...current.radicalSubjectIds]
      const index = ids.indexOf(radicalId)
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || targetIndex < 0 || targetIndex >= ids.length) return current
      const [moved] = ids.splice(index, 1)
      ids.splice(targetIndex, 0, moved)
      return {
        ...current,
        radicalSubjectIds: ids,
      }
    })
  }, [detailKanji])

  const addSelectedDetailSimilarKanji = useCallback(() => {
    if (!detailSimilarPickerIds.length) return
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      const nextKanji = detailSimilarPickerIds
        .map((id) => kanjiList.find((item) => item.id === id)?.kanji || '')
        .filter(Boolean)
      return {
        ...current,
        visuallySimilarKanji: uniqueStringList([
          ...splitKanjiTokens(current.visuallySimilarKanji),
          ...nextKanji,
        ]).join(', '),
      }
    })
    setDetailSimilarPendingRemoveKanji(null)
    setDetailSimilarPickerIds([])
    setDetailSimilarSearch('')
  }, [detailKanji, detailSimilarPickerIds, kanjiList])

  const removeDetailSimilarKanji = useCallback((kanjiChar) => {
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      return {
        ...current,
        visuallySimilarKanji: splitKanjiTokens(current.visuallySimilarKanji)
          .filter((token) => token !== kanjiChar)
          .join(', '),
      }
    })
    setDetailSimilarPendingRemoveKanji(null)
  }, [detailKanji])

  const moveDetailSimilarKanji = useCallback((kanjiChar, direction) => {
    setDetailEditDraft((prev) => {
      const current = createKanjiContentDraft(prev || detailKanji)
      const tokens = splitKanjiTokens(current.visuallySimilarKanji)
      const index = tokens.indexOf(kanjiChar)
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || targetIndex < 0 || targetIndex >= tokens.length) return current
      const [moved] = tokens.splice(index, 1)
      tokens.splice(targetIndex, 0, moved)
      return {
        ...current,
        visuallySimilarKanji: tokens.join(', '),
      }
    })
  }, [detailKanji])

  const cancelDetailContentEdits = useCallback(() => {
    if (!detailKanji || 'missingToken' in detailKanji) return
    setDetailEditDraft(createKanjiContentDraft(detailKanji))
    setDetailComponentPendingRemoveId(null)
    setDetailSimilarPendingRemoveKanji(null)
    setDetailRadicalPickerIds([])
    setDetailRadicalSearch('')
    setDetailSimilarPickerIds([])
    setDetailSimilarSearch('')
    setDetailEditMode(false)
  }, [detailKanji])


  const getRouteInfo = () => {
    if (typeof window === 'undefined') return null
    const hash = window.location.hash || ''
    if (hash.startsWith('#/kanji/')) {
      return { type: 'kanji', token: decodeURIComponent(hash.replace('#/kanji/', '')) }
    }
    if (hash.startsWith('#/radical/')) {
      return { type: 'radical', token: decodeURIComponent(hash.replace('#/radical/', '')) }
    }
    const base = import.meta.env.BASE_URL || '/'
    const rawPath = window.location.pathname || ''
    const relative = rawPath.startsWith(base) ? rawPath.slice(base.length) : rawPath
    if (relative.startsWith('kanji/')) {
      return { type: 'kanji', token: decodeURIComponent(relative.replace('kanji/', '')) }
    }
    if (relative.startsWith('radical/')) {
      return { type: 'radical', token: decodeURIComponent(relative.replace('radical/', '')) }
    }
    return null
  }

  const findKanjiByToken = useCallback((token) => {
    if (!token) return null
    const numeric = Number(token)
    if (Number.isFinite(numeric)) {
      return kanjiList.find((item) => item.id === numeric) || null
    }
    return kanjiList.find((item) => item.kanji === token) || null
  }, [kanjiList])

  const findRadicalByToken = useCallback((token) => {
    if (!token) return null
    const numeric = Number(token)
    if (Number.isFinite(numeric)) {
      return radicalList.find((item) => item.id === numeric) || null
    }
    return radicalBySlug.get(slugifyValue(token)) || null
  }, [radicalBySlug, radicalList])

  useEffect(() => {
    const syncFromRoute = () => {
      const route = getRouteInfo()
      const isSameKanjiRoute =
        route?.type === 'kanji' &&
        detailKanji &&
        !('missingToken' in detailKanji) &&
        route.token === detailKanji.kanji
      const isSameRadicalRoute =
        route?.type === 'radical' &&
        detailRadical &&
        !('missingToken' in detailRadical) &&
        route.token === (detailRadical.slug || slugifyValue(detailRadical.primaryMeaning))
      const routeMatchesCurrent =
        (!route && !detailKanji && !detailRadical) || isSameKanjiRoute || isSameRadicalRoute
      if (!routeMatchesCurrent && !confirmDiscardDetailEdits('leave this detail page')) {
        restoreCurrentDetailRoute()
        return
      }
      if (!route) {
        setDetailKanji(null)
        setDetailRadical(null)
        return
      }
      if (route.type === 'kanji') {
        const match = findKanjiByToken(route.token)
        setDetailKanji(match || { missingToken: route.token })
        setDetailRadical(null)
        return
      }
      if (route.type === 'radical') {
        const match = findRadicalByToken(route.token)
        setDetailRadical(match || { missingToken: route.token })
        setDetailKanji(null)
      }
    }
    syncFromRoute()
    window.addEventListener('hashchange', syncFromRoute)
    window.addEventListener('popstate', syncFromRoute)
    return () => {
      window.removeEventListener('hashchange', syncFromRoute)
      window.removeEventListener('popstate', syncFromRoute)
    }
  }, [
    confirmDiscardDetailEdits,
    detailKanji,
    detailRadical,
    findKanjiByToken,
    findRadicalByToken,
    restoreCurrentDetailRoute,
  ])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!detailEditModeRef.current || !detailEditDirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const baseTitle = 'kanji-organizer'
    if (detailKanji) {
      if ('missingToken' in detailKanji) {
        document.title = `Kanji: ${detailKanji.missingToken} · ${baseTitle}`
        return
      }
      const levelText = detailKanji.level ? ` (Lv ${detailKanji.level})` : ''
      document.title = `Kanji: ${detailKanji.kanji}${levelText} · ${baseTitle}`
      return
    }
    if (detailRadical) {
      if ('missingToken' in detailRadical) {
        document.title = `Radical: ${detailRadical.missingToken} · ${baseTitle}`
        return
      }
      const label = detailRadical.primaryMeaning || detailRadical.radical
      const levelText = detailRadical.level ? ` (Lv ${detailRadical.level})` : ''
      document.title = `Radical: ${label}${levelText} · ${baseTitle}`
      return
    }
    document.title = baseTitle
  }, [detailKanji, detailRadical])

  const groupedByFamiliarity = useMemo(() => {
    const groupsMap = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    orderedItems.forEach((item) => {
      const status = familiarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [orderedItems, familiarity])

  const kanjiSearchRecords = useMemo(
    () =>
      kanjiList.map((item) => ({
        item,
        primaryLower: (item.primaryMeaning || '').toLowerCase(),
        otherLower: (item.otherMeanings || []).map((meaning) => meaning.toLowerCase()),
      })),
    [kanjiList]
  )
  const radicalSearchRecords = useMemo(
    () =>
      radicalList.map((item) => ({
        item,
        primaryLower: (item.primaryMeaning || '').toLowerCase(),
        otherLower: (item.otherMeanings || []).map((meaning) => meaning.toLowerCase()),
      })),
    [radicalList]
  )

  const searchSections = useMemo(() => {
    const rawQuery = deferredSearchQuery.trim()
    const query = rawQuery.toLowerCase()
    if (!query) return []

    const kanjiResults = []
    for (const record of kanjiSearchRecords) {
      const { item, primaryLower, otherLower } = record
      const inPrimary = primaryLower.includes(query)
      const inOther = otherLower.some((meaning) => meaning.includes(query))
      const inKanji = item.kanji?.includes(rawQuery)
      if (!inPrimary && !inOther && !inKanji) continue
      kanjiResults.push({
        type: 'kanji',
        item,
        displayMeaning: getSearchDisplayMeaning(item.primaryMeaning, item.otherMeanings, query),
      })
      if (kanjiResults.length >= 20) break
    }

    const radicalResults = []
    for (const record of radicalSearchRecords) {
      const { item, primaryLower, otherLower } = record
      const inPrimary = primaryLower.includes(query)
      const inOther = otherLower.some((meaning) => meaning.includes(query))
      const inRadical = item.radical?.includes(rawQuery)
      if (!inPrimary && !inOther && !inRadical) continue
      radicalResults.push({
        type: 'radical',
        item,
        displayMeaning: getSearchDisplayMeaning(item.primaryMeaning, item.otherMeanings, query),
      })
      if (radicalResults.length >= 20) break
    }

    return [
      { key: 'kanji', label: 'Kanji', results: kanjiResults },
      { key: 'radical', label: 'Radicals', results: radicalResults },
    ].filter((section) => section.results.length > 0)
  }, [deferredSearchQuery, kanjiSearchRecords, radicalSearchRecords])
  const flatSearchResults = useMemo(
    () => searchSections.flatMap((section) => section.results),
    [searchSections]
  )

  const kanjiByCharacter = useMemo(() => {
    const map = new Map()
    kanjiList.forEach((item) => {
      if (!item.kanji) return
      map.set(item.kanji, item)
    })
    return map
  }, [kanjiList])
  const kanjiById = useMemo(() => {
    const map = new Map()
    kanjiList.forEach((item) => {
      map.set(item.id, item)
    })
    return map
  }, [kanjiList])
  const kanjiBaseById = useMemo(() => {
    const map = new Map()
    kanjiBaseList.forEach((item) => {
      map.set(item.id, item)
    })
    return map
  }, [kanjiBaseList])
  const randomReviewInclude = randomReviewConfig.include
  const randomReviewFilter = randomReviewConfig.filter
  const randomReviewIncludedStatuses = useMemo(
    () => getRandomReviewSelectedStatuses(randomReviewInclude),
    [randomReviewInclude]
  )
  const randomReviewFilteredStatuses = useMemo(
    () => getRandomReviewSelectedStatuses(randomReviewFilter),
    [randomReviewFilter]
  )
  const randomReviewHasIncludedSections = useMemo(
    () => hasActiveRandomReviewSection(randomReviewInclude),
    [randomReviewInclude]
  )
  const randomReviewHasActiveFilter = useMemo(
    () => hasActiveRandomReviewSection(randomReviewFilter),
    [randomReviewFilter]
  )
  const includedRandomReviewIds = useMemo(() => {
    if (!randomReviewHasIncludedSections) return []
    const ids = []
    const seen = new Set()
    kanjiList.forEach((item) => {
      const status = familiarity[item.id] || STATUS.UNMARKED
      const included =
        (randomReviewInclude.flagged && flaggedKanji[item.id]) ||
        Boolean(randomReviewInclude.statuses[status])
      if (!included || seen.has(item.id)) return
      seen.add(item.id)
      ids.push(item.id)
    })
    return ids
  }, [
    familiarity,
    flaggedKanji,
    kanjiList,
    randomReviewHasIncludedSections,
    randomReviewInclude,
  ])
  const randomReviewIds = useMemo(() => {
    if (!randomReviewHasIncludedSections) return []
    if (!randomReviewHasActiveFilter) return includedRandomReviewIds
    return includedRandomReviewIds.filter((id) => {
      const status = familiarity[id] || STATUS.UNMARKED
      const filteredOut =
        (randomReviewFilter.flagged && Boolean(flaggedKanji[id])) ||
        Boolean(randomReviewFilter.statuses[status])
      return !filteredOut
    })
  }, [
    familiarity,
    flaggedKanji,
    includedRandomReviewIds,
    randomReviewFilter,
    randomReviewFilteredStatuses.length,
    randomReviewHasActiveFilter,
    randomReviewHasIncludedSections,
  ])
  const randomReviewIdSet = useMemo(() => new Set(randomReviewIds), [randomReviewIds])
  const randomReviewSignature = useMemo(() => getIdSignature(randomReviewIds), [randomReviewIds])
  const hasRandomReviewItems = randomReviewIds.length > 0
  const randomReviewIncludeSummary = useMemo(() => {
    const parts = []
    if (randomReviewInclude.flagged) parts.push('Flagged')
    if (randomReviewIncludedStatuses.length) {
      parts.push(randomReviewIncludedStatuses.map((status) => STATUS_LABELS[status]).join(' + '))
    }
    return parts.join(' + ') || 'None'
  }, [randomReviewInclude.flagged, randomReviewIncludedStatuses])
  const randomReviewFilterSummary = useMemo(() => {
    const parts = []
    if (randomReviewFilter.flagged) parts.push('Flagged')
    if (randomReviewFilteredStatuses.length) {
      parts.push(randomReviewFilteredStatuses.map((status) => STATUS_LABELS[status]).join(' + '))
    }
    return parts.join(' + ') || 'None'
  }, [randomReviewFilter.flagged, randomReviewFilteredStatuses])
  const randomReviewOptionCounts = useMemo(() => {
    const counts = {
      flagged: 0,
      [STATUS.NEEDS]: 0,
      [STATUS.LUKEWARM]: 0,
      [STATUS.COMFORTABLE]: 0,
      [STATUS.UNMARKED]: 0,
    }
    kanjiList.forEach((item) => {
      if (flaggedKanji[item.id]) counts.flagged += 1
      const status = familiarity[item.id] || STATUS.UNMARKED
      counts[status] += 1
    })
    return counts
  }, [familiarity, flaggedKanji, kanjiList])
  const draftRandomReviewInclude = draftRandomReviewConfig.include
  const draftRandomReviewFilter = draftRandomReviewConfig.filter
  const draftRandomReviewHasIncludedSections = useMemo(
    () => hasActiveRandomReviewSection(draftRandomReviewInclude),
    [draftRandomReviewInclude]
  )
  const draftRandomReviewFilteredStatuses = useMemo(
    () => getRandomReviewSelectedStatuses(draftRandomReviewFilter),
    [draftRandomReviewFilter]
  )
  const draftRandomReviewHasActiveFilter = useMemo(
    () => hasActiveRandomReviewSection(draftRandomReviewFilter),
    [draftRandomReviewFilter]
  )
  const draftRandomReviewMatchCount = useMemo(() => {
    if (!draftRandomReviewHasIncludedSections) return 0
    return kanjiList.filter((item) => {
      const status = familiarity[item.id] || STATUS.UNMARKED
      const included =
        (draftRandomReviewInclude.flagged && flaggedKanji[item.id]) ||
        Boolean(draftRandomReviewInclude.statuses[status])
      if (!included) return false
      if (!draftRandomReviewHasActiveFilter) return true
      const filteredOut =
        (draftRandomReviewFilter.flagged && Boolean(flaggedKanji[item.id])) ||
        Boolean(draftRandomReviewFilter.statuses[status])
      return !filteredOut
    }).length
  }, [
    draftRandomReviewFilter,
    draftRandomReviewFilteredStatuses.length,
    draftRandomReviewHasActiveFilter,
    draftRandomReviewHasIncludedSections,
    draftRandomReviewInclude,
    familiarity,
    flaggedKanji,
    kanjiList,
  ])

  useEffect(() => {
    if (!detailKanji || 'missingToken' in detailKanji) return
    const next = kanjiById.get(detailKanji.id)
    if (next && next !== detailKanji) {
      setDetailKanji(next)
    }
  }, [detailKanji, kanjiById])

  useEffect(() => {
    if (!detailKanji && !detailRadical) return
    const frameId = window.requestAnimationFrame(() => {
      const container =
        document.querySelector('.detail-page .content') || document.querySelector('.content')
      if (!container) return
      if (detailScrollTargetRef.current === 'card') {
        const card = container.querySelector('.kanji-detail-card')
        if (card) {
          if (typeof card.scrollIntoView === 'function') {
            card.scrollIntoView({ block: 'start', behavior: 'auto' })
          }
          detailScrollTargetRef.current = 'top'
          return
        }
      }
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: 0, behavior: 'auto' })
      }
      container.scrollTop = 0
      scrollWindowToTop(0)
      detailScrollTargetRef.current = 'top'
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [detailKanji, detailRadical])

  useEffect(() => {
    if (detailKanji || detailRadical || ui.page !== 'familiarity') return
    const saved = familiarityRestorePendingRef.current
    const container = familiarityContentRef.current
    if (!saved || !container) return
    const frameId = window.requestAnimationFrame(() => {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: saved.scrollTop, behavior: 'auto' })
      }
      container.scrollTop = saved.scrollTop
      scrollWindowToTop(saved.windowScrollY || 0)
      familiarityRestorePendingRef.current = null
      familiarityDetailScrollRef.current = null
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [detailKanji, detailRadical, ui.page])

  const clearRandomReviewQueue = useCallback((total = 0) => {
    randomFlaggedQueueRef.current = { ids: [], index: 0, signature: '' }
    setHasRandomFlaggedQueue(false)
    setRandomFlaggedProgress({ current: 0, total })
  }, [])

  useEffect(() => {
    if (!hasRandomReviewItems) {
      clearRandomReviewQueue(0)
      return
    }
    if (randomFlaggedQueueRef.current.signature === randomReviewSignature) return
    clearRandomReviewQueue(randomReviewIds.length)
  }, [clearRandomReviewQueue, hasRandomReviewItems, randomReviewIds.length, randomReviewSignature])

  const resetRandomFlaggedQueue = useCallback(
    (currentId = null) => {
      randomFlaggedQueueRef.current = {
        ids: buildRandomQueue(randomReviewIds, currentId),
        index: 0,
        signature: randomReviewSignature,
      }
      setHasRandomFlaggedQueue(randomReviewIds.length > 0)
      setRandomFlaggedProgress({ current: 0, total: randomReviewIds.length })
    },
    [randomReviewIds, randomReviewSignature]
  )

  const openRandomFlaggedKanji = useCallback(() => {
    if (!randomReviewIds.length) return false

    const currentId =
      detailKanji && !('missingToken' in detailKanji) ? detailKanji.id : null
    const queue = randomFlaggedQueueRef.current
    if (queue.signature !== randomReviewSignature || queue.index >= queue.ids.length) {
      resetRandomFlaggedQueue(currentId)
    }

    while (randomFlaggedQueueRef.current.index < randomFlaggedQueueRef.current.ids.length) {
      const queueState = randomFlaggedQueueRef.current
      const nextId = queueState.ids[queueState.index]
      if (!randomReviewIdSet.has(nextId)) {
        queueState.index += 1
        continue
      }
      if (
        currentId &&
        nextId === currentId &&
        randomReviewIds.length > 1 &&
        queueState.index < queueState.ids.length - 1
      ) {
        const [deferredId] = queueState.ids.splice(queueState.index, 1)
        queueState.ids.push(deferredId)
        continue
      }
      queueState.index += 1
      const nextItem = kanjiById.get(nextId)
      if (!nextItem) continue
      openKanjiDetail(nextItem, {
        scrollTarget: isMobileDetailViewport() ? 'card' : 'top',
      })
      setRandomFlaggedProgress({
        current: queueState.index,
        total: queueState.ids.length,
      })
      return true
    }

    return false
  }, [
    detailKanji,
    kanjiById,
    openKanjiDetail,
    randomReviewIds,
    randomReviewIdSet,
    randomReviewSignature,
    resetRandomFlaggedQueue,
  ])

  const hasBlockingModal =
    quizOpen ||
    globalQuizOpen ||
    randomReviewSettingsOpen ||
    aboutOpen ||
    sprintHistoryOpen ||
    sprintLevelStatusOpen ||
    groupAddOpen

  const handleRandomFlaggedHotkey = useCallback(
    (event) => {
      if (event.type !== 'keydown') return
      if (event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextEditingTarget(event.target)) return
      if (hasBlockingModal) return
      const key = String(event.key || '').toLowerCase()
      if (key === 'r') {
        if (openRandomFlaggedKanji()) {
          event.preventDefault()
        }
        return
      }
      if (key === 'q' && hasRandomReviewItems && hasRandomFlaggedQueue) {
        resetRandomFlaggedQueue(
          detailKanji && !('missingToken' in detailKanji) ? detailKanji.id : null
        )
        event.preventDefault()
      }
    },
    [
      detailKanji,
      hasRandomFlaggedQueue,
      hasRandomReviewItems,
      hasBlockingModal,
      openRandomFlaggedKanji,
      resetRandomFlaggedQueue,
    ]
  )

  useEffect(() => {
    const keydown = (event) => handleRandomFlaggedHotkey(event)
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
    }
  }, [handleRandomFlaggedHotkey])

  const openRandomReviewSettings = useCallback(() => {
    setDraftRandomReviewConfig(randomReviewConfig)
    setRandomReviewSettingsOpen(true)
  }, [randomReviewConfig])

  const applyRandomReviewConfig = useCallback(() => {
    const nextConfig = normalizeRandomReviewConfig(draftRandomReviewConfig)
    clearRandomReviewQueue(draftRandomReviewMatchCount)
    setUi((prev) => ({ ...prev, randomReviewConfig: nextConfig }))
    setRandomReviewSettingsOpen(false)
  }, [clearRandomReviewQueue, draftRandomReviewConfig, draftRandomReviewMatchCount])

  const detailVocabEntries = useMemo(() => {
    if (!detailKanji) return []
    return vocabEntriesByKanji.get(detailKanji.kanji) || []
  }, [detailKanji, vocabEntriesByKanji])
  const detailVisuallySimilarKanji = useMemo(() => {
    if (!detailKanji?.visuallySimilarKanji) return []
    const seen = new Set()
    return sortItemsByLevel(
      splitKanjiTokens(detailKanji.visuallySimilarKanji)
      .map((token) => kanjiByCharacter.get(token))
      .filter((item) => {
        if (!item) return false
        if (item.id === detailKanji.id) return false
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
    )
  }, [detailKanji, kanjiByCharacter])
  const detailKanjiRadicals = useMemo(() => {
    if (!detailKanji?.radicalSubjectIds?.length) return []
    return detailKanji.radicalSubjectIds
      .map((id) => radicalById.get(id))
      .filter(Boolean)
  }, [detailKanji, radicalById])
  const detailCompareMnemonics = useMemo(() => {
    if (!detailKanji || !compareKanjiByCharacter) return null
    return compareKanjiByCharacter.get(detailKanji.kanji) || null
  }, [detailKanji, compareKanjiByCharacter])
  const detailCompareRadicals = useMemo(() => {
    if (!detailCompareMnemonics?.radicalSubjectIds?.length) return []
    return detailCompareMnemonics.radicalSubjectIds
      .map((id) => radicalById.get(id))
      .filter(Boolean)
  }, [detailCompareMnemonics, radicalById])
  const detailCompareVisuallySimilar = useMemo(() => {
    if (!detailCompareMnemonics?.visuallySimilarKanji) return []
    const seen = new Set()
    return splitKanjiTokens(detailCompareMnemonics.visuallySimilarKanji)
      .map((token) => kanjiByCharacter.get(token))
      .filter((item) => {
        if (!item) return false
        if (item.id === detailKanji?.id) return false
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
  }, [detailCompareMnemonics, kanjiByCharacter, detailKanji])
  const detailDraftVisuallySimilarKanji = useMemo(() => {
    if (!detailEditDraft?.visuallySimilarKanji) return []
    const seen = new Set()
    return splitKanjiTokens(detailEditDraft.visuallySimilarKanji)
      .map((token) => kanjiByCharacter.get(token))
      .filter((item) => {
        if (!item) return false
        if (detailKanji && item.id === detailKanji.id) return false
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
  }, [detailEditDraft?.visuallySimilarKanji, detailKanji, kanjiByCharacter])
  const filteredDetailRadicals = useMemo(() => {
    const query = deferredDetailRadicalSearch.trim().toLowerCase()
    if (!query) return []
    const selectedIds = new Set(detailEditDraft?.radicalSubjectIds || [])
    const matches = []
    for (const radical of radicalList) {
      if (selectedIds.has(radical.id)) continue
      const label = `${radical.primaryMeaning} ${radical.radical || ''}`.toLowerCase()
      if (!label.includes(query)) continue
      matches.push(radical)
      if (matches.length >= 30) break
    }
    return matches
  }, [deferredDetailRadicalSearch, detailEditDraft?.radicalSubjectIds, radicalList])
  const filteredDetailSimilarKanji = useMemo(() => {
    const rawQuery = deferredDetailSimilarSearch.trim()
    const query = rawQuery.toLowerCase()
    if (!query) return []
    const selectedKanji = new Set(splitKanjiTokens(detailEditDraft?.visuallySimilarKanji || ''))
    const matches = []
    for (const item of kanjiSearchRecords) {
      if (detailKanji && item.item.id === detailKanji.id) continue
      if (selectedKanji.has(item.item.kanji)) continue
      const inPrimary = item.primaryLower.includes(query)
      const inOther = item.otherLower.some((meaning) => meaning.includes(query))
      const inKanji = item.item.kanji?.includes(rawQuery)
      if (!inPrimary && !inOther && !inKanji) continue
      matches.push(item.item)
      if (matches.length >= 40) break
    }
    return matches
  }, [deferredDetailSimilarSearch, detailEditDraft?.visuallySimilarKanji, detailKanji, kanjiSearchRecords])
  const detailCurrentDraft = useMemo(
    () => ('missingToken' in (detailKanji || {}) ? null : createKanjiContentDraft(detailKanji)),
    [detailKanji]
  )
  const detailMnemonicValidation = useMemo(
    () => ({
      meaningMnemonic: validateMnemonicMarkup(detailEditDraft?.meaningMnemonic || ''),
      readingMnemonic: validateMnemonicMarkup(detailEditDraft?.readingMnemonic || ''),
      extraReadingMnemonic: validateMnemonicMarkup(detailEditDraft?.extraReadingMnemonic || ''),
      relatedMnemonicReadings: validateMnemonicMarkup(
        detailEditDraft?.relatedMnemonicReadings || ''
      ),
    }),
    [
      detailEditDraft?.meaningMnemonic,
      detailEditDraft?.readingMnemonic,
      detailEditDraft?.extraReadingMnemonic,
      detailEditDraft?.relatedMnemonicReadings,
    ]
  )
  const detailHasValidationErrors = Object.values(detailMnemonicValidation).some(
    (issues) => issues.length > 0
  )
  const detailIndicatorSource = detailEditMode
    ? detailEditDraft
    : detailKanji && !('missingToken' in detailKanji)
      ? detailKanji
      : null
  const detailIndicatorHasValidationErrors = useMemo(() => {
    if (!detailIndicatorSource) return false
    return ['meaningMnemonic', 'readingMnemonic', 'extraReadingMnemonic', 'relatedMnemonicReadings'].some(
      (field) => validateMnemonicMarkup(detailIndicatorSource[field] || '').length > 0
    )
  }, [detailIndicatorSource])
  const detailEditDirty =
    !!detailEditDraft &&
    !!detailCurrentDraft &&
    (detailCurrentDraft.meaningMnemonic !== detailEditDraft.meaningMnemonic ||
      detailCurrentDraft.readingMnemonic !== detailEditDraft.readingMnemonic ||
      detailCurrentDraft.extraReadingMnemonic !== detailEditDraft.extraReadingMnemonic ||
      detailCurrentDraft.relatedMnemonicReadings !== detailEditDraft.relatedMnemonicReadings ||
      detailCurrentDraft.onyomi !== detailEditDraft.onyomi ||
      detailCurrentDraft.kunyomi !== detailEditDraft.kunyomi ||
      detailCurrentDraft.nanori !== detailEditDraft.nanori ||
      !areNumberListsEqual(detailCurrentDraft.radicalSubjectIds, detailEditDraft.radicalSubjectIds) ||
      detailCurrentDraft.visuallySimilarKanji !== detailEditDraft.visuallySimilarKanji)

  const updateKanjiRadicalSubjectIds = useCallback(
    (kanjiId, nextRadicalSubjectIds) => {
      const currentItem = kanjiById.get(kanjiId)
      const baseItem = kanjiBaseById.get(kanjiId)
      if (!currentItem || !baseItem) return
      const draft = {
        ...createKanjiContentDraft(currentItem),
        radicalSubjectIds: uniqueNumberList(nextRadicalSubjectIds),
      }
      const edit = buildKanjiContentEdit(baseItem, draft)
      setContentEditsByKanji((prev) => {
        const next = { ...prev }
        if (edit) {
          next[kanjiId] = edit
        } else {
          delete next[kanjiId]
        }
        return next
      })
    },
    [kanjiBaseById, kanjiById]
  )

  const addKanjiToDetailRadical = useCallback(
    (kanjiId) => {
      if (!detailRadical || !canPersistEdits) return
      const currentItem = kanjiById.get(kanjiId)
      if (!currentItem) return
      if ((currentItem.radicalSubjectIds || []).includes(detailRadical.id)) return
      updateKanjiRadicalSubjectIds(kanjiId, [...(currentItem.radicalSubjectIds || []), detailRadical.id])
      setDetailRadicalPendingRemoveId(null)
    },
    [canPersistEdits, detailRadical, kanjiById, updateKanjiRadicalSubjectIds]
  )

  const removeKanjiFromDetailRadical = useCallback(
    (kanjiId) => {
      if (!detailRadical || !canPersistEdits) return
      const currentItem = kanjiById.get(kanjiId)
      if (!currentItem) return
      if (!(currentItem.radicalSubjectIds || []).includes(detailRadical.id)) return
      updateKanjiRadicalSubjectIds(
        kanjiId,
        (currentItem.radicalSubjectIds || []).filter((id) => id !== detailRadical.id)
      )
      setDetailRadicalPendingRemoveId(null)
    },
    [canPersistEdits, detailRadical, kanjiById, updateKanjiRadicalSubjectIds]
  )

  const saveDetailContentEdits = useCallback(() => {
    if (!detailKanji || 'missingToken' in detailKanji) return
    if (detailHasValidationErrors) return
    const baseItem = kanjiBaseById.get(detailKanji.id)
    if (!baseItem || !detailEditDraft) return
    const edit = buildKanjiContentEdit(baseItem, detailEditDraft)
    setContentEditsByKanji((prev) => {
      const next = { ...prev }
      if (edit) {
        next[detailKanji.id] = edit
      } else {
        delete next[detailKanji.id]
      }
      return next
    })
    const activeReadingTokens = new Set(
      [
        ...splitReadingTokens(detailEditDraft.onyomi),
        ...splitReadingTokens(detailEditDraft.kunyomi),
        ...splitReadingTokens(detailEditDraft.nanori),
      ]
        .map((token) => normalizeReadingToken(token))
        .filter(Boolean)
    )
    setReadingStatusByKanji((prev) => {
      const current = prev[detailKanji.id]
      if (!current) return prev
      const nextMap = Object.fromEntries(
        Object.entries(current).filter(([token]) => activeReadingTokens.has(token))
      )
      if (Object.keys(nextMap).length === Object.keys(current).length) return prev
      const next = { ...prev }
      if (Object.keys(nextMap).length === 0) {
        delete next[detailKanji.id]
      } else {
        next[detailKanji.id] = nextMap
      }
      return next
    })
    setDetailEditMode(false)
  }, [detailEditDraft, detailHasValidationErrors, detailKanji, kanjiBaseById])

  useEffect(() => {
    if (!detailKanji || 'missingToken' in detailKanji) {
      setDetailEditMode(false)
      setDetailEditDraft(null)
      setDetailComponentPendingRemoveId(null)
      setDetailSimilarPendingRemoveKanji(null)
      setDetailRadicalPickerIds([])
      setDetailRadicalSearch('')
      setDetailSimilarPickerIds([])
      setDetailSimilarSearch('')
      return
    }
    setDetailEditMode(false)
    setDetailEditDraft(createKanjiContentDraft(detailKanji))
    setDetailComponentPendingRemoveId(null)
    setDetailSimilarPendingRemoveKanji(null)
    setDetailRadicalPickerIds([])
    setDetailRadicalSearch('')
    setDetailSimilarPickerIds([])
    setDetailSimilarSearch('')
  }, [detailKanji])

  useEffect(() => {
    if (!detailRadical || 'missingToken' in detailRadical) {
      setDetailRadicalEditMode(false)
      setDetailRadicalKanjiSearch('')
      setDetailRadicalPendingRemoveId(null)
      return
    }
    setDetailRadicalEditMode(false)
    setDetailRadicalKanjiSearch('')
    setDetailRadicalPendingRemoveId(null)
  }, [detailRadical])

  useEffect(() => {
    detailEditModeRef.current = detailEditMode
    detailEditDirtyRef.current = detailEditDirty
    detailKanjiRef.current = detailKanji
    detailRadicalRef.current = detailRadical
  }, [detailEditDirty, detailEditMode, detailKanji, detailRadical])
  const detailRadicalRelatedKanji = useMemo(() => {
    if (!detailRadical) return []
    return sortItemsByLevel(
      kanjiList.filter((item) => (item.radicalSubjectIds || []).includes(detailRadical.id))
    )
  }, [detailRadical, kanjiList])
  const detailRadicalDisplayKanji = useMemo(() => {
    if (!detailRadical || 'missingToken' in detailRadical) return detailRadicalRelatedKanji
    const radicalCharacter = String(detailRadical.radical || '').trim()
    if (!radicalCharacter) return detailRadicalRelatedKanji
    const matchingKanji = kanjiByCharacter.get(radicalCharacter)
    if (!matchingKanji) return detailRadicalRelatedKanji
    if (detailRadicalRelatedKanji.some((item) => item.id === matchingKanji.id)) {
      return detailRadicalRelatedKanji
    }
    return [matchingKanji, ...detailRadicalRelatedKanji]
  }, [detailRadical, detailRadicalRelatedKanji, kanjiByCharacter])
  const detailRadicalRelatedKanjiIdSet = useMemo(
    () => new Set(detailRadicalRelatedKanji.map((item) => item.id)),
    [detailRadicalRelatedKanji]
  )
  const filteredDetailRadicalKanji = useMemo(() => {
    const query = detailRadicalKanjiSearch.trim().toLowerCase()
    if (!query) return []
    return sortItemsByLevel(
      kanjiList
        .filter((item) => {
          if (detailRadicalRelatedKanjiIdSet.has(item.id)) return false
          const inPrimary = (item.primaryMeaning || '').toLowerCase().includes(query)
          const inOther = item.otherMeanings?.some((meaning) => meaning.toLowerCase().includes(query))
          const inKanji = item.kanji?.includes(detailRadicalKanjiSearch.trim())
          return inPrimary || inOther || inKanji
        })
        .slice(0, 40)
    )
  }, [detailRadicalKanjiSearch, detailRadicalRelatedKanjiIdSet, kanjiList])
  const detailHighlightedMap = useMemo(
    () => highlightedVocabByKanji[detailKanji?.kanji] || {},
    [highlightedVocabByKanji, detailKanji]
  )

  const sortVocabEntries = useCallback((entries, highlightedMap, manualOrder) => {
    const base = [...entries].sort((a, b) => {
      const aHighlight = highlightedMap[a.id]
      const bHighlight = highlightedMap[b.id]
      const aStatus = aHighlight?.status || null
      const bStatus = bHighlight?.status || null
      const rank = (status) => {
        if (status === STATUS.COMFORTABLE) return 0
        if (status === STATUS.LUKEWARM) return 1
        return 2
      }
      const rankDiff = rank(aStatus) - rank(bStatus)
      if (rankDiff !== 0) return rankDiff
      if (!aHighlight && !bHighlight) return 0
      const aTime = aHighlight?.updated_at ? Date.parse(aHighlight.updated_at) : 0
      const bTime = bHighlight?.updated_at ? Date.parse(bHighlight.updated_at) : 0
      return bTime - aTime
    })
    const hasHighlights = base.some(
      (entry) => (highlightedMap[entry.id]?.status || null) !== null
    )
    if (!hasHighlights) return base
    const manual = manualOrder || []
    if (!manual.length) return base
    const orderIndex = new Map(manual.map((id, index) => [id, index]))
    const baseIndex = new Map(base.map((entry, index) => [entry.id, index]))
    const statusKey = (entry) => highlightedMap[entry.id]?.status || null
    const groupOrder = base.reduce((acc, entry) => {
      const key = statusKey(entry)
      if (!acc.has(key)) acc.set(key, [])
      acc.get(key).push(entry)
      return acc
    }, new Map())
    const sorted = []
    ;[STATUS.COMFORTABLE, STATUS.LUKEWARM, null].forEach((key) => {
      const group = groupOrder.get(key) || []
      group.sort((a, b) => {
        const aManual = orderIndex.has(a.id) ? orderIndex.get(a.id) : null
        const bManual = orderIndex.has(b.id) ? orderIndex.get(b.id) : null
        if (aManual !== null || bManual !== null) {
          if (aManual === null) return 1
          if (bManual === null) return -1
          return aManual - bManual
        }
        return (baseIndex.get(a.id) || 0) - (baseIndex.get(b.id) || 0)
      })
      sorted.push(...group)
    })
    return sorted
  }, [])

  const detailSortedVocab = useMemo(() => {
    if (!detailKanji) return []
    const manualOrder = vocabOrderByKanji[detailKanji.kanji] || []
    return sortVocabEntries(detailVocabEntries, detailHighlightedMap, manualOrder)
  }, [detailKanji, detailVocabEntries, detailHighlightedMap, vocabOrderByKanji, sortVocabEntries])

  const detailLevelItems = useMemo(() => {
    if (!detailKanji) return []
    return getOrderedItemsForLevel(detailKanji.level)
  }, [detailKanji, getOrderedItemsForLevel])
  const detailIndex = useMemo(() => {
    if (!detailKanji) return -1
    return detailLevelItems.findIndex((item) => item.id === detailKanji.id)
  }, [detailKanji, detailLevelItems])
  const detailPrev = detailIndex > 0 ? detailLevelItems[detailIndex - 1] : null
  const detailNext =
    detailIndex >= 0 && detailIndex < detailLevelItems.length - 1
      ? detailLevelItems[detailIndex + 1]
      : null
  const detailRadicalLevelItems = useMemo(() => {
    if (!detailRadical) return []
    const modeForLevel = ui.radicalModeByLevel?.[detailRadical.level] || 'normal'
    if (modeForLevel === 'familiarity') {
      const items = getRadicalItems(detailRadical.level)
      const order = getCurrentRadicalFamiliarityOrderForLevel(detailRadical.level)
      const map = new Map(items.map((item) => [item.id, item]))
      return order.map((id) => map.get(id)).filter(Boolean)
    }
    const items = getRadicalItems(detailRadical.level)
    const order = getCurrentRadicalOrderForLevel(detailRadical.level)
    const map = new Map(items.map((item) => [item.id, item]))
    return order.map((id) => map.get(id)).filter(Boolean)
  }, [
    detailRadical,
    getRadicalItems,
    getCurrentRadicalOrderForLevel,
    getCurrentRadicalFamiliarityOrderForLevel,
    ui.radicalModeByLevel,
  ])
  const detailRadicalIndex = useMemo(() => {
    if (!detailRadical) return -1
    return detailRadicalLevelItems.findIndex((item) => item.id === detailRadical.id)
  }, [detailRadical, detailRadicalLevelItems])
  const detailRadicalPrev =
    detailRadicalIndex > 0 ? detailRadicalLevelItems[detailRadicalIndex - 1] : null
  const detailRadicalNext =
    detailRadicalIndex >= 0 && detailRadicalIndex < detailRadicalLevelItems.length - 1
      ? detailRadicalLevelItems[detailRadicalIndex + 1]
      : null

  useEffect(() => {
    const handler = (event) => {
      if (!detailKanji && !detailRadical) return
      if (isTextEditingTarget(event.target)) return
      if (event.key === 'ArrowRight' && detailKanji && detailNext) {
        event.preventDefault()
        openKanjiDetail(detailNext)
      }
      if (event.key === 'ArrowLeft' && detailKanji && detailPrev) {
        event.preventDefault()
        openKanjiDetail(detailPrev)
      }
      if (event.key === 'ArrowRight' && detailRadical && detailRadicalNext) {
        event.preventDefault()
        openRadicalDetail(detailRadicalNext)
      }
      if (event.key === 'ArrowLeft' && detailRadical && detailRadicalPrev) {
        event.preventDefault()
        openRadicalDetail(detailRadicalPrev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    detailKanji,
    detailNext,
    detailPrev,
    detailRadical,
    detailRadicalNext,
    detailRadicalPrev,
    openKanjiDetail,
    openRadicalDetail,
  ])

  const updateVocabOrder = useCallback(
    (nextOrder) => {
      if (!detailKanji) return
      setVocabOrderByKanji((prev) => ({
        ...prev,
        [detailKanji.kanji]: nextOrder,
      }))
    },
    [detailKanji]
  )

  const handleVocabDragStart = useCallback((event, id) => {
    event.dataTransfer?.setData('text/plain', String(id))
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      try {
        const rect = event.currentTarget.getBoundingClientRect()
        const offsetX = event.clientX - rect.left
        const offsetY = event.clientY - rect.top
        event.dataTransfer.setDragImage(event.currentTarget, offsetX, offsetY)
      } catch {
        // ignore drag image errors
      }
    }
    setVocabDragId(id)
    setVocabDragOverId(null)
    setVocabDragPosition('before')
  }, [])

  const handleVocabDragOver = useCallback(
    (event, id) => {
      event.preventDefault()
      if (!detailKanji || vocabDragId == null) return
      const dragStatus = detailHighlightedMap[vocabDragId]?.status || null
      const targetStatus = detailHighlightedMap[id]?.status || null
      if (dragStatus !== targetStatus) {
        setVocabDragOverId(null)
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const position = event.clientY >= midpoint ? 'after' : 'before'
      setVocabDragOverId(id)
      setVocabDragPosition(position)
    },
    [detailKanji, detailHighlightedMap, vocabDragId]
  )

  const handleVocabDragEnter = useCallback(
    (event, id) => {
      event.preventDefault()
      if (!detailKanji || vocabDragId == null) return
      const dragStatus = detailHighlightedMap[vocabDragId]?.status || null
      const targetStatus = detailHighlightedMap[id]?.status || null
      if (dragStatus !== targetStatus) {
        setVocabDragOverId(null)
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const position = event.clientY >= midpoint ? 'after' : 'before'
      setVocabDragOverId(id)
      setVocabDragPosition(position)
    },
    [detailKanji, detailHighlightedMap, vocabDragId]
  )

  const handleVocabDrop = useCallback(
    (event, id) => {
      if (!detailKanji) return
      const transferId = event.dataTransfer?.getData('text/plain')
      const activeDragId = transferId ? Number(transferId) : vocabDragId
      if (activeDragId == null || Number.isNaN(activeDragId)) return
      const dragStatus = detailHighlightedMap[activeDragId]?.status || null
      const targetStatus = detailHighlightedMap[id]?.status || null
      if (dragStatus !== targetStatus) return
      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const position = event.clientY >= midpoint ? 'after' : 'before'
      const orderedIds = detailSortedVocab.map((entry) => entry.id)
      const fromIndex = orderedIds.indexOf(activeDragId)
      const toIndex = orderedIds.indexOf(id)
      if (fromIndex === -1 || toIndex === -1) return
      orderedIds.splice(fromIndex, 1)
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      const insertIndex = position === 'after' ? adjustedIndex + 1 : adjustedIndex
      orderedIds.splice(insertIndex, 0, activeDragId)
      updateVocabOrder(orderedIds)
      setVocabDragId(null)
      setVocabDragOverId(null)
      setVocabDragPosition('before')
    },
    [detailKanji, detailSortedVocab, updateVocabOrder, vocabDragId, detailHighlightedMap]
  )

  const handleVocabDragEnd = useCallback(() => {
    setVocabDragId(null)
    setVocabDragOverId(null)
    setVocabDragPosition('before')
  }, [])

  const getHighlightedVocab = useCallback(
    (kanjiChar) => {
      const highlightedMap = highlightedVocabByKanji[kanjiChar] || {}
      const entries = vocabEntriesByKanji.get(kanjiChar) || []
      const manualOrder = vocabOrderByKanji[kanjiChar] || []
      const sorted = sortVocabEntries(entries, highlightedMap, manualOrder)
      return sorted
        .map((entry) => {
          const highlight = highlightedMap[entry.id]
          if (!highlight) return null
          return {
            ...entry,
            highlightStatus: highlight.status,
            highlightedAt: highlight.updated_at,
          }
        })
        .filter(Boolean)
    },
    [highlightedVocabByKanji, vocabEntriesByKanji, vocabOrderByKanji, sortVocabEntries]
  )

  const getVisuallySimilarForKanji = useCallback(
    (item) => {
      if (!item?.visuallySimilarKanji) return []
      const seen = new Set()
      return splitKanjiTokens(item.visuallySimilarKanji)
        .map((token) => kanjiByCharacter.get(token))
        .filter((candidate) => {
          if (!candidate) return false
          if (candidate.id === item.id) return false
          if (seen.has(candidate.id)) return false
          seen.add(candidate.id)
          return true
        })
    },
    [kanjiByCharacter]
  )

  const familiarityView = ui.familiarityView || 'kanji'
  const familiarityFilterLevels = useMemo(
    () => parseLevelsInput(deferredFamiliarityLevelFilter),
    [deferredFamiliarityLevelFilter]
  )
  const familiarityFilterLevelSet = useMemo(
    () => (familiarityFilterLevels.length ? new Set(familiarityFilterLevels) : null),
    [familiarityFilterLevels]
  )
  const familiarityGroupsAllKanji = useMemo(() => {
    const groupsMap = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    familiarityOrder.forEach((id) => {
      const item = kanjiById.get(id)
      if (!item) return
      if (familiarityFilterLevelSet && !familiarityFilterLevelSet.has(item.level)) return
      const status = familiarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [familiarity, familiarityFilterLevelSet, familiarityOrder, kanjiById])

  const familiarityFlaggedKanji = useMemo(() => {
    if (familiarityView !== 'kanji') return []
    return familiarityOrder
      .map((id) => kanjiById.get(id))
      .filter(
        (item) =>
          item &&
          flaggedKanji[item.id] &&
          (!familiarityFilterLevelSet || familiarityFilterLevelSet.has(item.level))
      )
  }, [familiarityView, familiarityFilterLevelSet, flaggedKanji, familiarityOrder, kanjiById])

  const familiarityGroupsAllRadicals = useMemo(() => {
    const groupsMap = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    const map = new Map(radicalList.map((item) => [item.id, item]))
    radicalFamiliarityOrderGlobal.forEach((id) => {
      const item = map.get(id)
      if (!item) return
      if (familiarityFilterLevelSet && !familiarityFilterLevelSet.has(item.level)) return
      const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [familiarityFilterLevelSet, radicalList, radicalFamiliarity, radicalFamiliarityOrderGlobal])

  const familiarityGroupsAll =
    familiarityView === 'radical' ? familiarityGroupsAllRadicals : familiarityGroupsAllKanji

  const familiarityCountsAll = useMemo(() => {
    const counts = {}
    STATUS_ORDER_WITH_UNMARKED.forEach((status) => {
      counts[status] = familiarityGroupsAll[status]?.length || 0
    })
    counts.total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    return counts
  }, [familiarityGroupsAll])

  const navigableFamiliarityStatuses = useMemo(() => {
    return STATUS_ORDER_WITH_UNMARKED.filter(
      (status) => familiarityCountsAll[status] > 0 && ui.familiarityOpenByStatus?.[status]
    )
  }, [familiarityCountsAll, ui.familiarityOpenByStatus])

  useEffect(() => {
    const handler = (event) => {
      if (ui.page !== 'familiarity') return
      if (detailKanji || detailRadical || quizOpen || globalQuizOpen) return
      if (isTextEditingTarget(event.target)) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

      const currentStatus = getActiveFamiliarityStatus(navigableFamiliarityStatuses)
      if (!currentStatus) return
      const currentIndex = navigableFamiliarityStatuses.indexOf(currentStatus)
      if (currentIndex === -1) return
      if (navigableFamiliarityStatuses.length <= 1) return

      const nextIndex =
        event.key === 'ArrowRight'
          ? (currentIndex + 1) % navigableFamiliarityStatuses.length
          : (currentIndex - 1 + navigableFamiliarityStatuses.length) %
            navigableFamiliarityStatuses.length

      event.preventDefault()
      scrollToFamiliarity(navigableFamiliarityStatuses[nextIndex], { behavior: 'auto' })
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    detailKanji,
    detailRadical,
    getActiveFamiliarityStatus,
    globalQuizOpen,
    navigableFamiliarityStatuses,
    quizOpen,
    scrollToFamiliarity,
    ui.page,
  ])

  const selectedGroup = groups.find((group) => group.id === ui.selectedGroupId)
  const groupKanjiItemsByGroupId = useMemo(() => {
    const map = new Map()
    groups.forEach((group) => {
      map.set(
        group.id,
        group.kanjiIds.map((id) => kanjiById.get(id)).filter(Boolean)
      )
    })
    return map
  }, [groups, kanjiById])
  const selectedGroupItems = useMemo(
    () => (selectedGroup ? groupKanjiItemsByGroupId.get(selectedGroup.id) || EMPTY_ARRAY : EMPTY_ARRAY),
    [groupKanjiItemsByGroupId, selectedGroup]
  )
  const showingAllGroups = ui.selectedGroupId === 'all'
  const groupsByCategory = useMemo(() => {
    const map = new Map()
    groups.forEach((group) => {
      const category = group.category || 'Miscellaneous'
      if (!map.has(category)) map.set(category, [])
      map.get(category).push(group)
    })
    return map
  }, [groups])
  const orderedGroupCategories = useMemo(() => {
    const categories = [...GROUP_CATEGORIES]
    groups.forEach((group) => {
      const category = group.category || 'Miscellaneous'
      if (!categories.includes(category)) categories.push(category)
    })
    return categories
  }, [groups])
  const populatedGroupCategories = useMemo(
    () => orderedGroupCategories.filter((category) => (groupsByCategory.get(category) || []).length > 0),
    [orderedGroupCategories, groupsByCategory]
  )
  const sidebarOrderedGroups = useMemo(
    () => orderedGroupCategories.flatMap((category) => groupsByCategory.get(category) || []),
    [orderedGroupCategories, groupsByCategory]
  )
  const collapsedCategories = ui.groupCategoryCollapsed || {}
  const allCategoryCollapsed = orderedGroupCategories.every((category) => {
    const items = groupsByCategory.get(category) || []
    if (items.length === 0) return true
    return Boolean(collapsedCategories[category])
  })

  const getActiveGroupCategory = useCallback((categories = populatedGroupCategories) => {
    const sections = categories.map((category) => ({
      category,
      element: document.getElementById(getGroupCategoryId(category)),
    })).filter((entry) => entry.element)
    if (!sections.length) return null

    const container = document.querySelector('.content')
    const header = document.querySelector('.app-header')
    const offset = (header?.offsetHeight || 0) + 24
    const anchorTop =
      container && container.scrollHeight > container.clientHeight + 2
        ? container.getBoundingClientRect().top + offset
        : offset

    let active = sections[0].category
    let minDistance = Number.POSITIVE_INFINITY

    sections.forEach(({ category, element }) => {
      const rect = element.getBoundingClientRect()
      const withinSection = rect.top <= anchorTop && rect.bottom >= anchorTop
      const distance = withinSection ? 0 : Math.abs(rect.top - anchorTop)
      if (distance < minDistance) {
        minDistance = distance
        active = category
      }
    })

    return active
  }, [populatedGroupCategories])

  const scrollToGroupCategory = useCallback((category, options = {}) => {
    const { behavior = 'smooth' } = options
    const target = document.getElementById(getGroupCategoryId(category))
    if (!target) return
    const container = target.closest('.content')
    const header = document.querySelector('.app-header')
    const offset = (header?.offsetHeight || 0) + 24
    if (container && container.scrollHeight > container.clientHeight + 2) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const top = Math.max(0, container.scrollTop + (targetRect.top - containerRect.top) - offset)
      container.scrollTo({ top, behavior })
      return
    }
    const targetRect = target.getBoundingClientRect()
    const top = window.scrollY + targetRect.top - offset
    window.scrollTo({ top, behavior })
  }, [])

  useEffect(() => {
    const handler = (event) => {
      if (ui.page !== 'groups') return
      if (detailKanji || detailRadical || quizOpen || globalQuizOpen || groupAddOpen) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

      const target = event.target
      const allowFromGroupTitle =
        target instanceof HTMLElement && target.classList.contains('group-title')
      if (isTextEditingTarget(target) && !allowFromGroupTitle) return

      if (ui.selectedGroupId === 'all') {
        if (!populatedGroupCategories.length) return
        const currentCategory = getActiveGroupCategory(populatedGroupCategories)
        const currentIndex = currentCategory
          ? populatedGroupCategories.indexOf(currentCategory)
          : -1
        if (currentIndex === -1) return

        const nextCategory =
          event.key === 'ArrowRight'
            ? populatedGroupCategories[currentIndex + 1]
            : populatedGroupCategories[currentIndex - 1]
        if (!nextCategory) return

        event.preventDefault()
        scrollToGroupCategory(nextCategory, { behavior: 'auto' })
        return
      }

      if (!ui.selectedGroupId) {
        return
      }

      const currentIndex = sidebarOrderedGroups.findIndex((group) => group.id === ui.selectedGroupId)
      if (currentIndex === -1) return

      const nextGroup =
        event.key === 'ArrowRight'
          ? sidebarOrderedGroups[currentIndex + 1]
          : sidebarOrderedGroups[currentIndex - 1]

      if (!nextGroup) return

      event.preventDefault()
      setUi((prev) => ({ ...prev, selectedGroupId: nextGroup.id }))
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    detailKanji,
    detailRadical,
    globalQuizOpen,
    getActiveGroupCategory,
    groupAddOpen,
    populatedGroupCategories,
    quizOpen,
    scrollToGroupCategory,
    sidebarOrderedGroups,
    ui.page,
    ui.selectedGroupId,
  ])

  const addGroup = () => {
    const id = `group_${Date.now()}`
    const next = { id, name: 'New Group', kanjiIds: [], category: 'Miscellaneous' }
    setGroups((prev) => [...prev, next])
    setUi((prev) => ({ ...prev, selectedGroupId: id }))
  }

  const updateGroupName = (value) => {
    if (!selectedGroup) return
    setGroups((prev) =>
      prev.map((group) => (group.id === selectedGroup.id ? { ...group, name: value } : group))
    )
  }

  const updateGroupCategory = (value) => {
    if (!selectedGroup) return
    setGroups((prev) =>
      prev.map((group) =>
        group.id === selectedGroup.id ? { ...group, category: value } : group
      )
    )
  }

  const toggleCategory = (category) => {
    setUi((prev) => ({
      ...prev,
      groupCategoryCollapsed: {
        ...prev.groupCategoryCollapsed,
        [category]: !prev.groupCategoryCollapsed?.[category],
      },
    }))
  }

  const toggleAllCategories = () => {
    const next = {}
    orderedGroupCategories.forEach((category) => {
      const items = groupsByCategory.get(category) || []
      if (items.length === 0) return
      next[category] = !allCategoryCollapsed
    })
    setUi((prev) => ({ ...prev, groupCategoryCollapsed: next }))
  }

  const removeGroupItem = (id) => {
    if (!selectedGroup) return
    setGroups((prev) =>
      prev.map((group) =>
        group.id === selectedGroup.id
          ? { ...group, kanjiIds: group.kanjiIds.filter((itemId) => itemId !== id) }
          : group
      )
    )
  }

  const moveGroupItem = (fromId, toId) => {
    if (!selectedGroup || fromId === toId) return
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== selectedGroup.id) return group
        const ids = [...group.kanjiIds]
        const fromIndex = ids.indexOf(fromId)
        const toIndex = ids.indexOf(toId)
        if (fromIndex === -1 || toIndex === -1) return group
        ids.splice(fromIndex, 1)
        ids.splice(toIndex, 0, fromId)
        return { ...group, kanjiIds: ids }
      })
    )
  }

  const addGroupItem = (id) => {
    if (!selectedGroup) return
    setGroups((prev) =>
      prev.map((group) =>
        group.id === selectedGroup.id && !group.kanjiIds.includes(id)
          ? { ...group, kanjiIds: [...group.kanjiIds, id] }
          : group
      )
    )
  }

  const moveGroup = (fromId, toId) => {
    if (fromId === toId) return
    setGroups((prev) => {
      const ids = prev.map((group) => group.id)
      const fromIndex = ids.indexOf(fromId)
      const toIndex = ids.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const deleteGroup = () => {
    if (!selectedGroup) return
    setGroups((prev) => prev.filter((group) => group.id !== selectedGroup.id))
    setDeletedGroup(selectedGroup)
    setUi((prev) => ({ ...prev, selectedGroupId: null }))
  }

  const undoDeleteGroup = () => {
    if (!deletedGroup) return
    setGroups((prev) => [...prev, deletedGroup])
    setUi((prev) => ({ ...prev, selectedGroupId: deletedGroup.id }))
    setDeletedGroup(null)
  }

  const exportMergedCsv = async () => {
    let rows
    let fields
    try {
      const parsed = await loadKanjiCsvRows()
      rows = parsed.rows
      fields = parsed.fields
    } catch {
      window.alert('Could not load kanji.csv for export.')
      return
    }
    const nextRows = rows.map((row, index) => {
      const edit = contentEditsByKanji[index + 1]
      if (!edit) return row
      const next = { ...row }
      if (edit.meaningMnemonic !== undefined) next.meaning_mnemonic = edit.meaningMnemonic
      if (edit.readingMnemonic !== undefined) next.reading_mnemonic = edit.readingMnemonic
      if (edit.extraReadingMnemonic !== undefined) {
        next.extra_reading_mnemonic = edit.extraReadingMnemonic
      }
      if (edit.relatedMnemonicReadings !== undefined) {
        next.related_kanji_and_readings = edit.relatedMnemonicReadings
        delete next.related_mnemonic_readings
      }
      if (edit.onyomi !== undefined) next.onyomi = edit.onyomi
      if (edit.kunyomi !== undefined) next.kunyomi = edit.kunyomi
      if (edit.nanori !== undefined) next.nanori = edit.nanori
      if (edit.radicalSubjectIds !== undefined) {
        const radicals = edit.radicalSubjectIds.map((id) => radicalById.get(id)).filter(Boolean)
        next.radical_subject_ids = edit.radicalSubjectIds.join(',')
        next.radical_characters = radicals
          .map((radical) => radical.radical || '')
          .filter(Boolean)
          .join(', ')
        next.radical_meanings = radicals
          .map((radical) => radical.primaryMeaning || '')
          .filter(Boolean)
          .join(', ')
      }
      if (edit.visuallySimilarKanji !== undefined) {
        const tokens = uniqueStringList(splitKanjiTokens(edit.visuallySimilarKanji))
        const similarItems = tokens.map((token) => kanjiByCharacter.get(token)).filter(Boolean)
        next.visually_similar_kanji = tokens.join(', ')
        next.visually_similar_subject_ids = similarItems
          .map((item) => item.wkSubjectId)
          .filter((value) => Number.isFinite(value) && value > 0)
          .join(',')
      }
      return next
    })
    const exportFieldsBase = fields.filter((field) => field !== 'related_mnemonic_readings')
    const exportFields = exportFieldsBase.includes('related_kanji_and_readings')
      ? exportFieldsBase
      : [...exportFieldsBase, 'related_kanji_and_readings']
    const csv = Papa.unparse({
      fields: exportFields.length ? exportFields : Object.keys(nextRows[0] || {}),
      data: nextRows,
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kanji-updated-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportData = () => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      kanji_lookup: kanjiList.reduce((acc, item) => {
        acc[item.id] = item.kanji
        return acc
      }, {}),
      familiarity: Object.entries(familiarity)
        .filter(([, value]) => value)
        .map(([id, status]) => ({
          kanji_id: Number(id),
          status,
          updated_at: new Date().toISOString(),
        })),
      radical_familiarity: Object.entries(radicalFamiliarity)
        .filter(([, value]) => value)
        .map(([id, status]) => ({
          radical_id: Number(id),
          status,
          updated_at: new Date().toISOString(),
        })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        category: group.category || 'Miscellaneous',
        kanji_ids: group.kanjiIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      flagged_kanji: Object.keys(flaggedKanji)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
      flagged_radicals: Object.keys(flaggedRadicals)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
      highlighted_vocab_by_kanji: highlightedVocabByKanji,
      vocab_order_by_kanji: vocabOrderByKanji,
      reading_status_by_kanji: readingStatusByKanji,
      content_edits_by_kanji: contentEditsByKanji,
      sprints,
      preferences: {
        lightning_mode: ui.lightningMode,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.download = `kanji-organizer-export-${timestamp}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importData = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const confirmed = window.confirm('Replace current local data with this import?')
    if (!confirmed) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (parsed.version !== 1) return
        const nextFamiliarity = {}
        ;(parsed.familiarity || []).forEach((entry) => {
          nextFamiliarity[entry.kanji_id] = entry.status
        })
        const nextFlaggedKanji = normalizeFlaggedEntries(parsed.flagged_kanji || parsed.flaggedKanji)
        const nextFlaggedRadicals = normalizeFlaggedEntries(
          parsed.flagged_radicals || parsed.flaggedRadicals,
          'radical_id'
        )
        const nextRadicalFamiliarity = {}
        ;(parsed.radical_familiarity || []).forEach((entry) => {
          nextRadicalFamiliarity[entry.radical_id] = entry.status
        })
        setFamiliarity(nextFamiliarity)
        setFlaggedKanji(nextFlaggedKanji)
        setFlaggedRadicals(nextFlaggedRadicals)
        setRadicalFamiliarity(nextRadicalFamiliarity)
        setReadingStatusByKanji(parsed.reading_status_by_kanji || {})
        setContentEditsByKanji(
          normalizeContentEditsMap(parsed.content_edits_by_kanji || parsed.contentEditsByKanji)
        )
        setGroups(
          (parsed.groups || []).map((group) => ({
            id: group.id,
            name: group.name,
            category: group.category || 'Miscellaneous',
            kanjiIds: group.kanji_ids || [],
          }))
        )
        setHighlightedVocabByKanji(normalizeVocabHighlights(parsed.highlighted_vocab_by_kanji))
        setVocabOrderByKanji(parsed.vocab_order_by_kanji || {})
        setSprints(parsed.sprints || [])
        setUi((prev) => ({
          ...prev,
          lightningMode: parsed.preferences?.lightning_mode || false,
        }))
      } catch {
        // ignore invalid import
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const handleImportData = (event) => {
    setOpenHeaderMenu(null)
    importData(event)
  }

  const toggleHeaderMenu = useCallback((menu) => {
    setOpenHeaderMenu((prev) => (prev === menu ? null : menu))
  }, [])

  const closeHeaderMenu = useCallback(() => {
    setOpenHeaderMenu(null)
  }, [])

  useEffect(() => {
    if (!openHeaderMenu) return
    const handlePointerDown = (event) => {
      if (headerMenusRef.current?.contains(event.target)) return
      setOpenHeaderMenu(null)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpenHeaderMenu(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openHeaderMenu])

  const handleHoverCard = useCallback((id, target) => {
    updateHoveredCard(id, target)
  }, [updateHoveredCard])

  const handleHoverRadical = useCallback(
    (id, target) => {
      updateHoveredRadical(id, target)
    },
    [updateHoveredRadical]
  )
  const kanjiGridRowHeight = effectiveHide ? 74 : 138
  const radicalGridRowHeight = effectiveHide ? 74 : 104
  const familiarityPageKanjiRowHeight = effectiveHide ? 74 : 156
  const familiarityPageColumnGap = 18
  const familiarityPageRowGap = 20
  const familiarityPageMinColumnWidth = 150
  const familiarityPageMaxColumnWidth = 150
  const levelPageMinColumnWidth = 150
  const levelPageMaxColumnWidth = 150

  const handleCardMenuToggle = useCallback((id) => {
    setOpenMenuId((prev) => (prev === id ? null : id))
  }, [])
  const getReadingStatusForKanji = useCallback(
    (id) => readingStatusByKanji[id] || EMPTY_OBJECT,
    [readingStatusByKanji]
  )

  const renderCard = useCallback((item) => (
    <KanjiCard
      key={item.id}
      item={item}
      hideDetails={effectiveHide}
      status={familiarity[item.id]}
      isFlagged={Boolean(flaggedKanji[item.id])}
      onOpen={openCard}
      onOpenDetail={openKanjiDetail}
      onSetStatus={setStatus}
      onToggleFlag={toggleFlaggedKanji}
      showMenu={openMenuId === item.id}
      onMenuToggle={handleCardMenuToggle}
      onHover={handleHoverCard}
      hotkeySinkRef={hotkeySinkRef}
      supportsHover={supportsCardHover}
      readingStatus={getReadingStatusForKanji(item.id)}
      onToggleReading={toggleReadingStatus}
      getHighlightedVocab={getHighlightedVocab}
      getVisuallySimilarKanji={getVisuallySimilarForKanji}
    />
  ), [
    effectiveHide,
    familiarity,
    flaggedKanji,
    openMenuId,
    openCard,
    openKanjiDetail,
    setStatus,
    toggleFlaggedKanji,
    handleCardMenuToggle,
    handleHoverCard,
    supportsCardHover,
    getReadingStatusForKanji,
    toggleReadingStatus,
    getHighlightedVocab,
    getVisuallySimilarForKanji,
  ])

  const renderFamiliarityCard = useCallback((item, allowDrag) => {
    const isDragSource = dragFamiliarityId === item.id
    const isDragTarget = dragTargetId === item.id && dragFamiliarityId
    return (
      <KanjiCard
        key={item.id}
        item={item}
        hideDetails={effectiveHide}
        status={familiarity[item.id]}
        isFlagged={Boolean(flaggedKanji[item.id])}
        onOpen={openCard}
        onOpenDetail={openKanjiDetail}
        onSetStatus={setStatus}
        onToggleFlag={toggleFlaggedKanji}
        showMenu={openMenuId === item.id}
        onMenuToggle={handleCardMenuToggle}
        onHover={handleHoverCard}
        hotkeySinkRef={hotkeySinkRef}
        supportsHover={supportsCardHover}
        readingStatus={getReadingStatusForKanji(item.id)}
        onToggleReading={toggleReadingStatus}
        getHighlightedVocab={getHighlightedVocab}
        getVisuallySimilarKanji={getVisuallySimilarForKanji}
        draggable={false}
        onDragStart={undefined}
        onDragOver={undefined}
        onDrop={undefined}
        onDragEnd={undefined}
        showDragHandle={allowDrag}
        classNameOverride={
          allowDrag && (isDragSource || isDragTarget)
            ? `kanji-drag ${isDragSource ? 'drag-source' : ''} ${
                isDragTarget ? 'drag-target' : ''
              }`
            : ''
        }
        onMouseDownCapture={(event) => {
          if (!allowDrag || !event.shiftKey) return
          if (ui.storageLocked || !isStorageOwner) return
          event.preventDefault()
          setOpenMenuId(null)
          setDragFamiliarityId(item.id)
          setDragTargetId(item.id)
          setDragContext(allowDrag === 'global' ? 'global' : 'level')
        }}
        onMouseEnterExternal={() => {
          if (dragFamiliarityId) setDragTargetId(item.id)
        }}
      />
    )
  }, [
    dragFamiliarityId,
    dragTargetId,
    effectiveHide,
    familiarity,
    flaggedKanji,
    openCard,
    openKanjiDetail,
    setStatus,
    toggleFlaggedKanji,
    openMenuId,
    handleCardMenuToggle,
    handleHoverCard,
    supportsCardHover,
    getReadingStatusForKanji,
    toggleReadingStatus,
    getHighlightedVocab,
    getVisuallySimilarForKanji,
    ui.storageLocked,
    isStorageOwner,
  ])

  const renderRadicalCard = useCallback((item) => (
    <RadicalCard
      key={item.id}
      item={item}
      hideDetails={effectiveHide}
      status={radicalFamiliarity[item.id]}
      isFlagged={Boolean(flaggedRadicals[item.id])}
      onOpen={openRadicalCard}
      onOpenDetail={openRadicalDetail}
      onSetStatus={setRadicalStatus}
      onToggleFlag={toggleFlaggedRadical}
      showMenu={openMenuId === item.id}
      onMenuToggle={handleCardMenuToggle}
      onHover={handleHoverRadical}
      hotkeySinkRef={hotkeySinkRef}
      supportsHover={supportsCardHover}
    />
  ), [
    effectiveHide,
    flaggedRadicals,
    radicalFamiliarity,
    openRadicalCard,
    openRadicalDetail,
    setRadicalStatus,
    toggleFlaggedRadical,
    openMenuId,
    handleCardMenuToggle,
    handleHoverRadical,
    supportsCardHover,
  ])

  const openSearchResult = useCallback(
    (result) => {
      if (!result) return
      if (result.type === 'radical') {
        openRadicalDetail(result.item)
      } else {
        openKanjiDetail(result.item)
      }
      setSearchOpen(false)
    },
    [openKanjiDetail, openRadicalDetail]
  )

  const detailKanjiStatus = detailKanji ? familiarity[detailKanji.id] || STATUS.UNMARKED : STATUS.UNMARKED
  const detailKanjiFlagged = detailKanji ? Boolean(flaggedKanji[detailKanji.id]) : false
  const detailRadicalStatus = detailRadical
    ? radicalFamiliarity[detailRadical.id] || STATUS.UNMARKED
    : STATUS.UNMARKED
  const detailRadicalFlagged = detailRadical ? Boolean(flaggedRadicals[detailRadical.id]) : false
  const canEditDetailStatus = isStorageOwner && !ui.storageLocked
  const randomFlaggedProgressText = `${randomFlaggedProgress.current} / ${randomFlaggedProgress.total}`
  const renderRandomFlaggedButtonContent = () => (
    <>
      <span className="kanji-detail-random-flagged-label">Random Review</span>
      <span className="kanji-detail-random-flagged-count" aria-hidden="true">
        {randomFlaggedProgressText}
      </span>
    </>
  )

  const renderRangeLevelSection = (level, modeOverride = null, orderedOverride = null) => {
    const items = getLevelItems(level)
    if (items.length === 0) return null
    const counts = getCountsForLevel(items)
    const levelMode =
      modeOverride === 'familiarity' || ui.rangeMode === 'familiarity' ? 'familiarity' : 'normal'
    const ordered =
      orderedOverride ||
      (levelMode === 'familiarity'
        ? getFamiliarityOrderedItemsForLevel(level)
        : getOrderedItemsForLevel(level))
    return (
      <div key={level} className="range-section">
        <div className="level-header">
          <div>
            <h1>Level {level}</h1>
            <div className="level-counts">
              <span className="count-total">Total: {items.length}</span>
              <div className="count-badges">
                <span className="count-badge status-needs">{counts[STATUS.NEEDS]}</span>
                <span className="count-badge status-lukewarm">{counts[STATUS.LUKEWARM]}</span>
                <span className="count-badge status-comfortable">
                  {counts[STATUS.COMFORTABLE]}
                </span>
                <span className="count-badge status-default">{counts[STATUS.UNMARKED]}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="progress-bar" />
        <div className="grid-wrapper">
          {levelMode === 'familiarity' ? (
            <div className="familiarity-split">
              {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                <div key={status} className="split-section">
                  <VirtualGrid
                    items={items.filter(
                      (item) => (familiarity[item.id] || STATUS.UNMARKED) === status
                    )}
                    renderItem={(item) => renderFamiliarityCard(item, 'level')}
                    estimatedRowHeight={kanjiGridRowHeight}
                  />
                </div>
              ))}
            </div>
          ) : (
            <VirtualGrid
              items={ordered}
              renderItem={renderCard}
              estimatedRowHeight={kanjiGridRowHeight}
            />
          )}
        </div>
      </div>
    )
  }

  const renderRangeRadicalSection = (level) => {
    const items = getRadicalItems(level)
    if (items.length === 0) return null
    const counts = getCountsForRadicalLevel(items)
    const levelMode = ui.rangeMode === 'familiarity' ? 'familiarity' : 'normal'
    const ordered =
      levelMode === 'familiarity'
        ? getFamiliarityOrderedRadicalsForLevel(level)
        : getOrderedRadicalsForLevel(level)
    const grouped = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    ordered.forEach((item) => {
      const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
      grouped[status].push(item)
    })
    return (
      <div key={level} className="range-section">
        <div className="level-header">
          <div>
            <h1>Level {level}</h1>
            <div className="level-counts">
              <span className="count-total">Total: {items.length}</span>
              <div className="count-badges">
                <span className="count-badge status-needs">{counts[STATUS.NEEDS]}</span>
                <span className="count-badge status-lukewarm">{counts[STATUS.LUKEWARM]}</span>
                <span className="count-badge status-comfortable">
                  {counts[STATUS.COMFORTABLE]}
                </span>
                <span className="count-badge status-default">{counts[STATUS.UNMARKED]}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="progress-bar" />
        <div className="grid-wrapper">
          {levelMode === 'familiarity' ? (
            <div className="familiarity-split">
              {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                <div key={status} className="split-section">
                  <VirtualGrid
                    items={grouped[status]}
                    renderItem={renderRadicalCard}
                    estimatedRowHeight={radicalGridRowHeight}
                  />
                </div>
              ))}
            </div>
          ) : (
            <VirtualGrid
              items={ordered}
              renderItem={renderRadicalCard}
              estimatedRowHeight={radicalGridRowHeight}
            />
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!loading && kanjiList.length === 0) {
    return <div className="loading">No data loaded. Check /data/kanji.csv.</div>
  }

  return (
    <div
      className={`app${globalHide ? ' is-hidden' : ''}${
        decolor ? ' is-decolor' : ''
      }${dragFamiliarityId ? ' is-dragging' : ''}${shiftPressed ? ' is-shift' : ''}${
        altPressed ? ' is-alt' : ''
      }`}
      onClick={() => setOpenMenuId(null)}
    >
      <header className="app-header">
        {!isStorageOwner && (
          <div className="header-warning">
            Read-only: another tab is active.
            <button
              type="button"
              onClick={() => {
                saveStorageOwner({ id: ownerIdRef.current, ts: Date.now() })
                setIsStorageOwner(true)
              }}
            >
              Take Over
            </button>
          </div>
        )}
        <div className="nav">
          <button
            className={ui.page === 'levels' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'levels' }))
            }}
          >
            Levels
          </button>
          <button
            className={ui.page === 'radicals' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'radicals' }))
            }}
          >
            Radicals
          </button>
          <button
            className={ui.page === 'range' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'range' }))
            }}
          >
            Range
          </button>
          <button
            className={ui.page === 'sprints' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'sprints' }))
            }}
          >
            Sprints
          </button>
          <button
            className={ui.page === 'groups' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'groups' }))
            }}
          >
            Groups
          </button>
          <button
            className={ui.page === 'familiarity' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'familiarity' }))
            }}
          >
            Familiarity
          </button>
        </div>
        <div className="header-actions" ref={headerMenusRef}>
          <div
            className="header-search"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchOpen(false)
              }
              if (event.key === 'Enter' && flatSearchResults.length > 0) {
                openSearchResult(flatSearchResults[0])
              }
            }}
          >
            <input
              type="search"
              placeholder="Search kanji or meaning"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                setTimeout(() => setSearchOpen(false), 120)
              }}
            />
            {searchOpen && searchQuery.trim().length > 0 && (
              <div className="header-search-results">
                {searchSections.length === 0 ? (
                  <div className="header-search-empty">No matches</div>
                ) : (
                  searchSections.map((section) => (
                    <div key={section.key} className="header-search-group">
                      <div className="header-search-group-label">{section.label}</div>
                      {section.results.map((result) => {
                        const symbol =
                          result.type === 'kanji'
                            ? result.item.kanji
                            : result.item.radical || result.item.primaryMeaning
                        return (
                          <button
                            key={`${result.type}-${result.item.id}`}
                            type="button"
                            className="header-search-result"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => openSearchResult(result)}
                          >
                            <span className="search-primary">
                              <span
                                className={`${
                                  result.type === 'kanji' || result.item.radical
                                    ? 'search-kanji'
                                    : 'search-text'
                                }`}
                              >
                                {symbol}
                              </span>
                              <span className="search-meaning">{result.displayMeaning}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            className="header-primary-action"
            onClick={() => {
              closeHeaderMenu()
              setGlobalQuizOpen(true)
            }}
          >
            Global Quiz
          </button>
          <div className={`header-menu${openHeaderMenu === 'study' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="header-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={openHeaderMenu === 'study'}
              onClick={() => toggleHeaderMenu('study')}
            >
              Study
            </button>
            {openHeaderMenu === 'study' && (
              <div className="header-menu-panel" role="menu" aria-label="Study actions">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    toggleGlobalHide()
                  }}
                >
                  {globalHide ? 'Unhide' : 'Hide'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    setDecolor((prev) => !prev)
                  }}
                >
                  {decolor ? 'Colors On' : 'Colors Off'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    openRandomFlaggedKanji()
                  }}
                  disabled={!hasRandomReviewItems}
                >
                  Random Review (R)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    openRandomReviewSettings()
                  }}
                >
                  Review Pool
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    resetRandomFlaggedQueue(
                      detailKanji && !('missingToken' in detailKanji) ? detailKanji.id : null
                    )
                  }}
                  disabled={!hasRandomReviewItems || !hasRandomFlaggedQueue}
                  title="Reset random queue (Q)"
                >
                  Reset Random (Q)
                </button>
              </div>
            )}
          </div>
          <div className={`header-menu${openHeaderMenu === 'data' ? ' is-open' : ''}`}>
            <button
              type="button"
              className="header-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={openHeaderMenu === 'data'}
              onClick={() => toggleHeaderMenu('data')}
            >
              Data
            </button>
            {openHeaderMenu === 'data' && (
              <div className="header-menu-panel" role="menu" aria-label="Data actions">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    resetToDefault()
                  }}
                >
                  Reset to Default
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    exportMergedCsv()
                  }}
                >
                  Download kanji.csv
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeHeaderMenu()
                    exportData()
                  }}
                >
                  Export JSON
                </button>
                <label className="import-button header-menu-item" role="menuitem">
                  Import JSON
                  <input type="file" accept="application/json" onChange={handleImportData} />
                </label>
              </div>
            )}
          </div>
          <button
            className="header-lock"
            aria-pressed={ui.storageLocked}
            aria-label={ui.storageLocked ? 'Storage locked (click to unlock)' : 'Storage unlocked (click to lock)'}
            title={ui.storageLocked ? 'Storage locked (click to unlock)' : 'Storage unlocked (click to lock)'}
            onClick={() =>
              setUi((prev) => ({ ...prev, storageLocked: !prev.storageLocked }))
            }
            disabled={!isStorageOwner}
          >
            {ui.storageLocked ? '🔒' : '🔓'}
          </button>
          <button className="header-help" onClick={() => setAboutOpen(true)} aria-label="About">
            ?
          </button>
        </div>
      </header>

      <main className="app-main">
        {detailKanji ? (
          <div className="page detail-page">
            <section className="content kanji-detail">
              <div className="kanji-detail-actions">
                <button className="kanji-detail-back" onClick={closeKanjiDetail}>
                  Back
                </button>
                <div className="kanji-detail-nav">
                  <button
                    className="kanji-detail-next"
                    onClick={() => detailPrev && openKanjiDetail(detailPrev)}
                    disabled={!detailPrev}
                  >
                    Prev
                  </button>
                  <button
                    className="kanji-detail-next"
                    onClick={() => detailNext && openKanjiDetail(detailNext)}
                    disabled={!detailNext}
                  >
                    Next
                  </button>
                  <button
                    className="kanji-detail-next kanji-detail-random-nav-button"
                    onClick={openRandomFlaggedKanji}
                    disabled={!hasRandomReviewItems}
                    aria-label="Random Review (R)"
                  >
                    {renderRandomFlaggedButtonContent()}
                  </button>
                  <button
                    className="kanji-detail-next kanji-detail-random-settings-button"
                    onClick={openRandomReviewSettings}
                    aria-label="Review Pool"
                  >
                    Pool
                  </button>
                  <button
                    className="kanji-detail-next kanji-detail-reset-nav-button"
                    onClick={() =>
                      resetRandomFlaggedQueue(
                        detailKanji && !('missingToken' in detailKanji) ? detailKanji.id : null
                      )
                    }
                    disabled={!hasRandomReviewItems || !hasRandomFlaggedQueue}
                    title="Reset random queue (Q)"
                  >
                    Reset Random (Q)
                  </button>
                </div>
              </div>
              {'missingToken' in detailKanji ? (
                <div className="empty-state">Kanji not found: {detailKanji.missingToken}</div>
              ) : (
                <>
                  <div className="kanji-detail-card">
                    <div className="kanji-detail-header">
                    <a
                      className="kanji-detail-kanji"
                      href={detailKanji.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {detailKanji.kanji}
                    </a>
                    <div className="kanji-detail-meaning">{detailKanji.primaryMeaning}</div>
                  </div>
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title">Other meanings</div>
                    <div className="kanji-detail-text">
                      {detailKanji.otherMeanings?.length
                        ? detailKanji.otherMeanings.join(', ')
                        : '—'}
                    </div>
                  </div>
                  {detailEditMode ? (
                    <div className="kanji-detail-edit-bar">
                      <div
                        className={`kanji-detail-edit-status${
                          detailEditDirty ? ' is-dirty' : ''
                        }`}
                      >
                        {detailHasValidationErrors
                          ? 'Fix mnemonic tags before saving.'
                          : detailEditDirty
                            ? 'Unsaved changes'
                            : 'No changes yet'}
                      </div>
                      <button
                        type="button"
                        className="kanji-detail-toggle"
                        onClick={saveDetailContentEdits}
                        disabled={!canPersistEdits || !detailEditDirty || detailHasValidationErrors}
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        className="kanji-detail-toggle"
                        onClick={cancelDetailContentEdits}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title-row">
                      <div className="kanji-detail-title">Mnemonics</div>
                      <div className="kanji-detail-title-actions">
                        <span
                          className={`kanji-detail-tag-indicator ${
                            detailIndicatorHasValidationErrors ? 'is-invalid' : 'is-valid'
                          }`}
                          title={
                            detailIndicatorHasValidationErrors
                              ? 'Mnemonic tags are invalid'
                              : 'Mnemonic tags are valid'
                          }
                          aria-label={
                            detailIndicatorHasValidationErrors
                              ? 'Mnemonic tags invalid'
                              : 'Mnemonic tags valid'
                          }
                        />
                        <button
                          type="button"
                          className="kanji-detail-toggle"
                          onClick={() => {
                            if (!canPersistEdits || !detailKanji || 'missingToken' in detailKanji) return
                            setDetailEditDraft(createKanjiContentDraft(detailKanji))
                            setDetailComponentPendingRemoveId(null)
                            setDetailSimilarPendingRemoveKanji(null)
                            setDetailRadicalPickerIds([])
                            setDetailEditMode(true)
                          }}
                          disabled={!canPersistEdits || detailEditMode}
                          title={
                            canPersistEdits
                              ? 'Edit mnemonics, readings, and radical components'
                              : 'Read-only tab: use Take Over or unlock storage to persist'
                          }
                        >
                          Edit details
                        </button>
                        <button
                          type="button"
                          className="kanji-detail-toggle"
                          onClick={() => {
                            if (!canPersistEdits) return
                            setUi((prev) => ({
                              ...prev,
                              detailMnemonicCompareOpen: !prev.detailMnemonicCompareOpen,
                            }))
                          }}
                          disabled={!canPersistEdits}
                          title={
                            canPersistEdits
                              ? 'Toggle mnemonic comparison'
                              : 'Read-only tab: use Take Over or unlock storage to persist'
                          }
                        >
                          {ui.detailMnemonicCompareOpen ? 'Compare On' : 'Compare Off'}
                        </button>
                        <button
                          type="button"
                          className="kanji-detail-toggle"
                          onClick={toggleDetailMnemonics}
                          title="Toggle mnemonics visibility"
                        >
                          {ui.detailMnemonicsOpen === false ? 'Show' : 'Hide'}
                        </button>
                      </div>
                    </div>
                    {ui.detailMnemonicsOpen === false ? null : (
                      <>
                        {[
                          {
                            field: 'meaningMnemonic',
                            label: 'Meaning mnemonic',
                            hideWhenEmpty: false,
                            tone: 'radical',
                          },
                          {
                            field: 'readingMnemonic',
                            label: 'Reading mnemonic',
                            hideWhenEmpty: false,
                            tone: 'reading',
                          },
                          {
                            field: 'extraReadingMnemonic',
                            label: 'Extra reading mnemonic',
                            hideWhenEmpty: true,
                            tone: 'reading',
                          },
                          {
                            field: 'relatedMnemonicReadings',
                            label: 'Related kanji/readings',
                            hideWhenEmpty: true,
                            tone: 'vocabulary',
                          },
                        ]
                          .filter(
                            ({ field, hideWhenEmpty }) =>
                              detailEditMode ||
                              !hideWhenEmpty ||
                              !isOptionalMnemonicSectionEmpty(detailKanji[field])
                          )
                          .map(({ field, label, tone }) => (
                          <div
                            key={field}
                            className={`kanji-detail-mnemonic-block mnemonic-tone-${tone}`}
                          >
                            <div className="kanji-detail-subtitle">
                              {label}
                            </div>
                            {detailEditMode ? (
                              <div className="kanji-detail-editor-block">
                                <label className="kanji-detail-editor-label" htmlFor={field}>
                                  {label} raw text
                                </label>
                                <textarea
                                  id={field}
                                  className="kanji-detail-textarea"
                                  value={detailEditDraft?.[field] || ''}
                                  onChange={(event) =>
                                    updateDetailDraftField(field, event.target.value)
                                  }
                                  rows={
                                    field === 'extraReadingMnemonic' ||
                                    field === 'relatedMnemonicReadings'
                                      ? 6
                                      : 4
                                  }
                                />
                                {detailMnemonicValidation[field]?.length ? (
                                  <div className="kanji-detail-validation">
                                    {detailMnemonicValidation[field].map((issue) => (
                                      <div key={`${field}-${issue}`}>{issue}</div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="kanji-detail-validation ok">
                                    Tags look valid.
                                  </div>
                                )}
                                <div className="kanji-detail-editor-preview">
                                  <div className="kanji-detail-editor-label">Preview</div>
                                  <div className="kanji-detail-text">
                                    <MnemonicText text={detailEditDraft?.[field] || ''} />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="kanji-detail-text">
                                <MnemonicText
                                  text={detailKanji[field]}
                                  autoLinkKnownKanji={field === 'relatedMnemonicReadings'}
                                  kanjiByCharacter={
                                    field === 'relatedMnemonicReadings' ? kanjiByCharacter : null
                                  }
                                  onOpenKanjiDetail={
                                    field === 'relatedMnemonicReadings'
                                      ? openKanjiDetail
                                      : null
                                  }
                                  currentKanjiId={field === 'relatedMnemonicReadings' ? detailKanji.id : null}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        {ui.detailMnemonicCompareOpen && (
                          <div className="kanji-detail-compare">
                            <div className="kanji-detail-compare-header">
                              Compare with `kanji_new.csv`
                            </div>
                            {compareKanjiLoading ? (
                              <div className="kanji-detail-text">Loading compare data...</div>
                            ) : compareKanjiError ? (
                              <div className="kanji-detail-text">{compareKanjiError}</div>
                            ) : !detailCompareMnemonics ? (
                              <div className="kanji-detail-text">
                                No matching kanji found in compare file.
                              </div>
                            ) : (
                              <div className="kanji-detail-compare-grid">
                                {[
                                  {
                                    key: 'meaningMnemonic',
                                    label: 'Meaning mnemonic',
                                    currentValue: normalizeMnemonicForCompare(
                                      detailKanji.meaningMnemonic
                                    ),
                                    compareValue: normalizeMnemonicForCompare(
                                      detailCompareMnemonics.meaningMnemonic
                                    ),
                                    renderCurrent: () => (
                                      <MnemonicText text={detailKanji.meaningMnemonic} />
                                    ),
                                    renderCompare: () => (
                                      <MnemonicText text={detailCompareMnemonics.meaningMnemonic} />
                                    ),
                                  },
                                  {
                                    key: 'readingMnemonic',
                                    label: 'Reading mnemonic',
                                    currentValue: normalizeMnemonicForCompare(
                                      detailKanji.readingMnemonic
                                    ),
                                    compareValue: normalizeMnemonicForCompare(
                                      detailCompareMnemonics.readingMnemonic
                                    ),
                                    renderCurrent: () => (
                                      <MnemonicText text={detailKanji.readingMnemonic} />
                                    ),
                                    renderCompare: () => (
                                      <MnemonicText text={detailCompareMnemonics.readingMnemonic} />
                                    ),
                                  },
                                  {
                                    key: 'extraReadingMnemonic',
                                    label: 'Extra reading mnemonic',
                                    currentValue: normalizeMnemonicForCompare(
                                      detailKanji.extraReadingMnemonic
                                    ),
                                    compareValue: normalizeMnemonicForCompare(
                                      detailCompareMnemonics.extraReadingMnemonic
                                    ),
                                    renderCurrent: () => (
                                      <MnemonicText text={detailKanji.extraReadingMnemonic} />
                                    ),
                                    renderCompare: () => (
                                      <MnemonicText text={detailCompareMnemonics.extraReadingMnemonic} />
                                    ),
                                  },
                                  {
                                    key: 'relatedMnemonicReadings',
                                    label: 'Related kanji/readings',
                                    currentValue: normalizeMnemonicForCompare(
                                      detailKanji.relatedMnemonicReadings
                                    ),
                                    compareValue: normalizeMnemonicForCompare(
                                      detailCompareMnemonics.relatedMnemonicReadings
                                    ),
                                    renderCurrent: () => (
                                      <MnemonicText text={detailKanji.relatedMnemonicReadings} />
                                    ),
                                    renderCompare: () => (
                                      <MnemonicText
                                        text={detailCompareMnemonics.relatedMnemonicReadings}
                                      />
                                    ),
                                  },
                                  {
                                    key: 'radicalComponents',
                                    label: 'Radical components',
                                    currentValue: detailKanjiRadicals
                                      .map((radical) => radical.id)
                                      .join('|'),
                                    compareValue: detailCompareRadicals
                                      .map((radical) => radical.id)
                                      .join('|'),
                                    renderCurrent: () => (
                                      detailKanjiRadicals.length ? (
                                        <div className="kanji-detail-compare-radical-list">
                                          {detailKanjiRadicals.map((radical) => (
                                            <div
                                              key={`cur-rad-${radical.id}`}
                                              className="kanji-detail-compare-radical-item"
                                            >
                                              <div className="kanji-detail-compare-radical-visual">
                                                {radical.imageFile ? (
                                                  <img
                                                    src={`${import.meta.env.BASE_URL}radical_images/${radical.imageFile}`}
                                                    alt={radical.primaryMeaning}
                                                    loading="lazy"
                                                    decoding="async"
                                                    onError={(event) => {
                                                      event.currentTarget.style.display = 'none'
                                                    }}
                                                  />
                                                ) : (
                                                  <span className="kanji-detail-compare-radical-symbol">
                                                    {radical.character || radical.primaryMeaning}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="kanji-detail-compare-radical-name">
                                                {radical.primaryMeaning}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span>—</span>
                                      )
                                    ),
                                    renderCompare: () => (
                                      detailCompareRadicals.length ? (
                                        <div className="kanji-detail-compare-radical-list">
                                          {detailCompareRadicals.map((radical) => (
                                            <div
                                              key={`cmp-rad-${radical.id}`}
                                              className="kanji-detail-compare-radical-item"
                                            >
                                              <div className="kanji-detail-compare-radical-visual">
                                                {radical.imageFile ? (
                                                  <img
                                                    src={`${import.meta.env.BASE_URL}radical_images/${radical.imageFile}`}
                                                    alt={radical.primaryMeaning}
                                                    loading="lazy"
                                                    decoding="async"
                                                    onError={(event) => {
                                                      event.currentTarget.style.display = 'none'
                                                    }}
                                                  />
                                                ) : (
                                                  <span className="kanji-detail-compare-radical-symbol">
                                                    {radical.character || radical.primaryMeaning}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="kanji-detail-compare-radical-name">
                                                {radical.primaryMeaning}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span>—</span>
                                      )
                                    ),
                                  },
                                  {
                                    key: 'visuallySimilarKanji',
                                    label: 'Visually similar kanji',
                                    currentValue: detailVisuallySimilarKanji
                                      .map((item) => item.id)
                                      .join('|'),
                                    compareValue: detailCompareVisuallySimilar
                                      .map((item) => item.id)
                                      .join('|'),
                                    renderCurrent: () => (
                                      detailVisuallySimilarKanji.length ? (
                                        <div className="kanji-detail-compare-similar-list">
                                          {detailVisuallySimilarKanji.map((item) => (
                                            <div
                                              key={`cur-sim-${item.id}`}
                                              className="kanji-detail-compare-similar-item"
                                            >
                                              <span className="kanji-detail-compare-similar-char">
                                                {item.kanji}
                                              </span>
                                              <span className="kanji-detail-compare-similar-meaning">
                                                {item.primaryMeaning}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span>No visually similar kanji listed.</span>
                                      )
                                    ),
                                    renderCompare: () => (
                                      detailCompareVisuallySimilar.length ? (
                                        <div className="kanji-detail-compare-similar-list">
                                          {detailCompareVisuallySimilar.map((item) => (
                                            <div
                                              key={`cmp-sim-${item.id}`}
                                              className="kanji-detail-compare-similar-item"
                                            >
                                              <span className="kanji-detail-compare-similar-char">
                                                {item.kanji}
                                              </span>
                                              <span className="kanji-detail-compare-similar-meaning">
                                                {item.primaryMeaning}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span>No visually similar kanji listed.</span>
                                      )
                                    ),
                                  },
                                ].map((entry) => {
                                  const isSame = entry.currentValue === entry.compareValue
                                  return (
                                    <div key={entry.key} className="kanji-detail-compare-row">
                                      <div className="kanji-detail-subtitle">
                                        {entry.label}{' '}
                                        <span
                                          className={`kanji-detail-compare-badge ${
                                            isSame ? 'same' : 'changed'
                                          }`}
                                        >
                                          {isSame ? 'Same' : 'Changed'}
                                        </span>
                                      </div>
                                      <div className="kanji-detail-compare-columns">
                                        <div className="kanji-detail-compare-col">
                                          <div className="kanji-detail-compare-col-title">Current</div>
                                          <div className="kanji-detail-text">
                                            {entry.renderCurrent()}
                                          </div>
                                        </div>
                                        <div className="kanji-detail-compare-col">
                                          <div className="kanji-detail-compare-col-title">
                                            kanji_new.csv
                                          </div>
                                          <div className="kanji-detail-text">
                                            {entry.renderCompare()}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title-row">
                      <div className="kanji-detail-title">Radical components</div>
                      <button
                        type="button"
                        className="kanji-detail-toggle"
                        onClick={() => {
                          if (!canPersistEdits) return
                          setUi((prev) => ({
                            ...prev,
                            detailRadicalComponentsOpen: !(prev.detailRadicalComponentsOpen !== false),
                          }))
                        }}
                        disabled={!canPersistEdits}
                        title={
                          canPersistEdits
                            ? 'Toggle radical components visibility'
                            : 'Read-only tab: use Take Over or unlock storage to persist'
                        }
                      >
                        {ui.detailRadicalComponentsOpen === false ? 'Show' : 'Hide'}
                      </button>
                    </div>
                    {ui.detailRadicalComponentsOpen === false ? null : detailEditMode ? (
                      <div className="kanji-detail-editor-block">
                        <div className="kanji-detail-radical-editor">
                          <div className="kanji-detail-editor-label">Selected radicals</div>
                          {detailEditDraft?.radicalSubjectIds?.length ? (
                            <div className="kanji-detail-radical-selected">
                              {detailEditDraft.radicalSubjectIds.map((radicalId, index) => {
                                const radical = radicalById.get(radicalId)
                                if (!radical) return null
                                return (
                                  <div key={radicalId} className="kanji-detail-radical-row">
                                    <span className="kanji-detail-radical-row-name">
                                      {radical.primaryMeaning}
                                    </span>
                                    <div className="kanji-detail-radical-row-actions">
                                      <button
                                        type="button"
                                        className="kanji-detail-toggle"
                                        onClick={() => moveDetailRadical(radicalId, 'up')}
                                        disabled={index === 0}
                                        aria-label={`Move ${radical.primaryMeaning} up`}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="kanji-detail-toggle"
                                        onClick={() => moveDetailRadical(radicalId, 'down')}
                                        disabled={index === detailEditDraft.radicalSubjectIds.length - 1}
                                        aria-label={`Move ${radical.primaryMeaning} down`}
                                      >
                                        ↓
                                      </button>
                                      {detailComponentPendingRemoveId === radicalId ? (
                                        <>
                                          <button
                                            type="button"
                                            className="kanji-detail-toggle"
                                            onClick={() => removeDetailRadical(radicalId)}
                                            aria-label={`Confirm removing ${radical.primaryMeaning} from radical components`}
                                          >
                                            Confirm remove
                                          </button>
                                          <button
                                            type="button"
                                            className="kanji-detail-toggle"
                                            onClick={() => setDetailComponentPendingRemoveId(null)}
                                          >
                                            Keep
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          className="kanji-detail-toggle"
                                          onClick={() => setDetailComponentPendingRemoveId(radicalId)}
                                          aria-label={`Remove ${radical.primaryMeaning} from radical components`}
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="kanji-detail-text">No linked radicals.</div>
                          )}
                          <label className="kanji-detail-editor-label" htmlFor="detail-radical-search">
                            Search radicals
                          </label>
                          <input
                            id="detail-radical-search"
                            className="kanji-detail-input"
                            value={detailRadicalSearch}
                            onChange={(event) => setDetailRadicalSearch(event.target.value)}
                            placeholder="Type a radical name or symbol"
                          />
                          <label className="kanji-detail-editor-label" htmlFor="detail-radical-picker">
                            Add radicals
                          </label>
                          <select
                            id="detail-radical-picker"
                            className="kanji-detail-multi-select"
                            multiple
                            size={Math.min(8, Math.max(4, filteredDetailRadicals.length || 4))}
                            value={detailRadicalPickerIds.map(String)}
                            onChange={(event) => {
                              setDetailRadicalPickerIds(
                                Array.from(event.target.selectedOptions, (option) => Number(option.value))
                              )
                            }}
                          >
                            {filteredDetailRadicals.map((radical) => (
                              <option key={radical.id} value={radical.id}>
                                {radical.primaryMeaning}
                                {radical.radical ? ` (${radical.radical})` : ''}
                              </option>
                            ))}
                          </select>
                          {detailRadicalSearch.trim() && filteredDetailRadicals.length === 0 ? (
                            <div className="kanji-detail-text">No matching radicals.</div>
                          ) : null}
                          {!detailRadicalSearch.trim() ? (
                            <div className="kanji-detail-text">Type to search radicals.</div>
                          ) : null}
                          <div>
                            <button
                              type="button"
                              className="kanji-detail-toggle"
                              onClick={addSelectedDetailRadicals}
                              disabled={detailRadicalPickerIds.length === 0}
                            >
                              Add selected radicals
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : detailKanjiRadicals.length === 0 ? (
                      <div className="kanji-detail-text">No linked radicals.</div>
                    ) : (
                      <div className="kanji-radical-list">
                        {detailKanjiRadicals.map((radical) => (
                          <button
                            key={radical.id}
                            type="button"
                            className="kanji-radical-item"
                            onClick={() => openRadicalDetail(radical)}
                          >
                            <div className="kanji-radical-item-visual">
                              {radical.imageFile ? (
                                <img
                                  src={`${import.meta.env.BASE_URL}radical_images/${radical.imageFile}`}
                                  alt={radical.primaryMeaning}
                                  loading="lazy"
                                  decoding="async"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : (
                                <span className="kanji-radical-item-symbol">
                                  {radical.character || radical.primaryMeaning}
                                </span>
                              )}
                            </div>
                            <div className="kanji-radical-item-name">{radical.primaryMeaning}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title-row">
                      <div className="kanji-detail-title">
                        Visually similar kanji ({detailVisuallySimilarKanji.length})
                      </div>
                      <button
                        type="button"
                        className="kanji-detail-toggle"
                        onClick={() => {
                          if (!canPersistEdits) return
                          setUi((prev) => ({
                            ...prev,
                            detailVisuallySimilarOpen: !(prev.detailVisuallySimilarOpen !== false),
                          }))
                        }}
                        disabled={!canPersistEdits}
                        title={
                          canPersistEdits
                            ? 'Toggle visually similar kanji visibility'
                            : 'Read-only tab: use Take Over or unlock storage to persist'
                        }
                      >
                        {ui.detailVisuallySimilarOpen === false ? 'Show' : 'Hide'}
                      </button>
                    </div>
                    {ui.detailVisuallySimilarOpen === false ? null : detailEditMode ? (
                      <div className="kanji-detail-editor-block">
                        <div className="kanji-detail-radical-editor">
                          <div className="kanji-detail-editor-label">Selected visually similar kanji</div>
                          {detailDraftVisuallySimilarKanji.length ? (
                            <div className="kanji-detail-radical-selected">
                              {detailDraftVisuallySimilarKanji.map((item, index) => (
                                <div key={item.id} className="kanji-detail-radical-row">
                                  <span className="kanji-detail-radical-row-name">
                                    {item.kanji} {item.primaryMeaning}
                                  </span>
                                  <div className="kanji-detail-radical-row-actions">
                                    <button
                                      type="button"
                                      className="kanji-detail-toggle"
                                      onClick={() => moveDetailSimilarKanji(item.kanji, 'up')}
                                      disabled={index === 0}
                                      aria-label={`Move ${item.kanji} up`}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      className="kanji-detail-toggle"
                                      onClick={() => moveDetailSimilarKanji(item.kanji, 'down')}
                                      disabled={index === detailDraftVisuallySimilarKanji.length - 1}
                                      aria-label={`Move ${item.kanji} down`}
                                    >
                                      ↓
                                    </button>
                                    {detailSimilarPendingRemoveKanji === item.kanji ? (
                                      <>
                                        <button
                                          type="button"
                                          className="kanji-detail-toggle"
                                          onClick={() => removeDetailSimilarKanji(item.kanji)}
                                          aria-label={`Confirm removing ${item.kanji} from visually similar kanji`}
                                        >
                                          Confirm remove
                                        </button>
                                        <button
                                          type="button"
                                          className="kanji-detail-toggle"
                                          onClick={() => setDetailSimilarPendingRemoveKanji(null)}
                                        >
                                          Keep
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="kanji-detail-toggle"
                                        onClick={() => setDetailSimilarPendingRemoveKanji(item.kanji)}
                                        aria-label={`Remove ${item.kanji} from visually similar kanji`}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="kanji-detail-text">No visually similar kanji listed.</div>
                          )}
                          <label className="kanji-detail-editor-label" htmlFor="detail-similar-search">
                            Search kanji
                          </label>
                          <input
                            id="detail-similar-search"
                            className="kanji-detail-input"
                            value={detailSimilarSearch}
                            onChange={(event) => setDetailSimilarSearch(event.target.value)}
                            placeholder="Type kanji or meaning"
                          />
                          <label className="kanji-detail-editor-label" htmlFor="detail-similar-picker">
                            Add visually similar kanji
                          </label>
                          <select
                            id="detail-similar-picker"
                            className="kanji-detail-multi-select"
                            multiple
                            size={Math.min(8, Math.max(4, filteredDetailSimilarKanji.length || 4))}
                            value={detailSimilarPickerIds.map(String)}
                            onChange={(event) => {
                              setDetailSimilarPickerIds(
                                Array.from(event.target.selectedOptions, (option) => Number(option.value))
                              )
                            }}
                          >
                            {filteredDetailSimilarKanji.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.kanji} {item.primaryMeaning}
                              </option>
                            ))}
                          </select>
                          {detailSimilarSearch.trim() && filteredDetailSimilarKanji.length === 0 ? (
                            <div className="kanji-detail-text">No matching kanji.</div>
                          ) : null}
                          {!detailSimilarSearch.trim() ? (
                            <div className="kanji-detail-text">Type to search kanji.</div>
                          ) : null}
                          <div>
                            <button
                              type="button"
                              className="kanji-detail-toggle"
                              onClick={addSelectedDetailSimilarKanji}
                              disabled={detailSimilarPickerIds.length === 0}
                            >
                              Add selected kanji
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : detailVisuallySimilarKanji.length === 0 ? (
                      <div className="kanji-detail-text">No visually similar kanji listed.</div>
                    ) : (
                      <div className="kanji-similar-grid">
                        {detailVisuallySimilarKanji.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="kanji-similar-item"
                            onClick={() => openKanjiDetail(item)}
                            aria-label={`${item.kanji} ${item.primaryMeaning}`}
                          >
                            <span className="kanji-similar-char">{item.kanji}</span>
                            <span className="kanji-similar-meaning">{item.primaryMeaning}</span>
                            <CompactReadingSummary
                              onyomi={item.onyomi}
                              kunyomi={item.kunyomi}
                              readingStatus={readingStatusByKanji[item.id] || {}}
                              className="kanji-similar-readings"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title">Readings</div>
                    {detailEditMode ? (
                      <div className="kanji-detail-editor-block">
                        <label className="kanji-detail-editor-label" htmlFor="detail-onyomi">
                          Onyomi
                        </label>
                        <input
                          id="detail-onyomi"
                          className="kanji-detail-input"
                          value={detailEditDraft?.onyomi || ''}
                          onChange={(event) => updateDetailDraftField('onyomi', event.target.value)}
                        />
                        <label className="kanji-detail-editor-label" htmlFor="detail-kunyomi">
                          Kunyomi
                        </label>
                        <input
                          id="detail-kunyomi"
                          className="kanji-detail-input"
                          value={detailEditDraft?.kunyomi || ''}
                          onChange={(event) => updateDetailDraftField('kunyomi', event.target.value)}
                        />
                        <label className="kanji-detail-editor-label" htmlFor="detail-nanori">
                          Nanori
                        </label>
                        <input
                          id="detail-nanori"
                          className="kanji-detail-input"
                          value={detailEditDraft?.nanori || ''}
                          onChange={(event) => updateDetailDraftField('nanori', event.target.value)}
                        />
                      </div>
                    ) : (
                      <>
                        <ReadingTokens
                          label="O"
                          value={detailKanji.onyomi}
                          readingStatus={readingStatusByKanji[detailKanji.id] || {}}
                          onToggle={toggleReadingStatus}
                          allowShift
                          className="reading-line"
                          kanjiId={detailKanji.id}
                        />
                        <ReadingTokens
                          label="K"
                          value={detailKanji.kunyomi}
                          readingStatus={readingStatusByKanji[detailKanji.id] || {}}
                          onToggle={toggleReadingStatus}
                          allowShift
                          className="reading-line"
                          kanjiId={detailKanji.id}
                        />
                        {detailKanji.nanori?.trim() ? (
                          <ReadingTokens
                            label="N"
                            value={detailKanji.nanori}
                            readingStatus={readingStatusByKanji[detailKanji.id] || {}}
                            onToggle={toggleReadingStatus}
                            allowShift
                            className="reading-line"
                            kanjiId={detailKanji.id}
                          />
                        ) : null}
                      </>
                    )}
                  </div>
                  {detailKanji.strokeImg && (
                    <div className="kanji-detail-section">
                      <div className="kanji-detail-title">Stroke order</div>
                      <div className="kanji-detail-stroke">
                        <img
                          src={`${import.meta.env.BASE_URL}strokes_media/${detailKanji.strokeImg}`}
                          alt="Stroke order"
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title">Vocab</div>
                    <div className="kanji-detail-hint">
                      Drag rows to reorder within the same status.
                    </div>
                    {detailVocabEntries.length === 0 ? (
                      <div className="kanji-detail-text">No vocab found.</div>
                    ) : (
                      <div className="kanji-vocab-list">
                        {detailSortedVocab.map((entry) => (
                          <div
                            key={entry.id}
                            className={`kanji-vocab-item ${
                              detailHighlightedMap[entry.id]?.status || ''
                            } ${vocabDragId === entry.id ? 'drag-source' : ''} ${
                              vocabDragOverId === entry.id ? 'drag-target' : ''
                            } ${
                              vocabDragOverId === entry.id
                                ? vocabDragPosition === 'after'
                                  ? 'drag-after'
                                  : 'drag-before'
                                : ''
                            }`.trim()}
                            data-vocab-id={entry.id}
                            draggable
                            onMouseEnter={(event) => {
                              updateHoveredVocab(entry.id, event.currentTarget)
                              if (supportsCardHover) hotkeySinkRef?.current?.focus?.()
                            }}
                            onMouseDown={(event) => {
                              updateHoveredVocab(entry.id, event.currentTarget)
                            }}
                            onPointerEnter={(event) => {
                              updateHoveredVocab(entry.id, event.currentTarget)
                              if (supportsCardHover) hotkeySinkRef?.current?.focus?.()
                            }}
                            onMouseLeave={() => {}}
                            onPointerLeave={() => {}}
                            onFocusCapture={() => {
                              updateHoveredVocab(entry.id)
                            }}
                            onBlur={() => {}}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              const digit = getDigitFromEvent(event)
                              if (!digit) return
                              event.preventDefault()
                              if (digit === '3') {
                                setHighlightedVocabByKanji((prev) => {
                                  const current = prev[detailKanji.kanji] || {}
                                  return {
                                    ...prev,
                                    [detailKanji.kanji]: {
                                      ...current,
                                      [entry.id]: {
                                        status: STATUS.COMFORTABLE,
                                        updated_at: new Date().toISOString(),
                                      },
                                    },
                                  }
                                })
                              }
                              if (digit === '2') {
                                setHighlightedVocabByKanji((prev) => {
                                  const current = prev[detailKanji.kanji] || {}
                                  return {
                                    ...prev,
                                    [detailKanji.kanji]: {
                                      ...current,
                                      [entry.id]: {
                                        status: STATUS.LUKEWARM,
                                        updated_at: new Date().toISOString(),
                                      },
                                    },
                                  }
                                })
                              }
                              if (digit === '4') {
                                setHighlightedVocabByKanji((prev) => {
                                  const current = prev[detailKanji.kanji] || {}
                                  if (!current[entry.id]) return prev
                                  const next = { ...current }
                                  delete next[entry.id]
                                  return { ...prev, [detailKanji.kanji]: next }
                                })
                              }
                            }}
                            onDragStart={(event) => handleVocabDragStart(event, entry.id)}
                            onDragEnter={(event) => handleVocabDragEnter(event, entry.id)}
                            onDragOver={(event) => handleVocabDragOver(event, entry.id)}
                            onDrop={(event) => handleVocabDrop(event, entry.id)}
                            onDragEnd={handleVocabDragEnd}
                          >
                            <div className="kanji-vocab-main">
                              <a
                                className={`kanji-vocab-word${
                                  containsJapaneseText(entry.word) ? ' has-japanese' : ''
                                }`}
                                href={entry.url}
                                target="_blank"
                                rel="noreferrer"
                                draggable={false}
                              >
                                {entry.word}
                              </a>
                              <div className="kanji-vocab-meta">
                                <span className="kanji-vocab-reading">
                                  {entry.primaryReading || '—'}
                                </span>
                                <span className="kanji-vocab-meaning">
                                  {entry.primaryMeaning || '—'}
                                </span>
                              </div>
                              {entry.otherMeanings?.length ? (
                                <div className="kanji-vocab-other">
                                  {entry.otherMeanings.join(', ')}
                                </div>
                              ) : null}
                              {entry.partsOfSpeech?.length ? (
                                <div className="kanji-vocab-pos">
                                  {entry.partsOfSpeech.join(', ')}
                                </div>
                              ) : null}
                            </div>
                            <div className="kanji-vocab-actions">
                              <button
                                type="button"
                                className="kanji-vocab-highlight"
                                onMouseDown={(event) => {
                                  event.stopPropagation()
                                }}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  updateHoveredVocab(entry.id)
                                  toggleVocabHighlight(detailKanji.kanji, entry.id)
                                }}
                                draggable={false}
                              >
                                {detailHighlightedMap[entry.id]?.status
                                  ? detailHighlightedMap[entry.id]?.status === STATUS.COMFORTABLE
                                    ? 'Highlight: Green'
                                    : 'Highlight: Orange'
                                  : 'Highlight'}
                              </button>
                              <span className="kanji-vocab-handle" aria-hidden="true">
                                ⋮⋮
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="kanji-detail-footer">
                    <div className="kanji-detail-footer-left">
                      <button
                        type="button"
                        className={`kanji-detail-status-dot kanji-detail-status-button ${
                          STATUS_CLASS[detailKanjiStatus]
                        }`}
                        title={
                          canEditDetailStatus
                            ? `Status: ${STATUS_LABELS[detailKanjiStatus]}. Click to cycle.`
                            : `Status: ${STATUS_LABELS[detailKanjiStatus]}. Read-only while storage is locked or another tab owns it.`
                        }
                        aria-label={`Kanji familiarity status: ${STATUS_LABELS[detailKanjiStatus]}`}
                        disabled={!canEditDetailStatus}
                        onClick={() => {
                          setStatus(detailKanji.id, getNextStatus(detailKanjiStatus))
                        }}
                      />
                      <button
                        type="button"
                        className={`kanji-detail-flag-button ${detailKanjiFlagged ? 'is-flagged' : ''}`}
                        title={
                          canEditDetailStatus
                            ? detailKanjiFlagged
                              ? 'Flagged. Click to remove flag.'
                              : 'Not flagged. Click to flag.'
                            : 'Read-only while storage is locked or another tab owns it.'
                        }
                        aria-label={`Kanji flag: ${detailKanjiFlagged ? 'Flagged' : 'Not flagged'}`}
                        disabled={!canEditDetailStatus}
                        onClick={() => {
                          toggleFlaggedKanji(detailKanji.id)
                        }}
                      >
                        <span className="detail-flag-glyph" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="kanji-detail-level-number" aria-label="Kanji level">
                      Lv {detailKanji.level}
                    </span>
                  </div>
                </div>
              </>
            )}
            </section>
            {hasRandomReviewItems ? (
              <div className="kanji-detail-mobile-actions">
                <button
                  type="button"
                  className="kanji-detail-random-flagged-fab"
                  onClick={openRandomFlaggedKanji}
                  aria-label="Random Review (R)"
                >
                  {renderRandomFlaggedButtonContent()}
                </button>
                <button
                  type="button"
                  className="kanji-detail-next kanji-detail-random-settings-fab"
                  onClick={openRandomReviewSettings}
                  aria-label="Review Pool"
                >
                  Pool
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {detailRadical ? (
          <div className="page detail-page">
            <section className="content radical-detail">
              <div className="kanji-detail radical-detail-shell">
                <div className="kanji-detail-actions">
                  <button className="kanji-detail-back" onClick={closeKanjiDetail}>
                    Back
                  </button>
                  <div className="kanji-detail-nav">
                    <button
                      className="kanji-detail-next"
                      onClick={() => detailRadicalPrev && openRadicalDetail(detailRadicalPrev)}
                      disabled={!detailRadicalPrev}
                    >
                      Prev
                    </button>
                    <button
                      className="kanji-detail-next"
                      onClick={() => detailRadicalNext && openRadicalDetail(detailRadicalNext)}
                      disabled={!detailRadicalNext}
                    >
                      Next
                    </button>
                  </div>
                </div>
                {'missingToken' in detailRadical ? (
                  <div className="empty-state">Radical not found: {detailRadical.missingToken}</div>
                ) : (
                  <div className="kanji-detail-card">
                    <div className="kanji-detail-header">
                      {detailRadical.imageFile ? (
                        <a href={detailRadical.url} target="_blank" rel="noreferrer">
                          <img
                            className="radical-detail-image"
                            src={`${import.meta.env.BASE_URL}radical_images/${detailRadical.imageFile}`}
                            alt={detailRadical.primaryMeaning}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none'
                            }}
                          />
                        </a>
                      ) : (
                        <a
                          className="kanji-detail-kanji"
                          href={detailRadical.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {detailRadical.radical || detailRadical.primaryMeaning}
                        </a>
                      )}
                      <div className="kanji-detail-meaning">{detailRadical.primaryMeaning}</div>
                    </div>
                    <div className="kanji-detail-section">
                      <div className="kanji-detail-title">Other meanings</div>
                      <div className="kanji-detail-text">
                        {detailRadical.otherMeanings?.length
                          ? detailRadical.otherMeanings.join(', ')
                          : '—'}
                      </div>
                    </div>
                    <div className="kanji-detail-section">
                      <div className="kanji-detail-title">Meaning mnemonic</div>
                      <div className="kanji-detail-text">
                        <MnemonicText text={detailRadical.meaningMnemonic} />
                      </div>
                    </div>
                    <div className="kanji-detail-section">
                      <div className="kanji-detail-title-row">
                        <div className="kanji-detail-title">
                          Related kanji ({detailRadicalEditMode
                            ? detailRadicalRelatedKanji.length
                            : detailRadicalDisplayKanji.length})
                        </div>
                        <button
                          type="button"
                          className="kanji-detail-toggle"
                          onClick={() => {
                            if (!canPersistEdits) return
                            setDetailRadicalEditMode((prev) => !prev)
                            setDetailRadicalKanjiSearch('')
                            setDetailRadicalPendingRemoveId(null)
                          }}
                          disabled={!canPersistEdits}
                          title={
                            canPersistEdits
                              ? 'Add or remove kanji linked to this radical'
                              : 'Read-only tab: use Take Over or unlock storage to persist'
                          }
                        >
                          {detailRadicalEditMode ? 'Done' : 'Edit related kanji'}
                        </button>
                      </div>
                      {detailRadicalEditMode ? (
                        <div className="kanji-detail-editor-block">
                          <div className="kanji-detail-radical-editor">
                            <div className="kanji-detail-editor-label">Linked kanji</div>
                            {detailRadicalRelatedKanji.length ? (
                              <div className="kanji-detail-radical-selected">
                                {detailRadicalRelatedKanji.map((item) => (
                                  <div key={item.id} className="kanji-detail-radical-row">
                                    <span className="kanji-detail-radical-row-name">
                                      {item.kanji} {item.primaryMeaning}
                                    </span>
                                    <div className="kanji-detail-radical-row-actions">
                                      {detailRadicalPendingRemoveId === item.id ? (
                                        <>
                                          <button
                                            type="button"
                                            className="kanji-detail-toggle"
                                            onClick={() => removeKanjiFromDetailRadical(item.id)}
                                            aria-label={`Confirm removing ${item.kanji} from ${detailRadical.primaryMeaning}`}
                                          >
                                            Confirm remove
                                          </button>
                                          <button
                                            type="button"
                                            className="kanji-detail-toggle"
                                            onClick={() => setDetailRadicalPendingRemoveId(null)}
                                          >
                                            Keep
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          className="kanji-detail-toggle"
                                          onClick={() => setDetailRadicalPendingRemoveId(item.id)}
                                          aria-label={`Remove ${item.kanji} from ${detailRadical.primaryMeaning}`}
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="kanji-detail-text">No linked kanji.</div>
                            )}
                            <div className="kanji-detail-text">
                              Removing here also removes this radical from that kanji&apos;s radical components.
                            </div>
                            <label
                              className="kanji-detail-editor-label"
                              htmlFor="detail-radical-kanji-search"
                            >
                              Search kanji
                            </label>
                            <input
                              id="detail-radical-kanji-search"
                              className="kanji-detail-input"
                              value={detailRadicalKanjiSearch}
                              onChange={(event) => setDetailRadicalKanjiSearch(event.target.value)}
                              placeholder="Type kanji or meaning"
                            />
                            {detailRadicalKanjiSearch.trim() ? (
                              filteredDetailRadicalKanji.length ? (
                                <div className="kanji-detail-radical-selected">
                                  {filteredDetailRadicalKanji.map((item) => (
                                    <div key={item.id} className="kanji-detail-radical-row">
                                      <span className="kanji-detail-radical-row-name">
                                        {item.kanji} {item.primaryMeaning}
                                      </span>
                                      <div className="kanji-detail-radical-row-actions">
                                        <button
                                          type="button"
                                          className="kanji-detail-toggle"
                                          onClick={() => addKanjiToDetailRadical(item.id)}
                                          aria-label={`Add ${item.kanji} to ${detailRadical.primaryMeaning}`}
                                        >
                                          Add
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="kanji-detail-text">No matching kanji.</div>
                              )
                            ) : (
                              <div className="kanji-detail-text">Type to search kanji to add.</div>
                            )}
                          </div>
                        </div>
                      ) : detailRadicalDisplayKanji.length === 0 ? (
                        <div className="kanji-detail-text">No related kanji found.</div>
                      ) : (
                        <div className="radical-related-grid">
                          {isMobileDetailViewport() ? (
                            <div className="simple-grid radical-related-mobile-grid">
                              {detailRadicalDisplayKanji.map(renderCard)}
                            </div>
                          ) : (
                            <VirtualGrid
                              items={detailRadicalDisplayKanji}
                              renderItem={renderCard}
                              estimatedRowHeight={kanjiGridRowHeight}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="kanji-detail-footer">
                      <div className="kanji-detail-footer-left">
                        <button
                          type="button"
                          className={`kanji-detail-status-dot kanji-detail-status-button ${
                            STATUS_CLASS[detailRadicalStatus]
                          }`}
                          title={
                            canEditDetailStatus
                              ? `Status: ${STATUS_LABELS[detailRadicalStatus]}. Click to cycle.`
                              : `Status: ${STATUS_LABELS[detailRadicalStatus]}. Read-only while storage is locked or another tab owns it.`
                          }
                          aria-label={`Radical familiarity status: ${STATUS_LABELS[detailRadicalStatus]}`}
                          disabled={!canEditDetailStatus}
                          onClick={() => {
                            setRadicalStatus(detailRadical.id, getNextStatus(detailRadicalStatus))
                          }}
                        />
                        <button
                          type="button"
                          className={`kanji-detail-flag-button ${detailRadicalFlagged ? 'is-flagged' : ''}`}
                          title={
                            canEditDetailStatus
                              ? detailRadicalFlagged
                                ? 'Flagged. Click to remove flag.'
                                : 'Not flagged. Click to flag.'
                              : 'Read-only while storage is locked or another tab owns it.'
                          }
                          aria-label={`Radical flag: ${detailRadicalFlagged ? 'Flagged' : 'Not flagged'}`}
                          disabled={!canEditDetailStatus}
                          onClick={() => {
                            toggleFlaggedRadical(detailRadical.id)
                          }}
                        >
                          <span className="detail-flag-glyph" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="kanji-detail-level-number" aria-label="Radical level">
                        Lv {detailRadical.level}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
        {!detailKanji && !detailRadical && ui.page === 'levels' && (
          <LevelsPage
            layoutRef={sidebarLayoutRef}
            sidebarWidth={sidebarWidth}
            levelSidebarLevels={levelSidebarLevels}
            levels={levels}
            selectedLevel={selectedLevel}
            selectLevel={selectLevel}
            levelItems={levelItems}
            levelCounts={levelCounts}
            openLevelQuiz={openLevelQuiz}
            shuffleLevel={shuffleLevel}
            toggleAlpha={toggleAlpha}
            toggleFamiliarity={toggleFamiliarity}
            mode={mode}
            groupedByFamiliarity={groupedByFamiliarity}
            orderedItems={orderedItems}
            renderCard={renderCard}
            renderFamiliarityCard={renderFamiliarityCard}
            kanjiGridRowHeight={kanjiGridRowHeight}
            cardMinColumnWidth={levelPageMinColumnWidth}
            cardMaxColumnWidth={levelPageMaxColumnWidth}
            commitSidebarWidth={commitSidebarWidth}
          />
        )}

        {!detailKanji && !detailRadical && ui.page === 'radicals' && (
          <RadicalsPage
            layoutRef={sidebarLayoutRef}
            sidebarWidth={sidebarWidth}
            radicalSidebarLevels={radicalSidebarLevels}
            radicalLevels={radicalLevels}
            selectedRadicalLevel={selectedRadicalLevel}
            selectRadicalLevel={selectRadicalLevel}
            radicalLevelItems={radicalLevelItems}
            radicalLevelCounts={radicalLevelCounts}
            shuffleRadicals={shuffleRadicals}
            toggleRadicalAlpha={toggleRadicalAlpha}
            toggleRadicalFamiliarity={toggleRadicalFamiliarity}
            radicalMode={radicalMode}
            groupedRadicalsByFamiliarity={groupedRadicalsByFamiliarity}
            orderedRadicalItems={orderedRadicalItems}
            renderRadicalCard={renderRadicalCard}
            radicalGridRowHeight={radicalGridRowHeight}
            cardMinColumnWidth={familiarityPageMinColumnWidth}
            cardMaxColumnWidth={familiarityPageMaxColumnWidth}
            commitSidebarWidth={commitSidebarWidth}
          />
        )}

        {!detailKanji && !detailRadical && ui.page === 'groups' && (
          <div
            ref={sidebarLayoutRef}
            className="page layout"
            style={{ '--sidebar-width': `${sidebarWidth}px` }}
          >
            <aside className="sidebar" ref={groupSidebarRef}>
              <div className="sidebar-top" ref={groupSidebarTopRef}>
                <div className="sidebar-title">Groups</div>
                <button className="primary" onClick={addGroup}>
                  + New Group
                </button>
                <button className="ghost" onClick={toggleAllCategories}>
                  {allCategoryCollapsed ? 'Expand All' : 'Collapse All'}
                </button>
                <button
                  className={ui.selectedGroupId === 'all' ? 'active' : ''}
                  onClick={() => setUi((prev) => ({ ...prev, selectedGroupId: 'all' }))}
                >
                  All Groups ({groups.length})
                </button>
              </div>
              {orderedGroupCategories.map((category) => {
                const items = groupsByCategory.get(category) || []
                if (items.length === 0) return null
                const isCollapsed = Boolean(collapsedCategories[category])
                return (
                  <div key={category} className="group-category">
                    <div className="group-category-sticky">
                      <button
                        className="group-category-title"
                        type="button"
                        onClick={() => toggleCategory(category)}
                      >
                        <span>{category}</span>
                        <span className="group-category-toggle">
                          {isCollapsed ? '+' : '–'}
                        </span>
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="group-category-items">
                        {items.map((group) => (
                          <button
                            key={group.id}
                            className={group.id === ui.selectedGroupId ? 'active' : ''}
                            onClick={() =>
                              setUi((prev) => ({ ...prev, selectedGroupId: group.id }))
                            }
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', String(group.id))
                            }}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setDragOverGroupId(group.id)
                            }}
                            onDragLeave={() => setDragOverGroupId(null)}
                            onDrop={(event) => {
                              const fromId = event.dataTransfer.getData('text/plain')
                              moveGroup(fromId, group.id)
                              setDragOverGroupId(null)
                            }}
                            data-drag-over={dragOverGroupId === group.id}
                          >
                            {group.name} ({group.kanjiIds.length})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </aside>
            <SidebarResizeHandle
              layoutRef={sidebarLayoutRef}
              width={sidebarWidth}
              onCommitWidth={commitSidebarWidth}
            />
            <section className="content">
              {showingAllGroups ? (
                <div className="all-groups">
                  {groups.length === 0 && <div className="empty-state">No groups yet.</div>}
                  {orderedGroupCategories.map((category) => {
                    const items = groupsByCategory.get(category) || []
                    if (items.length === 0) return null
                    const isCollapsed = Boolean(collapsedCategories[category])
                    return (
                      <div
                        key={category}
                        className="group-preview"
                        id={getGroupCategoryId(category)}
                      >
                        <div className="group-preview-header">
                          <h2>
                            {category}{' '}
                            <button
                              className="group-preview-toggle"
                              type="button"
                              onClick={() => toggleCategory(category)}
                            >
                              {isCollapsed ? 'Expand' : 'Collapse'}
                            </button>
                          </h2>
                          <span>{items.length} groups</span>
                        </div>
                        {!isCollapsed &&
                          items.map((group) => (
                            <div key={group.id} className="group-preview-group">
                              <div className="group-preview-header">
                                <h3>{group.name}</h3>
                                <span>{group.kanjiIds.length} items</span>
                              </div>
                              <VirtualGrid
                                items={groupKanjiItemsByGroupId.get(group.id) || EMPTY_ARRAY}
                                renderItem={renderCard}
                                estimatedRowHeight={kanjiGridRowHeight}
                              />
                            </div>
                          ))}
                      </div>
                    )
                  })}
                </div>
              ) : selectedGroup ? (
                <div className="group-editor">
                  <input
                    className="group-title"
                    value={selectedGroup.name}
                    onChange={(event) => updateGroupName(event.target.value)}
                  />
                  <div className="group-category-select">
                    <label>
                      Category
                      <select
                        value={selectedGroup.category || 'Miscellaneous'}
                        onChange={(event) => updateGroupCategory(event.target.value)}
                      >
                        {GROUP_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="group-actions">
                    <button onClick={() => setGroupAddOpen(true)}>Add Kanji</button>
                    <button className="danger" onClick={deleteGroup}>
                      Delete Group
                    </button>
                    {deletedGroup && (
                      <button className="ghost" onClick={undoDeleteGroup}>
                        Undo delete
                      </button>
                    )}
                  </div>
                  <div className="group-grid">
                    {selectedGroupItems.map((item) => {
                      return (
                        <div
                          key={item.id}
                          className="group-item group-card"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', String(item.id))
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setDragOverId(item.id)
                          }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(event) => {
                            const fromId = Number(event.dataTransfer.getData('text/plain'))
                            moveGroupItem(fromId, item.id)
                            setDragOverId(null)
                          }}
                          data-drag-over={dragOverId === item.id}
                        >
                          <div className="group-kanji" onClick={() => openCard(item)}>
                            {item.kanji}
                          </div>
                          {!effectiveHide && (
                            <>
                              <div className="group-meaning">{item.primaryMeaning}</div>
                              <div className="group-readings">
                                <ReadingTokens
                                  label="O"
                                  value={item.onyomi}
                                  readingStatus={readingStatusByKanji[item.id] || {}}
                                  onToggle={toggleReadingStatus}
                                  className="group-reading-line"
                                  kanjiId={item.id}
                                />
                                <ReadingTokens
                                  label="K"
                                  value={item.kunyomi}
                                  readingStatus={readingStatusByKanji[item.id] || {}}
                                  onToggle={toggleReadingStatus}
                                  className="group-reading-line"
                                  kanjiId={item.id}
                                />
                              </div>
                            </>
                          )}
                          <button onClick={() => removeGroupItem(item.id)}>Remove</button>
                        </div>
                      )
                    })}
                    <button className="group-add" onClick={() => setGroupAddOpen(true)}>
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">Select or create a group.</div>
              )}
            </section>
          </div>
        )}

        {!detailKanji && !detailRadical && ui.page === 'range' && (
          <div className="page range-page">
            <section className="content">
              <div className="range-controls">
                <div className="range-view-toggle">
                  <button
                    className={rangeView === 'kanji' ? 'active' : ''}
                    onClick={() =>
                      setUi((prev) => ({ ...prev, rangeView: 'kanji', rangeMode: 'normal' }))
                    }
                  >
                    Kanji View
                  </button>
                  <button
                    className={rangeView === 'radicals' ? 'active' : ''}
                    onClick={() =>
                      setUi((prev) => ({ ...prev, rangeView: 'radicals', rangeMode: 'normal' }))
                    }
                  >
                    Radical View
                  </button>
                </div>
                <label>
                  Levels (e.g. 1...3, 5)
                  <div className="range-input-row">
                    <input
                      value={rangeLevels}
                      onChange={(event) =>
                        setUi((prev) => ({ ...prev, rangeLevels: event.target.value }))
                      }
                      placeholder="1...3, 5"
                    />
                    <button
                      className="range-clear"
                      onClick={() =>
                        setUi((prev) => ({ ...prev, rangeLevels: '', rangeMode: 'normal' }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                </label>
                <div className="range-actions">
                  <button onClick={shuffleRange}>Shuffle</button>
                  <button onClick={toggleRangeAlpha}>Sort Alphabetically</button>
                  <button onClick={toggleRangeFamiliarity}>Sort by Familiarity</button>
                </div>
              </div>
              <div>
                {rangeLevelsList.length === 0 && (
                  <div className="empty-state">Enter a range to show levels.</div>
                )}
                {rangeLevelsList.map((level) =>
                  rangeView === 'radicals'
                    ? renderRangeRadicalSection(level)
                    : renderRangeLevelSection(level)
                )}
              </div>
            </section>
          </div>
        )}

        {!detailKanji && !detailRadical && ui.page === 'sprints' && (
          <div className="page sprints-page">
            <section className="content">
              <div className="range-sprint">
                <div className="range-sprint-header">
                  <div>
                    <div className="range-sprint-title">Sprints</div>
                    <div className="range-sprint-sub">
                      Weekdays only · 2 weeks · {levels.length} levels
                    </div>
                  </div>
                  <div className="range-sprint-header-actions">
                    <button className="sprint-start" onClick={startNewSprint}>
                      {activeSprint ? 'Start New Sprint' : 'Start Sprint'}
                    </button>
                  </div>
                </div>
                {!activeSprint ? (
                  <div className="empty-state">Start a sprint to generate weekday reviews.</div>
                ) : (
                  <div className="range-sprint-body">
                    <div className="range-sprint-history">
                      <div className="range-sprint-history-title">Sprint history</div>
                      <button
                        className="sprint-history-open"
                        onClick={() => setSprintHistoryOpen(true)}
                      >
                        View history
                      </button>
                    </div>
                    <div className="range-sprint-controls">
                      <div className="range-sprint-day">
                        <div className="range-sprint-day-label">
                          Day {ui.sprintDayIndex + 1} of {activeSprint.days.length}{' '}
                          <span className="range-sprint-count">
                            · {sprintDayKanjiCount} kanji
                          </span>
                        </div>
                        <div className="range-sprint-day-date">{activeSprintDay?.label}</div>
                      </div>
                      <div className="range-sprint-actions">
                        <button onClick={jumpToNextSprintDay}>Today</button>
                        <button onClick={() => setSprintLevelStatusOpen(true)}>
                          Level Status
                        </button>
                        <button
                          className="primary"
                          onClick={refreshSprintDay}
                          disabled={activeSprintDay?.committed_at}
                        >
                          Refresh
                        </button>
                        <button
                          className="primary"
                          onClick={commitSprintDay}
                          disabled={activeSprintDay?.committed_at}
                        >
                          Commit
                        </button>
                        <button
                          onClick={completeSprintDay}
                          disabled={!activeSprintDay?.committed_at}
                        >
                          Complete Day
                        </button>
                      </div>
                    </div>
                    <div className="range-sprint-view">
                      <div className="range-sprint-toggle">
                        <button
                          className={sprintViewMode === 'levels' ? 'active' : ''}
                          onClick={() => setSprintViewMode('levels')}
                        >
                          Show Levels
                        </button>
                        <button
                          className={sprintViewMode === 'all' ? 'active' : ''}
                          onClick={() => setSprintViewMode('all')}
                        >
                          Group All Kanji Together
                        </button>
                      </div>
                      <div className="range-sprint-sort">
                        <button
                          className={sprintSortMode === 'shuffle' ? 'active' : ''}
                          onClick={() => applySprintSort('shuffle')}
                        >
                          Shuffle
                        </button>
                        <button
                          className={sprintSortMode === 'alpha' ? 'active' : ''}
                          onClick={() => applySprintSort('alpha')}
                        >
                          Sort Alphabetically
                        </button>
                        <button
                          className={sprintSortMode === 'familiarity' ? 'active' : ''}
                          onClick={() => applySprintSort('familiarity')}
                        >
                          Sort by Familiarity
                        </button>
                        <button
                          className={sprintSortMode === 'normal' ? 'active' : ''}
                          onClick={() => applySprintSort('normal')}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="range-sprint-nav">
                      <button
                        onClick={() =>
                          setUi((prev) => ({
                            ...prev,
                            sprintDayIndex: Math.max(0, prev.sprintDayIndex - 1),
                          }))
                        }
                        disabled={ui.sprintDayIndex === 0}
                      >
                        Prev
                      </button>
                      <button
                        onClick={() =>
                          setUi((prev) => ({
                            ...prev,
                            sprintDayIndex: Math.min(
                              activeSprint.days.length - 1,
                              prev.sprintDayIndex + 1
                            ),
                          }))
                        }
                        disabled={ui.sprintDayIndex >= activeSprint.days.length - 1}
                      >
                        Next
                      </button>
                    </div>
                    <div className="range-sprint-days">
                      {activeSprint.days.map((day, index) => {
                        const status = day.completed_at
                          ? 'Completed'
                          : day.committed_at
                            ? 'Committed'
                            : 'Draft'
                        const statusClass = day.completed_at
                          ? 'completed'
                          : day.committed_at
                            ? 'committed'
                            : 'draft'
                        return (
                          <button
                            key={day.date}
                            className={`sprint-day${index === ui.sprintDayIndex ? ' active' : ''}`}
                            onClick={() =>
                              setUi((prev) => ({ ...prev, sprintDayIndex: index }))
                            }
                          >
                            <div className="sprint-day-title">Day {index + 1}</div>
                            <div className="sprint-day-date">{day.label}</div>
                            <div className="sprint-day-status">
                              <span className={`status-dot ${statusClass}`} />
                              {status}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="range-sprint-levels">
                      {sprintDayLevels.length === 0 ? (
                        <div className="empty-state">
                          Refresh to preview levels, then commit to lock them in.
                        </div>
                      ) : (
                        sprintViewMode === 'levels' ? (
                          sprintDayLevels.map((level) => {
                            const items = getLevelItems(level)
                            if (items.length === 0) return null
                            let ordered = getOrderedItemsForLevel(level)
                            if (sprintSortMode === 'alpha' || sprintSortMode === 'shuffle') {
                              const order = sprintOrderByLevel[level]
                              if (order?.length) {
                                const map = new Map(items.map((item) => [item.id, item]))
                                ordered = order.map((id) => map.get(id)).filter(Boolean)
                              }
                            }
                            const modeOverride =
                              sprintSortMode === 'familiarity' ? 'familiarity' : null
                            return renderRangeLevelSection(level, modeOverride, ordered)
                          })
                        ) : (
                          <div className="range-sprint-all">
                            {(() => {
                              let allItems = sprintAllItems.slice()
                              if (sprintSortMode === 'alpha') {
                                allItems.sort((a, b) =>
                                  a.primaryMeaning.localeCompare(b.primaryMeaning)
                                )
                              } else if (sprintSortMode === 'shuffle') {
                                if (sprintAllOrder.length) {
                                  const map = new Map(allItems.map((item) => [item.id, item]))
                                  allItems = sprintAllOrder.map((id) => map.get(id)).filter(Boolean)
                                } else {
                                  allItems = shuffleArray(allItems)
                                }
                              } else if (sprintSortMode === 'familiarity') {
                                const rank = (status) => {
                                  if (status === STATUS.NEEDS) return 0
                                  if (status === STATUS.LUKEWARM) return 1
                                  if (status === STATUS.COMFORTABLE) return 2
                                  return 3
                                }
                                allItems.sort((a, b) => {
                                  const aStatus = familiarity[a.id] || STATUS.UNMARKED
                                  const bStatus = familiarity[b.id] || STATUS.UNMARKED
                                  const diff = rank(aStatus) - rank(bStatus)
                                  if (diff !== 0) return diff
                                  return a.primaryMeaning.localeCompare(b.primaryMeaning)
                                })
                              }
                              return (
                                <VirtualGrid
                                  items={allItems}
                                  renderItem={renderCard}
                                  estimatedRowHeight={kanjiGridRowHeight}
                                />
                              )
                            })()}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {!detailKanji && !detailRadical && ui.page === 'familiarity' && (
          <div
            ref={sidebarLayoutRef}
            className="page layout"
            style={{ '--sidebar-width': `${sidebarWidth}px` }}
          >
            <aside className="sidebar">
              <div className="sidebar-title">Familiarity</div>
              <div className="range-view-toggle familiarity-view-toggle">
                <button
                  type="button"
                  className={familiarityView === 'kanji' ? 'active' : ''}
                  onClick={() => setUi((prev) => ({ ...prev, familiarityView: 'kanji' }))}
                >
                  Kanji
                </button>
                <button
                  type="button"
                  className={familiarityView === 'radical' ? 'active' : ''}
                  onClick={() => setUi((prev) => ({ ...prev, familiarityView: 'radical' }))}
                >
                  Radicals
                </button>
              </div>
              <div className="sidebar-note">
                {familiarityView === 'radical' ? 'All radicals by status' : 'All kanji by status'}
              </div>
              <div className="sidebar-counts">
                <div className="count-total">Total: {familiarityCountsAll.total}</div>
                <div className="count-badges">
                  {familiarityView === 'kanji' ? (
                    <span className="sidebar-flagged-value">{familiarityFlaggedKanji.length}</span>
                  ) : null}
                  <button
                    className="count-badge status-needs"
                    type="button"
                    onClick={() => scrollToFamiliarity(STATUS.NEEDS)}
                  >
                    {familiarityCountsAll[STATUS.NEEDS]}
                  </button>
                  <button
                    className="count-badge status-lukewarm"
                    type="button"
                    onClick={() => scrollToFamiliarity(STATUS.LUKEWARM)}
                  >
                    {familiarityCountsAll[STATUS.LUKEWARM]}
                  </button>
                  <button
                    className="count-badge status-comfortable"
                    type="button"
                    onClick={() => scrollToFamiliarity(STATUS.COMFORTABLE)}
                  >
                    {familiarityCountsAll[STATUS.COMFORTABLE]}
                  </button>
                  <button
                    className="count-badge status-default"
                    type="button"
                    onClick={() => scrollToFamiliarity(STATUS.UNMARKED)}
                  >
                    {familiarityCountsAll[STATUS.UNMARKED]}
                  </button>
                </div>
              </div>
              <div className="sidebar-filter">
                <label>
                  Levels filter
                  <input
                    value={familiarityLevelFilter}
                    onChange={(event) => setFamiliarityLevelFilter(event.target.value)}
                    placeholder="e.g. 1...3, 5"
                  />
                </label>
                <button
                  className="ghost"
                  onClick={() => setFamiliarityLevelFilter('')}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </aside>
            <SidebarResizeHandle
              layoutRef={sidebarLayoutRef}
              width={sidebarWidth}
              onCommitWidth={commitSidebarWidth}
            />
            <section className="content" ref={familiarityContentRef}>
              <div className="familiarity-page">
                {familiarityView === 'kanji' && familiarityFlaggedKanji.length > 0 ? (
                  <div className="familiarity-block familiarity-flagged-block">
                    <button
                      type="button"
                      className="familiarity-block-toggle"
                      onClick={() =>
                        setUi((prev) => ({
                          ...prev,
                          familiarityFlaggedOpen: !prev.familiarityFlaggedOpen,
                        }))
                      }
                      aria-expanded={ui.familiarityFlaggedOpen ? 'true' : 'false'}
                    >
                      <span className="familiarity-title">
                        Flagged ({familiarityFlaggedKanji.length})
                      </span>
                      <span className="familiarity-flagged-toggle-text">
                        {ui.familiarityFlaggedOpen ? 'Collapse' : 'Expand'}
                      </span>
                    </button>
                    {ui.familiarityFlaggedOpen ? (
                      <div className="grid-wrapper">
                        <VirtualGrid
                          items={familiarityFlaggedKanji}
                          renderItem={(item) => renderFamiliarityCard(item, 'global')}
                          estimatedRowHeight={familiarityPageKanjiRowHeight}
                          columnGap={familiarityPageColumnGap}
                          rowGap={familiarityPageRowGap}
                          minColumnWidth={familiarityPageMinColumnWidth}
                          maxColumnWidth={familiarityPageMaxColumnWidth}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                  <div
                    key={status}
                    id={`familiarity-${status}`}
                    className={`familiarity-block ${STATUS_CLASS[status]}`}
                  >
                    <button
                      type="button"
                      className="familiarity-block-toggle"
                      onClick={() =>
                        setFamiliarityStatusOpen(
                          status,
                          !ui.familiarityOpenByStatus?.[status]
                        )
                      }
                      aria-expanded={ui.familiarityOpenByStatus?.[status] ? 'true' : 'false'}
                    >
                      <span className="familiarity-title">
                        {STATUS_LABELS[status]} ({familiarityCountsAll[status]})
                      </span>
                      <span className="familiarity-flagged-toggle-text">
                        {ui.familiarityOpenByStatus?.[status] ? 'Collapse' : 'Expand'}
                      </span>
                    </button>
                    {ui.familiarityOpenByStatus?.[status] ? (
                      <div className="grid-wrapper">
                        <VirtualGrid
                          items={familiarityGroupsAll[status]}
                          renderItem={(item) =>
                            familiarityView === 'radical'
                              ? renderRadicalCard(item)
                              : renderFamiliarityCard(item, 'global')
                          }
                          estimatedRowHeight={
                            familiarityView === 'radical'
                              ? radicalGridRowHeight
                              : familiarityPageKanjiRowHeight
                          }
                          columnGap={familiarityPageColumnGap}
                          rowGap={familiarityPageRowGap}
                          minColumnWidth={
                            familiarityView === 'radical'
                              ? undefined
                              : familiarityPageMinColumnWidth
                          }
                          maxColumnWidth={
                            familiarityView === 'radical'
                              ? undefined
                              : familiarityPageMaxColumnWidth
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <QuizModal
        key={quizOpen ? 'quiz-open' : 'quiz-closed'}
        isOpen={quizOpen}
        onClose={() => setQuizOpen(false)}
        items={quizItems}
        lightningMode={ui.lightningMode}
        setLightningMode={(value) => setUi((prev) => ({ ...prev, lightningMode: value }))}
        familiarity={familiarity}
        readingStatusByKanji={readingStatusByKanji}
        onToggleReading={toggleReadingStatus}
      />

      <Modal
        isOpen={globalQuizOpen}
        onClose={() => setGlobalQuizOpen(false)}
        title="Global Quiz"
      >
        <div className="global-quiz">
          <label>
            Levels (e.g. 1...3, 5)
            <input
              value={globalQuizLevels}
              onChange={(event) => {
                const value = event.target.value
                setGlobalQuizLevels(value)
                setUi((prev) => ({ ...prev, globalQuizLevels: value }))
              }}
            />
          </label>
          <div className="global-filters">
            {STATUS_ORDER.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={globalQuizStatuses[status]}
                  onChange={(event) =>
                    setGlobalQuizStatuses((prev) => {
                      const next = { ...prev, [status]: event.target.checked }
                      setUi((uiPrev) => ({ ...uiPrev, globalQuizStatuses: next }))
                      return next
                    })
                  }
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button onClick={openGlobalQuiz}>Start Quiz</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={randomReviewSettingsOpen}
        onClose={() => setRandomReviewSettingsOpen(false)}
        title="Review Pool"
        className="random-review-modal"
      >
        <div className="random-review-settings">
          <div className="random-review-settings-summary">
            <div className="random-review-settings-label">Included Sections</div>
            <div className="random-review-settings-value">{randomReviewIncludeSummary}</div>
          </div>
          <div className="random-review-settings-summary">
            <div className="random-review-settings-label">Filtered Out</div>
            <div className="random-review-settings-value">{randomReviewFilterSummary}</div>
          </div>
          <div className="random-review-settings-group">
            <div className="random-review-settings-label">Include</div>
            <label className="random-review-settings-option">
              <input
                type="checkbox"
                aria-label="Flagged"
                checked={draftRandomReviewConfig.include.flagged}
                onChange={(event) =>
                  setDraftRandomReviewConfig((prev) => ({
                    ...prev,
                    include: {
                      ...prev.include,
                      flagged: event.target.checked,
                    },
                  }))
                }
              />
              {`Flagged (${randomReviewOptionCounts.flagged})`}
            </label>
          </div>
          <div className="random-review-settings-group">
            <div className="random-review-settings-label">Familiarity</div>
            <div className="random-review-settings-grid">
              {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                <label key={status} className="random-review-settings-option">
                  <input
                    type="checkbox"
                    aria-label={STATUS_LABELS[status]}
                    checked={draftRandomReviewConfig.include.statuses[status]}
                    onChange={(event) =>
                      setDraftRandomReviewConfig((prev) => ({
                        ...prev,
                        include: {
                          ...prev.include,
                          statuses: {
                            ...prev.include.statuses,
                            [status]: event.target.checked,
                          },
                        },
                      }))
                    }
                  />
                  {`${STATUS_LABELS[status]} (${randomReviewOptionCounts[status]})`}
                </label>
              ))}
            </div>
          </div>
          <div className="random-review-settings-group">
            <div className="random-review-settings-label">Filter Out</div>
            <label className="random-review-settings-option">
              <input
                type="checkbox"
                aria-label="Filter Out Flagged"
                checked={draftRandomReviewConfig.filter.flagged}
                onChange={(event) =>
                  setDraftRandomReviewConfig((prev) => ({
                    ...prev,
                    filter: {
                      ...prev.filter,
                      flagged: event.target.checked,
                    },
                  }))
                }
              />
              {`Flagged (${randomReviewOptionCounts.flagged})`}
            </label>
            <div className="random-review-settings-grid">
              {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                <label key={`filter-${status}`} className="random-review-settings-option">
                  <input
                    type="checkbox"
                    aria-label={`Filter Out ${STATUS_LABELS[status]}`}
                    checked={draftRandomReviewConfig.filter.statuses[status]}
                    onChange={(event) =>
                      setDraftRandomReviewConfig((prev) => ({
                        ...prev,
                        filter: {
                          ...prev.filter,
                          statuses: {
                            ...prev.filter.statuses,
                            [status]: event.target.checked,
                          },
                        },
                      }))
                    }
                  />
                  {`${STATUS_LABELS[status]} (${randomReviewOptionCounts[status]})`}
                </label>
              ))}
            </div>
          </div>
          <div className="random-review-settings-preview">
            Matches: <strong>{draftRandomReviewMatchCount}</strong>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() =>
                setDraftRandomReviewConfig(normalizeRandomReviewConfig(DEFAULT_RANDOM_REVIEW_CONFIG))
              }
            >
              Reset to Flagged Only
            </button>
            <button
              type="button"
              onClick={() =>
                setDraftRandomReviewConfig((prev) => ({
                  ...prev,
                  filter: normalizeRandomReviewSection(null, DEFAULT_RANDOM_REVIEW_FILTER),
                }))
              }
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={applyRandomReviewConfig}
            >
              Apply
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="About">
        <div className="about-modal">
          <div className="about-section">
            <div className="about-title">Legend</div>
            <div className="about-row">
              <span className="legend-swatch status-needs">Needs Work</span>
              <span className="legend-swatch status-lukewarm">Lukewarm</span>
              <span className="legend-swatch status-comfortable">Comfortable</span>
              <span className="legend-swatch status-default">Unmarked</span>
            </div>
            <div className="about-row">
              <span className="legend-swatch vocab-lukewarm">Vocab: Orange</span>
              <span className="legend-swatch vocab-comfortable">Vocab: Green</span>
              <span className="legend-swatch flagged">Flagged</span>
            </div>
          </div>
          <div className="about-section">
            <div className="about-title">Card Labels</div>
            <div className="about-text">
              <strong>O:</strong> Onyomi · <strong>K:</strong> Kunyomi
            </div>
            <div className="about-text">
              Hover cards show meanings, readings, strokes, and highlighted vocab.
            </div>
            <div className="about-text">
              Kanji detail pages include vocab lists with highlight ordering.
            </div>
            <div className="about-text">
              Radical pages include SVG, meanings, mnemonic, and related kanji cards.
            </div>
          </div>
          <div className="about-section">
            <div className="about-title">Keyboard Shortcuts</div>
            <div className="about-list">
              <div>
                <strong>Levels / Radicals nav:</strong> ← / →
              </div>
              <div>
                <strong>Groups:</strong> ← / → switches prev/next group
              </div>
              <div>
                <strong>Groups (All Groups view):</strong> ← / → scrolls between category sections
              </div>
              <div>
                <strong>Familiarity:</strong> ← / → scrolls between status sections
              </div>
              <div>
                <strong>Mnemonics toggle (kanji detail):</strong> ,
              </div>
              <div>
                <strong>Random Review:</strong> R opens a random kanji detail page from the active
                review pool
              </div>
              <div>
                <strong>Review Pool:</strong> choose which sections to include, then optionally
                remove sections from that pool with Filter Out
              </div>
              <div>
                <strong>Reset Random queue:</strong> Q reshuffles the Random Review queue
              </div>
              <div>
                <strong>Kanji / Radical status (hovered or detail):</strong> 1 ={' '}
                <span className="shortcut-pill needs">Needs Work</span>, 2 ={' '}
                <span className="shortcut-pill lukewarm">Lukewarm</span>, 3 ={' '}
                <span className="shortcut-pill comfortable">Comfortable</span>, 4 ={' '}
                <span className="shortcut-pill clear">Clear</span>, 5 ={' '}
                <span className="shortcut-pill flagged">Flag / Unflag</span>
              </div>
              <div>
                <strong>Radical status (hovered):</strong> 1 ={' '}
                <span className="shortcut-pill needs">Needs Work</span>, 2 ={' '}
                <span className="shortcut-pill lukewarm">Lukewarm</span>, 3 ={' '}
                <span className="shortcut-pill comfortable">Comfortable</span>, 4 ={' '}
                <span className="shortcut-pill clear">Clear</span>
              </div>
              <div>
                <strong>Vocab highlight (detail page, hovered):</strong> 2 ={' '}
                <span className="shortcut-pill orange">Orange</span>, 3 ={' '}
                <span className="shortcut-pill green">Green</span>, 4 ={' '}
                <span className="shortcut-pill clear">Clear</span>
              </div>
              <div>
                <strong>Vocab reorder (detail page):</strong> Drag rows to reorder within the same
                status.
              </div>
              <div>
                <strong>Quiz:</strong> Enter submit / advance, ← / → prev/next, Esc close
              </div>
              <div>
                <strong>Sprints:</strong> Use Refresh → Commit → Complete Day to track progress.
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <input
        ref={hotkeySinkRef}
        className="hotkey-sink"
        aria-hidden="true"
        tabIndex={-1}
        inputMode="none"
        onKeyDown={handleDigitHotkey}
        onKeyUp={handleDigitHotkey}
        onInput={(event) => {
          const value = event.currentTarget.value || ''
          const last = value[value.length - 1]
          if (last && /\d/.test(last)) {
            applyDigitHotkey(last, { key: last, code: `Digit${last}`, type: 'input' })
          }
          event.currentTarget.value = ''
        }}
      />

      <Modal
        isOpen={sprintHistoryOpen}
        onClose={() => setSprintHistoryOpen(false)}
        title="Sprint History"
      >
        <div className="sprint-history-modal">
          {sprintSummaries.length === 0 ? (
            <div className="empty-state">No sprints yet.</div>
          ) : (
            <div className="range-sprint-history-list">
              {sprintSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className={`sprint-history-item${
                    summary.id === ui.sprintActiveId ? ' active' : ''
                  }`}
                >
                  <button
                    className="sprint-history-main"
                    onClick={() => {
                      setUi((prev) => ({
                        ...prev,
                        sprintActiveId: summary.id,
                        sprintDayIndex: 0,
                      }))
                      setSprintHistoryOpen(false)
                    }}
                  >
                    <div className="sprint-history-name">Sprint {summary.number}</div>
                    <div className="sprint-history-range">
                      {summary.startLabel} → {summary.endLabel}
                    </div>
                  </button>
                  <button
                    className="sprint-history-delete"
                    onClick={() => deleteSprint(summary.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={sprintLevelStatusOpen}
        onClose={() => setSprintLevelStatusOpen(false)}
        title="Sprint Level Status"
        className="modal-wide"
      >
        <div className="sprint-status-modal">
          {!activeSprint ? (
            <div className="empty-state">Start a sprint to see level status.</div>
          ) : sprintAllLevelNumbers.length === 0 ? (
            <div className="empty-state">
              Refresh to preview levels, then commit to lock them in.
            </div>
          ) : (
            <div className="sprint-status-grid">
              {sprintAllLevelNumbers.map((level) => (
                <div key={level} className="sprint-status-item">
                  <span className={`status-dot ${sprintLevelStatusByLevel[level] || 'draft'}`} />
                  <div className="sprint-status-label">Level {level}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>


      <GroupAddModal
        key={groupAddOpen ? `group-add-open-${selectedGroup?.id || 'none'}` : 'group-add-closed'}
        isOpen={groupAddOpen}
        onClose={() => setGroupAddOpen(false)}
        kanjiList={kanjiList}
        groupItems={selectedGroup?.kanjiIds || []}
        onAdd={(id) => addGroupItem(id)}
      />
    </div>
  )
}

export default App
