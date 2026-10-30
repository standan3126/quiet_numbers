// Quiet Numbers: the launch page, the books, the play screen for both games (Sudoku and Sum Cross),
// saves and the GameHub pieces. Rules, solvers and puzzle makers are in sudoku.js and sumcross.js;
// sumcross-board.js draws a Sum Cross puzzle. The puzzles are made ahead of time (tools/) and read
// from data/. Settings use the toolbox's shared panel (/shared/v1/settings.js).
//
// Both games play the same way, like a puzzle book: tap = pencil, drag = ink, nothing checked until
// every square is full, White-out, Hint and Look. Only the board and the numbers differ: Sudoku has
// a 9×9 grid and the numbers 1-9; Sum Cross a crossword of sums (pinch to zoom, drag to move) and a
// bank with exactly the numbers its blanks need.

import { Book } from '/shared/v1/book.js'
import { gameFrame, setupPage, tapToStart, warmOffline } from '/shared/v1/kit.js'
import { PanZoom } from '/shared/v1/panzoom.js'
import { gameStore } from '/shared/v1/save.js'
import { SettingsPanel, toggle } from '/shared/v1/settings.js'
import { Sound } from '/shared/v1/sound/index.js'
import { DIFFICULTIES, DIFFICULTY_NAMES, PEERS, digitsOf, parse, solve } from './sudoku.js'
import { answerOf, decodePuzzle, isAnswer } from './sumcross.js'
import { drawBoard, writeNotes, writeSquare } from './sumcross-board.js'

const GAME_ID = 'quiet-numbers'
const store = gameStore(GAME_ID)

// Hint circles wrong ink. One whenever you like, then the next is ready 2 minutes (of play) later
// (user, 2026-10-30: "so you cant just keep using it").
const HINT_WAIT = 120
// Finger dragging: the number floats this far above the fingertip, and lands where the number
// is, not where the finger is (user, 2026-10-30: "otherwise you are placing the number blind").
const FINGER_LIFT = 72
// A Sum Cross box on the board before zooming, in CSS pixels (the board is scaled to fit).
const UNIT = 48

// The games on the launch page. `rules`: the tip name for "the rules were shown once".
const GAMES = {
  sudoku: {
    name: 'Sudoku',
    rules: 'rules',
    notes: {
      easy: 'Plenty of numbers to start with. A gentle warm-up.',
      medium: 'Fewer numbers. Look along the rows and columns.',
      hard: 'Pencil notes help. Needs a few clever tricks.',
      expert: 'The toughest tricks. Still never needs a guess.',
    },
  },
  sumcross: {
    name: 'Sum Cross',
    rules: 'rules-sumcross',
    notes: {
      easy: 'One sign a sum, small numbers. A gentle warm-up.',
      medium: 'One sign a sum, bigger numbers and times tables.',
      hard: 'Up to two signs a sum: × and ÷ come before + and −.',
      expert: 'Square roots and squares join in.',
    },
  },
}
const KINDS = Object.keys(GAMES)
// The launch page's parts for a game: Sudoku's kept their first names (difficulty, board-status...).
const idOf = (kind, part) => (kind === 'sudoku' ? part : `${kind}-${part}`)

// Every difficulty of every game is a book of puzzles (user, 2026-10-30): flip to any page, play any
// puzzle. A finished puzzle is final: it stays in the book to look at, locked. Finishing a book moves
// you on to the next difficulty. Saves (format v3; a v2 save's Sudoku place is kept):
//   save:  { v, game (the card last picked), games: { sudoku: { difficulty, at: { easy: puzzle last
//          opened } }, sumcross: {...} }, tips }
//   book-<diff> (Sudoku) and book-sumcross-<diff>: { [puzzle number]: board }
//   A Sudoku board = { values (81: '.' or ink), notes (bit masks), whiteout, checked (square lists),
//   hints, looked, time, hintAt, done (local day) }. A Sum Cross board is the same with values = a
//   list (null or the ink, one per square) and notes = a list of numbers per square.
const NEW_SAVE = () => ({ v: 3, game: 'sudoku', games: { sudoku: { difficulty: 'easy', at: {} }, sumcross: { difficulty: 'easy', at: {} } }, tips: [] })
const bookKey = (kind, d) => (kind === 'sudoku' ? `book-${d}` : `book-${kind}-${d}`)

let save
const books = {}
function load() {
  const saved = store.get('save', {})
  save = NEW_SAVE()
  if (saved.v === 2) save.games.sudoku = { difficulty: saved.difficulty ?? 'easy', at: { ...saved.at } }
  if (saved.v === 3) {
    if (saved.game in GAMES) save.game = saved.game
    for (const kind of KINDS) save.games[kind] = { ...save.games[kind], ...saved.games?.[kind], at: { ...saved.games?.[kind]?.at } }
  }
  if (saved.v >= 2) save.tips = saved.tips ?? []
  for (const kind of KINDS) {
    books[kind] = {}
    for (const d of DIFFICULTIES) books[kind][d] = store.get(bookKey(kind, d), {})
  }
}
load()
const saveGame = () => store.set('save', save)
const saveBook = (kind, d) => store.set(bookKey(kind, d), books[kind][d])
const prefs = (kind) => save.games[kind]
saveGame()

