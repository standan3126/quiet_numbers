// Sum Cross: true sums laid out as a free-form crossword (across and down, crossing at shared
// numbers), some numbers blank, and a bank with exactly the numbers the blanks need. Rules, the
// puzzle maker and the solver; no browser or Node APIs here. The layout comes from the toolbox's
// Crossword (/shared/v1/crossword.js), passed in so Node tools can load it from the hub folder.
//
// A sum is a line of pieces: numbers, and the signs '+', '−', '×', '÷', '=', '√' (before a number)
// and '²' (after one). × and ÷ come before + and − (like school); √ and ² before both.

import { rng as seeded, shuffle } from './sudoku.js'

export const isNum = (p) => typeof p === 'number'
const pick = (random, list) => list[Math.floor(random() * list.length)]
const int = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1))

// The value of the left side of a sum, or null if it isn't a whole number (or has no meaning).
export function evaluate(pieces) {
  // √ and ² first.
  const terms = []
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    if (p === '√') {
      const n = pieces[++i]
      const r = Math.round(Math.sqrt(n))
      if (!isNum(n) || r * r !== n) return null
      terms.push(r)
    } else if (p === '²') {
      if (!isNum(terms.at(-1))) return null
      terms.push(terms.pop() ** 2)
    } else terms.push(p)
  }
  // Then × and ÷, then + and −.
  const sums = [terms[0]]
  for (let i = 1; i < terms.length; i += 2) {
    const op = terms[i]
    const n = terms[i + 1]
    if (!isNum(n)) return null
    if (op === '×') sums.push(sums.pop() * n)
    else if (op === '÷') {
      const a = sums.pop()
      if (n === 0 || a % n) return null
      sums.push(a / n)
    } else sums.push(op, n)
  }
  let total = sums[0]
  for (let i = 1; i < sums.length; i += 2) total = sums[i] === '+' ? total + sums[i + 1] : total - sums[i + 1]
  return Number.isInteger(total) ? total : null
}

// True when a whole sum (left = right) holds.
export function holds(pieces) {
  const eq = pieces.indexOf('=')
  const left = evaluate(pieces.slice(0, eq))
  return left !== null && left === pieces[eq + 1] && left >= 0
}

// --- Making sums, by difficulty -------------------------------------------------------------------
// Difficulty is the maths itself (user, 2026-10-30): Easy and Medium have one sign a sum, Hard up to
// two, Expert adds square roots and squares with bigger numbers.

function oneSign(random, small) {
  const op = pick(random, ['+', '−', '×', '÷'])
  if (small) {
    if (op === '+') {
      const a = int(random, 1, 12), b = int(random, 1, 12)
      return [a, '+', b, '=', a + b]
    }
    if (op === '−') {
      const b = int(random, 1, 10), c = int(random, 1, 10)
      return [b + c, '−', b, '=', c]
    }
    if (op === '×') {
      const a = int(random, 2, 6), b = int(random, 2, 6)
      return [a, '×', b, '=', a * b]
    }
    const b = int(random, 2, 5), c = int(random, 2, 6)
    return [b * c, '÷', b, '=', c]
  }
  if (op === '+') {
    const a = int(random, 8, 60), b = int(random, 6, 40)
    return [a, '+', b, '=', a + b]
  }
  if (op === '−') {
    const b = int(random, 6, 40), c = int(random, 4, 50)
    return [b + c, '−', b, '=', c]
  }
  if (op === '×') {
    const a = int(random, 3, 12), b = int(random, 3, 12)
    return [a, '×', b, '=', a * b]
  }
  const b = int(random, 3, 12), c = int(random, 3, 12)
  return [b * c, '÷', b, '=', c]
}

function twoSigns(random, hi) {
  for (;;) {
    const left = [int(random, 1, hi), pick(random, ['+', '−', '×', '÷']), int(random, 1, hi), pick(random, ['+', '−', '×', '÷']), int(random, 1, hi)]
    const v = evaluate(left)
    if (v !== null && v >= 0 && v <= 150) return [...left, '=', v]
  }
}

function expertSum(random) {
  const form = int(random, 0, 4)
  if (form === 0) {
    // √49 + 3 = 10
    const r = int(random, 2, 15)
    const op = pick(random, ['+', '−', '×'])
    const b = int(random, 2, 12)
    const left = ['√', r * r, op, b]
    const v = evaluate(left)
    return v !== null && v >= 0 ? [...left, '=', v] : expertSum(random)
  }
  if (form === 1) {
    // 6² − 11 = 25
    const a = int(random, 3, 13)
    const op = pick(random, ['+', '−'])
    const b = int(random, 2, 40)
    const left = [a, '²', op, b]
    const v = evaluate(left)
    return v !== null && v >= 0 ? [...left, '=', v] : expertSum(random)
  }
  if (form === 2) {
    // √144 ÷ 3 = 4
    const c = int(random, 2, 6), b = int(random, 2, 5)
    return ['√', (b * c) ** 2, '÷', b, '=', c]
  }
  return twoSigns(random, 20)
}

