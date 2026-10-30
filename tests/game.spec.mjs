// Plays Quiet Numbers in phone-sized browsers: npm test (starts its own server on 4230).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const FAMILY_CODE = process.env.HUB_CODE ?? readFileSync(new URL('../../hub/private/family-code.txt', import.meta.url), 'utf8').trim()

// The start card asks Finger or Stylus every time.
const start = async (page, how = 'Finger') => {
  await page.goto('./')
  await page.locator('.hub-start button', { hasText: how }).click()
  await expect(page.locator('#home')).toBeVisible()
}

const play = async (page) => {
  await page.locator('#play').click()
  await expect(page.locator('#play-screen')).toBeVisible()
  if (await page.locator('#coach').isVisible()) await page.locator('#coach-ok').click()
}

const cell = (page, i) => page.locator('.cell').nth(i)
const number = (page, d) => page.locator('.number').nth(d - 1)
const state = (page) => page.evaluate(() => {
  const c = window.quietNumbers.current
  return { values: c.values, solution: c.solution, given: c.given, notes: c.notes, time: c.time }
})
// Inks d into square i by dragging it from the number row (a finger holds it 72 px above itself).
const inkBy = async (page, i, d, lift = 72) => {
  const from = await number(page, d).boundingBox()
  const to = await cell(page, i).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + lift, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(420) // the click after a drag is ignored for a moment
}
const bit = (d) => 1 << (d - 1)
// An empty square and the number that belongs there.
const emptyCell = async (page, skip = 0) => {
  const { values, solution } = await state(page)
  const i = values.map((v, k) => (v ? -1 : k)).filter((k) => k !== -1)[skip]
  return { i, d: solution[i] }
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
})

test('the frame, and Easy 1 solved on your own by dragging the answers in', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await start(page)
  await expect(page.getByRole('button', { name: 'Exit to GameHub' })).toBeVisible()
  await expect(page.locator('#levels')).toBeHidden()
  const gear = await page.locator('.hub-gear').boundingBox()
  await play(page)
  await expect(page.getByRole('button', { name: 'Exit to GameHub' })).toBeHidden()
  expect(await page.locator('.hub-gear').boundingBox()).toEqual(gear) // never moves
  await expect(page.locator('#level-name')).toHaveText('Easy 1')
  await expect(page.locator('#pen, #pencil, #undo')).toHaveCount(0) // paper: no modes, no undo
  await expect(page.locator('#record')).toHaveText('On your own so far')

  // Everything fits: label between Home and the gear, grid above the numbers, tools on screen.
  const view = page.viewportSize()
  const label = await page.locator('.level-label').boundingBox()
  const home = await page.locator('.hub-corner', { hasText: 'Home' }).boundingBox()
  expect(label.x).toBeGreaterThan(home.x + home.width)
  expect(label.x + label.width).toBeLessThan(gear.x)
  const board = await page.locator('#board').boundingBox()
  const numbers = await page.locator('#numbers').boundingBox()
  const bar = await page.locator('.bottom-bar').boundingBox()
  expect(board.y).toBeGreaterThan(label.y + label.height)
  expect(board.y + board.height).toBeLessThanOrEqual(numbers.y)
  expect(numbers.y + numbers.height).toBeLessThanOrEqual(bar.y)
  expect(bar.y + bar.height).toBeLessThanOrEqual(view.height)
  expect(bar.x).toBeGreaterThanOrEqual(0)
  expect(bar.x + bar.width).toBeLessThanOrEqual(view.width)
  expect(board.width).toBeGreaterThan(view.width * 0.85)
  expect(Math.abs(board.width - board.height)).toBeLessThan(1)

  // All but three filled by the computer's own hand (fast), the last three dragged like a finger.
  await page.evaluate(() => {
    const c = window.quietNumbers.current
    const open = c.values.map((v, i) => (v ? -1 : i)).filter((i) => i !== -1)
    for (const i of open.slice(0, -3)) c.values[i] = c.solution[i]
  })
  for (let k = 0; k < 3; k++) {
    const { i, d } = await emptyCell(page)
    await inkBy(page, i, d)
  }
  await expect(page.locator('#done')).toBeVisible()
  await expect(page.locator('#done-title')).toHaveText('Solved on your own!')
  await expect(page.locator('#done-lines')).toContainText('Easy puzzle 1')
  await expect(page.locator('#done-lines')).toContainText('Time')
  await page.locator('#next').click()
  await expect(page.locator('#level-name')).toHaveText('Easy 2')
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('#board-status')).toHaveText('Puzzle 2 is waiting where you left it.')
  await expect(page.locator('.level-row[aria-checked="true"] b')).toHaveText('2')
  await expect(page.locator('#history')).toHaveText('Easy history: 1 solved, 1 on your own')
  await page.locator('#history').click()
  await expect(page.locator('.history-row')).toHaveCount(1)
  await expect(page.locator('.history-row .h-n')).toHaveText('Puzzle 1')
  await expect(page.locator('.history-row .h-how')).toHaveText('On your own')
  await page.locator('#history-close').click()
  expect(errors).toEqual([])
})

