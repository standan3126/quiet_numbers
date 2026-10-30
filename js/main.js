// Quiet Numbers: the launch page, the Sudoku play screen, saves and the GameHub pieces. The rules
// and solver are in sudoku.js; the puzzles are made ahead of time (tools/make-sudoku.mjs) and read
// from data/sudoku.json. Settings use the toolbox's shared panel (/shared/v1/settings.js).

import { gameFrame, setupPage, tapToStart, warmOffline } from '/shared/v1/kit.js'
import { gameStore } from '/shared/v1/save.js'
import { SettingsPanel, toggle } from '/shared/v1/settings.js'
import { Sound } from '/shared/v1/sound/index.js'
import { DIFFICULTIES, DIFFICULTY_NAMES, PEERS, digitsOf, parse, solve } from './sudoku.js'

const GAME_ID = 'quiet-numbers'
const store = gameStore(GAME_ID)

// Hint circles wrong ink. One whenever you like, then the next is ready 2 minutes (of play) later
// (user, 2026-10-30: "so you cant just keep using it").
const HINT_WAIT = 120
// Finger dragging: the number floats this far above the fingertip, and lands where the number
// is, not where the finger is (user, 2026-10-30: "otherwise you are placing the number blind").
const FINGER_LIFT = 72
// Puzzles per page of a book (user, 2026-10-30).
const PER_PAGE = 6

const DIFFICULTY_NOTES = {
  easy: 'Plenty of numbers to start with. A gentle warm-up.',
  medium: 'Fewer numbers. Look along the rows and columns.',
  hard: 'Pencil notes help. Needs a few clever tricks.',
  expert: 'The toughest tricks. Still never needs a guess.',
}

// Lessons, each shown once, when a puzzle starts.
const TIPS = [
  {
    id: 'paper',
    text: 'Like a puzzle book. Tap to pencil in notes (a square then numbers, or a number then squares). Drag a number onto a square to ink it. Nothing is checked until the grid is full. Hint circles wrong ink; Look opens the answer key.',
  },
]

// Every difficulty is a book of puzzles (user, 2026-10-30): flip to any page, play any puzzle.
// A finished puzzle is final: it stays in the book to look at, locked. Finishing a book moves you on
// to the next difficulty. Saves (format v2; v1 test saves start fresh, the user agreed):
//   save:        { v, game, difficulty (the book picked), at: { easy: puzzle last opened }, tips }
//   book-<diff>: { [puzzle number]: board }, board = { values (81: '.' or ink), notes (while open),
//                whiteout, checked (square lists), hints, looked, time, hintAt, done (local day) }
const NEW_SAVE = () => ({ v: 2, game: 'sudoku', difficulty: 'easy', at: {}, tips: [] })

let save
const books = {}
function load() {
  const saved = store.get('save', {})
  save = saved.v === 2 ? { ...NEW_SAVE(), ...saved, at: { ...saved.at } } : NEW_SAVE()
  for (const d of DIFFICULTIES) books[d] = store.get(`book-${d}`, {})
}
load()
const saveGame = () => store.set('save', save)
const saveBook = (d) => store.set(`book-${d}`, books[d])
saveGame()

const today = () => new Date().toLocaleDateString('en-CA') // the local day, YYYY-MM-DD
const isOwn = (b) => !b.hints && !b.looked
// A book's tally: how many solved, how many on your own, the best time on your own.
function tally(d) {
  const done = Object.values(books[d]).filter((b) => b.done)
  const own = done.filter(isOwn)
  return { solved: done.length, own: own.length, best: own.length ? Math.min(...own.map((b) => b.time)) : null }
}
const bookSize = (d) => packs[d].length
// The first unsolved puzzle after n (then from the start); null when the book is finished.
function nextOpen(d, n = 0) {
  const size = bookSize(d)
  for (let k = 1; k <= size; k++) {
    const m = ((n + k - 1) % size) + 1
    if (!books[d][m]?.done) return m
  }
  return null
}

