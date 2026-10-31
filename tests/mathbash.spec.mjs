// Plays Math Bash in phone-sized browsers (npm test runs it with the other games).
import { expect, test } from '@playwright/test'

const openCard = async (page) => {
  await page.goto('./')
  await page.locator('.hub-start button', { hasText: 'Tap to Start' }).click()
  await page.locator('#open-mathbash').click()
  await expect(page.locator('#mathbash-body')).toBeVisible()
}
const key = (page, k) => page.locator('.mb-key', { hasText: new RegExp(`^${k}$`) })
const type = async (page, n) => {
  for (const d of String(n)) await key(page, d).click()
}
const bash = (page) => page.evaluate(() => window.quietNumbers.mathBash.current)
const closeRules = async (page) => {
  if (await page.locator('#mb-rules').isVisible()) await page.locator('#mb-rules').click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
})

test('a test: pick what and how hard, type on the keypad, review, hand in, the marked test', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openCard(page)
  await page.locator('#mathbash-category .chip-row', { hasText: 'Multiplication' }).click()
  await page.locator('#mathbash-body .level-row', { hasText: 'Medium' }).click()
  await expect(page.locator('#mathbash-difficulty-note')).toContainText('two digits times one')
  await expect(page.locator('#mathbash-board-status')).toHaveText('Next: test 1.')
  await expect(page.locator('#play')).toHaveText('Play Math Bash')
  await page.locator('#play').click()
  await expect(page.locator('#book-name')).toHaveText('Multiplication · Medium')
  await expect(page.locator('#start')).toHaveText('Start test 1')
  await page.locator('#start').click()
  await expect(page.locator('#mb-rules')).toBeVisible() // the first time
  await closeRules(page)

  // Everything fits: the question above the keypad, the keypad on screen.
  const view = page.viewportSize()
  const q = await page.locator('#mb-question').boundingBox()
  const pad = await page.locator('#mb-keypad').boundingBox()
  expect(q.y + q.height).toBeLessThan(pad.y)
  expect(pad.y + pad.height).toBeLessThanOrEqual(view.height)
  expect(pad.x + pad.width).toBeLessThanOrEqual(view.width)

  // Type, delete, Next; Back keeps the answer.
  let b = await bash(page)
  await expect(page.locator('#mb-question')).toHaveText(`${b.questions[0].text} =`)
  await type(page, 99)
  await key(page, '⌫').click()
  await expect(page.locator('#mb-answer')).toHaveText('9')
  await key(page, '⌫').click()
  await type(page, b.questions[0].answer)
  await key(page, 'Next').click()
  await expect(page.locator('#mb-count')).toHaveText('Question 2 of 100')
  await page.locator('#mb-back').click()
  await expect(page.locator('#mb-answer')).toHaveText(String(b.questions[0].answer))
  await key(page, 'Next').click()

  // All but three answered right by the computer, one wrong; then to the review sheet.
  await page.evaluate(() => {
    const b = window.quietNumbers.mathBash.current
    b.questions.forEach((q, i) => (b.answers[i] = i < 3 ? '' : String(q.answer)))
    b.answers[50] = '1'
  })
  await page.locator('#mb-review').click()
  await expect(page.locator('#mb-sheet-note')).toContainText('3 questions are blank')
  await expect(page.locator('.mb-row.blank')).toHaveCount(3)
  // Tap a blank one: answer it, Done goes back to the sheet.
  await page.locator('.mb-row').nth(1).click()
  await expect(page.locator('#mb-count')).toHaveText('Question 2 of 100')
  b = await bash(page)
  await type(page, b.questions[1].answer)
  await expect(key(page, 'Done')).toBeVisible()
  await key(page, 'Done').click()
  await expect(page.locator('.mb-row.blank')).toHaveCount(2)
  await page.locator('#mb-handin').click()
  // 97 right (2 blank, 1 wrong): an A.
  await expect(page.locator('#mb-grade')).toHaveText('A')
  await expect(page.locator('#mb-score')).toContainText('97 right of 100 · 97%')
  await expect(page.locator('.mb-marks li.wrong')).toHaveCount(3)
  await expect(page.locator('.mb-marks li').nth(50).locator('.mb-fix')).toHaveText(String(b.questions[50].answer))
  await expect(page.locator('#mb-next')).toHaveText('Next: test 2')

  // Home: the book shows the grade; the test is final, to look at.
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  const tile = page.locator('.hub-book-tile').first()
  await expect(tile.locator('.mb-mini')).toHaveText('A')
  await expect(tile.locator('.tile-state')).toContainText('97%')
  await tile.click()
  await expect(page.locator('#start')).toHaveText('Look at test 1')
  await page.locator('#start').click()
  await expect(page.locator('#mb-marked')).toBeVisible()
  await expect(page.locator('#mb-grade')).toHaveText('A')
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('#mathbash-body .level-row[aria-checked="true"] b')).toHaveText('1')
  await expect(page.locator('#mathbash-board-status')).toHaveText('Next: test 2.')
  expect(errors).toEqual([])
})