const today = () => new Date().toLocaleDateString('en-CA') // the local day, YYYY-MM-DD
const isOwn = (b) => !b.hints && !b.looked
// A book's tally: how many solved, how many on your own, the best time on your own.
function tally(kind, d) {
  const done = Object.values(books[kind][d]).filter((b) => b.done)
  const own = done.filter(isOwn)
  return { solved: done.length, own: own.length, best: own.length ? Math.min(...own.map((b) => b.time)) : null }
}
const bookSize = (kind, d) => packs[kind][d].length
// The first unsolved puzzle after n (then from the start); null when the book is finished.
function nextOpen(kind, d, n = 0) {
  const size = bookSize(kind, d)
  for (let k = 1; k <= size; k++) {
    const m = ((n + k - 1) % size) + 1
    if (!books[kind][d][m]?.done) return m
  }
  return null
}

const sound = new Sound({ notes: 0.7, nature: 0.5, music: 0.35 })

const $ = (id) => document.getElementById(id)
setupPage()
// Home goes up one step: from a puzzle to its book, from a book to the launch page. The ? under the
// gear shows the rules while playing.
const frame = gameFrame({
  onSettings: () => panel.open(),
  onHelp: () => showRules(),
  beforeExit: () => saveBoard(),
  onHome: () => {
    saveBoard()
    if (current) openBook(current.kind, current.difficulty, current.n)
    else showHome()
  },
})

// --- Settings ----------------------------------------------------------------------------------

const panel = new SettingsPanel({
  gameId: GAME_ID,
  store,
  sound,
  notesLabel: 'Number sounds',
  defaults: { showClock: true },
  sections: [
    {
      title: 'Puzzles',
      build: (el, panel) =>
        el.append(
          toggle({
            label: 'Show the stopwatch',
            hint: 'Off hides your time while you play and when you finish.',
            checked: panel.settings.showClock,
            onToggle: (showClock) => panel.set({ showClock }),
          }),
        ),
    },
  ],
  // No hidden set-progress tools: every page of every book is open to play, so there's nothing to
  // unlock by hand.
  credits: [
    'Quiet Numbers was made for GameHub. Every puzzle is made and checked by our own code.',
    'Every sound and all the music are made in code by the GameHub toolbox. Nothing is borrowed.',
  ],
  onChange: () => {
    applyTheme()
    showClock()
  },
  beforeExport: () => saveBoard(),
  onRestore: () => {
    load()
    saveGame()
    current = null
    showHome()
  },
})

function applyTheme() {
  const theme = panel.night ? 'night' : 'day'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]').content = theme === 'night' ? '#1a0e06' : '#f6f0e1'
}

// --- Puzzles -----------------------------------------------------------------------------------

let packs = null
const packsReady = Promise.all([
  fetch('data/sudoku.json').then((r) => r.json()),
  ...DIFFICULTIES.map((d) => fetch(`data/sumcross-${d}.json`).then((r) => r.json())),
]).then(([sudoku, ...sumcross]) => (packs = { sudoku, sumcross: Object.fromEntries(DIFFICULTIES.map((d, k) => [d, sumcross[k]])) }))

// Puzzle n of a book (1 to the book's size).
const sudokuFor = (d, n) => parse(packs.sudoku[d][n - 1])
const decoded = new Map()
function sumCrossFor(d, n) {
  const key = `${d}:${n}`
  if (!decoded.has(key)) decoded.set(key, decodePuzzle(packs.sumcross[d][n - 1]))
  return decoded.get(key)
}

// --- Home --------------------------------------------------------------------------------------

// The launch page: a card per game that opens to show what it is and how hard (one open at a time;
// Play plays the open one). Each kind of information has its own look (user, 2026-10-30: "finding
// the information was difficult because its all the same font, same size, same color"): the about
// text is plain and soft, how far you are is bold, a waiting board is a coloured line.
const difficultyRows = {}
let openCard = save.game
for (const kind of KINDS) {
  difficultyRows[kind] = DIFFICULTIES.map((d) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'level-row' })
    b.dataset.value = d
    b.setAttribute('role', 'radio')
    b.innerHTML = '<span class="level-name"></span><span class="level-at"><b></b> of <span class="level-size"></span> solved</span>'
    b.querySelector('.level-name').textContent = DIFFICULTY_NAMES[d]
    b.addEventListener('click', () => {
      prefs(kind).difficulty = d
      save.game = kind
      saveGame()
      showHome()
    })
    return b
  })
  $(idOf(kind, 'difficulty')).append(...difficultyRows[kind])
  $(`open-${kind}`).addEventListener('click', () => {
    openCard = openCard === kind ? null : kind
    if (openCard) save.game = kind
    saveGame()
    showHome()
  })
}

function hideScreens() {
  stopClock()
  current = null
  for (const id of ['home', 'book-screen', 'play-screen', 'done']) $(id).hidden = true
}

function showHome() {
  hideScreens()
  $('home').hidden = false
  frame.setPage('launch')
  applyTheme()
  $('play').textContent = `Play ${GAMES[save.game].name}`
  for (const kind of KINDS) {
    $(`open-${kind}`).setAttribute('aria-expanded', String(openCard === kind))
    $(`${kind}-body`).hidden = openCard !== kind
    const d = prefs(kind).difficulty
    $(idOf(kind, 'difficulty-note')).textContent = GAMES[kind].notes[d]
    if (!packs) continue
    for (const row of difficultyRows[kind]) {
      const r = row.dataset.value
      row.setAttribute('aria-checked', String(r === d))
      row.querySelector('b').textContent = tally(kind, r).solved
      row.querySelector('.level-size').textContent = bookSize(kind, r)
    }
    const at = prefs(kind).at[d]
    const waiting = at && books[kind][d][at] && !books[kind][d][at].done
    const next = nextOpen(kind, d)
    const status = $(idOf(kind, 'board-status'))
    status.textContent = waiting ? `Puzzle ${at} is waiting where you left it.` : next ? `Next: puzzle ${next}.` : `You finished the ${DIFFICULTY_NAMES[d]} book.`
    status.classList.toggle('waiting', !!waiting)
  }
}