const sound = new Sound({ notes: 0.7, nature: 0.5, music: 0.35 })

const $ = (id) => document.getElementById(id)
setupPage()
// Home goes up one step: from a puzzle to its book, from a book to the launch page.
const frame = gameFrame({
  onSettings: () => panel.open(),
  beforeExit: () => saveBoard(),
  onHome: () => {
    saveBoard()
    if (current) openBook(current.difficulty, current.n)
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
      title: 'Sudoku',
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
const packsReady = fetch('data/sudoku.json')
  .then((r) => r.json())
  .then((data) => (packs = data))

// Puzzle n of a difficulty (1 to the book's size).
const puzzleFor = (difficulty, n) => parse(packs[difficulty][n - 1])

// --- Home --------------------------------------------------------------------------------------

// The launch page: a card per game that opens to show what it is and how hard. Each kind of
// information has its own look (user, 2026-10-30: "finding the information was difficult because
// its all the same font, same size, same color"): the about text is plain and soft, how far you are
// is bold, a waiting board is a coloured line. Play opens the book.
const difficultyRows = DIFFICULTIES.map((d) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'level-row' })
  b.dataset.value = d
  b.setAttribute('role', 'radio')
  b.innerHTML = '<span class="level-name"></span><span class="level-at"><b></b> of <span class="level-size"></span> solved</span>'
  b.querySelector('.level-name').textContent = DIFFICULTY_NAMES[d]
  b.addEventListener('click', () => {
    save.difficulty = d
    saveGame()
    showHome()
  })
  return b
})
$('difficulty').append(...difficultyRows)

let cardOpen = true
$('open-sudoku').addEventListener('click', () => {
  cardOpen = !cardOpen
  showHome()
})

function hideScreens() {
  stopClock()
  current = null
  for (const id of ['home', 'book-screen', 'play-screen', 'done']) $(id).hidden = true
}

function showHome() {
  hideScreens()
  $('home').hidden = false
  frame.setPage('launch')
  $('open-sudoku').setAttribute('aria-expanded', String(cardOpen))
  $('sudoku-body').hidden = !cardOpen
  const d = save.difficulty
  $('difficulty-note').textContent = DIFFICULTY_NOTES[d]
  applyTheme()
  if (!packs) return
  for (const row of difficultyRows) {
    const r = row.dataset.value
    row.setAttribute('aria-checked', String(r === d))
    row.querySelector('b').textContent = tally(r).solved
    row.querySelector('.level-size').textContent = bookSize(r)
  }
  const at = save.at[d]
  const waiting = at && books[d][at] && !books[d][at].done
  const next = nextOpen(d)
  $('board-status').textContent = waiting ? `Puzzle ${at} is waiting where you left it.` : next ? `Next: puzzle ${next}.` : `You finished the ${DIFFICULTY_NAMES[d]} book.`
  $('board-status').classList.toggle('waiting', !!waiting)
}

// "On your own", "2 hints", "Looked", "1 hint, looked".
function howSolved({ hints, looked }) {
  if (!hints && !looked) return 'On your own'
  const text = [hints && `${hints} hint${hints > 1 ? 's' : ''}`, looked && 'looked'].filter(Boolean).join(', ')
  return text[0].toUpperCase() + text.slice(1)
}

$('play').addEventListener('click', async () => {
  await packsReady
  openBook(save.difficulty)
})

// --- The book ----------------------------------------------------------------------------------
// Six puzzles a page, each a small picture of its board with how it stands. Flip with the arrows;
// pick one, then Start (greyed until one is picked).

let bookPage = 1
let chosen = null // the puzzle picked on the page

const tiles = Array.from({ length: PER_PAGE }, () => {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'tile' })
  b.innerHTML = '<span class="mini"></span><span class="tile-n"></span><span class="tile-state"></span><span class="tile-how"></span>'
  b.querySelector('.mini').append(...Array.from({ length: 81 }, () => document.createElement('span')))
  b.addEventListener('click', () => {
    chosen = Number(b.dataset.n)
    showBook()
  })
  return b
})
$('tiles').append(...tiles)

