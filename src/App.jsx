import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
// Virtualization can be reintroduced later if needed.
import './App.css'

const STORAGE_KEY = 'kanji_organizer_v1'
const STORAGE_SLICES = {
  familiarity: 'kanji_organizer_familiarity_v1',
  radicalFamiliarity: 'kanji_organizer_radical_familiarity_v1',
  readingStatusByKanji: 'kanji_organizer_readings_v1',
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
  detailMnemonicsOpen: true,
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
  const tokens = []
  const source = String(text)
  const re = /<(radical|kanji|reading)>(.*?)<\/\1>/gi
  let last = 0
  let match
  while ((match = re.exec(source)) !== null) {
    if (match.index > last) {
      const cleaned = normalizeText(source.slice(last, match.index))
      if (cleaned) {
        tokens.push({
          type: 'text',
          value: cleaned,
        })
      }
    }
    const chipValue = normalizeText(match[2] || '')
    if (chipValue) {
      tokens.push({
        type: match[1].toLowerCase(),
        value: chipValue,
      })
    }
    last = re.lastIndex
  }
  if (last < source.length) {
    const cleaned = normalizeText(source.slice(last))
    if (cleaned) {
      tokens.push({ type: 'text', value: cleaned })
    }
  }
  return tokens
}

function splitReadingTokens(text) {
  if (!text) return []
  return text
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

function splitKanjiTokens(text) {
  if (!text) return []
  return String(text)
    .split(/[,、]/)
    .map((token) => token.trim())
    .filter(Boolean)
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


function shuffleArray(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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

function useLocalStorageSync(slices, locked, canWrite) {
  const {
    familiarity,
    radicalFamiliarity,
    readingStatusByKanji,
    groups,
    sprints,
    highlightedVocabByKanji,
    vocabOrderByKanji,
    ui,
  } = slices || {}

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.familiarity, familiarity || {})
  }, [slices, locked, canWrite, familiarity])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.radicalFamiliarity, radicalFamiliarity || {})
  }, [slices, locked, canWrite, radicalFamiliarity])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.readingStatusByKanji, readingStatusByKanji || {})
  }, [slices, locked, canWrite, readingStatusByKanji])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.groups, groups || [])
  }, [slices, locked, canWrite, groups])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.sprints, sprints || [])
  }, [slices, locked, canWrite, sprints])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.highlightedVocabByKanji, highlightedVocabByKanji || {})
  }, [slices, locked, canWrite, highlightedVocabByKanji])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.vocabOrderByKanji, vocabOrderByKanji || {})
  }, [slices, locked, canWrite, vocabOrderByKanji])

  useLayoutEffect(() => {
    if (!slices || locked || !canWrite) return
    saveStorageSlice(STORAGE_SLICES.ui, ui || {})
  }, [slices, locked, canWrite, ui])

  // Keep a backward-compatible aggregate snapshot for existing tooling/tests.
  // Debounced to avoid hot-loop full JSON serialization on every tiny update.
  useEffect(() => {
    if (!slices || locked || !canWrite) return
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slices))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [
    slices,
    locked,
    canWrite,
    familiarity,
    radicalFamiliarity,
    readingStatusByKanji,
    groups,
    sprints,
    highlightedVocabByKanji,
    vocabOrderByKanji,
    ui,
  ])
}

function useKeydown(handler) {
  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
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

function VirtualGridInner({ items, renderItem }) {
  const PAGE_SIZE = 240
  const VIRTUALIZE_THRESHOLD = 400
  const supportsIO = typeof IntersectionObserver !== 'undefined'
  const shouldVirtualize = supportsIO && items.length > VIRTUALIZE_THRESHOLD
  const [visibleCount, setVisibleCount] = useState(
    shouldVirtualize ? Math.min(PAGE_SIZE, items.length) : items.length
  )
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!shouldVirtualize) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting) return
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length))
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [items.length, shouldVirtualize])

  const visibleItems = shouldVirtualize ? items.slice(0, visibleCount) : items
  return (
    <div className="simple-grid">
      {visibleItems.map(renderItem)}
      {shouldVirtualize && visibleCount < items.length ? (
        <div ref={sentinelRef} className="virtual-grid-sentinel" aria-hidden="true" />
      ) : null}
    </div>
  )
}

