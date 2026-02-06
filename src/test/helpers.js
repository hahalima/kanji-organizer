import { afterEach, beforeEach, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

const sampleCsv = `wk_subject_id,kanji,primary_meaning,other_meanings,onyomi,kunyomi,nanori,radical_subject_ids,visually_similar_subject_ids,visually_similar_kanji,meaning_mnemonic,reading_mnemonic,url,wk_level,srs_stage,StrokeImg
1,一,One,1,いち,ひと,,, ,,, ,https://example.com/1,1,,<img src="jisho_strokes_04E00.png">
2,二,Two,2,に,ふた,,, ,,, ,https://example.com/2,1,,<img src="jisho_strokes_04E01.png">
3,三,Three,3,さん,み,,, ,,, ,https://example.com/3,2,,<img src="jisho_strokes_04E02.png">`

const sampleVocabCsv = `wk_subject_id,subject_type,word,primary_reading,primary_meaning,other_meanings,parts_of_speech,context_sentence_ja_1,context_sentence_en_1,context_sentence_ja_2,context_sentence_en_2,context_sentence_ja_3,context_sentence_en_3,audio_url_1,meanings_json,readings_json,auxiliary_meanings_json,pronunciation_audios_json,context_sentences_json,parts_of_speech_json,component_subject_ids_json,component_subject_kanji_json,meaning_mnemonic,reading_mnemonic,slug,created_at,document_url,hidden_at,lesson_position,spaced_repetition_system_id,url,wk_level,srs_stage
2501,vocabulary,一,いち,One,1,numeral,,,,,,,,,,,,,,[440],[\"一\"],,,,,https://example.com/vocab/1,1,
2502,vocabulary,二つ,ふたつ,Two Things,2 Things,numeral,,,,,,,,,,,,,,[441],[\"二\"],,,,,https://example.com/vocab/2,1,`

function mockFetchCsv() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input) => {
      const url = typeof input === 'string' ? input : input?.url || ''
      if (url.includes('wk_vocab.csv')) {
        return Promise.resolve({ text: () => Promise.resolve(sampleVocabCsv) })
      }
      if (url.includes('kanji.csv')) {
        return Promise.resolve({ text: () => Promise.resolve(sampleCsv) })
      }
      return Promise.resolve({ text: () => Promise.resolve('{}') })
    })
  )
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