function openBook(d, n = save.at[d] ?? nextOpen(d) ?? 1) {
  save.difficulty = d
  saveGame()
  chosen = n
  bookPage = Math.ceil(n / PER_PAGE)
  showBook()
}

function showBook() {
  hideScreens()
  $('book-screen').hidden = false
  frame.setPage('play') // Home goes back to the launch page
  const d = save.difficulty
  const pages = Math.ceil(bookSize(d) / PER_PAGE)
  bookPage = Math.min(Math.max(1, bookPage), pages)
  $('book-name').textContent = `${DIFFICULTY_NAMES[d]} book`
  $('page-at').textContent = `Page ${bookPage} of ${pages}`
  tiles.forEach((t, k) => {
    const n = (bookPage - 1) * PER_PAGE + k + 1
    t.hidden = n > bookSize(d)
    if (t.hidden) return
    t.dataset.n = n
    const b = books[d][n]
    const given = puzzleFor(d, n)
    const ink = b ? parse(b.values) : []
    const white = new Set(b?.whiteout)
    t.querySelectorAll('.mini span').forEach((sq, i) => {
      sq.textContent = given[i] || ink[i] || ''
      // White-out shows under new ink too, as on paper.
      sq.className = given[i] ? 'g' : [ink[i] && 'i', white.has(i) && 'w'].filter(Boolean).join(' ')
    })
    t.querySelector('.tile-n').textContent = n
    t.classList.toggle('solved', !!b?.done)
    t.setAttribute('aria-pressed', String(n === chosen))
    t.querySelector('.tile-state').textContent = b?.done ? clockText(b.time) : b ? `In progress · ${clockText(b.time)}` : 'Fresh'
    const how = t.querySelector('.tile-how')
    how.textContent = b?.done ? howSolved(b) : ''
    how.classList.toggle('own', !!b?.done && isOwn(b))
  })
  for (const id of ['first-page', 'prev-page']) $(id).disabled = bookPage === 1
  for (const id of ['next-page', 'last-page']) $(id).disabled = bookPage === pages
  const b = chosen && books[d][chosen]
  const start = $('start')
  start.disabled = !chosen
  start.textContent = !chosen ? 'Pick a puzzle' : b?.done ? `Look at puzzle ${chosen}` : b ? `Continue puzzle ${chosen}` : `Start puzzle ${chosen}`
  applyTheme()
}

// Flipping to another page lets go of a puzzle picked on the old one (Start greys until you pick).
const flip = (to) => () => {
  bookPage = to()
  if (chosen && Math.ceil(chosen / PER_PAGE) !== Math.min(bookPage, Math.ceil(bookSize(save.difficulty) / PER_PAGE))) chosen = null
  showBook()
}
$('first-page').addEventListener('click', flip(() => 1))
$('prev-page').addEventListener('click', flip(() => bookPage - 1))
$('next-page').addEventListener('click', flip(() => bookPage + 1))
$('last-page').addEventListener('click', flip(() => Infinity))
$('start').addEventListener('click', () => chosen && start(save.difficulty, chosen))

// --- The board ---------------------------------------------------------------------------------

// As close to a puzzle book as we can (the user's design, 2026-10-30). The touch decides: a tap
// pencils a note in, a drag inks a number. Nothing is checked while you play ("the back of the
// book"): when the grid is full it says solved, or only how many squares are wrong. Ink stays
// until White-out covers it (an off-white patch that stays, like on paper). There is no restart:
// a board is permanent, like a page. Hint (circles wrong ink) and Look (the answer key) are the back
// of the book: always there, and recorded, so "on your own" means something (willpower, not a rule).
// values = givens and ink (right or wrong); whiteout / checked = squares (Sets); hints = how often
// Hint was used; looked = the answer key was opened before the puzzle was finished.
// done = the day it was solved: the board is then final, to look at only.
let current = null // { difficulty, n, given, solution, values, notes, whiteout, checked, hints, looked, time, hintAt, done, found }
let pick = null // the number picked on the number row
let sel = null // the square tapped last
let input = 'finger' // 'finger' | 'stylus', asked on the start card every time the game opens