function VirtualGrid({ items, renderItem }) {
  const resetKey = `${items.length}:${items[0]?.id ?? 'none'}`
  return <VirtualGridInner key={resetKey} items={items} renderItem={renderItem} />
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

function KanjiCard({
  item,
  hideDetails,
  status,
  onOpen,
  onOpenDetail,
  onSetStatus,
  showMenu,
  onMenuToggle,
  onHover,
  hotkeySinkRef,
  readingStatus,
  onToggleReading,
  highlightedVocab,
  visuallySimilarKanji,
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
  const handleMouseEnter = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const hoverWidth = 560
    if (rect.left < hoverWidth * 0.8) {
      setHoverAlign('left')
    } else if (rect.right + hoverWidth * 0.8 > window.innerWidth) {
      setHoverAlign('right')
    } else {
      setHoverAlign('center')
    }
    setHoverReady(true)
  }

  return (
    <div
      className={`kanji-card ${STATUS_CLASS[status] || 'status-default'} ${
        classNameOverride || ''
      }`}
      data-kanji-id={item.id}
      onClick={(event) => {
        if (event.metaKey) {
          event.preventDefault()
          onOpenDetail?.(item)
          return
        }
        onOpen(item)
      }}
      onMouseEnter={(event) => {
        handleMouseEnter(event)
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
        if (onMouseEnterExternal) onMouseEnterExternal()
      }}
      onPointerEnter={(event) => {
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
      }}
      onMouseLeave={() => {
        setHoverReady(false)
      }}
      onPointerLeave={() => {}}
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
        if (event.key === 'Enter') onOpen(item)
        const digit = getDigitFromEvent(event)
        if (!digit) return
        event.preventDefault()
        if (digit === '1') onSetStatus(item.id, STATUS.NEEDS)
        if (digit === '2') onSetStatus(item.id, STATUS.LUKEWARM)
        if (digit === '3') onSetStatus(item.id, STATUS.COMFORTABLE)
        if (digit === '4') onSetStatus(item.id, null)
      }}
    >
      <div className="card-header">
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
        </div>
      )}
      {hoverReady &&
        (item.otherMeanings?.length > 0 ||
          item.onyomi ||
          item.kunyomi ||
          item.strokeImg ||
          visuallySimilarKanji?.length > 0) && (
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
          {(highlightedVocab?.length > 0 || visuallySimilarKanji?.length > 0) &&
            item.strokeImg && <div className="hover-divider" />}
          {item.strokeImg && (
            <div className="hover-stroke">
              <img
                src={`${import.meta.env.BASE_URL}strokes_media/${item.strokeImg}`}
                alt="Stroke order"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}
          {visuallySimilarKanji?.length > 0 && (
            <div className="hover-similar">
              <div className="hover-title">Visually similar kanji ({visuallySimilarKanji.length})</div>
              <div className="hover-similar-list">
                {visuallySimilarKanji.map((similar) => (
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
          {highlightedVocab?.length > 0 && (
            <div className="hover-vocab">
              <div className="hover-title hover-vocab-title">Highlighted vocab</div>
              <div className="hover-vocab-list">
                {highlightedVocab.map((vocab) => (
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
  onOpen,
  onOpenDetail,
  onSetStatus,
  showMenu,
  onMenuToggle,
  onHover,
  hotkeySinkRef,
}) {
  return (
    <div
      className={`kanji-card radical-card ${STATUS_CLASS[status] || 'status-default'}`}
      data-radical-id={item.id}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onOpenDetail?.(item)
          return
        }
        onOpen(item)
      }}
      onMouseEnter={(event) => {
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
      }}
      onPointerEnter={(event) => {
        if (onHover) onHover(item.id, event.currentTarget)
        hotkeySinkRef?.current?.focus?.()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(item)
        const digit = getDigitFromEvent(event)
        if (!digit) return
        event.preventDefault()
        if (digit === '1') onSetStatus(item.id, STATUS.NEEDS)
        if (digit === '2') onSetStatus(item.id, STATUS.LUKEWARM)
        if (digit === '3') onSetStatus(item.id, STATUS.COMFORTABLE)
        if (digit === '4') onSetStatus(item.id, null)
      }}
    >
      <div className="card-header">
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

function MnemonicText({ text }) {
  const segments = useMemo(() => parseMnemonicSegments(text), [text])
  if (!segments.length) return <span>—</span>
  return (
    <span className="mnemonic-rich">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <span key={`text-${index}`} className="mnemonic-text-fragment">
              {segment.value}{' '}
            </span>
          )
        }
        return (
          <span key={`${segment.type}-${index}`} className={`mnemonic-chip ${segment.type}`}>
            {segment.value}
          </span>
        )
      })}
    </span>
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

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return kanjiList
      .filter((item) => item.primaryMeaning.toLowerCase().includes(normalized))
      .slice(0, 30)
  }, [kanjiList, query])

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

function App() {
  const [kanjiList, setKanjiList] = useState([])
  const [radicalList, setRadicalList] = useState([])
  const [loading, setLoading] = useState(true)
  const [familiarity, setFamiliarity] = useState({})
  const [radicalFamiliarity, setRadicalFamiliarity] = useState({})
  const [readingStatusByKanji, setReadingStatusByKanji] = useState({})
  const [groups, setGroups] = useState([])
  const [sprints, setSprints] = useState([])
  const [vocabList, setVocabList] = useState([])
  const [highlightedVocabByKanji, setHighlightedVocabByKanji] = useState({})
  const [vocabOrderByKanji, setVocabOrderByKanji] = useState({})
  const [ui, setUi] = useState(DEFAULT_UI)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [quizItems, setQuizItems] = useState([])
  const [quizOpen, setQuizOpen] = useState(false)
  const [globalQuizOpen, setGlobalQuizOpen] = useState(false)
  const [globalQuizLevels, setGlobalQuizLevels] = useState('')
  const [globalQuizStatuses, setGlobalQuizStatuses] = useState({
    [STATUS.NEEDS]: false,
    [STATUS.LUKEWARM]: false,
    [STATUS.COMFORTABLE]: false,
  })
  const [aboutOpen, setAboutOpen] = useState(false)
  const [sprintHistoryOpen, setSprintHistoryOpen] = useState(false)
  const [sprintLevelStatusOpen, setSprintLevelStatusOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [familiarityLevelFilter, setFamiliarityLevelFilter] = useState('')
  const [deletedGroup, setDeletedGroup] = useState(null)
  const [groupAddOpen, setGroupAddOpen] = useState(false)
  const [detailKanji, setDetailKanji] = useState(null)
  const [detailRadical, setDetailRadical] = useState(null)
  const [hoveredVocabId, setHoveredVocabId] = useState(null)
  const hoveredVocabRef = useRef(null)
  const [vocabDragId, setVocabDragId] = useState(null)
  const [vocabDragOverId, setVocabDragOverId] = useState(null)
  const [vocabDragPosition, setVocabDragPosition] = useState('before')
  const [hydrated, setHydrated] = useState(false)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverGroupId, setDragOverGroupId] = useState(null)
  const [_hoveredCardId, setHoveredCardId] = useState(null)
  const [hoveredRadicalId, setHoveredRadicalId] = useState(null)
  const hoveredCardRef = useRef(null)
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
  const levelShuffleRef = useRef({ level: null, signature: '', order: [] })
  const groupSidebarRef = useRef(null)
  const groupSidebarTopRef = useRef(null)

  const updateHoveredCard = useCallback((id, target = null) => {
    hoveredCardRef.current = id
    if (target) lastPointerTargetRef.current = target
    setHoveredCardId((prev) => (prev === id ? prev : id))
  }, [])

  const updateHoveredRadical = useCallback((id, target = null) => {
    hoveredRadicalRef.current = id
    if (target) lastPointerTargetRef.current = target
    setHoveredRadicalId((prev) => (prev === id ? prev : id))
  }, [])

  const updateHoveredVocab = useCallback((id, target = null) => {
    hoveredVocabRef.current = id
    if (target) lastPointerTargetRef.current = target
    setHoveredVocabId((prev) => (prev === id ? prev : id))
  }, [])

  useEffect(() => {
    let active = true
    const hydrateFromPayload = (stored) => {
      setFamiliarity(stored.familiarity || {})
      setRadicalFamiliarity(stored.radicalFamiliarity || {})
      setReadingStatusByKanji(stored.readingStatusByKanji || {})
      setGroups(stored.groups || [])
      setSprints(stored.sprints || [])
      setHighlightedVocabByKanji(normalizeVocabHighlights(stored.highlightedVocabByKanji))
      setVocabOrderByKanji(stored.vocabOrderByKanji || {})
      setUi((prev) => ({ ...prev, ...stored.ui }))
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

  useEffect(() => {
    let ignore = false
    async function loadCsv() {
      setLoading(true)
      const response = await fetch(CSV_PATH)
      const text = await response.text()
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
      const rows = parsed.data
      const formatted = rows.map((row, index) => {
        const other = row.other_meanings
          ? row.other_meanings.split(',').map((item) => item.trim()).filter(Boolean)
          : []
        const strokeMatch = row.StrokeImg ? row.StrokeImg.match(/src="([^"]+)"/) : null
        return {
          id: index + 1,
          kanji: row.kanji,
          primaryMeaning: row.primary_meaning,
          otherMeanings: other,
          onyomi: row.onyomi,
          kunyomi: row.kunyomi,
          meaningMnemonic: row.meaning_mnemonic || row.meaningMnemonic || '',
          readingMnemonic: row.reading_mnemonic || row.readingMnemonic || '',
          url: row.url,
          level: Number(row.wk_level),
          radicalSubjectIds: parseIdArray(row.radical_subject_ids),
          visuallySimilarKanji: row.visually_similar_kanji,
          strokeImg: strokeMatch ? strokeMatch[1] : '',
        }
      })
      if (!ignore) {
        setKanjiList(formatted)
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
        const rows = parsed.data
        const formatted = rows.map((row) => {
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
          return {
            id: Number(row.wk_subject_id),
            word: row.word,
            primaryReading: row.primary_reading,
            primaryMeaning: row.primary_meaning,
            otherMeanings: other,
            partsOfSpeech: parts,
            url: row.url || row.document_url,
            componentKanji,
          }
        })
        if (!ignore) setVocabList(formatted)
      } catch {
        if (!ignore) setVocabList([])
      }
    }
    loadVocabCsv()
    return () => {
      ignore = true
    }
  }, [])

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
          radicalFamiliarity,
          readingStatusByKanji,
          groups,
          sprints,
          ui,
          highlightedVocabByKanji,
          vocabOrderByKanji,
        }
      : null
    ,
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

  const scrollToFamiliarity = (status) => {
    const target = document.getElementById(`familiarity-${status}`)
    if (!target) return
    const container = target.closest('.content')
    const header = document.querySelector('.app-header')
    const offset = (header?.offsetHeight || 0) + 24
    if (container && container.scrollHeight > container.clientHeight + 2) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const top = Math.max(0, container.scrollTop + (targetRect.top - containerRect.top) - offset)
      container.scrollTo({ top, behavior: 'smooth' })
      return
    }
    const targetRect = target.getBoundingClientRect()
    const top = window.scrollY + targetRect.top - offset
    window.scrollTo({ top, behavior: 'smooth' })
  }

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
      setRadicalFamiliarity({})
      setReadingStatusByKanji(parsed.reading_status_by_kanji || {})
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

  const applyDigitHotkey = useCallback(
    (digit) => {
      if (!isStorageOwner || ui.storageLocked) return
      if (!digit) return
      const vocabAction = getVocabHotkey({ key: digit, code: `Digit${digit}` })
      const statusAction = getStatusHotkey({ key: digit, code: `Digit${digit}` })

      const hoverVocabEl = document.querySelector('.kanji-vocab-item:hover')
      const target = lastPointerTargetRef.current
      const vocabTarget = hoverVocabEl || target?.closest?.('.kanji-vocab-item')
      const vocabId =
        Number(vocabTarget?.getAttribute?.('data-vocab-id')) ||
        hoveredVocabRef.current ||
        hoveredVocabId
      if (detailKanji && vocabId) {
        if (vocabAction !== undefined) {
          setVocabHighlight(detailKanji.kanji, vocabId, vocabAction)
        }
        return
      }

      if (detailKanji) return
      if (detailRadical) return
      if (statusAction === undefined) return
      const hoverCardEl = document.querySelector('.kanji-card:hover')
      const cardTarget = hoverCardEl || target?.closest?.('.kanji-card')
      const cardAttrId = Number(cardTarget?.getAttribute?.('data-kanji-id'))
      const cardId = Number.isFinite(cardAttrId) && cardAttrId > 0 ? cardAttrId : null
      const hoverRadicalEl = document.querySelector('.radical-card:hover')
      const radicalTarget = hoverRadicalEl || target?.closest?.('.radical-card')
      const radicalAttrId = Number(radicalTarget?.getAttribute?.('data-radical-id'))
      const radicalId =
        Number.isFinite(radicalAttrId) && radicalAttrId > 0
          ? radicalAttrId
          : ui.page === 'radicals'
            ? hoveredRadicalRef.current || hoveredRadicalId || null
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
      hoveredRadicalId,
      hoveredVocabId,
      setStatus,
      setRadicalStatus,
      setVocabHighlight,
      isStorageOwner,
      ui.storageLocked,
      ui.page,
    ]
  )

  const handleDigitHotkey = useCallback(
    (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      const digit = getDigitFromEvent(event)
      if (!digit) return
      applyDigitHotkey(digit)
      event.preventDefault()
    },
    [applyDigitHotkey]
  )

  useEffect(() => {
    const keydown = (event) => handleDigitHotkey(event)
    const keypress = (event) => handleDigitHotkey(event)
    const keyup = (event) => handleDigitHotkey(event)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keypress', keypress, true)
    window.addEventListener('keyup', keyup, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('keypress', keypress, true)
      window.removeEventListener('keyup', keyup, true)
    }
  }, [handleDigitHotkey])

  const openCard = (item) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  const openRadicalCard = (item) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  const openKanjiDetail = useCallback((item) => {
    if (!item) return
    const token = encodeURIComponent(item.kanji)
    const base = import.meta.env.BASE_URL || '/'
    window.history.pushState({}, '', `${base}#/kanji/${token}`)
    setHoveredCardId(null)
    setUi((prev) => ({
      ...prev,
      lastDetailLevel: prev.selectedLevel,
    }))
    setDetailKanji(item)
    setDetailRadical(null)
  }, [])

  const openRadicalDetail = useCallback((item) => {
    if (!item) return
    const token = encodeURIComponent(item.slug || slugifyValue(item.primaryMeaning))
    const base = import.meta.env.BASE_URL || '/'
    window.history.pushState({}, '', `${base}#/radical/${token}`)
    setHoveredRadicalId(null)
    setUi((prev) => ({ ...prev, selectedRadicalLevel: item.level || prev.selectedRadicalLevel }))
    setDetailKanji(null)
    setDetailRadical(item)
  }, [])

  const closeKanjiDetail = () => {
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
  }


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
  }, [findKanjiByToken, findRadicalByToken])

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

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return kanjiList
      .map((item) => {
        const primary = item.primaryMeaning || ''
        const primaryMatch = primary.toLowerCase().includes(query)
        const otherMatch = item.otherMeanings?.find((meaning) =>
          meaning.toLowerCase().includes(query)
        )
        const kanjiMatch = item.kanji?.includes(query)
        if (!kanjiMatch && !primaryMatch && !otherMatch) return null
        return {
          item,
          displayMeaning: otherMatch && !primaryMatch ? otherMatch : primary,
        }
      })
      .filter(Boolean)
  }, [kanjiList, searchQuery])

  const kanjiByCharacter = useMemo(() => {
    const map = new Map()
    kanjiList.forEach((item) => {
      if (!item.kanji) return
      map.set(item.kanji, item)
    })
    return map
  }, [kanjiList])

  const vocabByKanji = useMemo(() => {
    const map = new Map()
    vocabList.forEach((entry) => {
      entry.componentKanji.forEach((kanji) => {
        if (!map.has(kanji)) map.set(kanji, [])
        map.get(kanji).push(entry)
      })
    })
    return map
  }, [vocabList])

  const detailVocabEntries = useMemo(() => {
    if (!detailKanji) return []
    return vocabByKanji.get(detailKanji.kanji) || []
  }, [detailKanji, vocabByKanji])
  const detailVisuallySimilarKanji = useMemo(() => {
    if (!detailKanji?.visuallySimilarKanji) return []
    const seen = new Set()
    return splitKanjiTokens(detailKanji.visuallySimilarKanji)
      .map((token) => kanjiByCharacter.get(token))
      .filter((item) => {
        if (!item) return false
        if (item.id === detailKanji.id) return false
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
  }, [detailKanji, kanjiByCharacter])
  const detailKanjiRadicals = useMemo(() => {
    if (!detailKanji?.radicalSubjectIds?.length) return []
    return detailKanji.radicalSubjectIds
      .map((id) => radicalById.get(id))
      .filter(Boolean)
  }, [detailKanji, radicalById])
  const detailRadicalRelatedKanji = useMemo(() => {
    if (!detailRadical?.amalgamationKanji?.length) return []
    const seen = new Set()
    const related = []
    detailRadical.amalgamationKanji.forEach((token) => {
      const item = kanjiByCharacter.get(token)
      if (!item) return
      if (seen.has(item.id)) return
      seen.add(item.id)
      related.push(item)
    })
    return related
  }, [detailRadical, kanjiByCharacter])
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
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
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
      const entries = vocabByKanji.get(kanjiChar) || []
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
    [highlightedVocabByKanji, vocabByKanji, vocabOrderByKanji, sortVocabEntries]
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
  const familiarityGroupsAllKanji = useMemo(() => {
    const filterLevels = parseLevelsInput(familiarityLevelFilter)
    const levelSet = filterLevels.length ? new Set(filterLevels) : null
    const groupsMap = {
      [STATUS.NEEDS]: [],
      [STATUS.LUKEWARM]: [],
      [STATUS.COMFORTABLE]: [],
      [STATUS.UNMARKED]: [],
    }
    const map = new Map(kanjiList.map((item) => [item.id, item]))
    familiarityOrder.forEach((id) => {
      const item = map.get(id)
      if (!item) return
      if (levelSet && !levelSet.has(item.level)) return
      const status = familiarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [kanjiList, familiarity, familiarityLevelFilter, familiarityOrder])

  const familiarityGroupsAllRadicals = useMemo(() => {
    const filterLevels = parseLevelsInput(familiarityLevelFilter)
    const levelSet = filterLevels.length ? new Set(filterLevels) : null
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
      if (levelSet && !levelSet.has(item.level)) return
      const status = radicalFamiliarity[item.id] || STATUS.UNMARKED
      groupsMap[status].push(item)
    })
    return groupsMap
  }, [radicalList, radicalFamiliarity, familiarityLevelFilter, radicalFamiliarityOrderGlobal])

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

  const selectedGroup = groups.find((group) => group.id === ui.selectedGroupId)
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
  const collapsedCategories = ui.groupCategoryCollapsed || {}
  const allCategoryCollapsed = orderedGroupCategories.every((category) => {
    const items = groupsByCategory.get(category) || []
    if (items.length === 0) return true
    return Boolean(collapsedCategories[category])
  })

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
      highlighted_vocab_by_kanji: highlightedVocabByKanji,
      vocab_order_by_kanji: vocabOrderByKanji,
      reading_status_by_kanji: readingStatusByKanji,
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
        const nextRadicalFamiliarity = {}
        ;(parsed.radical_familiarity || []).forEach((entry) => {
          nextRadicalFamiliarity[entry.radical_id] = entry.status
        })
        setFamiliarity(nextFamiliarity)
        setRadicalFamiliarity(nextRadicalFamiliarity)
        setReadingStatusByKanji(parsed.reading_status_by_kanji || {})
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

  const handleHoverCard = useCallback((id, target) => {
    updateHoveredCard(id, target)
  }, [updateHoveredCard])

  const handleHoverRadical = useCallback(
    (id, target) => {
      updateHoveredRadical(id, target)
    },
    [updateHoveredRadical]
  )

  const renderCard = (item) => (
    <KanjiCard
      key={item.id}
      item={item}
      hideDetails={effectiveHide}
      status={familiarity[item.id]}
      onOpen={openCard}
      onOpenDetail={openKanjiDetail}
      onSetStatus={setStatus}
      showMenu={openMenuId === item.id}
      onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
      onHover={handleHoverCard}
      hotkeySinkRef={hotkeySinkRef}
      readingStatus={readingStatusByKanji[item.id] || {}}
      onToggleReading={toggleReadingStatus}
      highlightedVocab={getHighlightedVocab(item.kanji)}
      visuallySimilarKanji={getVisuallySimilarForKanji(item)}
    />
  )

  const renderFamiliarityCard = (item, allowDrag) => {
    const isDragSource = dragFamiliarityId === item.id
    const isDragTarget = dragTargetId === item.id && dragFamiliarityId
    return (
      <KanjiCard
        key={item.id}
        item={item}
        hideDetails={effectiveHide}
        status={familiarity[item.id]}
        onOpen={openCard}
        onOpenDetail={openKanjiDetail}
        onSetStatus={setStatus}
        showMenu={openMenuId === item.id}
        onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
        onHover={handleHoverCard}
        hotkeySinkRef={hotkeySinkRef}
        readingStatus={readingStatusByKanji[item.id] || {}}
        onToggleReading={toggleReadingStatus}
        highlightedVocab={getHighlightedVocab(item.kanji)}
        visuallySimilarKanji={getVisuallySimilarForKanji(item)}
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
  }

  const renderRadicalCard = (item) => (
    <RadicalCard
      key={item.id}
      item={item}
      hideDetails={effectiveHide}
      status={radicalFamiliarity[item.id]}
      onOpen={openRadicalCard}
      onOpenDetail={openRadicalDetail}
      onSetStatus={setRadicalStatus}
      showMenu={openMenuId === item.id}
      onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
      onHover={handleHoverRadical}
      hotkeySinkRef={hotkeySinkRef}
    />
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
                  />
                </div>
              ))}
            </div>
          ) : (
            <VirtualGrid items={ordered} renderItem={renderCard} />
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
                  <VirtualGrid items={grouped[status]} renderItem={renderRadicalCard} />
                </div>
              ))}
            </div>
          ) : (
            <VirtualGrid items={ordered} renderItem={renderRadicalCard} />
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
        <div className="header-actions">
          <div
            className="header-search"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchOpen(false)
              }
              if (event.key === 'Enter' && searchResults.length > 0) {
                openKanjiDetail(searchResults[0])
                setSearchOpen(false)
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
                {searchResults.length === 0 ? (
                  <div className="header-search-empty">No matches</div>
                ) : (
                  searchResults.slice(0, 30).map(({ item, displayMeaning }) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        openKanjiDetail(item)
                        setSearchOpen(false)
                      }}
                    >
                      <span className="search-kanji">{item.kanji}</span>
                      <span className="search-meaning">{displayMeaning}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={toggleGlobalHide}>{globalHide ? 'Unhide' : 'Hide'}</button>
          <button onClick={() => setDecolor((prev) => !prev)}>
            {decolor ? 'Colors On' : 'Colors Off'}
          </button>
          <button onClick={() => setGlobalQuizOpen(true)}>Global Quiz</button>
          <button onClick={resetToDefault}>Reset to Default</button>
          <button onClick={exportData}>Export</button>
          <label className="import-button">
            Import
            <input type="file" accept="application/json" onChange={importData} />
          </label>
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
                </div>
              </div>
              {'missingToken' in detailKanji ? (
                <div className="empty-state">Kanji not found: {detailKanji.missingToken}</div>
              ) : (
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
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title-row">
                      <div className="kanji-detail-title">Mnemonics</div>
                      <button
                        type="button"
                        className="kanji-detail-toggle"
                        onClick={() => {
                          if (!canPersistEdits) return
                          setUi((prev) => ({
                            ...prev,
                            detailMnemonicsOpen: !(prev.detailMnemonicsOpen !== false),
                          }))
                        }}
                        disabled={!canPersistEdits}
                        title={
                          canPersistEdits
                            ? 'Toggle mnemonics visibility'
                            : 'Read-only tab: use Take Over or unlock storage to persist'
                        }
                      >
                        {ui.detailMnemonicsOpen === false ? 'Show' : 'Hide'}
                      </button>
                    </div>
                    {ui.detailMnemonicsOpen === false ? null : (
                      <>
                        <div className="kanji-detail-mnemonic-block">
                          <div className="kanji-detail-subtitle">Meaning mnemonic</div>
                          <div className="kanji-detail-text">
                            <MnemonicText text={detailKanji.meaningMnemonic} />
                          </div>
                        </div>
                        <div className="kanji-detail-mnemonic-block">
                          <div className="kanji-detail-subtitle">Reading mnemonic</div>
                          <div className="kanji-detail-text">
                            <MnemonicText text={detailKanji.readingMnemonic} />
                          </div>
                        </div>
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
                    {ui.detailRadicalComponentsOpen === false ? null : detailKanjiRadicals.length === 0 ? (
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
                    {ui.detailVisuallySimilarOpen === false ? null : detailVisuallySimilarKanji.length === 0 ? (
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
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="kanji-detail-section">
                    <div className="kanji-detail-title">Readings</div>
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
                  </div>
                  {detailKanji.strokeImg && (
                    <div className="kanji-detail-section">
                      <div className="kanji-detail-title">Stroke order</div>
                      <div className="kanji-detail-stroke">
                        <img
                          src={`${import.meta.env.BASE_URL}strokes_media/${detailKanji.strokeImg}`}
                          alt="Stroke order"
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
                              hotkeySinkRef?.current?.focus?.()
                            }}
                            onMouseDown={(event) => {
                              updateHoveredVocab(entry.id, event.currentTarget)
                            }}
                            onPointerEnter={(event) => {
                              updateHoveredVocab(entry.id, event.currentTarget)
                              hotkeySinkRef?.current?.focus?.()
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
                                className="kanji-vocab-word"
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
                  <span
                    className={`kanji-detail-status-dot ${STATUS_CLASS[
                      familiarity[detailKanji.id] || STATUS.UNMARKED
                    ]}`}
                    title={`Status: ${
                      STATUS_LABELS[familiarity[detailKanji.id] || STATUS.UNMARKED] || 'Unmarked'
                    }`}
                    aria-label="Kanji familiarity status"
                  />
                  <span className="kanji-detail-level-number" aria-label="Kanji level">
                    Lv {detailKanji.level}
                  </span>
                </div>
              )}
            </section>
          </div>
        ) : null}
        {detailRadical ? (
          <div className="page detail-page">
            <section className="content kanji-detail radical-detail">
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
                    <div className="kanji-detail-title">Related kanji</div>
                    {detailRadicalRelatedKanji.length === 0 ? (
                      <div className="kanji-detail-text">No related kanji found.</div>
                    ) : (
                      <div className="radical-related-grid">
                        <VirtualGrid items={detailRadicalRelatedKanji} renderItem={renderCard} />
                      </div>
                    )}
                  </div>
                  <span
                    className={`kanji-detail-status-dot ${STATUS_CLASS[
                      radicalFamiliarity[detailRadical.id] || STATUS.UNMARKED
                    ]}`}
                    title={`Status: ${
                      STATUS_LABELS[radicalFamiliarity[detailRadical.id] || STATUS.UNMARKED] ||
                      'Unmarked'
                    }`}
                    aria-label="Radical familiarity status"
                  />
                  <span className="kanji-detail-level-number" aria-label="Radical level">
                    Lv {detailRadical.level}
                  </span>
                </div>
              )}
            </section>
          </div>
        ) : null}
        {!detailKanji && !detailRadical && ui.page === 'levels' && (
          <div
            className="page layout levels-page"
            style={{ '--sidebar-width': `${ui.sidebarWidth || 220}px` }}
          >
            <aside className="sidebar">
              <div className="sidebar-title">Levels</div>
              {levels.map((level) => (
                <button
                  key={level}
                  className={level === selectedLevel ? 'active' : ''}
                  onClick={() => selectLevel(level)}
                >
                  Level {level}
                </button>
              ))}
            </aside>
            <div
              className="sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault()
                const startX = event.clientX
                const startWidth = ui.sidebarWidth || 220
                const onMove = (moveEvent) => {
                  const next = Math.max(180, Math.min(360, startWidth + (moveEvent.clientX - startX)))
                  setUi((prev) => ({ ...prev, sidebarWidth: next }))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
            <section className="content">
              <>
                <div className="level-header">
                  <div>
                    <h1>Level {selectedLevel}</h1>
                    <div className="level-counts">
                      <span className="count-total">Total: {levelItems.length}</span>
                      <div className="count-badges">
                        <span className="count-badge status-needs">
                          {levelCounts[STATUS.NEEDS]}
                        </span>
                        <span className="count-badge status-lukewarm">
                          {levelCounts[STATUS.LUKEWARM]}
                        </span>
                        <span className="count-badge status-comfortable">
                          {levelCounts[STATUS.COMFORTABLE]}
                        </span>
                        <span className="count-badge status-default">
                          {levelCounts[STATUS.UNMARKED]}
                        </span>
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
                <div className="grid-wrapper">
                  {mode === 'familiarity' ? (
                    <div className="familiarity-split">
                      {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                        <div key={status} className="split-section">
                          <VirtualGrid
                            items={groupedByFamiliarity[status]}
                            renderItem={(item) => renderFamiliarityCard(item, 'level')}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <VirtualGrid items={orderedItems} renderItem={renderCard} />
                  )}
                </div>
              </>
            </section>
          </div>
        )}

        {!detailKanji && !detailRadical && ui.page === 'radicals' && (
          <div
            className="page layout levels-page radicals-page"
            style={{ '--sidebar-width': `${ui.sidebarWidth || 220}px` }}
          >
            <aside className="sidebar">
              <div className="sidebar-title">Radicals</div>
              {radicalLevels.map((level) => (
                <button
                  key={level}
                  className={level === selectedRadicalLevel ? 'active' : ''}
                  onClick={() => selectRadicalLevel(level)}
                >
                  Level {level}
                </button>
              ))}
            </aside>
            <div
              className="sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault()
                const startX = event.clientX
                const startWidth = ui.sidebarWidth || 220
                const onMove = (moveEvent) => {
                  const next = Math.max(180, Math.min(360, startWidth + (moveEvent.clientX - startX)))
                  setUi((prev) => ({ ...prev, sidebarWidth: next }))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
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
              <div className="grid-wrapper">
                {radicalMode === 'familiarity' ? (
                  <div className="familiarity-split">
                    {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                      <div key={status} className="split-section">
                        <VirtualGrid
                          items={groupedRadicalsByFamiliarity[status]}
                          renderItem={renderRadicalCard}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <VirtualGrid items={orderedRadicalItems} renderItem={renderRadicalCard} />
                )}
              </div>
            </section>
          </div>
        )}

        {!detailKanji && !detailRadical && ui.page === 'groups' && (
          <div className="page layout" style={{ '--sidebar-width': `${ui.sidebarWidth || 220}px` }}>
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
            <div
              className="sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault()
                const startX = event.clientX
                const startWidth = ui.sidebarWidth || 220
                const onMove = (moveEvent) => {
                  const next = Math.max(180, Math.min(360, startWidth + (moveEvent.clientX - startX)))
                  setUi((prev) => ({ ...prev, sidebarWidth: next }))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
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
                      <div key={category} className="group-preview">
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
                                items={group.kanjiIds
                                  .map((id) => kanjiList.find((kanji) => kanji.id === id))
                                  .filter(Boolean)}
                                renderItem={renderCard}
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
                    {selectedGroup.kanjiIds.map((id) => {
                      const item = kanjiList.find((kanji) => kanji.id === id)
                      if (!item) return null
                      return (
                        <div
                          key={id}
                          className="group-item group-card"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', String(id))
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setDragOverId(id)
                          }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={(event) => {
                            const fromId = Number(event.dataTransfer.getData('text/plain'))
                            moveGroupItem(fromId, id)
                            setDragOverId(null)
                          }}
                          data-drag-over={dragOverId === id}
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
                          <button onClick={() => removeGroupItem(id)}>Remove</button>
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
                              return <VirtualGrid items={allItems} renderItem={renderCard} />
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
          <div className="page layout" style={{ '--sidebar-width': `${ui.sidebarWidth || 220}px` }}>
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
            <div
              className="sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault()
                const startX = event.clientX
                const startWidth = ui.sidebarWidth || 220
                const onMove = (moveEvent) => {
                  const next = Math.max(180, Math.min(360, startWidth + (moveEvent.clientX - startX)))
                  setUi((prev) => ({ ...prev, sidebarWidth: next }))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
            <section className="content">
              <div className="familiarity-page">
                {STATUS_ORDER_WITH_UNMARKED.map((status) => (
                  <div
                    key={status}
                    id={`familiarity-${status}`}
                    className={`familiarity-block ${STATUS_CLASS[status]}`}
                  >
                    <div className="familiarity-title">{STATUS_LABELS[status]}</div>
                    <div className="grid-wrapper">
                      <VirtualGrid
                        items={familiarityGroupsAll[status]}
                        renderItem={(item) =>
                          familiarityView === 'radical'
                            ? renderRadicalCard(item)
                            : renderFamiliarityCard(item, 'global')
                        }
                      />
                    </div>
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
                <strong>Level nav:</strong> ← / →
              </div>
              <div>
                <strong>Kanji status (hovered):</strong> 1 ={' '}
                <span className="shortcut-pill needs">Needs Work</span>, 2 ={' '}
                <span className="shortcut-pill lukewarm">Lukewarm</span>, 3 ={' '}
                <span className="shortcut-pill comfortable">Comfortable</span>, 4 ={' '}
                <span className="shortcut-pill clear">Clear</span>
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
