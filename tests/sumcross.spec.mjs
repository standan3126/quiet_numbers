// Plays Sum Cross in phone-sized browsers (npm test runs it with the Sudoku tests).
import { expect, test } from '@playwright/test'

// Tap to Start; then the Sum Cross card, a difficulty, Play, Start.
const openSumCross = async (page, difficulty = 'Easy') => {
  await page.goto('./')
  await page.locator('.hub-start button', { hasText: 'Tap to Start' }).click()
  await page.locator('#open-sumcross').click()
  await expect(page.locator('#sumcross-body')).toBeVisible()
  await expect(page.locator('#sudoku-body')).toBeHidden() // one card open at a time
  await page.locator('#sumcross-body .level-row', { hasText: difficulty }).click()
  await expect(page.locator('#play')).toHaveText('Play Sum Cross')
  await page.locator('#play').click()
  await expect(page.locator('#book-name')).toHaveText(`Sum Cross · ${difficulty}`)
  await startPicked(page)
}
const startPicked = async (page) => {
  await page.locator('#start').click()
  await expect(page.locator('#sc-view')).toBeVisible()
  if (await page.locator('#rules').isVisible()) await page.locator('#rules').click() // first time: the rules
}

const box = (page, i) => page.locator('#sc-board .sc-sq').nth(i)
const tileFor = (page, v) => page.locator(`.bank-tile[data-value="${v}"]`).first()
const state = (page) =>
  page.evaluate(() => {
    const c = window.quietNumbers.current
    return { values: c.values, solution: c.solution, open: c.open, notes: c.notes, sums: c.puzzle.sums, time: c.time }
  })
// Fills every blank but the ones in `keep` with its answer, as if inked earlier.
const fillAllBut = (page, keep) =>
  page.evaluate((keep) => {
    const c = window.quietNumbers.current
    for (const i of c.open) if (!keep.includes(i)) c.values[i] = c.solution[i]
  }, keep)
// Inks v into box i by dragging its bank tile (a finger holds it 72 px above itself).
const inkBy = async (page, i, v) => {
  const from = await tileFor(page, v).boundingBox()
  const to = await box(page, i).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 72, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(420) // the click after a drag is ignored for a moment
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
})

test('Sum Cross: its card and book, and Easy 1 solved on your own by dragging from the bank', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await page.locator('.hub-start button', { hasText: 'Tap to Start' }).click()
  await page.locator('#open-sumcross').click()
  await expect(page.locator('#sumcross-board-status')).toHaveText('Next: puzzle 1.')
  await expect(page.locator('#sumcross-body .level-row', { hasText: 'Easy' }).locator('.level-size')).toHaveText('600')
  await page.locator('#play').click()
  await expect(page.locator('.hub-book-tile').first().locator('.sc-mini')).toBeVisible()
  await expect(page.locator('.hub-book-tile').first().locator('.mini')).toBeHidden()
  await startPicked(page)
  await expect(page.locator('#level-name')).toHaveText('Easy 1')
  await expect(page.locator('.bank-tile')).toHaveCount(10)
  await expect(page.locator('#numbers')).toBeHidden()

  // Everything fits: the puzzle above the bank, the bank above the tools, all on screen.
  const view = page.viewportSize()
  const label = await page.locator('#play-screen .level-label').boundingBox()
  const board = await page.locator('#sc-board').boundingBox()
  const bank = await page.locator('#bank').boundingBox()
  const bar = await page.locator('.bottom-bar').boundingBox()
  expect(board.y).toBeGreaterThan(label.y + label.height)
  expect(board.x).toBeGreaterThanOrEqual(0)
  expect(board.x + board.width).toBeLessThanOrEqual(view.width)
  expect(board.y + board.height).toBeLessThanOrEqual(bank.y)
  expect(bank.y + bank.height).toBeLessThanOrEqual(bar.y)
  expect(bar.y + bar.height).toBeLessThanOrEqual(view.height)
  expect(bank.x + bank.width).toBeLessThanOrEqual(view.width)

  // All but two filled by the computer's own hand, the last two dragged in like a finger.
  const { open, solution } = await state(page)
  const last = open.slice(-2)
  await fillAllBut(page, last)
  for (const i of last) await inkBy(page, i, solution[i])
  await expect(page.locator('#done')).toBeVisible()
  await expect(page.locator('#done-title')).toHaveText('Solved on your own!')
  await expect(page.locator('#next')).toHaveText('Next: puzzle 2')
  await page.locator('#done-home').click()
  const first = page.locator('.hub-book-tile').first()
  await expect(first.locator('.tile-how')).toHaveText('On your own')
  await expect(first.locator('.sc-mini .ink')).toHaveCount(10)
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('#sumcross-board-status')).toHaveText('Next: puzzle 2.')
  await expect(page.locator('#sumcross-body .level-row[aria-checked="true"] b')).toHaveText('1')
  // Sudoku's place is its own.
  await expect(page.locator('#board-status')).toHaveText('Next: puzzle 1.')
  expect(errors).toEqual([])
})