const cells = Array.from({ length: 81 }, (_, i) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'cell' })
  b.setAttribute('role', 'gridcell')
  b.addEventListener('click', () => tapCell(i))
  return b
})
$('board').append(...cells)

const numberButtons = Array.from({ length: 9 }, (_, k) => {
  const d = k + 1
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'number', textContent: d })
  b.setAttribute('aria-pressed', 'false')
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
    hideCoach()
    ghost.textContent = drag.d
    ghost.hidden = false
    const at = dropPoint(e)
    ghost.style.left = `${at.x}px`
    ghost.style.top = `${at.y}px`
    const over = cellAt(at)
    if (over !== drag.over) {
      cells[drag.over]?.classList.remove('drop')
      cells[over]?.classList.add('drop')
      drag.over = over
    }
  })
  b.addEventListener('pointerup', (e) => {
    if (drag?.moved) {
      dragged = performance.now() // a click right after a drag isn't a tap
      const over = cellAt(dropPoint(e))
      endDrag()
      if (over !== -1) dropOn(over, d)
    } else endDrag()
  })
  b.addEventListener('pointercancel', endDrag)
  return b
})
$('numbers').append(...numberButtons)

// Dragging a number onto a square inks it there, without changing the number picked for tapping.
let drag = null
let dragged = -Infinity
const ghost = Object.assign(document.createElement('div'), { className: 'ghost', hidden: true })
$('play-screen').append(ghost)
const cellAt = ({ x, y }) => cells.indexOf(document.elementFromPoint(x, y)?.closest('.cell'))
// Where the dragged number is: above a finger (so it can be seen), right at a stylus tip.
const dropPoint = (e) => ({ x: e.clientX, y: e.clientY - (input === 'finger' ? FINGER_LIFT : 0) })
function endDrag() {
  if (drag) cells[drag.over]?.classList.remove('drop')
  drag = null
  ghost.hidden = true
}
function dropOn(i, d) {
  current.found = -1
  ink(i, d)
}

// The grid is as big as fits between the frame and the number row (square, at most 560 px); the
// grid, numbers and tools sit together in the middle.
new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect
  const gap = 10
  const below = ['.status', '.numbers', '.bottom-bar'].reduce((h, q) => h + $('play-screen').querySelector(q).offsetHeight + gap, 0)
  const size = Math.floor(Math.min(width, height - below, 560))
  if (size > 0) $('play-screen').style.setProperty('--grid-size', `${size}px`)
  // Messages sit just above the number row, never over the numbers or tools.
  requestAnimationFrame(() => {
    const top = $('numbers').getBoundingClientRect().top
    if (top > 0) $('play-screen').style.setProperty('--above-numbers', `${Math.round(window.innerHeight - top + 8)}px`)
  })
}).observe($('play-screen').querySelector('.play-area'))

function start(difficulty, n) {
  const given = puzzleFor(difficulty, n)
  const solution = solve(given)
  const kept = books[difficulty][n]
  hideScreens()
  current = {
    difficulty,
    n,
    given,
    solution,
    values: kept ? parse(kept.values).map((v, i) => given[i] || v) : given.slice(),
    notes: kept?.notes?.slice() ?? new Array(81).fill(0),
    whiteout: new Set(kept?.whiteout ?? []),
    checked: new Set(kept?.checked ?? []),
    hints: kept?.hints ?? 0,
    looked: kept?.looked ?? false,
    time: kept?.time ?? 0,
    hintAt: kept?.hintAt ?? 0,
    done: kept?.done ?? null,
    found: -1,
  }
  save.at[difficulty] = n
  saveGame()
  pick = null
  sel = null
  $('play-screen').hidden = false
  $('play-screen').classList.toggle('readonly', !!current.done)
  frame.setPage('play')
  $('level-name').textContent = `${DIFFICULTY_NAMES[difficulty]} ${n}`
  applyTheme()
  render()
  showClock()
  if (current.done) return
  startClock()
  const tip = TIPS.find((t) => !save.tips.includes(t.id))
  if (tip) coach(tip)
  else $('coach').hidden = true
}

