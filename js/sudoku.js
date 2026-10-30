// Sudoku rules, a solver and a step-by-step "human" solver. Used by the game (checking, hints)
// and by tools/make-sudoku.mjs (making and grading the puzzles). No browser or Node APIs here.
//
// A grid is an array of 81 numbers, row by row; 0 = empty. Candidates are 9-bit masks
// (bit d-1 set = d still possible).

export const SIZE = 9
export const ALL = 0x1ff

export const rowOf = (i) => Math.floor(i / 9)
export const colOf = (i) => i % 9
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

// The 27 units (rows 0-8, columns 9-17, boxes 18-26), each a list of 9 cells.
export const UNITS = []
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c))
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c))
for (let b = 0; b < 9; b++)
  UNITS.push(Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)))

// Every cell's 20 peers (same row, column or box).
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const set = new Set([...UNITS[rowOf(i)], ...UNITS[9 + colOf(i)], ...UNITS[18 + boxOf(i)]])
  set.delete(i)
  return [...set]
})

const bit = (d) => 1 << (d - 1)
export const bitCount = (m) => {
  let n = 0
  for (; m; m &= m - 1) n++
  return n
}
const onlyDigit = (m) => 31 - Math.clz32(m) + 1 // the digit of a single-bit mask
export const digitsOf = (m) => {
  const out = []
  for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d)
  return out
}

export const parse = (text) => Array.from(text, (ch) => (ch >= '1' && ch <= '9' ? Number(ch) : 0))
export const format = (grid) => grid.map((v) => v || '.').join('')

// Seeded random numbers, so the same seed always makes the same puzzle.
export function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = (h << 13) | (h >>> 19)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// What each empty cell could still be, from the numbers already placed.
export function candidates(grid) {
  const cand = new Array(81).fill(0)
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue
    let m = ALL
    for (const p of PEERS[i]) if (grid[p]) m &= ~bit(grid[p])
    cand[i] = m
  }
  return cand
}

// Cells whose number appears again in their row, column or box.
export function clashes(grid) {
  const out = new Set()
  for (let i = 0; i < 81; i++) if (grid[i]) for (const p of PEERS[i]) if (grid[p] === grid[i]) out.add(i)
  return out
}

// Counts solutions up to limit (2 is enough to know "exactly one"). Fills `into` with the first.
export function countSolutions(grid, limit = 2, into = null) {
  const g = grid.slice()
  let count = 0
  const walk = () => {
    // The empty cell with the fewest choices.
    let best = -1
    let bestMask = 0
    let bestN = 10
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue
      let m = ALL
      for (const p of PEERS[i]) if (g[p]) m &= ~bit(g[p])
      const n = bitCount(m)
      if (n < bestN) {
        best = i
        bestMask = m
        bestN = n
        if (n <= 1) break
      }
    }
    if (best === -1) {
      if (count === 0 && into) into.splice(0, 81, ...g)
      count++
      return
    }
    for (const d of digitsOf(bestMask)) {
      g[best] = d
      walk()
      if (count >= limit) return
    }
    g[best] = 0
  }
  walk()
  return count
}

export const solve = (grid) => {
  const out = []
  return countSolutions(grid, 1, out) ? out : null
}

// A random full grid.
export function randomSolution(random) {
  const g = new Array(81).fill(0)
  const fill = (i) => {
    if (i === 81) return true
    let m = ALL
    for (const p of PEERS[i]) if (g[p]) m &= ~bit(g[p])
    for (const d of shuffle(digitsOf(m), random)) {
      g[i] = d
      if (fill(i + 1)) return true
    }
    g[i] = 0
    return false
  }
  fill(0)
  return g
}

// --- Solving like a person ----------------------------------------------------------------------
// Tricks from easiest to hardest. The hardest one a puzzle needs is how hard it is.

export const TRICKS = ['hidden single', 'naked single', 'pointing', 'naked pair', 'hidden pair', 'naked triple', 'hidden triple', 'x-wing']
export const RANK = Object.fromEntries(TRICKS.map((t, i) => [t, i]))

const unitName = (u) => (u < 9 ? `row ${u + 1}` : u < 18 ? `column ${u - 8}` : 'box')

// One placement found by a single: { cell, digit, why } (or null). The why is for hints.
export function findSingle(grid, cand = candidates(grid)) {
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      let spot = -1
      let n = 0
      for (const i of UNITS[u]) {
        if (grid[i] === d) {
          n = -1
          break
        }
        if (!grid[i] && cand[i] & bit(d)) {
          spot = i
          n++
        }
      }
      if (n === 1) return { cell: spot, digit: d, trick: 'hidden single', why: `This is the only place for ${d} in this ${unitName(u)}.` }
    }
  }
  for (let i = 0; i < 81; i++)
    if (!grid[i] && bitCount(cand[i]) === 1)
      return { cell: i, digit: onlyDigit(cand[i]), trick: 'naked single', why: `Every other number is already in this square's row, column or box.` }
  return null
}