test('tapping only ever pencils: square then numbers, number then squares; tap again lets go', async ({ page }) => {
  await start(page)
  await play(page)
  const a = await emptyCell(page)
  const b = await emptyCell(page, 1)
  const row = Math.floor(a.i / 9)
  await cell(page, a.i).click()
  await expect(cell(page, a.i)).toHaveClass(/picked/)
  await expect(cell(page, row * 9 + (((a.i % 9) + 1) % 9))).toHaveClass(/cross/)
  await cell(page, a.i).click()
  await expect(cell(page, a.i)).not.toHaveClass(/picked/)
  // Square first: numbers tapped go in as notes, and the square stays picked for more.
  await cell(page, a.i).click()
  await number(page, a.d).click()
  await number(page, (a.d % 9) + 1).click()
  expect((await state(page)).notes[a.i]).toBe(bit(a.d) | bit((a.d % 9) + 1))
  expect((await state(page)).values[a.i]).toBe(0) // never inked by a tap
  await number(page, (a.d % 9) + 1).click() // the same again takes the note out
  expect((await state(page)).notes[a.i]).toBe(bit(a.d))
  await cell(page, a.i).click() // let go
  // Number first: every copy of it lights up, and tapped squares get it as a note.
  await number(page, b.d).click()
  await expect(number(page, b.d)).toHaveAttribute('aria-pressed', 'true')
  const copy = (await state(page)).values.findIndex((v) => v === b.d)
  if (copy !== -1) await expect(cell(page, copy)).toHaveClass(/same/)
  await cell(page, b.i).click()
  expect((await state(page)).notes[b.i]).toBe(bit(b.d))
  expect((await state(page)).values[b.i]).toBe(0)
  await number(page, b.d).click()
  await expect(number(page, b.d)).toHaveAttribute('aria-pressed', 'false')
})

test('ink clears notes nearby whether right or wrong, and nothing shows if it was right', async ({ page }) => {
  await start(page)
  await play(page)
  const a = await emptyCell(page)
  const row = Math.floor(a.i / 9)
  const box = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)
  const { given } = await state(page)
  const sameLine = [...Array(81).keys()].find((k) => k !== a.i && !given[k] && Math.floor(k / 9) === row)
  const sameBox = [...Array(81).keys()].find((k) => k !== a.i && !given[k] && box(k) === box(a.i) && Math.floor(k / 9) !== row && k % 9 !== a.i % 9)
  const wrong = (a.d % 9) + 1
  for (const d of [a.d, wrong]) {
    await number(page, d).click()
    for (const k of [a.i, sameLine, sameBox].filter((k) => k !== undefined)) await cell(page, k).click()
    await number(page, d).click() // let go
  }
  // Ink the wrong number: the notes go just the same, and the square looks like any other ink.
  await inkBy(page, a.i, wrong)
  const after = await state(page)
  expect(after.values[a.i]).toBe(wrong)
  expect(after.notes[a.i]).toBe(0)
  expect(after.notes[sameLine] & bit(wrong)).toBe(0)
  expect(after.notes[sameLine] & bit(a.d)).toBe(bit(a.d))
  if (sameBox !== undefined) expect(after.notes[sameBox] & bit(wrong)).toBe(0)
  expect(await cell(page, a.i).getAttribute('class')).toBe('cell')
  await expect(page.locator('#toast')).not.toHaveClass(/show/)
  // Erase is for pencil; ink needs White-out.
  await cell(page, a.i).click()
  await page.locator('#erase').click()
  await expect(page.locator('#toast')).toContainText('White-out covers ink')
  await inkBy(page, a.i, a.d)
  await expect(page.locator('#toast')).toContainText('White-out covers it')
  await cell(page, sameLine).click()
  await page.locator('#erase').click()
  expect((await state(page)).notes[sameLine]).toBe(0)
})

