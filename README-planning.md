# Kanji Organizer

A React app for organizing and self-studying kanji by level, with quick sorting, familiarity tagging, and focused quiz flow. Data is sourced from a CSV file.

## Main Features
- Levels view (1–60) with a grid of kanji cards per level and level summary counts (total + familiarity breakdown like `green/pink/orange`).
- Kanji card shows: primary meaning, O (onyomi), K (kunyomi).
- Clicking a kanji card opens its source URL (from CSV) in a new tab.
- Familiarity color states: light green (comfortable), light pink (needs work), light orange (lukewarm).
- Default kanji card background is light red until a familiarity is set.
- Card controls: a 3-dot menu appears on hover in the top-right of each card for setting familiarity (prevents accidental toggles when opening the URL).
- Card width uses a uniform grid with a minimum width; long meanings can expand within a max width, and text truncates with ellipsis with full reveal on hover.
- Kanji character is placed at the top of the card with a large, readable size.
- Hover card shows additional details like other meanings.
- Shuffle items within a level or sort A–Z by meaning.
- Hide toggle: show only the kanji character (hide meanings/readings) for the current level view; toggling returns to previous view state.
- Sort Alphabetically toggle: clicking again restores the previous ordering.
- Familiarity layout button: split the level into three color-based grids/rows in order (needs work → lukewarm → comfortable), no text labels; clicking again restores the previous ordering.
- Quiz mode with:
  - meaning input check
  - Prev/Next navigation for already seen items
  - Reveal Answer button
  - Lightning toggle: when ON, correct answers advance immediately without reveal; incorrect answers always reveal before advancing.
- Global quiz launcher: open a prompt to quiz by level range (e.g., `1...3, 5`) or by familiarity selection.
- Groups view for user-created clusters of visually similar or custom groupings.
- Group editor: editable heading/title at top, grid of group items below; last grid tile is a "+" button that opens a modal search/add panel (search by meaning and show kanji) to add items; remove items, delete group with undo.
  - Add/search modal traps focus while open.
- Familiarity view showing all kanji grouped by familiarity color.
- Local persistence of familiarity states and groups (initially via local storage).
- Export/import JSON for backing up and restoring local data.
- Persist UI state (selected level, hide toggle, familiarity split, last sort) in local storage.

## User Stories (MVP)
- As a learner, I can choose a level from 1–60 so I can focus on a specific set of kanji.
- As a learner, I can see a grid of kanji cards for a level so I can review them at a glance.
- As a learner, I can read the primary meaning plus O/K readings on each card so I can study efficiently.
- As a learner, I can mark familiarity (green/pink/orange) so I can track progress.
- As a learner, I can shuffle or sort A–Z by meaning so I can vary study order.
- As a learner, I can hide/show readings and meanings so I can self-test quickly.
- As a learner, I can toggle alphabetical sorting on/off and return to my prior ordering.
- As a learner, I can toggle familiarity layout on/off and return to my prior ordering.
- As a learner, I can view a level split into three familiarity sections so I can prioritize weak items.
- As a learner, I can start a quiz for a level so I can test recall.
- As a learner, I can reveal the answer before moving on so I can confirm my guess.
- As a learner, I can enable Lightning mode so correct answers advance immediately, but wrong answers still reveal.
- As a learner, I can navigate prev/next in the quiz so I can review what I already saw.
- As a learner, I can launch a quiz across a custom level range (e.g., `1...3, 5`) so I can study multiple levels at once.
- As a learner, I can launch a quiz filtered by familiarity so I can target specific statuses.
- As a learner, I can create custom groups so I can study visually similar kanji together.
- As a learner, I can search and add kanji to a group so I can build sets quickly.
- As a learner, I can remove kanji or delete a group (with undo) so I can manage my sets safely.
- As a learner, I can browse all kanji by familiarity color so I can target weak areas.
- As a learner, I can export and import my data so I can back up or move to another device.

## Nice-to-Haves (Post-MVP)
- Filters by familiarity state within a level.
- Quiz stats per level (accuracy, streaks).
- Multi-answer validation (accept synonyms or alternate meanings).
- Dark/light theme toggle.

## Data Model (Draft)
- `kanji` (from CSV)
  - `id` (number, CSV row number; 1-based)
  - `character` (string)
  - `level` (number, 1–60)
  - `meaning_primary` (string)
  - `onyomi` (string)
  - `kunyomi` (string)
  - `meaning_alt` (string[] optional)
  - `source_url` (string, optional)
  - `visually_similar_kanji` (string, optional)
- `familiarity` (user state)
  - `kanji_id` (string)
  - `status` (enum: `comfortable` | `lukewarm` | `needs_work`)
  - `updated_at` (ISO string)
- `groups` (user-created)
  - `id` (string)
  - `name` (string)
  - `kanji_ids` (string[])
  - `created_at` (ISO string)
  - `updated_at` (ISO string)
- `quiz_sessions` (ephemeral)
  - `level` (number)
  - `order` (string[] of `kanji_id`)
  - `seen_index` (number)
  - `results` (map of `kanji_id` -> `correct` | `incorrect`)

## Quiz Rules
- Meaning validation is case-insensitive with trimmed spaces/punctuation (loose compare).
- Correct is determined by token match after normalization.
- Quiz order is randomized for each session.
- Keyboard flow: Enter submits, Left/Right arrows for prev/next.
- Exit quiz by pressing Escape or clicking outside the quiz modal.
- Quiz modal traps focus while open.

## Rendering
- Use virtualized rendering for large grids (target 2000+ cards).

## Data Notes
- Only append new rows to the CSV (avoid inserting in the middle) to keep row-based IDs stable.
- Empty readings display as blank.

## Pages
- Levels: list of levels (1–60) and per-level grid.
- Groups: user-created group collections and editor.
- Familiarity: all kanji grouped by familiarity color (green/pink/orange).

## Navigation
- Header with the three page links (Levels, Groups, Familiarity).
- Header is sticky while scrolling.
- Header is compact and desktop-only for MVP.
- Global quiz launcher lives in the header.

## Layout
- Levels list appears in a left sidebar (desktop).
- Groups page uses a similar left sidebar for navigating between groups.

## Export/Import JSON Shape
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
    "level_sort": "shuffle",
    "lightning_mode": true
  }
}
```

## Import/Export Rules
- Export generates a downloadable JSON file (e.g., `kanji-organizer-export-YYYYMMDD-HHMMSS.json`).
- Import requires selecting a file; use the most recent timestamped export when restoring.
- On import, validate `version`.
- Default behavior: replace current local data after confirmation.

## Notes
- CSV source example: `wk_kanji_with_strokes-test.csv`.
- Implementation is now in progress.

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

