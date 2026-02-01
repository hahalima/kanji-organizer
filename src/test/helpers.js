import { afterEach, beforeEach, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

const sampleCsv = `wk_subject_id,kanji,primary_meaning,other_meanings,onyomi,kunyomi,nanori,radical_subject_ids,visually_similar_subject_ids,visually_similar_kanji,meaning_mnemonic,reading_mnemonic,url,wk_level,srs_stage,StrokeImg
1,一,One,1,いち,ひと,,, ,,, ,https://example.com/1,1,,<img src="jisho_strokes_04E00.png">
2,二,Two,2,に,ふた,,, ,,, ,https://example.com/2,1,,<img src="jisho_strokes_04E01.png">
3,三,Three,3,さん,み,,, ,,, ,https://example.com/3,2,,<img src="jisho_strokes_04E02.png">`

function mockFetchCsv() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ text: () => Promise.resolve(sampleCsv) })))
}

function mockOpen() {
  vi.stubGlobal('open', vi.fn())
}

beforeEach(() => {
  localStorage.clear()
  mockFetchCsv()
  mockOpen()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function waitForLoaded(screen) {
  await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
}

export { waitForLoaded }
