// Math Bash: mental-maths questions. Five categories (adding, taking away, times, sharing, and a
// mix), four levels made from 5th- to 9th-grade maths (user, 2026-10-30: never harder than 9th
// grade, "most people dont do that anymore"). Whole numbers only: division always comes out even,
// taking away never goes below zero. Harder = more digits. No browser or Node APIs here.
//
// A test is 100 questions made from a fixed seed, so test 37 of a book is always the same test and
// nothing is downloaded. Pop Quiz questions come from the same recipes, at random.

import { rng } from './sudoku.js'

export const CATEGORIES = ['add', 'sub', 'mul', 'div', 'mix']
export const CATEGORY_NAMES = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division', mix: 'Random' }
export const SIGNS = { add: '+', sub: '−', mul: '×', div: '÷' }
export const QUESTIONS = 100
export const BOOK_SIZE = 600
export const QUIZ_SECONDS = 60

const int = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1))
// A number with exactly n digits (1 digit: 2 to 9, so no ×1 or ÷1).
const digits = (random, n) => (n === 1 ? int(random, 2, 9) : int(random, 10 ** (n - 1), 10 ** n - 1))

// [a, b] for adding or taking away: an a-digit and a b-digit number (the bigger first when taking
// away, and never the same number, so the answer is above zero).
function pair(random, [n, m], sub) {
  for (;;) {
    let a = digits(random, n)
    let b = digits(random, m)
    if (sub) {
      if (a === b) continue
      if (a < b) [a, b] = [b, a]
    } else if (random() < 0.5) [a, b] = [b, a]
    return [a, b]
  }
}

// A division that comes out even: the number shared has `n` digits, the divisor `m` digits.
function sharing(random, n, m) {
  for (;;) {
    const b = digits(random, m)
    const lo = Math.max(2, Math.ceil(10 ** (n - 1) / b))
    const hi = Math.floor((10 ** n - 1) / b)
    if (lo > hi) continue
    const q = int(random, lo, hi)
    return [q * b, b]
  }
}

// What each level asks, per sign (user's table, 2026-10-30).
export const LEVELS = {
  easy: {
    add: (r) => pair(r, [2, 2]),
    sub: (r) => pair(r, [2, 2], true),
    mul: (r) => [int(r, 2, 12), int(r, 2, 12)], // times tables to 12 × 12
    div: (r) => {
      const b = int(r, 2, 12)
      return [b * int(r, 2, 12), b] // facts up to 144 ÷ 12
    },
  },
  medium: {
    add: (r) => pair(r, [3, 2]),
    sub: (r) => pair(r, [3, 2], true),
    mul: (r) => (r() < 0.5 ? [digits(r, 2), digits(r, 1)] : [digits(r, 1), digits(r, 2)]),
    div: (r) => sharing(r, r() < 0.5 ? 2 : 3, 1),
  },
  hard: {
    add: (r) => pair(r, [3, 3]),
    sub: (r) => pair(r, [3, 3], true),
    mul: (r) => [digits(r, 3), digits(r, 1)],
    div: (r) => sharing(r, 3, 1),
  },
  extreme: {
    add: (r) => pair(r, [4, r() < 0.5 ? 3 : 4]),
    sub: (r) => pair(r, [4, r() < 0.5 ? 3 : 4], true),
    mul: (r) => [digits(r, 2), digits(r, 2)],
    div: (r) => (r() < 0.5 ? sharing(r, 3, 2) : sharing(r, 4, 1)),
  },
}

export const LEVEL_IDS = Object.keys(LEVELS)
export const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' }

const ANSWER = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b }

// One question: { a, sign, b, answer, text }. `mix` picks a sign at random each time.
export function question(category, level, random) {
  const op = category === 'mix' ? ['add', 'sub', 'mul', 'div'][Math.floor(random() * 4)] : category
  const [a, b] = LEVELS[level][op](random)
  return { a, op, b, answer: ANSWER[op](a, b), text: `${a} ${SIGNS[op]} ${b}` }
}

// Test n (1 to BOOK_SIZE) of a book: 100 questions, never the same one twice in a row.
export function makeTest(category, level, n) {
  const random = rng(`mathbash:${category}:${level}:${n}`)
  const out = []
  while (out.length < QUESTIONS) {
    const q = question(category, level, random)
    if (out.length && out[out.length - 1].text === q.text) continue
    out.push(q)
  }
  return out
}

// A school grade from the share right (user: "just like a real test from 5th grade").
export function gradeOf(right, total = QUESTIONS) {
  const pct = (100 * right) / total
  return pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F'
}
