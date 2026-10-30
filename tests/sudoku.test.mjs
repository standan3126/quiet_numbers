// The puzzles and the rules: node --test tests/sudoku.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DIFFICULTIES, RECIPES, clashes, countSolutions, findSingle, grade, humanSolve, makePuzzle, parse, solve } from '../js/sudoku.js'

const packs = JSON.parse(readFileSync(new URL('../data/sudoku.json', import.meta.url), 'utf8'))

test('every puzzle has exactly one answer, needs no guessing, and is graded right', () => {
  for (const difficulty of DIFFICULTIES) {
    assert.ok(packs[difficulty].length >= 200, `${difficulty}: at least 200 puzzles`)
    const seen = new Set()
    for (const [k, text] of packs[difficulty].entries()) {
      const where = `${difficulty} ${k + 1}`
      assert.equal(text.length, 81, where)
      assert.ok(!seen.has(text), `${where} is a repeat`)
      seen.add(text)
      const puzzle = parse(text)
      const clues = puzzle.filter(Boolean).length
      const [low, high] = RECIPES[difficulty].clues
      // Easy and Medium are set by how many numbers you start with; Hard and Expert by the
      // tricks they need (some can't lose another given and keep one answer).
      if (RECIPES[difficulty].maxRank <= 1) assert.ok(clues >= low - 1 && clues <= high + 1, `${where}: ${clues} givens`)
      assert.equal(clashes(puzzle).size, 0, where)
      assert.equal(countSolutions(puzzle), 1, `${where}: one answer`)
      assert.equal(grade(puzzle), difficulty, `${where}: graded ${grade(puzzle)}`)
    }
  }
})

test('the same seed always makes the same puzzle (puzzle numbers never change)', () => {
  const a = makePuzzle('easy', 'easy:0')
  const b = makePuzzle('easy', 'easy:0')
  assert.deepEqual(a, b)
  assert.equal(a.puzzle.map((v) => v || '.').join(''), packs.easy[0])
})

test('the step-by-step solver reaches the real answer', () => {
  const puzzle = parse(packs.hard[0])
  const human = humanSolve(puzzle)
  assert.ok(human.solved)
  assert.deepEqual(human.grid, solve(puzzle))
})

test('hints find a square and say why', () => {
  const puzzle = parse(packs.easy[0])
  const answer = solve(puzzle)
  const step = findSingle(puzzle)
  assert.ok(step)
  assert.equal(step.digit, answer[step.cell])
  assert.match(step.why, /only place|already/)
})