// "On your own", "2 hints", "Looked", "1 hint, looked".
function howSolved({ hints, looked }) {
  if (!hints && !looked) return 'On your own'
  const text = [hints && `${hints} hint${hints > 1 ? 's' : ''}`, looked && 'looked'].filter(Boolean).join(', ')
  return text[0].toUpperCase() + text.slice(1)
}

$('play').addEventListener('click', async () => {
  await packsReady
  openBook(save.game, prefs(save.game).difficulty)
})

// --- The book ----------------------------------------------------------------------------------
// The toolbox's book (/shared/v1/book.js): six puzzles a page, each a small picture of its board
// with how it stands; flip with the arrows; pick one, then Start (greyed until one is picked).

let shelf = { kind: 'sudoku', d: 'easy' } // the book that's open

const book = new Book({
  root: $('book'),
  perPage: 6,
  count: () => bookSize(shelf.kind, shelf.d),
  buildTile: (tile) => {
    tile.innerHTML = '<span class="mini"></span><span class="sc-mini"></span><span class="tile-n"></span><span class="tile-state"></span><span class="tile-how"></span>'
    tile.querySelector('.mini').append(...Array.from({ length: 81 }, () => document.createElement('span')))
  },
  drawTile: (tile, n) => {
    const { kind, d } = shelf
    const b = books[kind][d][n]
    tile.querySelector('.mini').hidden = kind !== 'sudoku'
    tile.querySelector('.sc-mini').hidden = kind !== 'sumcross'
    if (kind === 'sudoku') drawSudokuTile(tile.querySelector('.mini'), sudokuFor(d, n), b)
    else drawSumCrossTile(tile.querySelector('.sc-mini'), sumCrossFor(d, n), b)
    tile.querySelector('.tile-n').textContent = n
    tile.classList.toggle('solved', !!b?.done)
    tile.querySelector('.tile-state').textContent = b?.done ? clockText(b.time) : b ? `In progress · ${clockText(b.time)}` : 'Fresh'
    const how = tile.querySelector('.tile-how')
    how.textContent = b?.done ? howSolved(b) : ''
    how.classList.toggle('own', !!b?.done && isOwn(b))
  },
  startLabel: (n) => {
    const b = books[shelf.kind][shelf.d][n]
    return b?.done ? `Look at puzzle ${n}` : b ? `Continue puzzle ${n}` : `Start puzzle ${n}`
  },
  onStart: (n) => start(shelf.kind, shelf.d, n),
})
book.start.id = 'start'
book.label.id = 'page-at'
for (const [key, id] of Object.entries({ first: 'first-page', prev: 'prev-page', next: 'next-page', last: 'last-page' })) book.arrows[key].id = id

// Sudoku's small picture: givens dark, ink in pen colour, white-out as white squares.
function drawSudokuTile(mini, given, b) {
  const ink = b ? parse(b.values) : []
  const white = new Set(b?.whiteout)
  mini.querySelectorAll('span').forEach((sq, i) => {
    sq.textContent = given[i] || ink[i] || ''
    // White-out shows under new ink too, as on paper.
    sq.className = given[i] ? 'g' : [ink[i] && 'i', white.has(i) && 'w'].filter(Boolean).join(' ')
  })
}

// Sum Cross's small picture: the puzzle's shape, printed numbers dark, ink in pen colour.
function drawSumCrossTile(mini, p, b) {
  const boxes = drawBoard(mini, p, { square: true })
  const white = new Set(b?.whiteout)
  p.squares.forEach((s, i) => {
    if (!s.blank) return
    const v = b?.values?.[i] ?? null
    if (v !== null) {
      writeSquare(boxes[i], s.piece, v)
      boxes[i].classList.add('ink')
    }
    if (white.has(i)) boxes[i].classList.add('w')
  })
}

function openBook(kind, d, n = prefs(kind).at[d] ?? nextOpen(kind, d) ?? 1) {
  save.game = kind
  prefs(kind).difficulty = d
  saveGame()
  openCard = kind
  hideScreens()
  shelf = { kind, d }
  $('book-screen').hidden = false
  frame.setPage('play') // Home goes back to the launch page
  frame.help.hidden = true // the rules are for the board
  $('book-name').textContent = `${GAMES[kind].name} · ${DIFFICULTY_NAMES[d]}`
  applyTheme()
  book.open(n)
}

// --- The board ---------------------------------------------------------------------------------

// As close to a puzzle book as we can (the user's design, 2026-10-30). The touch decides: a tap
// pencils a note in, a drag inks a number. Nothing is checked while you play ("the back of the
// book"): when the grid is full it says solved, or only how many squares are wrong. Ink stays
// until White-out covers it (a white patch that stays, like on paper). There is no restart:
// a board is permanent, like a page. Hint (circles wrong ink) and Look (the answer key) are the back
// of the book: always there, and recorded, so "on your own" means something (willpower, not a rule).
//
// current = { kind, difficulty, n, given (per square: printed, so not to be filled), solution,
//   open (the squares to fill), values, notes, whiteout, checked (Sets), hints, looked, time,
//   hintAt, done, found, and for Sum Cross the puzzle }. Sudoku: values 0 = empty, notes = bit
//   masks. Sum Cross: values null = empty (0 can be an answer), notes = lists of numbers, and every
//   square of the crossword is a square (signs are "given").
let current = null
let pick = null // the number picked on the number row or in the bank
let sel = null // the square tapped last
let input = 'finger' // 'finger' | 'stylus', asked on the start card every time the game opens

