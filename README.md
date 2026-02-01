# Kanji Organizer

A React app for organizing and self‑studying kanji by level. Data is sourced from a CSV file and persisted locally with export/import support.

## Current Feature Set
### Levels Page
- **Level sidebar (1–60)** with selected level highlight and **resizable width**.
- **Level header** shows total count and familiarity breakdown as **colored pills** (needs/lukewarm/comfortable/unmarked).
- **Kanji grid** with cards (primary meaning, O/K readings) and hover details.
- **Controls**: Quiz, Shuffle, Sort Alphabetically (toggle), Sort by Familiarity (toggle), plus global Hide/Unhide in the header.
- **Default order** reshuffles every time you visit a level (no blink).
- **Familiarity split**: needs work → lukewarm → comfortable → unmarked sections.
- **Keyboard**: Left/Right arrows switch levels (when not typing in inputs; default scroll is prevented).
- **Shift‑drag reorder** within familiarity split sections (per‑level order preserved).

### Familiarity Page
- Groups all kanji by status (including **Unmarked**).
- **Levels filter** using range syntax (e.g., `1...3, 5`).
- **Live counts** for total and each status (colored pills).
- **Clickable pills** to jump to each section.
- **Shift‑drag reorder** within familiarity sections (separate, global ordering).

### Groups Page
- **Left sidebar** with non‑reorderable **All Groups** at the top and drag‑reorderable group list below.
- **All Groups view** shows every group stacked with its kanji cards.
- **Group editor**:
  - Editable group title
  - Grid of group items
  - “+” add tile opens a **modal search** (search by meaning, shows kanji)
  - Remove items and delete group
- **Drag‑and‑drop** reorder within a group and reorder groups in the sidebar.

### Quiz
- **Per‑level quiz** and **Global quiz** (level range + familiarity filter).
- **Reveal answer** button.
- **Lightning mode**: correct answers advance immediately; incorrect answers always reveal.
- **Prev/Next** navigation.
- **Summary** at end: percent correct + missed/correct lists.
- **Skip counts as incorrect** (Next without answering).

## Kanji Card Details
- **Click card**: opens source URL in new tab.
- **3‑dot menu** (hover) to set familiarity.
- **Keyboard shortcuts** while hovering a card:
  - `1` → Needs Work
  - `2` → Lukewarm
  - `3` → Comfortable
  - `4` → Clear
- **Hover modal** shows:
  - Primary meaning
  - Other meanings
  - Readings (O/K)
  - Stroke order image (if available)
- Hover modal auto‑aligns left/center/right to reduce clipping.

## UI & Interaction Notes
- **Default order** is reshuffled on each level visit; alphabetical sort is a toggle.
- **Hide** is global across pages (hides meanings/readings but keeps hover modal).
- **Colors Off / Colors On** toggle (temporary, not persisted) to mute familiarity colors.
- **Sticky header** with navigation tabs and global quiz launcher.
- **Sticky sidebar + resizer gutter** on the left.
- **Modals** (quiz/add/search/global quiz) trap focus and close with `Esc` or clicking outside.

## CSV Expectations
The app expects a CSV with these columns (from `wk_kanji_with_strokes-test.csv`):
- `kanji`, `primary_meaning`, `other_meanings`, `onyomi`, `kunyomi`, `url`, `wk_level`, `StrokeImg`

Notes:
- IDs are **1‑based CSV row numbers** (data rows only).
- Only **append new rows** to keep IDs stable.
- `StrokeImg` is parsed to extract the filename and load from `/public/strokes_media/`.

## Data Model (Runtime)
- `kanji`
  - `id` (number, 1‑based CSV row number)
  - `kanji`, `primaryMeaning`, `otherMeanings[]`, `onyomi`, `kunyomi`, `url`, `level`, `strokeImg`
- `familiarity` (map: `kanji_id` → `needs_work | lukewarm | comfortable`)
- `groups` (array of `{ id, name, kanjiIds[] }`)
- `ui` (persisted preferences: selected level, sort modes, lightning mode, familiarity ordering)

## Quiz Rules
- Case‑insensitive, punctuation‑trimmed compare.
- Enter submits; Left/Right arrows for prev/next.
- If the answer is revealed, Enter advances.
- Escape or click outside closes quiz modal.
- Skipped items count as incorrect.

## Export/Import
- Export downloads a timestamped JSON file.
- Import replaces local data after confirmation.
- Version field is validated; unsupported versions are ignored.

### Export/Import JSON Shape
```json
{
  "version": 1,
  "exported_at": "2026-02-01T12:34:56.000Z",
  "kanji_lookup": {
    "123": "角",
    "456": "用"
  },
  "familiarity": [
    {
      "kanji_id": 123,
      "status": "comfortable",
      "updated_at": "2026-02-01T12:00:00.000Z"
    }
  ],
  "groups": [
    {
      "id": "grp_01",
      "name": "Visually Similar",
      "kanji_ids": [123, 456],
      "created_at": "2026-02-01T12:00:00.000Z",
      "updated_at": "2026-02-01T12:05:00.000Z"
    }
  ],
  "preferences": {
    "lightning_mode": true
  }
}
```

## Running Locally
1) Install dependencies:
```bash
npm install
```
2) Start the dev server:
```bash
npm run dev
```
3) Open the URL shown in the terminal.

## Tests
Run in watch mode:
```bash
npm test
```
Run once:
```bash
npm run test:run
```
Coverage report:
```bash
npm run test:coverage
```

## Notes
- CSV source example: `wk_kanji_with_strokes-test.csv`.
- Stroke images should be placed in `public/strokes_media/`.