export const DIFFICULTY_RULES = {
  easy: { sum: (r) => oneSign(r, true), lines: 6, size: 9, givens: 0.5 },
  medium: { sum: (r) => oneSign(r, false), lines: 7, size: 11, givens: 0.4 },
  hard: { sum: (r) => (r() < 0.75 ? twoSigns(r, 12) : oneSign(r, false)), lines: 7, size: 11, givens: 0.33 },
  expert: { sum: (r) => expertSum(r), lines: 8, size: 11, givens: 0.28 },
}

// --- Growing the crossword -------------------------------------------------------------------------

const key = (x, y) => `${x},${y}`

function grow(difficulty, random, Crossword) {
  const rules = DIFFICULTY_RULES[difficulty]
  const limits = { maxWidth: rules.size, maxHeight: rules.size }
  const cw = new Crossword({ canCross: isNum })
  cw.place(rules.sum(random), 0, 0, 'h')
  for (let fails = 0; cw.lines.length < rules.lines && fails < 300; ) {
    // A number crossed by one line only, and a new sum through it the other way.
    const open = [...cw.cells].filter(([k, p]) => isNum(p) && !cw.crossed(...k.split(',').map(Number)))
    if (!open.length) break
    const [k, value] = pick(random, open)
    const [x, y] = k.split(',').map(Number)
    const dir = cw.dirs.get(k) === 1 ? 'v' : 'h'
    const [dx, dy] = dir === 'h' ? [1, 0] : [0, 1]
    let best = null
    for (let t = 0; t < 400; t++) {
      const sum = rules.sum(random)
      sum.forEach((p, j) => {
        if (p !== value) return
        const sx = x - dx * j
        const sy = y - dy * j
        const crossings = cw.fit(sum, sx, sy, dir, limits)
        if (crossings < 0) return
        const w = Math.max(cw.maxX, sx + dx * (sum.length - 1)) - Math.min(cw.minX, sx) + 1
        const h = Math.max(cw.maxY, sy + dy * (sum.length - 1)) - Math.min(cw.minY, sy) + 1
        const score = crossings * 6 - w * h * 0.15 - Math.abs(w - h) + random()
        if (!best || score > best.score) best = { sum, sx, sy, score }
      })
    }
    if (best) cw.place(best.sum, best.sx, best.sy, dir)
    else fails++
  }
  return cw.normalized()
}

// --- Solving (to make sure there's exactly one answer) ------------------------------------------

// The puzzle as squares: { x, y, piece } for every filled square, and each sum as square indexes.
export function squaresOf(layout) {
  const index = new Map()
  const squares = []
  const sums = layout.lines.map((l) => {
    const [dx, dy] = l.dir === 'h' ? [1, 0] : [0, 1]
    return l.pieces.map((piece, i) => {
      const k = key(l.x + dx * i, l.y + dy * i)
      if (!index.has(k)) {
        index.set(k, squares.length)
        squares.push({ x: l.x + dx * i, y: l.y + dy * i, piece })
      }
      return index.get(k)
    })
  })
  return { squares, sums }
}

// How many ways the blanks can be filled from the bank so every sum holds (stops at `limit`).
export function countAnswers(squares, sums, blanks, bank, limit = 2) {
  const value = squares.map((s, i) => (blanks.has(i) ? null : s.piece))
  const left = new Map()
  for (const n of bank) left.set(n, (left.get(n) ?? 0) + 1)
  const sumsOf = squares.map(() => [])
  sums.forEach((sum, k) => sum.forEach((i) => sumsOf[i].push(k)))
  const open = (k) => sums[k].filter((i) => value[i] === null).length
  let count = 0
  const walk = () => {
    // The blank in the sum closest to done.
    let best = -1
    let bestOpen = Infinity
    for (const i of blanks)
      if (value[i] === null) {
        const o = Math.min(...sumsOf[i].map(open))
        if (o < bestOpen) {
          best = i
          bestOpen = o
        }
      }
    if (best === -1) {
      count++
      return
    }
    for (const [n, c] of left) {
      if (!c) continue
      value[best] = n
      left.set(n, c - 1)
      const ok = sumsOf[best].every((k) => open(k) > 0 || holds(sums[k].map((i) => value[i])))
      if (ok) walk()
      left.set(n, c)
      value[best] = null
      if (count >= limit) return
    }
  }
  walk()
  return count
}

// --- A whole puzzle -------------------------------------------------------------------------------

// { width, height, squares: [{ x, y, piece, blank }], bank: [numbers, smallest first], sums }
export function makePuzzle(difficulty, seed, Crossword) {
  const random = seeded(seed)
  const rules = DIFFICULTY_RULES[difficulty]
  const layout = grow(difficulty, random, Crossword)
  const { squares, sums } = squaresOf(layout)
  const numbers = squares.map((s, i) => (isNum(s.piece) ? i : -1)).filter((i) => i !== -1)
  const blanks = new Set()
  const keep = Math.ceil(numbers.length * rules.givens)
  for (const i of shuffle(numbers.slice(), random)) {
    if (numbers.length - blanks.size <= keep) break
    blanks.add(i)
    const bank = [...blanks].map((b) => squares[b].piece)
    if (countAnswers(squares, sums, blanks, bank) !== 1) blanks.delete(i)
  }
  return {
    width: layout.width,
    height: layout.height,
    squares: squares.map((s, i) => ({ ...s, blank: blanks.has(i) })),
    bank: [...blanks].map((b) => squares[b].piece).sort((a, b) => a - b),
    sums,
  }
}
