// Makes the Sum Cross books: data/sumcross-<difficulty>.json = [puzzles, encoded]. Run once on the
// computer (node tools/make-sumcross.mjs); phones only read the files. Same seeds, same puzzles:
// seeds that don't give a full-size puzzle are skipped, so puzzle N never changes, and new puzzles
// are only ever added at the end (raise COUNT; the old ones stay as they are).
// Version 1 books (user, 2026-10-30): 600 easy, 600 medium, 450 hard, 300 expert.
import { writeFileSync } from 'node:fs'
import { Crossword } from '../../hub/shared/v1/crossword.js'
import { encodePuzzle, makePuzzle } from '../js/sumcross.js'

const COUNT = { easy: 600, medium: 600, hard: 450, expert: 300 }
for (const [difficulty, count] of Object.entries(COUNT)) {
  const started = Date.now()
  const book = []
  const seen = new Set()
  for (let k = 1; book.length < count; k++) {
    const puzzle = makePuzzle(difficulty, `sumcross:${difficulty}:${k}`, Crossword)
    if (!puzzle) continue
    const coded = encodePuzzle(puzzle)
    const id = coded.lines.join(';')
    if (seen.has(id)) continue // never the same puzzle twice in a book
    seen.add(id)
    book.push(coded)
  }
  writeFileSync(new URL(`../data/sumcross-${difficulty}.json`, import.meta.url), `[\n${book.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`)
  console.log(`${difficulty}: ${count} puzzles in ${((Date.now() - started) / 1000).toFixed(1)} s`)
}