test('the back of the book: a full grid says how many are wrong; Hint circles them; White-out fixes', async ({ page }) => {
  await start(page)
  await play(page)
  // Fill all but two squares right, then ink one wrong and one right by dragging.
  await page.evaluate(() => {
    const c = window.quietNumbers.current
    const open = c.values.map((v, i) => (v ? -1 : i)).filter((i) => i !== -1)
    for (const i of open.slice(0, -2)) c.values[i] = c.solution[i]
  })
  const a = await emptyCell(page)
  const b = await emptyCell(page, 1)
  await inkBy(page, a.i, (a.d % 9) + 1)
  await inkBy(page, b.i, b.d)
  await expect(page.locator('#toast')).toContainText('Not quite: 1 square is wrong')
  await expect(page.locator('#done')).toBeHidden()
  await expect(page.locator('.cell.checked')).toHaveCount(0) // count only
  // Hint circles wrong ink, is counted, and then waits.
  await page.locator('#hint').click()
  await expect(cell(page, a.i)).toHaveClass(/checked/)
  await expect(page.locator('.cell.checked')).toHaveCount(1)
  await expect(page.locator('#record')).toHaveText('1 hint')
  await expect(page.locator('#hint-wait')).toHaveText(/^[12]:\d\d$/)
  await page.locator('#hint').click()
  await expect(page.locator('#toast')).toContainText('Your next hint is ready in')
  await expect(page.locator('#record')).toHaveText('1 hint')
  // White-out: an off-white patch that stays; the circle goes; the square can be inked again.
  await cell(page, a.i).click()
  await page.locator('#whiteout').click()
  await expect(cell(page, a.i)).toHaveClass(/whiteout/)
  await expect(cell(page, a.i)).not.toHaveClass(/checked/)
  expect((await state(page)).values[a.i]).toBe(0)
  const patch = await cell(page, a.i).evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  const paper = await cell(page, b.i).evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(patch).not.toBe(paper) // it shows
  // Kept after closing the app.
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await play(page)
  await expect(cell(page, a.i)).toHaveClass(/whiteout/)
  await expect(page.locator('#record')).toHaveText('1 hint')
  await cell(page, a.i).click() // let go of the square, so the drag lands cleanly
  await inkBy(page, a.i, a.d)
  await expect(page.locator('#done-title')).toHaveText('Solved!')
  await expect(page.locator('#done-lines')).toContainText('1 hint')
  await page.locator('#done-home').click()
  await expect(page.locator('#history')).toHaveText('Easy history: 1 solved, 0 on your own')
})

test('Look asks once, shows the answer key, any tap puts it away; then it opens straight away', async ({ page }) => {
  await start(page)
  await play(page)
  await page.locator('#look').click()
  await expect(page.locator('#ask-look')).toBeVisible()
  await page.locator('#look-no').click()
  await expect(page.locator('#answer-key')).toBeHidden()
  await expect(page.locator('#record')).toHaveText('On your own so far')
  await page.locator('#look').click()
  await page.locator('#look-yes').click()
  await expect(page.locator('#answer-key')).toBeVisible()
  const { solution } = await state(page)
  await expect(page.locator('#answer-board .cell').nth(4)).toHaveText(String(solution[4]))
  await page.mouse.click(20, 200)
  await expect(page.locator('#answer-key')).toBeHidden()
  await expect(page.locator('#record')).toHaveText('looked at the answer key')
  await page.locator('#look').click()
  await expect(page.locator('#ask-look')).toBeHidden()
  await expect(page.locator('#answer-key')).toBeVisible()
  await page.locator('#answer-key').click()
  // Solved after a look: recorded in the history.
  await page.evaluate(() => {
    const c = window.quietNumbers.current
    const open = c.values.map((v, i) => (v ? -1 : i)).filter((i) => i !== -1)
    for (const i of open.slice(0, -1)) c.values[i] = c.solution[i]
  })
  const a = await emptyCell(page)
  await inkBy(page, a.i, a.d)
  await expect(page.locator('#done-lines')).toContainText('Looked')
  await page.locator('#done-home').click()
  await page.locator('#history').click()
  await expect(page.locator('.history-row .h-how')).toHaveText('Looked')
  await expect(page.locator('.history-row .h-how')).not.toHaveClass(/own/)
})