const isSC = () => current?.kind === 'sumcross'
const inked = (i) => (isSC() ? current.values[i] !== null : current.values[i] !== 0)
const hasNotes = (i) => (isSC() ? current.notes[i].length > 0 : current.notes[i] !== 0)
const clearNotes = (i) => (current.notes[i] = isSC() ? [] : 0)
// Pencil goes in an open square without ink.
const canPencil = (i) => !current.given[i] && !inked(i)

// Sudoku's grid and number row.
const cells = Array.from({ length: 81 }, (_, i) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'cell' })
  b.setAttribute('role', 'gridcell')
  b.addEventListener('click', () => tapCell(i))
  return b
})
$('board').append(...cells)

const numberButtons = Array.from({ length: 9 }, (_, k) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'number', textContent: k + 1 })
  b.setAttribute('aria-pressed', 'false')
  draggable(b, k + 1)
  return b
})
$('numbers').append(...numberButtons)

// Sum Cross's board, drawn when a puzzle starts: its boxes, where each sits, which sums go through
// each, and the bank's tiles.
let scBoxes = []
let scAt = new Map() // "x,y" -> square
let scSumsOf = []
let bankTiles = []

// Pinch to zoom and drag to move (the toolbox's PanZoom, here moving a board of boxes with a CSS
// transform). A tap on a box is a tap on that square.
const scView = new PanZoom($('sc-view'), {
  width: UNIT,
  height: UNIT,
  maxZoom: 4,
  maxScale: 1.6,
  margin: 0.94,
  onTap: (x, y) => {
    const i = scAt.get(`${Math.floor(x / UNIT)},${Math.floor(y / UNIT)}`)
    if (i !== undefined) return tapCell(i)
    // A tap beside the puzzle lets go.
    pick = null
    sel = null
    if (current) render()
  },
  onChange: () => {
    $('sc-board').style.transform = `translate(${scView.tx}px, ${scView.ty}px) scale(${scView.s})`
    // The dragged number is the size of a box on screen (at least a finger's width).
    $('play-screen').style.setProperty('--ghost-size', `${Math.max(44, Math.round(UNIT * scView.s) + 6)}px`)
  },
})
new ResizeObserver(([entry]) => scView.resize(entry.contentRect.width, entry.contentRect.height)).observe($('sc-view'))

function setupSumCross() {
  const p = current.puzzle
  scBoxes = drawBoard($('sc-board'), p)
  scAt = new Map(p.squares.map((s, i) => [`${s.x},${s.y}`, i]))
  scSumsOf = p.squares.map(() => [])
  p.sums.forEach((sum, k) => sum.forEach((i) => scSumsOf[i].push(k)))
  bankTiles = p.bank.map((v) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'bank-tile', textContent: v })
    b.dataset.value = v
    b.setAttribute('aria-pressed', 'false')
    draggable(b, v)
    return b
  })
  $('bank').replaceChildren(...bankTiles)
  scView.setContent(p.width * UNIT, p.height * UNIT)
}

// Dragging a number onto a square inks it there, without changing the number picked for tapping.
// A quick tap is a tap (pencil).
let drag = null
let dragged = -Infinity
function draggable(b, d) {
  b.addEventListener('click', () => {
    if (performance.now() - dragged > 400) tapNumber(d)
  })
  b.addEventListener('pointerdown', (e) => {
    if (!current || current.done) return
    drag = { d, x: e.clientX, y: e.clientY, moved: false, over: -1 }
    b.setPointerCapture(e.pointerId)
  })
  b.addEventListener('pointermove', (e) => {
    if (!drag || (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10)) return
    drag.moved = true
    ghost.textContent = drag.d
    ghost.hidden = false
    const at = dropPoint(e)
    ghost.style.left = `${at.x}px`
    ghost.style.top = `${at.y}px`
    const over = squareAt(at)
    if (over !== drag.over) {
      dropTargets()[drag.over]?.classList.remove('drop')
      dropTargets()[over]?.classList.add('drop')
      drag.over = over
    }
  })
  b.addEventListener('pointerup', (e) => {
    if (drag?.moved) {
      dragged = performance.now() // a click right after a drag isn't a tap
      const over = squareAt(dropPoint(e))
      endDrag()
      if (over !== -1) dropOn(over, d)
    } else endDrag()
  })
  b.addEventListener('pointercancel', endDrag)
}

const ghost = Object.assign(document.createElement('div'), { className: 'ghost', hidden: true })
$('play-screen').append(ghost)
const dropTargets = () => (isSC() ? scBoxes : cells)
// The square under a point on screen, or -1.
function squareAt({ x, y }) {
  const el = document.elementFromPoint(x, y)
  if (isSC()) return Number(el?.closest('#sc-board .sc-sq')?.dataset.i ?? -1)
  return cells.indexOf(el?.closest('.cell'))
}
// Where the dragged number is: above a finger (so it can be seen), right at a stylus tip.
const dropPoint = (e) => ({ x: e.clientX, y: e.clientY - (input === 'finger' ? FINGER_LIFT : 0) })
function endDrag() {
  if (drag) dropTargets()[drag.over]?.classList.remove('drop')
  drag = null
  ghost.hidden = true
}
function dropOn(i, d) {
  current.found = -1
  if (isSC()) inkSumCross(i, d)
  else ink(i, d)
}

