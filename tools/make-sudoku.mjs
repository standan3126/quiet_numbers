// Makes the Sudoku puzzles: data/sudoku.json = { easy: [81-character strings], medium, ... }.
// Run once on the computer (node tools/make-sudoku.mjs); phones only read the file, so they never
// wait for a puzzle to be made. Same seeds, same puzzles: puzzle N of a difficulty never changes,
// and new puzzles are only ever added at the end (raise COUNT; the old ones stay as they are).
// Version 1 books (user, 2026-10-30): 600 easy, 600 medium, 450 hard, 300 expert. Updates may add
// 100 to each later.
import { writeFileSync } from 'node:fs'
import { DIFFICULTIES, format, makePuzzle } from '../js/sudoku.js'

const COUNT = { easy: 600, medium: 600, hard: 450, expert: 300 }
const out = {}
for (const difficulty of DIFFICULTIES) {
  const started = Date.now()
  out[difficulty] = []
  for (let seed = 0; out[difficulty].length < COUNT[difficulty]; seed++) {
    const made = makePuzzle(difficulty, `${difficulty}:${seed}`)
    if (made) out[difficulty].push(format(made.puzzle))
  }
  console.log(`${difficulty}: ${COUNT[difficulty]} puzzles in ${((Date.now() - started) / 1000).toFixed(1)} s`)
}
writeFileSync(new URL('../data/sudoku.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
