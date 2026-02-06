import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
// Virtualization can be reintroduced later if needed.
import './App.css'

const STORAGE_KEY = 'kanji_organizer_v1'
const LEGACY_STORAGE_KEY = 'wk_organizer_v1'
const CSV_PATH = `${import.meta.env.BASE_URL}data/kanji.csv`
const VOCAB_CSV_PATH = `${import.meta.env.BASE_URL}data/wk_vocab.csv`

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
  selectedGroupId: null,
  modeByLevel: {},
  orderByLevel: {},
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
  rangeMode: 'normal',
}

const READING_STATUS = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
}

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) return JSON.parse(legacy)
    return null
  } catch {
    return null
  }
}

function saveStorage(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
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

function splitReadingTokens(text) {
  if (!text) return []
  return text
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
}

function shuffleArray(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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

function useLocalStorageSync(state) {
  useEffect(() => {
    if (!state) return
    saveStorage(state)
  }, [state])
}

function useKeydown(handler) {
  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}

function Modal({ isOpen, onClose, title, children }) {
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
      <div className="modal" ref={modalRef} onClick={(event) => event.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  )
}

function VirtualGrid({ items, renderItem }) {
  return <div className="simple-grid">{items.map(renderItem)}</div>
}

function ReadingTokens({ label, value, readingStatus, onToggle, className, kanjiId }) {
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
                  onToggle(kanjiId, token, event)
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
  onOpenDetailNewTab,
  onSetStatus,
  showMenu,
  onMenuToggle,
  onHover,
  readingStatus,
  onToggleReading,
  highlightedVocab,
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
      onClick={(event) => {
        if (event.metaKey) {
          event.preventDefault()
          onOpenDetailNewTab?.(item)
          return
        }
        onOpen(item)
      }}
      onMouseEnter={(event) => {
        handleMouseEnter(event)
        if (onHover) onHover(item.id)
        if (onMouseEnterExternal) onMouseEnterExternal()
      }}
      onMouseLeave={() => {
        if (onHover) onHover(null)
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
        if (event.key === 'Enter') onOpen(item)
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
          />
          <ReadingTokens
            label="K"
            value={item.kunyomi}
            readingStatus={readingStatus}
            onToggle={onToggleReading}
            className="reading-line"
            kanjiId={item.id}
          />
        </div>
      )}
      {hoverReady &&
        (item.otherMeanings?.length > 0 || item.onyomi || item.kunyomi || item.strokeImg) && (
          <div className="hover-card" data-align={hoverAlign}>
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
            />
          </div>
          {highlightedVocab?.length > 0 && (
            <div className="hover-vocab">
              <div className="hover-title hover-vocab-title">Highlighted vocab</div>
              <div className="hover-vocab-list">
                {highlightedVocab.map((vocab) => (
                  <div key={vocab.id} className="hover-vocab-item">
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
          {highlightedVocab?.length > 0 && item.strokeImg && <div className="hover-divider" />}
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
        </div>
      )}
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
  const [loading, setLoading] = useState(true)
  const [familiarity, setFamiliarity] = useState({})
  const [readingStatusByKanji, setReadingStatusByKanji] = useState({})
  const [groups, setGroups] = useState([])
  const [vocabList, setVocabList] = useState([])
  const [highlightedVocabByKanji, setHighlightedVocabByKanji] = useState({})
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [familiarityLevelFilter, setFamiliarityLevelFilter] = useState('')
  const [deletedGroup, setDeletedGroup] = useState(null)
  const [groupAddOpen, setGroupAddOpen] = useState(false)
  const [detailKanji, setDetailKanji] = useState(null)
  const [hoveredVocabId, setHoveredVocabId] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverGroupId, setDragOverGroupId] = useState(null)
  const [hoveredCardId, setHoveredCardId] = useState(null)
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

  useEffect(() => {
    let active = true
    const hydrateFromPayload = (stored) => {
      setFamiliarity(stored.familiarity || {})
      setReadingStatusByKanji(stored.readingStatusByKanji || {})
      setGroups(stored.groups || [])
      setHighlightedVocabByKanji(stored.highlightedVocabByKanji || {})
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
          url: row.url,
          level: Number(row.wk_level),
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

  useLocalStorageSync(
    hydrated ? { familiarity, readingStatusByKanji, groups, ui, highlightedVocabByKanji } : null
  )

  useEffect(() => {
    setOpenMenuId(null)
  }, [ui.page, ui.selectedLevel])

  const levels = useMemo(() => {
    const levelSet = new Set(kanjiList.map((item) => item.level))
    return [...levelSet].sort((a, b) => a - b)
  }, [kanjiList])

  const rangeLevels = ui.rangeLevels || ''
  const rangeLevelsList = useMemo(() => {
    if (!rangeLevels.trim()) return []
    return parseLevelsInput(rangeLevels)
  }, [rangeLevels])

  const familiarityOrder = useMemo(() => {
    const ids = kanjiList.map((item) => item.id)
    const existing = ui.familiarityOrder || []
    const missing = ids.filter((id) => !existing.includes(id))
    return existing.length ? [...existing, ...missing] : ids
  }, [kanjiList, ui.familiarityOrder])

  useEffect(() => {
    if (!kanjiList.length || ui.familiarityOrder) return
    setGlobalOrder(kanjiList.map((item) => item.id))
  }, [kanjiList, ui.familiarityOrder])

  const selectedLevel = ui.selectedLevel
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
  const levelItems = useMemo(() => getLevelItems(selectedLevel), [getLevelItems, selectedLevel])

  useLayoutEffect(() => {
    if (levelItems.length === 0) return
    setUi((prev) => {
      const existingOrder = prev.orderByLevel[selectedLevel]
      const ids = levelItems.map((item) => item.id)
      const missing = existingOrder ? ids.filter((id) => !existingOrder.includes(id)) : ids
      if (existingOrder && missing.length === 0) return prev
      const shuffled = shuffleArray(ids)
      levelShuffleRef.current = {
        level: selectedLevel,
        signature: ids.join(','),
        order: shuffled,
      }
      return {
        ...prev,
        orderByLevel: { ...prev.orderByLevel, [selectedLevel]: shuffled },
        modeByLevel: { ...prev.modeByLevel, [selectedLevel]: 'normal' },
      }
    })
  }, [levelItems, selectedLevel])

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

  const selectLevel = useCallback(
    (level) => {
      if (level === selectedLevel) return
      const items = getLevelItems(level)
      const ids = items.map((item) => item.id)
      const shuffled = ids.length ? shuffleArray(ids) : []
      levelShuffleRef.current = {
        level,
        signature: ids.join(','),
        order: shuffled,
      }
      setUi((prev) => ({
        ...prev,
        selectedLevel: level,
        orderByLevel: shuffled.length
          ? { ...prev.orderByLevel, [level]: shuffled }
          : prev.orderByLevel,
        modeByLevel: { ...prev.modeByLevel, [level]: 'normal' },
      }))
    },
    [getLevelItems, selectedLevel]
  )

  useEffect(() => {
    const handler = (event) => {
      if (ui.page !== 'levels') return
      if (quizOpen || globalQuizOpen || groupAddOpen) return
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const idx = levels.indexOf(selectedLevel)
        const next = levels[idx + 1]
        if (next) selectLevel(next)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const idx = levels.indexOf(selectedLevel)
        const prevLevel = levels[idx - 1]
        if (prevLevel) selectLevel(prevLevel)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [levels, selectedLevel, ui.page, quizOpen, globalQuizOpen, groupAddOpen, selectLevel])

  useEffect(() => {
    const handler = (event) => {
      if (!hoveredCardId) return
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === '1') setStatus(hoveredCardId, STATUS.NEEDS)
      if (event.key === '2') setStatus(hoveredCardId, STATUS.LUKEWARM)
      if (event.key === '3') setStatus(hoveredCardId, STATUS.COMFORTABLE)
      if (event.key === '4') setStatus(hoveredCardId, null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hoveredCardId])

  const toggleVocabHighlight = useCallback((kanjiChar, vocabId) => {
    setHighlightedVocabByKanji((prev) => {
      const existing = new Set(prev[kanjiChar] || [])
      if (existing.has(vocabId)) {
        existing.delete(vocabId)
      } else {
        existing.add(vocabId)
      }
      return { ...prev, [kanjiChar]: [...existing] }
    })
  }, [])

  useEffect(() => {
    const handler = (event) => {
      if (!detailKanji || !hoveredVocabId) return
      if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (event.key === '3') toggleVocabHighlight(detailKanji.kanji, hoveredVocabId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detailKanji, hoveredVocabId, highlightedVocabByKanji, toggleVocabHighlight])

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
      if (!order || order.length === 0) return ids
      const missing = ids.filter((id) => !order.includes(id))
      return [...order, ...missing]
    },
    [getLevelItems, ui.orderByLevel]
  )

  const currentOrder = getCurrentOrderForLevel(selectedLevel)
  const orderedItems = useMemo(() => {
    const map = new Map(levelItems.map((item) => [item.id, item]))
    return currentOrder.map((id) => map.get(id)).filter(Boolean)
  }, [currentOrder, levelItems])

  const mode = ui.modeByLevel[selectedLevel] || 'normal'
  const effectiveHide = globalHide

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

  const setOrderForLevel = (level, order) => {
    setUi((prev) => ({
      ...prev,
      orderByLevel: { ...prev.orderByLevel, [level]: order },
    }))
  }

  const setGlobalOrder = (order) => {
    setUi((prev) => ({ ...prev, familiarityOrder: order }))
  }

  const toggleReadingStatus = useCallback((kanjiId, token, event) => {
    const key = normalizeReadingToken(token)
    if (!key) return
    if (event?.shiftKey) return
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
  }, [])

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
      const nextOrder = currentOrder.map((id) =>
        statusSet.has(id) ? statusIds[pointer++] : id
      )
      setOrderForLevel(selectedLevel, nextOrder)
    },
    [orderedItems, familiarity, currentOrder, selectedLevel]
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
    [ui.familiarityOrder, kanjiList, familiarity]
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

  const setPrevForLevel = (level, payload) => {
    setUi((prev) => ({
      ...prev,
      prevByLevel: { ...prev.prevByLevel, [level]: payload },
    }))
  }

  const toggleAlpha = () => {
    if (mode === 'alpha') {
      const prev = ui.prevByLevel[selectedLevel]
      if (prev) {
        setOrderForLevel(selectedLevel, prev.order)
        setModeForLevel(selectedLevel, prev.mode)
      } else {
        setModeForLevel(selectedLevel, 'normal')
      }
      return
    }
    setPrevForLevel(selectedLevel, { order: currentOrder, mode })
    const sorted = [...orderedItems].sort((a, b) =>
      a.primaryMeaning.localeCompare(b.primaryMeaning)
    )
    setOrderForLevel(
      selectedLevel,
      sorted.map((item) => item.id)
    )
    setModeForLevel(selectedLevel, 'alpha')
  }

  const toggleFamiliarity = () => {
    if (mode === 'familiarity') {
      const prev = ui.prevByLevel[selectedLevel]
      if (prev) {
        setOrderForLevel(selectedLevel, prev.order)
        setModeForLevel(selectedLevel, prev.mode)
      } else {
        setModeForLevel(selectedLevel, 'normal')
      }
      return
    }
    setPrevForLevel(selectedLevel, { order: currentOrder, mode })
    setModeForLevel(selectedLevel, 'familiarity')
  }

  const shuffleLevel = () => {
    const next = shuffleArray(currentOrder)
    setOrderForLevel(selectedLevel, next)
    setModeForLevel(selectedLevel, 'normal')
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
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : levels
    if (ui.rangeMode === 'alpha') {
      levelsToUse.forEach((level) => {
        const prev = ui.prevByLevel[level]
        if (prev) {
          setOrderForLevel(level, prev.order)
          setModeForLevel(level, prev.mode)
        } else {
          setModeForLevel(level, 'normal')
        }
      })
      setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
      return
    }
    levelsToUse.forEach((level) => {
      const items = getLevelItems(level)
      if (items.length === 0) return
      const current = getCurrentOrderForLevel(level)
      setPrevForLevel(level, { order: current, mode: ui.modeByLevel[level] || 'normal' })
      const sorted = [...items].sort((a, b) => a.primaryMeaning.localeCompare(b.primaryMeaning))
      setOrderForLevel(level, sorted.map((item) => item.id))
      setModeForLevel(level, 'alpha')
    })
    setUi((prev) => ({ ...prev, rangeMode: 'alpha' }))
  }

  const toggleRangeFamiliarity = () => {
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : levels
    if (ui.rangeMode === 'familiarity') {
      levelsToUse.forEach((level) => {
        const prev = ui.prevByLevel[level]
        if (prev) {
          setOrderForLevel(level, prev.order)
          setModeForLevel(level, prev.mode)
        } else {
          setModeForLevel(level, 'normal')
        }
      })
      setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
      return
    }
    levelsToUse.forEach((level) => {
      const current = getCurrentOrderForLevel(level)
      setPrevForLevel(level, { order: current, mode: ui.modeByLevel[level] || 'normal' })
      setModeForLevel(level, 'familiarity')
    })
    setUi((prev) => ({ ...prev, rangeMode: 'familiarity' }))
  }

  const shuffleRange = () => {
    const levelsToUse = rangeLevelsList.length ? rangeLevelsList : levels
    levelsToUse.forEach((level) => {
      const current = getCurrentOrderForLevel(level)
      setOrderForLevel(level, shuffleArray(current))
      setModeForLevel(level, 'normal')
    })
    setUi((prev) => ({ ...prev, rangeMode: 'normal' }))
  }

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

  const setStatus = (id, status) => {
    setFamiliarity((prev) => ({
      ...prev,
      [id]: status || undefined,
    }))
    setOpenMenuId(null)
  }

  const openCard = (item) => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  const openKanjiDetail = (item) => {
    if (!item) return
    const token = encodeURIComponent(item.kanji)
    const base = import.meta.env.BASE_URL || '/'
    window.history.pushState({}, '', `${base}#/kanji/${token}`)
    setDetailKanji(item)
  }

  const closeKanjiDetail = () => {
    const base = import.meta.env.BASE_URL || '/'
    window.history.pushState({}, '', base)
    setDetailKanji(null)
  }

  const openKanjiDetailNewTab = (item) => {
    if (!item) return
    const base = import.meta.env.BASE_URL || '/'
    const token = encodeURIComponent(item.kanji)
    const url = `${window.location.origin}${base}#/kanji/${token}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }


  const getRouteToken = () => {
    if (typeof window === 'undefined') return null
    const hash = window.location.hash || ''
    if (hash.startsWith('#/kanji/')) {
      return decodeURIComponent(hash.replace('#/kanji/', ''))
    }
    const base = import.meta.env.BASE_URL || '/'
    const rawPath = window.location.pathname || ''
    const relative = rawPath.startsWith(base) ? rawPath.slice(base.length) : rawPath
    if (relative.startsWith('kanji/')) {
      return decodeURIComponent(relative.replace('kanji/', ''))
    }
    return null
  }

  const findKanjiByToken = (token) => {
    if (!token) return null
    const numeric = Number(token)
    if (Number.isFinite(numeric)) {
      return kanjiList.find((item) => item.id === numeric) || null
    }
    return kanjiList.find((item) => item.kanji === token) || null
  }

  useEffect(() => {
    const syncFromRoute = () => {
      const token = getRouteToken()
      if (!token) {
        setDetailKanji(null)
        return
      }
      const match = findKanjiByToken(token)
      setDetailKanji(match || { missingToken: token })
    }
    syncFromRoute()
    window.addEventListener('hashchange', syncFromRoute)
    window.addEventListener('popstate', syncFromRoute)
    return () => {
      window.removeEventListener('hashchange', syncFromRoute)
      window.removeEventListener('popstate', syncFromRoute)
    }
  }, [kanjiList])

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

  const vocabById = useMemo(() => {
    const map = new Map()
    vocabList.forEach((entry) => {
      map.set(entry.id, entry)
    })
    return map
  }, [vocabList])

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

  const detailVocabEntries = detailKanji ? vocabByKanji.get(detailKanji.kanji) || [] : []
  const detailHighlightedIds = useMemo(
    () => new Set(highlightedVocabByKanji[detailKanji?.kanji] || []),
    [highlightedVocabByKanji, detailKanji]
  )

  const getHighlightedVocab = useCallback(
    (kanjiChar) => {
      const ids = highlightedVocabByKanji[kanjiChar] || []
      return ids.map((id) => vocabById.get(id)).filter(Boolean)
    },
    [highlightedVocabByKanji, vocabById]
  )

  const familiarityGroupsAll = useMemo(() => {
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
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        category: group.category || 'Miscellaneous',
        kanji_ids: group.kanjiIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      highlighted_vocab_by_kanji: highlightedVocabByKanji,
      reading_status_by_kanji: readingStatusByKanji,
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
        setFamiliarity(nextFamiliarity)
        setReadingStatusByKanji(parsed.reading_status_by_kanji || {})
        setGroups(
          (parsed.groups || []).map((group) => ({
            id: group.id,
            name: group.name,
            category: group.category || 'Miscellaneous',
            kanjiIds: group.kanji_ids || [],
          }))
        )
        setHighlightedVocabByKanji(parsed.highlighted_vocab_by_kanji || {})
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

  const renderCard = (item) => (
    <KanjiCard
      key={item.id}
      item={item}
      hideDetails={effectiveHide}
      status={familiarity[item.id]}
      onOpen={openCard}
      onOpenDetail={openKanjiDetail}
      onOpenDetailNewTab={openKanjiDetailNewTab}
      onSetStatus={setStatus}
      showMenu={openMenuId === item.id}
      onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
      onHover={setHoveredCardId}
      readingStatus={readingStatusByKanji[item.id] || {}}
      onToggleReading={toggleReadingStatus}
      highlightedVocab={getHighlightedVocab(item.kanji)}
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
        onOpenDetailNewTab={openKanjiDetailNewTab}
        onSetStatus={setStatus}
        showMenu={openMenuId === item.id}
        onMenuToggle={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
        onHover={setHoveredCardId}
        readingStatus={readingStatusByKanji[item.id] || {}}
        onToggleReading={toggleReadingStatus}
        highlightedVocab={getHighlightedVocab(item.kanji)}
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
            className={ui.page === 'range' ? 'active' : ''}
            onClick={() => {
              closeKanjiDetail()
              setUi((prev) => ({ ...prev, page: 'range' }))
            }}
          >
            Range
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
        </div>
      </header>

      <main className="app-main">
        {detailKanji ? (
          <div className="page detail-page">
            <section className="content kanji-detail">
              <button className="kanji-detail-back" onClick={closeKanjiDetail}>
                Back
              </button>
              {'missingToken' in detailKanji ? (
                <div className="empty-state">Kanji not found: {detailKanji.missingToken}</div>
              ) : (
                <div className="kanji-detail-card">
                  <div className="kanji-detail-header">
                    <div className="kanji-detail-kanji">{detailKanji.kanji}</div>
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
                    <div className="kanji-detail-title">Readings</div>
                    <ReadingTokens
                      label="O"
                      value={detailKanji.onyomi}
                      readingStatus={readingStatusByKanji[detailKanji.id] || {}}
                      onToggle={toggleReadingStatus}
                      className="reading-line"
                      kanjiId={detailKanji.id}
                    />
                    <ReadingTokens
                      label="K"
                      value={detailKanji.kunyomi}
                      readingStatus={readingStatusByKanji[detailKanji.id] || {}}
                      onToggle={toggleReadingStatus}
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
                    {detailVocabEntries.length === 0 ? (
                      <div className="kanji-detail-text">No vocab found.</div>
                    ) : (
                      <div className="kanji-vocab-list">
                        {detailVocabEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className={`kanji-vocab-item ${
                              detailHighlightedIds.has(entry.id) ? 'is-highlighted' : ''
                            }`}
                            onMouseEnter={() => setHoveredVocabId(entry.id)}
                            onMouseLeave={() => setHoveredVocabId(null)}
                          >
                            <div className="kanji-vocab-main">
                              <a
                                className="kanji-vocab-word"
                                href={entry.url}
                                target="_blank"
                                rel="noreferrer"
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
                            <button
                              type="button"
                              className="kanji-vocab-highlight"
                              onClick={() =>
                                toggleVocabHighlight(detailKanji.kanji, entry.id)
                              }
                            >
                              {detailHighlightedIds.has(entry.id) ? 'Unhighlight' : 'Highlight'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
        {!detailKanji && ui.page === 'levels' && (
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

        {!detailKanji && ui.page === 'groups' && (
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

        {!detailKanji && ui.page === 'range' && (
          <div className="page range-page">
            <section className="content">
              <div className="range-controls">
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
                {rangeLevelsList.map((level) => {
                  const items = getLevelItems(level)
                  if (items.length === 0) return null
                  const counts = getCountsForLevel(items)
                  const ordered = getOrderedItemsForLevel(level)
                  const levelMode = ui.rangeMode === 'familiarity' ? 'familiarity' : 'normal'
                  return (
                    <div key={level} className="range-section">
                      <div className="level-header">
                        <div>
                          <h1>Level {level}</h1>
                          <div className="level-counts">
                            <span className="count-total">Total: {items.length}</span>
                            <div className="count-badges">
                              <span className="count-badge status-needs">
                                {counts[STATUS.NEEDS]}
                              </span>
                              <span className="count-badge status-lukewarm">
                                {counts[STATUS.LUKEWARM]}
                              </span>
                              <span className="count-badge status-comfortable">
                                {counts[STATUS.COMFORTABLE]}
                              </span>
                              <span className="count-badge status-default">
                                {counts[STATUS.UNMARKED]}
                              </span>
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
                })}
              </div>
            </section>
          </div>
        )}

        {!detailKanji && ui.page === 'familiarity' && (
          <div className="page layout" style={{ '--sidebar-width': `${ui.sidebarWidth || 220}px` }}>
            <aside className="sidebar">
              <div className="sidebar-title">Familiarity</div>
              <div className="sidebar-note">All kanji by status</div>
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
                        renderItem={(item) => renderFamiliarityCard(item, 'global')}
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