// Sudoku: the grid is as big as fits between the frame and the number row (square, at most 560 px);
// the grid, numbers and tools sit together in the middle. Sum Cross's board takes the room left.
function layout() {
  const area = $('play-screen').querySelector('.play-area')
  const { width, height } = area.getBoundingClientRect()
  const styles = getComputedStyle(area)
  const gap = 10
  const inner = height - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
  const below = ['.status', '.numbers', '.bottom-bar'].reduce((h, q) => h + area.querySelector(q).offsetHeight + gap, 0)
  const size = Math.floor(Math.min(width - 16, inner - below, 560))
  if (size > 0) $('play-screen').style.setProperty('--grid-size', `${size}px`)
  // Messages sit just above the number row or bank, never over the numbers or tools.
  requestAnimationFrame(() => {
    const top = $(isSC() ? 'bank' : 'numbers').getBoundingClientRect().top
    if (top > 0) $('play-screen').style.setProperty('--above-numbers', `${Math.round(window.innerHeight - top + 8)}px`)
  })
}
new ResizeObserver(() => layout()).observe($('play-screen').querySelector('.play-area'))

function start(kind, difficulty, n) {
  const kept = books[kind][difficulty][n]
  hideScreens()
  const board = {
    kind,
    difficulty,
    n,
    whiteout: new Set(kept?.whiteout ?? []),
    checked: new Set(kept?.checked ?? []),
    hints: kept?.hints ?? 0,
    looked: kept?.looked ?? false,
    time: kept?.time ?? 0,
    hintAt: kept?.hintAt ?? 0,
    done: kept?.done ?? null,
    found: -1,
  }
  if (kind === 'sudoku') {
    const given = sudokuFor(difficulty, n)
    Object.assign(board, {
      given,
      solution: solve(given),
      open: given.map((v, i) => (v ? -1 : i)).filter((i) => i !== -1),
      values: kept ? parse(kept.values).map((v, i) => given[i] || v) : given.slice(),
      notes: kept?.notes?.slice() ?? new Array(81).fill(0),
    })
  } else {
    const puzzle = sumCrossFor(difficulty, n)
    const { squares } = puzzle
    Object.assign(board, {
      puzzle,
      given: squares.map((s) => !s.blank),
      solution: squares.map((s) => (s.blank ? answerOf(s.piece) : null)),
      open: squares.map((s, i) => (s.blank ? i : -1)).filter((i) => i !== -1),
      values: squares.map((s, i) => (s.blank ? (kept?.values?.[i] ?? null) : null)),
      notes: squares.map((s, i) => kept?.notes?.[i]?.slice() ?? []),
    })
  }
  current = board
  prefs(kind).at[difficulty] = n
  save.game = kind
  saveGame()
  pick = null
  sel = null
  for (const id of ['rules', 'answer-key', 'ask-look']) $(id).hidden = true
  const sc = kind === 'sumcross'
  $('play-screen').hidden = false
  $('play-screen').classList.toggle('readonly', !!current.done)
  $('play-screen').classList.toggle('sumcross', sc)
  for (const id of ['grid', 'numbers', 'rules-sudoku']) $(id).hidden = sc
  for (const id of ['sc-view', 'bank', 'rules-sumcross']) $(id).hidden = !sc
  $('board').setAttribute('aria-label', 'Sudoku grid')
  if (sc) setupSumCross()
  frame.setPage('play')
  $('level-name').textContent = `${DIFFICULTY_NAMES[difficulty]} ${n}`
  applyTheme()
  layout()
  render()
  showClock()
  if (current.done) return
  startClock()
  const seen = GAMES[kind].rules
  if (!save.tips.includes(seen)) {
    save.tips.push(seen)
    saveGame()
    showRules()
  }
}

function showRules() {
  $('rules').hidden = false
}
$('rules').addEventListener('click', () => ($('rules').hidden = true))

// The board as it's kept in the book.
function boardRecord() {
  const { values, given, whiteout, checked, hints, looked } = current
  return {
    values: isSC() ? values.slice() : values.map((v, i) => (given[i] ? '.' : v || '.')).join(''),
    whiteout: [...whiteout],
    checked: [...checked],
    hints,
    looked,
  }
}

function saveBoard() {
  if (!current) return saveGame()
  const { kind, difficulty, n, open, notes, whiteout, hints, looked, time, hintAt, done } = current
  if (done) return // final
  // An untouched page stays out of the book's save until something is written on it.
  const touched = open.some((i) => inked(i) || hasNotes(i)) || whiteout.size || hints || looked
  if (!touched && !books[kind][difficulty][n]) return
  books[kind][difficulty][n] = { ...boardRecord(), notes, time: Math.round(time * 10) / 10, hintAt }
  saveBook(kind, difficulty)
}

const isSolved = () => current.open.every((i) => current.values[i] === current.solution[i])
const wrongInk = () => current.open.filter((i) => inked(i) && current.values[i] !== current.solution[i])

function render() {
  if (isSC()) renderSumCross()
  else renderSudoku()
  showRecord()
  showHintWait()
}

function renderSudoku() {
  const { given, values, notes, whiteout, checked, found } = current
  // The number to look for: the one picked, or the one in the square picked.
  const same = pick ?? (sel !== null ? values[sel] || null : null)
  const cross = sel === null ? [] : [Math.floor(sel / 9), sel % 9]
  for (let i = 0; i < 81; i++) {
    const c = cells[i]
    const v = values[i]
    c.className = 'cell'
    if (given[i]) c.classList.add('given')
    if (whiteout.has(i)) c.classList.add('whiteout')
    if (checked.has(i)) c.classList.add('checked')
    if (sel !== null && (Math.floor(i / 9) === cross[0] || i % 9 === cross[1])) c.classList.add('cross')
    if (same && v === same) c.classList.add('same')
    if (i === sel) c.classList.add('picked')
    if (i === found) c.classList.add('found')
    if (v) {
      c.textContent = v
      c.setAttribute('aria-label', `${v}${given[i] ? ', printed' : ''}${checked.has(i) ? ', circled: wrong' : ''}`)
    } else if (notes[i]) {
      const box = document.createElement('span')
      box.className = 'notes'
      for (let d = 1; d <= 9; d++)
        box.append(Object.assign(document.createElement('span'), { textContent: notes[i] & (1 << (d - 1)) ? d : '', className: notes[i] & (1 << (d - 1)) && d === same ? 'look' : '' }))
      c.replaceChildren(box)
      c.setAttribute('aria-label', `Notes ${digitsOf(notes[i]).join(' ')}`)
    } else {
      c.textContent = ''
      c.setAttribute('aria-label', whiteout.has(i) ? 'Whited out' : 'Empty')
    }
  }
  const counts = new Array(10).fill(0)
  for (const v of values) counts[v]++
  numberButtons.forEach((b, k) => {
    b.setAttribute('aria-pressed', String(pick === k + 1))
    b.classList.toggle('full', counts[k + 1] >= 9)
  })
}

