// Drawing a Sum Cross puzzle: one box per square on a CSS grid (numbers, signs and = alike), the ²
// in its number's top right corner (also when the box is empty), and every empty spot boxed in on
// all four sides filled dark, like a crossword's black squares. The board you play on, the answer
// key and the small pictures in the book all use it; the size of a box is the CSS variable --u.
// Box lines are outlines on the box edge, so neighbours share one line (user, 2026-10-30).

import { answerOf, isAnswer, isPow } from './sumcross.js'

const NEXT = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// Puts the puzzle's boxes in `el` and returns them (box k = square k). Signs and printed numbers
// are written in; blanks are left empty for the game. `square`: centred on a square grid (the
// book's small pictures).
export function drawBoard(el, p, { square = false } = {}) {
  const cols = square ? Math.max(p.width, p.height) : p.width
  const rows = square ? cols : p.height
  const dx = Math.floor((cols - p.width) / 2)
  const dy = Math.floor((rows - p.height) / 2)
  el.style.setProperty('--cols', cols)
  el.style.setProperty('--rows', rows)
  const place = (sq, x, y) => (sq.style.gridArea = `${y + dy + 1} / ${x + dx + 1}`)
  const boxes = p.squares.map((s, i) => {
    const sq = document.createElement('span')
    place(sq, s.x, s.y)
    sq.className = baseClass(s)
    sq.dataset.i = i
    writeSquare(sq, s.piece, s.blank ? null : isAnswer(s.piece) ? answerOf(s.piece) : s.piece)
    return sq
  })
  const filled = new Set(p.squares.map((s) => `${s.x},${s.y}`))
  const holes = []
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      if (filled.has(`${x},${y}`) || !NEXT.every(([ax, ay]) => filled.has(`${x + ax},${y + ay}`))) continue
      const hole = Object.assign(document.createElement('span'), { className: 'sc-hole' })
      place(hole, x, y)
      holes.push(hole)
    }
  el.replaceChildren(...boxes, ...holes)
  return boxes
}

export const baseClass = (s) => `sc-sq ${isAnswer(s.piece) ? 'sc-num' : 'sc-sign'}${s.blank ? ' blank' : ''}`

// A number (or sign) in a box; null leaves it empty. A squared box keeps its ².
export function writeSquare(sq, piece, value) {
  const text = value === null ? '' : String(value)
  sq.dataset.len = Math.max(1, Math.min(3, text.length + (isPow(piece) ? 1 : 0)))
  sq.replaceChildren(text)
  if (isPow(piece)) sq.append(power())
}

// Pencil notes, small; the ones matching `look` stand out.
export function writeNotes(sq, piece, notes, look) {
  const box = Object.assign(document.createElement('span'), { className: 'sc-notes' })
  box.append(...notes.map((n) => Object.assign(document.createElement('span'), { textContent: n, className: n === look ? 'look' : '' })))
  sq.replaceChildren(box)
  if (isPow(piece)) sq.append(power())
}

const power = () => Object.assign(document.createElement('sup'), { textContent: '2' })