function saveBoard() {
  if (!current) return saveGame()
  const { difficulty, n, given, values, notes, whiteout, checked, hints, looked, time, hintAt, done } = current
  if (done) return // final
  // An untouched page stays out of the book's save until something is written on it.
  const touched = values.some((v, i) => v && !given[i]) || notes.some(Boolean) || whiteout.size || hints || looked
  if (!touched && !books[difficulty][n]) return
  books[difficulty][n] = { values: values.map((v, i) => (given[i] ? '.' : v || '.')).join(''), notes, whiteout: [...whiteout], checked: [...checked], hints, looked, time: Math.round(time * 10) / 10, hintAt }
  saveBook(difficulty)
}

const isSolved = () => current.values.every((v, i) => v === current.solution[i])
const wrongCount = () => current.values.filter((v, i) => v && v !== current.solution[i]).length
const onYourOwn = () => !current.hints && !current.looked

function render() {
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
  showRecord()
  const counts = new Array(10).fill(0)
  for (const v of values) counts[v]++
  numberButtons.forEach((b, k) => {
    b.setAttribute('aria-pressed', String(pick === k + 1))
    b.classList.toggle('full', counts[k + 1] >= 9)
  })
  showHintWait()
}

// --- Playing -----------------------------------------------------------------------------------

// Tapping a number: with an open square picked, pencils the number in there (the square stays
// picked for more notes). Otherwise picks the number (every copy lights up) or lets it go.
// Tapping only ever pencils, so a stray tap can't ink anything (user, 2026-10-30).
function tapNumber(d) {
  if (!current || current.done) return
  hideCoach()
  current.found = -1
  if (sel !== null && !current.values[sel]) return pencil(sel, d)
  pick = pick === d ? null : d
  sel = null
  render()
}

// Tapping a square: with a number picked, pencils it into an open square (on a filled one, lets
// the number go and looks there instead). Otherwise lights up the square's row and column;
// tapping it again lets go. A held number and a picked square never go together.
function tapCell(i) {
  if (!current) return
  hideCoach()
  current.found = -1
  if (pick !== null) {
    if (!current.values[i]) return pencil(i, pick)
    pick = null
  }
  sel = sel === i ? null : i
  render()
}

// A pencil note on or off. Never checked.
function pencil(i, d) {
  current.notes[i] ^= 1 << (d - 1)
  render()
  saveBoard()
}

// Inking a number (a drag). Not checked. The square's notes go, and notes of that number leave its
// row, column and box, right or wrong alike (anything else would tell you if it was right). The
// same sound every time, for the same reason.
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

// After ink: a full grid is checked against the back of the book (count only, user 2026-10-30).
function afterInk() {
  render()
  saveBoard()
  if (current.values.some((v) => !v)) return
  if (isSolved()) return setTimeout(finish, 450)
  const wrong = wrongCount()
  sound.soft()
  toast(`Not quite: ${wrong} square${wrong > 1 ? 's are' : ' is'} wrong. White-out fixes ink.`, 5000)
}

