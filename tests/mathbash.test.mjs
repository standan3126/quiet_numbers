// Math Bash's questions: node --test tests/mathbash.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CATEGORIES, LEVELS, QUESTIONS, gradeOf, makeTest } from '../js/mathbash.js'

const len = (n) => String(n).length

test('every category and level: whole answers, never below zero, division even, 100 questions', () => {
  for (const level of Object.keys(LEVELS))
    for (const category of CATEGORIES)
      for (const n of [1, 2, 300, 600]) {
        const t = makeTest(category, level, n)
        assert.equal(t.length, QUESTIONS)
        for (const q of t) {
          assert.ok(Number.isInteger(q.answer), `${q.text} = ${q.answer}`)
          assert.ok(q.answer > 0, `${level} ${q.text} = ${q.answer}`)
          if (q.op === 'div') assert.equal(q.a % q.b, 0)
          if (category !== 'mix') assert.equal(q.op, category)
          if (q.op === 'mul' || q.op === 'div') assert.ok(q.b >= 2 && q.answer >= 2, q.text)
        }
      }
})

test('digit sizes follow the level (never harder than 9th grade)', () => {
  const sizes = (level, op) => {
    const seen = new Set()
    for (let n = 1; n <= 20; n++) for (const q of makeTest(op, level, n)) seen.add(`${len(Math.max(q.a, q.b))}x${len(Math.min(q.a, q.b))}`)
    return [...seen].sort()
  }
  assert.deepEqual(sizes('easy', 'add'), ['2x2'])
  assert.deepEqual(sizes('medium', 'add'), ['3x2'])
  assert.deepEqual(sizes('hard', 'sub'), ['3x3'])
  assert.deepEqual(sizes('extreme', 'add'), ['4x3', '4x4'])
  assert.deepEqual(sizes('medium', 'mul'), ['2x1'])
  assert.deepEqual(sizes('extreme', 'mul'), ['2x2'])
  for (const q of makeTest('mul', 'easy', 5)) assert.ok(q.a <= 12 && q.b <= 12)
  for (const q of makeTest('div', 'easy', 5)) assert.ok(q.a <= 144 && q.b <= 12 && q.answer <= 12)
  for (const q of makeTest('div', 'extreme', 5)) assert.ok(len(q.a) <= 4 && len(q.b) <= 2)
})

test('a test never changes; Random mixes all four signs', () => {
  assert.deepEqual(makeTest('add', 'easy', 7), makeTest('add', 'easy', 7))
  assert.notDeepEqual(makeTest('add', 'easy', 7), makeTest('add', 'easy', 8))
  assert.deepEqual(new Set(makeTest('mix', 'hard', 1).map((q) => q.op)), new Set(['add', 'sub', 'mul', 'div']))
})

test('grades like a school test', () => {
  assert.deepEqual([100, 90, 89, 80, 79, 70, 60, 59, 0].map((r) => gradeOf(r)), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'F', 'F'])
})