test('a half-done test keeps its place and time after closing the app; the clock waits for the rules', async ({ page }) => {
  await openCard(page)
  await page.locator('#play').click()
  await page.locator('#start').click()
  await page.waitForTimeout(1300)
  expect((await bash(page)).time).toBe(0) // the rules are up
  await closeRules(page)
  await page.waitForTimeout(1300)
  expect((await bash(page)).time).toBeGreaterThan(0.9)
  const b = await bash(page)
  await type(page, b.questions[0].answer)
  await key(page, 'Next').click()
  await type(page, 5)
  await key(page, 'Next').click()
  await page.evaluate(() => (window.quietNumbers.mathBash.current.time = 75))
  await page.locator('.hub-corner', { hasText: 'Home' }).click()
  await expect(page.locator('.hub-book-tile').first().locator('.tile-state')).toHaveText('2 answered · 1:15')
  await page.reload()
  await page.locator('.hub-start button').click()
  await expect(page.locator('#mathbash-board-status')).toContainText('Test 1 is waiting')
  await page.locator('#play').click()
  await expect(page.locator('#start')).toHaveText('Continue test 1')
  await page.locator('#start').click()
  await expect(page.locator('#mb-count')).toHaveText('Question 3 of 100')
  expect((await bash(page)).answers.slice(0, 2)).toEqual([String(b.questions[0].answer), '5'])
  await expect(page.locator('#mb-clock')).toHaveText(/^1:1\d$/)
})

test('Pop Quiz: one minute, one try a question, the best score kept', async ({ page }) => {
  await openCard(page)
  await page.locator('#mathbash-category .chip-row', { hasText: 'Random' }).click()
  await page.locator('#mathbash-mode .level-row', { hasText: 'Pop Quiz' }).click()
  await expect(page.locator('#mathbash-board-status')).toHaveText('No Pop Quiz score yet.')
  await expect(page.locator('#play')).toHaveText('Play Pop Quiz')
  await page.locator('#play').click()
  await closeRules(page)
  await expect(page.locator('#mb-card-title')).toHaveText('Pop Quiz')
  await expect(page.locator('#mb-clock')).toHaveText('1:00')
  await page.waitForTimeout(1200)
  await expect(page.locator('#mb-clock')).toHaveText('1:00') // waits for Start
  await page.locator('#mb-card-go').click()
  // Right, then wrong: wrong stays wrong.
  let b = await bash(page)
  await type(page, b.q.answer)
  await key(page, 'Next').click()
  await expect(page.locator('#mb-flash')).toHaveText('✓')
  b = await bash(page)
  await type(page, b.q.answer + 1)
  await key(page, 'Next').click()
  await expect(page.locator('#mb-flash')).toContainText(`✗ ${b.q.answer}`)
  await expect(page.locator('#mb-count')).toHaveText('1 right')
  expect((await bash(page)).left).toBeLessThan(60)
  // Time's up.
  await page.evaluate(() => (window.quietNumbers.mathBash.current.left = 0.1))
  await expect(page.locator('#mb-card-title')).toHaveText("Time's up!")
  await expect(page.locator('#mb-card-lines')).toContainText('1 right, 1 wrong')
  await expect(page.locator('#mb-card-lines')).toContainText('Your first score.')
  await page.locator('#mb-card-home').click()
  await expect(page.locator('#mathbash-board-status')).toHaveText('Pop Quiz best: 1 right.')
  await expect(page.locator('#mathbash-mode .level-row', { hasText: 'Pop Quiz' })).toContainText('Best: 1')
})