// Under the grid: how much of the back of the book was used, so "on your own" is plain to see.
function showRecord() {
  const { hints, looked, done, time } = current
  if (done) {
    $('record').textContent = `Solved ${new Date(`${done}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${clockText(time)} · ${howSolved(current)}`
    return
  }
  $('record').textContent = hints || looked ? [hints && `${hints} hint${hints > 1 ? 's' : ''}`, looked && 'looked at the answer key'].filter(Boolean).join(' · ') : 'On your own so far'
}

// White-out: covers the ink in the picked square with an off-white patch that stays, so the square
// can be inked again. The only way to change ink, and to start a board over (square by square).
$('whiteout').addEventListener('click', () => {
  if (!current || current.done) return
  if (sel === null) return toast('Tap an inked square, then White-out.')
  if (current.given[sel]) return toast('That number is printed.')
  if (!current.values[sel]) return toast(current.notes[sel] ? 'White-out is for ink. Erase clears pencil.' : 'Nothing to cover there.')
  current.values[sel] = 0
  current.notes[sel] = 0
  current.whiteout.add(sel)
  current.checked.delete(sel)
  render()
  saveBoard()
})

// The eraser: clears the pencil notes in the picked square.
$('erase').addEventListener('click', () => {
  if (!current || current.done) return
  if (sel === null || current.given[sel]) return toast('Tap a square with notes, then Erase.')
  if (current.values[sel]) return toast('Erase is for pencil. White-out covers ink.')
  current.notes[sel] = 0
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
  const { values, solution, given } = current
  if (!values.some((v, i) => v && !given[i])) return toast('Nothing inked yet. Hint checks your ink.')
  const wrong = values.map((v, i) => (v && !given[i] && v !== solution[i] ? i : -1)).filter((i) => i !== -1)
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
  answerCells.forEach((c, i) => {
    c.textContent = current.solution[i]
    c.className = current.given[i] ? 'cell given' : 'cell'
  })
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
function tick() {
  const now = performance.now()
  if (current && !document.hidden) current.time += Math.min(now - lastTick, 1000) / 1000
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
  const { difficulty: d, n, time } = current
  const before = tally(d)
  current.done = today()
  books[d][n] = { values: current.values.map((v, i) => (current.given[i] ? '.' : v)).join(''), whiteout: [...current.whiteout], checked: [...current.checked], hints: current.hints, looked: current.looked, time: Math.round(time), done: current.done }
  saveBook(d)
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
  const next = nextOpen(d, n)
  if (next) {
    afterDone = () => start(d, next)
    return showCard(own ? 'Solved on your own!' : 'Solved!', lines, `Next: puzzle ${next}`)
  }
  const after = DIFFICULTIES[DIFFICULTIES.indexOf(d) + 1]
  lines.push(after ? `You finished the ${name} book!` : 'You finished every book. New puzzles come with updates.')
  afterDone = after ? () => openBook(after) : () => showHome()
  if (after) {
    save.difficulty = after
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
$('done-home').addEventListener('click', () => openBook(current.difficulty, current.n))

// --- Little things -----------------------------------------------------------------------------

let toastTimer = 0
function toast(text, ms = 2800) {
  const el = $('toast')
  el.textContent = text
  // Away from the square being looked at: at the top when it's in the bottom half.
  el.classList.toggle('top', sel !== null && sel >= 45)
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), ms)
}

function coach(tip) {
  save.tips.push(tip.id)
  saveGame()
  $('coach-text').textContent = tip.text
  $('coach').hidden = false
}
const hideCoach = () => ($('coach').hidden = true)
$('coach-ok').addEventListener('click', hideCoach)

// A keyboard helps when playing on the computer: 1-9 pencils into the picked square (like a tap),
// Shift + 1-9 inks it (like a drag), arrows move, Backspace erases notes, W whites out, Esc lets go.
document.addEventListener('keydown', (e) => {
  if (!current || current.done || $('done').hidden === false || document.querySelector('dialog[open]')) return
  const digit = /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) : 0
  if (digit && e.shiftKey) {
    if (sel !== null) ink(sel, digit)
  } else if (digit) tapNumber(digit)
  else if (e.key === 'Backspace' || e.key === 'Delete') $('erase').click()
  else if (e.key === 'w' || e.key === 'W') $('whiteout').click()
  else if (e.key === 'Escape') {
    pick = null
    sel = null
    render()
  } else if (e.key.startsWith('Arrow')) {
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