test('Sum Cross: tap = pencil, a picked box lights up its sums, ink uses a bank tile, White-out gives it back', async ({ page }) => {
  await openSumCross(page)
  const { open, solution, sums } = await state(page)
  const a = open[0]
  const v = solution[a]
  // Box first: tapped bank numbers go in as notes; the box's sums light up.
  await box(page, a).click()
  await expect(box(page, a)).toHaveClass(/picked/)
  const partner = sums.find((s) => s.includes(a)).find((k) => k !== a)
  await expect(box(page, partner)).toHaveClass(/cross/)
  await tileFor(page, v).click()
  const other = (await state(page)).solution.find((x, i) => open.includes(i) && x !== v)
  await tileFor(page, other).click()
  expect((await state(page)).notes[a]).toEqual([v, other].sort((x, y) => x - y))
  expect((await state(page)).values[a]).toBe(null) // never inked by a tap
  await tileFor(page, other).click() // again takes it out
  expect((await state(page)).notes[a]).toEqual([v])
  await expect(box(page, a).locator('.sc-notes')).toHaveText(String(v))
  await box(page, a).click() // let go

  // A drag inks it: the notes go and the bank's tile is used up (dimmed).
  await inkBy(page, a, v)
  expect((await state(page)).values[a]).toBe(v)
  expect((await state(page)).notes[a]).toEqual([])
  await expect(box(page, a)).toHaveClass(/ink/)
  const copies = (await state(page)).open.filter((i) => solution[i] === v).length
  if (copies === 1) {
    await expect(tileFor(page, v)).toHaveClass(/used/)
    const b = open.find((i) => i !== a && (solution[i] !== v))
    await inkBy(page, b, v)
    await expect(page.locator('#toast')).toContainText(`The bank's ${v} is used`)
    expect((await state(page)).values[b]).toBe(null)
  }
  // Erase is for pencil; White-out covers ink and gives the number back.
  await box(page, a).click()
  await page.locator('#erase').click()
  await expect(page.locator('#toast')).toContainText('White-out covers ink')
  await page.locator('#whiteout').click()
  expect((await state(page)).values[a]).toBe(null)
  await expect(box(page, a)).toHaveClass(/whiteout/)
  await expect(page.locator('.bank-tile.used')).toHaveCount(0)
  // Signs can't take numbers.
  const sign = await page.locator('#sc-board .sc-sign').first().getAttribute('data-i')
  await page.locator('#sc-board .sc-sq').nth(a).click() // let go
  await inkBy(page, Number(sign), v)
  await expect(page.locator('#toast')).toContainText('Numbers go in the empty boxes')
})