// Removes candidates with one of the harder tricks. Returns true if anything changed.
function eliminate(grid, cand, trick) {
  let changed = false
  const strike = (i, mask) => {
    if (!grid[i] && cand[i] & mask) {
      cand[i] &= ~mask
      changed = true
    }
  }
  if (trick === 'pointing') {
    // A digit in a box sits on one row/column only: it can't be elsewhere on that line, and the
    // other way round (a line's digit inside one box).
    for (let u = 0; u < 27; u++)
      for (let d = 1; d <= 9; d++) {
        const spots = UNITS[u].filter((i) => !grid[i] && cand[i] & bit(d))
        if (spots.length < 2) continue
        const lines = u >= 18 ? [rowOf(spots[0]), 9 + colOf(spots[0])] : [18 + boxOf(spots[0])]
        for (const other of lines) {
          if (!spots.every((i) => UNITS[other].includes(i))) continue
          for (const i of UNITS[other]) if (!spots.includes(i)) strike(i, bit(d))
        }
      }
  } else if (trick === 'naked pair' || trick === 'naked triple') {
    const k = trick === 'naked pair' ? 2 : 3
    for (const unit of UNITS) {
      const open = unit.filter((i) => !grid[i])
      const pick = (start, chosen, mask) => {
        if (chosen.length === k) {
          if (bitCount(mask) !== k) return
          for (const i of open) if (!chosen.includes(i)) strike(i, mask)
          return
        }
        for (let s = start; s < open.length; s++) {
          const m = mask | cand[open[s]]
          if (bitCount(m) <= k) pick(s + 1, [...chosen, open[s]], m)
        }
      }
      pick(0, [], 0)
    }
  } else if (trick === 'hidden pair' || trick === 'hidden triple') {
    const k = trick === 'hidden pair' ? 2 : 3
    for (const unit of UNITS) {
      const open = unit.filter((i) => !grid[i])
      const placed = unit.reduce((m, i) => m | (grid[i] ? bit(grid[i]) : 0), 0)
      const digits = digitsOf(ALL & ~placed)
      const pick = (start, chosen) => {
        if (chosen.length === k) {
          const mask = chosen.reduce((m, d) => m | bit(d), 0)
          const cells = open.filter((i) => cand[i] & mask)
          if (cells.length === k) for (const i of cells) strike(i, ~mask & ALL)
          return
        }
        for (let s = start; s < digits.length; s++) pick(s + 1, [...chosen, digits[s]])
      }
      pick(0, [])
    }
  } else if (trick === 'x-wing') {
    for (const [lines, cross] of [
      [0, 9],
      [9, 0],
    ])
      for (let d = 1; d <= 9; d++) {
        const where = []
        for (let a = 0; a < 9; a++) {
          const spots = UNITS[lines + a].filter((i) => !grid[i] && cand[i] & bit(d))
          where.push(spots.length === 2 ? spots.map((i) => (lines === 0 ? colOf(i) : rowOf(i))) : null)
        }
        for (let a = 0; a < 9; a++)
          for (let b = a + 1; b < 9; b++) {
            if (!where[a] || !where[b] || where[a][0] !== where[b][0] || where[a][1] !== where[b][1]) continue
            for (const x of where[a])
              for (const i of UNITS[cross + x]) {
                const line = lines === 0 ? rowOf(i) : colOf(i)
                if (line !== a && line !== b) strike(i, bit(d))
              }
          }
      }
  }
  return changed
}

// Solves with tricks only, never guessing. Returns { solved, hardest (rank), steps }.
export function humanSolve(start, maxRank = TRICKS.length - 1) {
  const grid = start.slice()
  const cand = candidates(grid)
  let hardest = -1
  let steps = 0
  const place = (i, d) => {
    grid[i] = d
    cand[i] = 0
    for (const p of PEERS[i]) cand[p] &= ~bit(d)
  }
  for (;;) {
    if (grid.every(Boolean)) return { solved: true, hardest, steps, grid }
    const single = findSingle(grid, cand)
    if (single && RANK[single.trick] <= maxRank) {
      place(single.cell, single.digit)
      hardest = Math.max(hardest, RANK[single.trick])
      steps++
      continue
    }
    let moved = false
    for (let r = RANK.pointing; r <= maxRank && !moved; r++)
      if (eliminate(grid, cand, TRICKS[r])) {
        hardest = Math.max(hardest, r)
        moved = true
      }
    if (!moved) return { solved: false, hardest, steps, grid }
  }
}

// --- Difficulties -------------------------------------------------------------------------------

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']
export const DIFFICULTY_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }

// What each difficulty needs: the hardest trick allowed (and needed), and how many givens.
export const RECIPES = {
  easy: { minRank: 0, maxRank: 0, clues: [36, 40] }, // hidden singles only, lots of givens
  medium: { minRank: 1, maxRank: 1, clues: [28, 32] }, // naked singles needed, fewer givens
  hard: { minRank: 2, maxRank: 4, clues: [24, 30] }, // pointing or pairs needed
  expert: { minRank: 5, maxRank: 7, clues: [22, 28] }, // triples or an x-wing needed
}

export function grade(puzzle) {
  const result = humanSolve(puzzle)
  if (!result.solved) return null
  return DIFFICULTIES.find((d) => result.hardest >= RECIPES[d].minRank && result.hardest <= RECIPES[d].maxRank) ?? null
}

// Tries to make one puzzle of a difficulty from a seed; null if this seed didn't give one.
// Givens come in pairs mirrored through the middle, the classic look.
export function makePuzzle(difficulty, seed) {
  const random = rng(seed)
  const recipe = RECIPES[difficulty]
  const solution = randomSolution(random)
  const puzzle = solution.slice()
  const target = recipe.clues[0] + Math.floor(random() * (recipe.clues[1] - recipe.clues[0] + 1))
  let clues = 81
  for (const i of shuffle(Array.from({ length: 41 }, (_, k) => k), random)) {
    const pair = i === 40 ? [40] : [i, 80 - i]
    if (clues - pair.length < target) continue
    const kept = pair.map((c) => puzzle[c])
    for (const c of pair) puzzle[c] = 0
    // Still exactly one answer, and still solvable without tricks harder than allowed.
    if (countSolutions(puzzle) === 1 && humanSolve(puzzle, recipe.maxRank).solved) clues -= pair.length
    else pair.forEach((c, k) => (puzzle[c] = kept[k]))
  }
  if (grade(puzzle) !== difficulty) return null
  return { puzzle, solution }
}