// Sum Cross: the picked square lights up the sums through it; the number looked for (picked in the
// bank, or in the picked square) is tinted everywhere it is. A bank tile whose number is inked is
// dimmed (still tappable for pencil); White-out gives it back.
function renderSumCross() {
  const { puzzle, given, values, notes, whiteout, checked } = current
  const shown = (i) => (given[i] ? (isAnswer(puzzle.squares[i].piece) ? answerOf(puzzle.squares[i].piece) : null) : values[i])
  const same = pick ?? (sel !== null ? shown(sel) : null)
  const lit = new Set(sel === null ? [] : scSumsOf[sel].flatMap((k) => puzzle.sums[k]))
  puzzle.squares.forEach((s, i) => {
    const c = scBoxes[i]
    const v = shown(i)
    const flags = [whiteout.has(i) && 'whiteout', checked.has(i) && 'checked', lit.has(i) && 'cross', same !== null && v === same && 'same', i === sel && 'picked', s.blank && v !== null && 'ink']
    c.className = [c.className.split(' ').filter((k) => k.startsWith('sc-') || k === 'blank').join(' '), ...flags.filter(Boolean)].join(' ')
    if (!s.blank) return
    if (v !== null) {
      writeSquare(c, s.piece, v)
      c.setAttribute('aria-label', `${v}${checked.has(i) ? ', circled: wrong' : ''}`)
    } else if (notes[i].length) {
      writeNotes(c, s.piece, notes[i], same)
      c.setAttribute('aria-label', `Notes ${notes[i].join(' ')}`)
    } else {
      writeSquare(c, s.piece, null)
      c.setAttribute('aria-label', whiteout.has(i) ? 'Whited out' : 'Empty')
    }
  })
  const used = new Map()
  for (const i of current.open) if (values[i] !== null) used.set(values[i], (used.get(values[i]) ?? 0) + 1)
  const seen = new Map()
  for (const t of bankTiles) {
    const v = Number(t.dataset.value)
    const k = seen.get(v) ?? 0
    seen.set(v, k + 1)
    t.classList.toggle('used', k < (used.get(v) ?? 0))
    t.setAttribute('aria-pressed', String(pick === v))
  }
}

// --- Playing -----------------------------------------------------------------------------------

// Tapping a number: with an open square picked, pencils the number in there (the square stays
// picked for more notes). Otherwise picks the number (every copy lights up) or lets it go.
// Tapping only ever pencils, so a stray tap can't ink anything (user, 2026-10-30).
function tapNumber(d) {
  if (!current || current.done) return
  current.found = -1
  if (sel !== null && canPencil(sel)) return pencil(sel, d)
  pick = pick === d ? null : d
  sel = null
  render()
}

// Tapping a square: with a number picked, pencils it into an open square (on a filled one, lets
// the number go and looks there instead). Otherwise lights up the square's row and column (Sum
// Cross: its sums); tapping it again lets go. A held number and a picked square never go together.
function tapCell(i) {
  if (!current) return
  current.found = -1
  if (pick !== null) {
    if (canPencil(i)) return pencil(i, pick)
    pick = null
  }
  sel = sel === i ? null : i
  render()
}

// A pencil note on or off. Never checked.
function pencil(i, d) {
  if (isSC()) {
    const notes = current.notes[i]
    current.notes[i] = notes.includes(d) ? notes.filter((n) => n !== d) : [...notes, d].sort((a, b) => a - b)
  } else current.notes[i] ^= 1 << (d - 1)
  render()
  saveBoard()
}

// Inking a Sudoku number (a drag). Not checked. The square's notes go, and notes of that number
// leave its row, column and box, right or wrong alike (anything else would tell you if it was
// right). The same sound every time, for the same reason.
function ink(i, d) {
  if (current.done) return
  const { values, notes, given } = current
  if (given[i]) return toast('That number is printed.')
  if (values[i]) return toast('That square is inked. White-out covers it.')
  values[i] = d
  notes[i] = 0
  for (const p of PEERS[i]) notes[p] &= ~(1 << (d - 1))
  sound.chime()
  afterInk()
}

// Inking a Sum Cross number: a bank tile onto an empty box. Each bank number is there once (or as
// often as the bank has it); White-out gives it back. Not checked; the box's notes go.
function inkSumCross(i, d) {
  if (current.done) return
  const { values, notes, given, puzzle } = current
  if (!isAnswer(puzzle.squares[i].piece)) return toast('Numbers go in the empty boxes.')
  if (given[i]) return toast('That number is printed.')
  if (values[i] !== null) return toast('That box is inked. White-out covers it.')
  const left = puzzle.bank.filter((v) => v === d).length - current.open.filter((k) => values[k] === d).length
  if (left <= 0) return toast(`The bank's ${d} is used. White-out gives it back.`)
  values[i] = d
  notes[i] = []
  sound.chime()
  afterInk()
}