for (const how of ['Finger', 'Stylus'])
  test(`dragging with a ${how.toLowerCase()}: the number lands where it is drawn`, async ({ page }) => {
    await start(page, how)
    await play(page)
    const a = await emptyCell(page, 20) // lower down the grid, so the finger can be below it
    const from = await number(page, a.d).boundingBox()
    const to = await cell(page, a.i).boundingBox()
    const lift = how === 'Finger' ? 72 : 0
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + lift, { steps: 8 })
    await expect(page.locator('.ghost')).toBeVisible()
    await expect(cell(page, a.i)).toHaveClass(/drop/)
    const ghost = await page.locator('.ghost').boundingBox()
    expect(Math.abs(ghost.y + ghost.height / 2 - (to.y + to.height / 2))).toBeLessThan(2)
    await page.mouse.up()
    await expect(page.locator('.ghost')).toBeHidden()
    expect((await state(page)).values[a.i]).toBe(a.d)
    await expect(number(page, a.d)).toHaveAttribute('aria-pressed', 'false') // a drag doesn't pick it
    await page.waitForTimeout(450)
    await number(page, a.d).click()
    await expect(number(page, a.d)).toHaveAttribute('aria-pressed', 'true')
  })

test('a half-done puzzle, its time and the difficulty are kept after closing the app', async ({ page }) => {
  await start(page)
  // The game card is open; pick Hard.
  await expect(page.locator('#open-sudoku')).toHaveAttribute('aria-expanded', 'true')
  await page.locator('.level-row', { hasText: 'Hard' }).click()
  await expect(page.locator('#difficulty-note')).toContainText('clever tricks')
  await expect(page.locator('#board-status')).toHaveText('Puzzle 1 is a fresh page.')
  await play(page)
  await expect(page.locator('#level-name')).toHaveText('Hard 1')
  const a = await emptyCell(page)
  const b = await emptyCell(page, 1)
  await inkBy(page, a.i, a.d)
  await cell(page, b.i).click()
  await number(page, b.d).click()
  await page.evaluate(() => (window.quietNumbers.current.time = 75))
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('#board-status')).toContainText('Puzzle 1 is waiting')
  await page.reload()
  await page.locator('.hub-start button', { hasText: 'Finger' }).click()
  await expect(page.locator('.level-row[aria-checked="true"] .level-name')).toHaveText('Hard')
  await play(page)
  expect((await state(page)).values[a.i]).toBe(a.d)
  expect((await state(page)).notes[b.i]).toBe(bit(b.d))
  await expect(page.locator('#clock')).toHaveText(/^1:1\d$/)
})

test('settings: hide the stopwatch, warm Night, Reset, and the hidden tools', async ({ page }) => {
  await start(page)
  await play(page)
  const panel = page.locator('dialog.hub-settings')
  await page.locator('.hub-gear').click()
  await panel.getByText('Show the stopwatch').click()
  await expect(page.locator('#clock-wrap')).toBeHidden()
  await panel.locator('.hub-choice button', { hasText: 'Night' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  // Night has no blue: every colour on the grid is warm (red ≥ blue).
  const colours = await page.evaluate(() =>
    [...document.querySelectorAll('.cell, .number, #board')].flatMap((el) => {
      const s = getComputedStyle(el)
      return [s.color, s.backgroundColor, s.borderRightColor]
    }),
  )
  for (const c of colours) {
    const [r, , b] = c.match(/[\d.]+/g).map(Number)
    expect(r, c).toBeGreaterThanOrEqual(b)
  }
  await panel.getByRole('button', { name: 'Reset to GameHub settings' }).click()
  await panel.getByRole('button', { name: 'Tap again to reset' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day')
  await expect(page.locator('#clock-wrap')).toBeVisible()

  const manual = panel.locator('section', { hasText: 'Set progress by hand' })
  for (let i = 0; i < 5; i++) await panel.locator('h2').click()
  await panel.locator('.hub-secret input').fill(FAMILY_CODE)
  await panel.locator('.hub-secret button').click()
  await expect(manual).toBeVisible()
  await manual.getByLabel('Expert puzzle').fill('12')
  await manual.getByRole('button', { name: 'Set' }).click()
  await panel.locator('.hub-settings-close').click()
  await page.locator('.level-row', { hasText: 'Expert' }).click()
  await expect(page.locator('.level-row', { hasText: 'Expert' }).locator('b')).toHaveText('12')
})
