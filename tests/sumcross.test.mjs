// The Sum Cross books: node --test tests/sumcross.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Crossword, runs } from '../../hub/shared/v1/crossword.js'
import { BLANKS, SUMS, answerOf, decodePuzzle, encodePuzzle, evaluate, holds, isAnswer, isPow, makePuzzle, solveStepByStep } from '../js/sumcross.js'

const SIZES = { easy: 600, medium: 600, hard: 450, expert: 300 }
const books = Object.fromEntries(Object.keys(SIZES).map((d) => [d, JSON.parse(readFileSync(new URL(`../data/sumcross-${d}.json`, import.meta.url), 'utf8'))]))
const signsOf = (sum, squares) => sum.map((i) => squares[i].piece).filter((p) => ['+', '−', '×', '÷'].includes(p)).length

test('every puzzle: the right size, every sum true, solvable step by step from the bank', () => {
  for (const [d, book] of Object.entries(books)) {
    assert.equal(book.length, SIZES[d], `${d}: the V1 book size`)
    const seen = new Set()
    book.forEach((coded, k) => {
      const where = `${d} ${k + 1}`
      const id = coded.lines.join(';')
      assert.ok(!seen.has(id), `${where} is a repeat`)
      seen.add(id)
      const p = decodePuzzle(coded)
      assert.equal(p.sums.length, SUMS, where)
      assert.equal(p.bank.length, BLANKS, where)
      assert.ok(p.width <= 11 && p.height <= 11, `${where}: ${p.width}×${p.height}`)
      for (const sum of p.sums) assert.ok(holds(sum.map((i) => p.squares[i].piece)), `${where}: a sum isn't true`)
      // The layout is a sound crossword: one run of boxes per sum, nothing else.
      const lines = p.sums.map((sum) => ({ pieces: sum.map((i) => p.squares[i].piece), x: p.squares[sum[0]].x, y: p.squares[sum[0]].y, dir: p.squares[sum[1]].x > p.squares[sum[0]].x ? 'h' : 'v' }))
      assert.equal(runs(lines).length, SUMS, `${where}: boxes touch where they shouldn't`)
      // Solved one forced step at a time, ending with every blank's own number.
      const blanks = new Set(p.squares.map((s, i) => (s.blank ? i : -1)).filter((i) => i !== -1))
      const order = solveStepByStep(p.squares, p.sums, blanks, p.bank)
      assert.ok(order && order.length === BLANKS, `${where}: needs guessing`)
      for (const s of p.squares) if (s.blank) assert.ok(isAnswer(s.piece), where)
      // Easy and Medium: one sign a sum; Hard: up to two.
      const most = Math.max(...p.sums.map((sum) => signsOf(sum, p.squares)))
      if (d === 'easy' || d === 'medium') assert.equal(most, 1, `${where}: ${most} signs`)
      if (d === 'hard') assert.ok(most <= 2, where)
      if (d === 'easy') for (const s of p.squares) if (isAnswer(s.piece)) assert.ok(answerOf(s.piece) <= 36, `${where}: ${answerOf(s.piece)} is big for Easy (6 × 6 is the most)`)
    })
  }
})

test('Expert has square roots and squares', () => {
  const pieces = books.expert.flatMap((coded) => decodePuzzle(coded).squares.map((s) => s.piece))
  assert.ok(pieces.filter((p) => p === '√').length > 100)
  assert.ok(pieces.filter(isPow).length > 50)
})

test('puzzle numbers never change: the same seed makes the same puzzle, saved and loaded alike', () => {
  const made = makePuzzle('hard', 'sumcross:hard:1', Crossword)
  assert.deepEqual(encodePuzzle(made), books.hard[0])
  assert.deepEqual(decodePuzzle(encodePuzzle(made)), made)
})

test('the maths: √ and ² first, then × and ÷, then + and −; whole numbers only', () => {
  assert.equal(evaluate([3, '+', 4, '×', 2]), 11)
  assert.equal(evaluate(['√', 49, '+', 3]), 10)
  assert.equal(evaluate([{ n: 6, pow: 2 }, '−', 11]), 25)
  assert.equal(evaluate([7, '÷', 2]), null)
  assert.equal(evaluate(['√', 50]), null)
  assert.ok(holds([12, '÷', 3, '=', 4]))
  assert.ok(!holds([12, '÷', 3, '=', 5]))
})