test('Sum Cross: a full board says how many are wrong; Hint circles them; Look shows the answer key', async ({ page }) => {
  await openSumCross(page, 'Medium')
  const { open, solution } = await state(page)
  // Two blanks with different answers, inked the wrong way round.
  const a = open[0]
  const b = open.find((i) => solution[i] !== solution[a])
  await fillAllBut(page, [a, b])
  await inkBy(page, a, solution[b])
  await inkBy(page, b, solution[a])
  await expect(page.locator('#toast')).toContainText('Not quite: 2 squares are wrong')
  await expect(page.locator('#done')).toBeHidden()
  await expect(page.locator('#sc-board .checked')).toHaveCount(0) // count only
  await page.locator('#hint').click()
  await expect(page.locator('#sc-board .checked')).toHaveCount(2)
  await expect(page.locator('#record')).toHaveText('1 hint')
  // Look: asks, then shows the whole crossword filled in.
  await page.locator('#look').click()
  await page.locator('#look-yes').click()
  await expect(page.locator('#sc-answer')).toBeVisible()
  await expect(page.locator('#answer-board')).toBeHidden()
  await expect(page.locator('#sc-answer .sc-sq').nth(a)).toContainText(String(solution[a]))
  const key = await page.locator('#sc-answer').boundingBox()
  expect(key.x + key.width).toBeLessThanOrEqual(page.viewportSize().width)
  await page.locator('#answer-key').click()
  // White-out both, ink them right: solved, with a hint and a look.
  for (const i of [a, b]) {
    await box(page, i).click()
    await page.locator('#whiteout').click()
    await box(page, i).click()
  }
  await inkBy(page, a, solution[a])
  await inkBy(page, b, solution[b])
  await expect(page.locator('#done-title')).toHaveText('Solved!')
  await expect(page.locator('#done-lines')).toContainText('1 hint, looked')
})

test('Sum Cross: kept after closing the app; pinch-zoom (wheel here) and taps still find their box', async ({ page }) => {
  await openSumCross(page)
  const { open, solution } = await state(page)
  const [a, b] = open
  await inkBy(page, a, solution[a])
  await box(page, b).click()
  await tileFor(page, solution[b]).click()
  await page.evaluate(() => (window.quietNumbers.current.time = 75))
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('.hub-book-tile').first().locator('.tile-state')).toHaveText('In progress · 1:15')
  await page.reload()
  await page.locator('.hub-start button', { hasText: 'Tap to Start' }).click()
  await expect(page.locator('#sumcross-body')).toBeVisible() // the card played last is open
  await expect(page.locator('#sumcross-board-status')).toContainText('Puzzle 1 is waiting')
  await page.locator('#play').click()
  await expect(page.locator('#start')).toHaveText('Continue puzzle 1')
  await startPicked(page)
  expect((await state(page)).values[a]).toBe(solution[a])
  expect((await state(page)).notes[b]).toEqual([solution[b]])
  await expect(page.locator('#clock')).toHaveText(/^1:1\d$/)

  // Zoom in: the boxes get bigger, and a tap still lands on the box under it.
  const before = await box(page, b).boundingBox()
  const view = await page.locator('#sc-view').boundingBox()
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.wheel(0, -300)
  await expect.poll(async () => (await box(page, b).boundingBox()).width).toBeGreaterThan(before.width * 1.2)
  const after = await box(page, b).boundingBox()
  if (after.y > view.y && after.y + after.height < view.y + view.height) {
    await box(page, b).click()
    await expect(box(page, b)).toHaveClass(/picked/)
  }
})

test('Sum Cross at night: warm colours only', async ({ page }) => {
  await openSumCross(page)
  await page.locator('.hub-gear').click()
  await page.locator('dialog.hub-settings .hub-choice button', { hasText: 'Night' }).first().click()
  await page.locator('.hub-settings-close').click()
  const { open, solution } = await state(page)
  await inkBy(page, open[0], solution[open[0]])
  const colours = await page.evaluate(() =>
    [...document.querySelectorAll('#sc-board > *, .bank-tile')].flatMap((el) => {
      const s = getComputedStyle(el)
      return [s.color, s.backgroundColor, s.outlineColor]
    }),
  )
  for (const c of colours) {
    const [r, , b] = c.match(/[\d.]+/g).map(Number)
    expect(r, c).toBeGreaterThanOrEqual(b)
  }
})