// After ink: a full board is checked against the back of the book (count only, user 2026-10-30).
function afterInk() {
  render()
  saveBoard()
  if (!current.open.every(inked)) return
  if (isSolved()) return setTimeout(finish, 450)
  const wrong = wrongInk().length
  sound.soft()
  toast(`Not quite: ${wrong} square${wrong > 1 ? 's are' : ' is'} wrong. White-out fixes ink.`, 5000)
}

// Under the board: how much of the back of the book was used, so "on your own" is plain to see.
function showRecord() {
  const { hints, looked, done, time } = current
  if (done) {
    $('record').textContent = `Solved ${new Date(`${done}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${clockText(time)} · ${howSolved(current)}`
    return
  }
  $('record').textContent = hints || looked ? [hints && `${hints} hint${hints > 1 ? 's' : ''}`, looked && 'looked at the answer key'].filter(Boolean).join(' · ') : 'On your own so far'
}

// White-out: covers the ink in the picked square with a white patch that stays, so the square can
// be inked again (in Sum Cross the number goes back to the bank). The only way to change ink, and
// to start a board over (square by square).
$('whiteout').addEventListener('click', () => {
  if (!current || current.done) return
  if (sel === null) return toast('Tap an inked square, then White-out.')
  if (current.given[sel]) return toast(isSC() && !isAnswer(current.puzzle.squares[sel].piece) ? 'Tap an inked box, then White-out.' : 'That number is printed.')
  if (!inked(sel)) return toast(hasNotes(sel) ? 'White-out is for ink. Erase clears pencil.' : 'Nothing to cover there.')
  current.values[sel] = isSC() ? null : 0
  clearNotes(sel)
  current.whiteout.add(sel)
  current.checked.delete(sel)
  render()
  saveBoard()
})

// The eraser: clears the pencil notes in the picked square.
$('erase').addEventListener('click', () => {
  if (!current || current.done) return
  if (sel === null || current.given[sel]) return toast('Tap a square with notes, then Erase.')
  if (inked(sel)) return toast('Erase is for pencil. White-out covers ink.')
  clearNotes(sel)
  render()
  saveBoard()
})

// --- Hint --------------------------------------------------------------------------------------

const clockText = (s) => {
  s = Math.floor(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const hintWait = () => (current ? Math.max(0, current.hintAt - current.time) : 0)

function showHintWait() {
  const wait = hintWait()
  $('hint-wait').textContent = wait > 0 ? clockText(Math.ceil(wait)) : ''
  $('hint').classList.toggle('waiting', wait > 0)
}

// Hint: circles every wrong inked square in red (until it's whited out). Then a 2-minute wait.
$('hint').addEventListener('click', () => {
  if (!current || isSolved()) return
  const wait = hintWait()
  if (wait > 0) return toast(`Your next hint is ready in ${clockText(Math.ceil(wait))}.`)
  if (!current.open.some(inked)) return toast('Nothing inked yet. Hint checks your ink.')
  const wrong = wrongInk()
  for (const i of wrong) current.checked.add(i)
  current.hints++
  current.hintAt = current.time + HINT_WAIT
  sound.ping()
  toast(wrong.length ? `${wrong.length} inked square${wrong.length > 1 ? 's are' : ' is'} wrong. ${wrong.length > 1 ? 'They are' : 'It is'} circled.` : 'Everything inked so far is right.', 4000)
  render()
  saveBoard()
})

// Look: the answer key. Asks the first time; after that it opens straight away for this puzzle.
$('look').addEventListener('click', () => {
  if (!current || isSolved()) return
  if (current.looked) return showAnswers()
  $('ask-look').hidden = false
})
$('look-no').addEventListener('click', () => ($('ask-look').hidden = true))
$('look-yes').addEventListener('click', () => {
  $('ask-look').hidden = true
  current.looked = true
  render()
  saveBoard()
  showAnswers()
})
const answerCells = Array.from({ length: 81 }, () => Object.assign(document.createElement('span'), { className: 'cell' }))
$('answer-board').append(...answerCells)
function showAnswers() {
  $('answer-board').hidden = isSC()
  $('sc-answer').hidden = !isSC()
  if (isSC()) {
    // The whole crossword filled in, as big as fits.
    const p = current.puzzle
    const boxes = drawBoard($('sc-answer'), p)
    const u = Math.floor(Math.min(UNIT, (window.innerWidth - 32) / p.width, (window.innerHeight - 140) / p.height))
    $('sc-answer').style.setProperty('--u', `${u}px`)
    p.squares.forEach((s, i) => {
      if (!s.blank) return
      writeSquare(boxes[i], s.piece, current.solution[i])
      boxes[i].classList.add('ink')
    })
  } else {
    answerCells.forEach((c, i) => {
      c.textContent = current.solution[i]
      c.className = current.given[i] ? 'cell given' : 'cell'
    })
  }
  $('answer-key').hidden = false
}
$('answer-key').addEventListener('click', () => ($('answer-key').hidden = true))

// --- Stopwatch ---------------------------------------------------------------------------------
// Counts play time only: it stops on the home page, when the app is hidden, and once solved.

let ticking = 0
let lastTick = 0
function startClock() {
  stopClock()
  lastTick = performance.now()
  ticking = setInterval(tick, 250)
}
function stopClock() {
  if (ticking) tick()
  clearInterval(ticking)
  ticking = 0
}
let lastSaved = 0
// The clock counts only while the board is in full view (user, 2026-10-30): not while the rules,
// Settings, the answer key, the "look?" question or the done card cover it, nor when the app is
// hidden. The hint wait counts the same time.
const boardInView = () =>
  current && !current.done && !document.hidden && ['rules', 'answer-key', 'ask-look', 'done'].every((id) => $(id).hidden) && !document.querySelector('dialog[open]')
function tick() {
  const now = performance.now()
  if (boardInView()) current.time += Math.min(now - lastTick, 1000) / 1000
  lastTick = now
  showClock()
  showHintWait()
  if (current && current.time - lastSaved > 10) {
    lastSaved = current.time
    saveBoard()
  }
}
function showClock() {
  $('clock-wrap').hidden = !panel.settings.showClock
  if (current) $('clock').textContent = clockText(current.time)
}
document.addEventListener('visibilitychange', () => {
  lastTick = performance.now()
  if (document.hidden) saveBoard()
})

// --- Done --------------------------------------------------------------------------------------

// Solved: the board becomes final (kept in the book to look at), then on to the next open puzzle,
// or, when the book is finished, to the next book (user, 2026-10-30).
let afterDone = null
function finish() {
  if ($('done').hidden === false) return
  stopClock()
  const { kind, difficulty: d, n, time } = current
  const before = tally(kind, d)
  current.done = today()
  books[kind][d][n] = { ...boardRecord(), time: Math.round(time), done: current.done }
  saveBook(kind, d)
  const own = isOwn(current)
  const name = DIFFICULTY_NAMES[d]
  const lines = [`${name} puzzle ${n}`]
  if (!own) lines.push(howSolved(current))
  // Best times count only puzzles solved on your own.
  if (panel.settings.showClock) {
    lines.push(`Time ${clockText(time)}`)
    if (own) lines.push(before.best === null ? `Your first ${name} time on your own` : time < before.best ? `A new best for ${name}!` : `Your best ${name}: ${clockText(before.best)}`)
  }
  pick = null
  sel = null
  $('play-screen').classList.add('readonly')
  render()
  sound.celebrate()
  const next = nextOpen(kind, d, n)
  if (next) {
    afterDone = () => start(kind, d, next)
    return showCard(own ? 'Solved on your own!' : 'Solved!', lines, `Next: puzzle ${next}`)
  }
  const after = DIFFICULTIES[DIFFICULTIES.indexOf(d) + 1]
  lines.push(after ? `You finished the ${name} book!` : 'You finished every book. New puzzles come with updates.')
  afterDone = after ? () => openBook(kind, after) : () => showHome()
  if (after) {
    prefs(kind).difficulty = after
    saveGame()
  }
  showCard(own ? 'Solved on your own!' : 'Solved!', lines, after ? `Open the ${DIFFICULTY_NAMES[after]} book` : 'Home')
}

function showCard(title, lines, action) {
  $('done-title').textContent = title
  $('done-lines').replaceChildren(...lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })))
  $('next').textContent = action
  $('done').hidden = false
}

$('next').addEventListener('click', () => afterDone?.())
$('done-home').addEventListener('click', () => openBook(current.kind, current.difficulty, current.n))

// --- Little things -----------------------------------------------------------------------------

// True when the picked square is low on the screen (messages then go to the top).
function selLow() {
  if (sel === null) return false
  if (!isSC()) return sel >= 45
  const r = scBoxes[sel].getBoundingClientRect()
  return r.top + r.height / 2 > window.innerHeight * 0.45
}

let toastTimer = 0
function toast(text, ms = 2800) {
  const el = $('toast')
  el.textContent = text
  // Away from the square being looked at: at the top when it's in the bottom half.
  el.classList.toggle('top', selLow())
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), ms)
}

// A keyboard helps when playing on the computer: 1-9 pencils into the picked square (like a tap),
// Shift + 1-9 inks it (like a drag), arrows move, Backspace erases notes, W whites out, Esc lets go.
// Sum Cross has numbers of any size, so only Backspace, W and Esc work there.
document.addEventListener('keydown', (e) => {
  if (!current || current.done || $('done').hidden === false || document.querySelector('dialog[open]')) return
  const digit = !isSC() && /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) : 0
  if (digit && e.shiftKey) {
    if (sel !== null) ink(sel, digit)
  } else if (digit) tapNumber(digit)
  else if (e.key === 'Backspace' || e.key === 'Delete') $('erase').click()
  else if (e.key === 'w' || e.key === 'W') $('whiteout').click()
  else if (e.key === 'Escape') {
    pick = null
    sel = null
    render()
  } else if (e.key.startsWith('Arrow') && !isSC()) {
    const at = sel ?? 40
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
    const r = (Math.floor(at / 9) + dr + 9) % 9
    const c = ((at % 9) + dc + 9) % 9
    sel = r * 9 + c
    render()
  } else return
  e.preventDefault()
})

// --- Start -------------------------------------------------------------------------------------

showHome()
packsReady.then(() => $('home').hidden || showHome())
// For the tests (and curious grown-ups in the browser console).
window.quietNumbers = {
  panel,
  get input() {
    return input
  },
  start,
  openBook,
  packsReady,
  books,
  scView,
  get current() {
    return current
  },
  get save() {
    return save
  },
}

// Finger or stylus, asked every time (user, 2026-10-30): it only changes how dragging works.
tapToStart({
  title: 'Quiet Numbers',
  subtitle: 'How are you playing today?',
  choices: [
    { value: 'finger', label: 'Finger', hint: 'Numbers float above your finger' },
    { value: 'stylus', label: 'Stylus', hint: 'Numbers sit at the tip' },
  ],
  onStart: (how) => {
    input = how
    document.documentElement.dataset.input = how
    sound.unlock()
  },
})
warmOffline('offline-files.json')
