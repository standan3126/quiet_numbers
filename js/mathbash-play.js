// Math Bash's screens: a test (100 questions, one at a time, a big keypad, review before handing in,
// then the marked test with a school grade) and Pop Quiz (one minute, one try a question, a high
// score). The launch card and the books are main.js's, like the other games'; the questions come
// from mathbash.js. User's design, 2026-10-30.
//
// A test in its book: { answers (100 strings, '' = blank), at (the question showing), time,
// reviewing, done (local day), right }. Handed in = final, like a book page. Pop Quiz keeps only
// the best score per category and level (prefs.best).

import { CATEGORY_NAMES, QUESTIONS, QUIZ_SECONDS, gradeOf, makeTest, question } from './mathbash.js'

const MAX_DIGITS = 6

// prefs(): Math Bash's part of the save ({ difficulty, category, mode, at, best }); book(id): a
// book's tests; tips(): the save's one-time tips. Functions, because a restored save replaces them.
export function createMathBash({ $, sound, panel, frame, book, prefs, tips, saveGame, saveBook, nextOpen, openBook, showHome, clockText, levelName, today }) {
  let bash = null // the test or quiz on screen
  const bookId = (b) => `${b.category}-${b.level}`
  const title = (b) => `${CATEGORY_NAMES[b.category]} · ${levelName(b.level)}`

  // --- The keypad: 1 2 3 on top, like a phone ---------------------------------------------------
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Next'].map((k) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'mb-key', textContent: k })
    if (k === '⌫') b.setAttribute('aria-label', 'Delete')
    if (k === 'Next') b.classList.add('mb-next')
    b.addEventListener('click', () => press(k))
    return b
  })
  $('mb-keypad').append(...keys)
  const nextKey = keys[11]

  function press(k) {
    if (!bash || bash.done || !$('mb-card').hidden || !$('mb-sheet').hidden) return
    if (bash.mode === 'quiz' && !bash.running) return
    if (k === 'Next') return bash.mode === 'quiz' ? submitQuiz() : nextQuestion()
    if (k === '⌫') bash.typed = bash.typed.slice(0, -1)
    else if (bash.typed.length < MAX_DIGITS) bash.typed = bash.typed === '0' ? k : bash.typed + k
    showAsk()
  }

  // The screen and its parts: the question (with the keypad), the review sheet, the marked test.
  function show(part) {
    $('mb-screen').hidden = false
    $('mb-ask-area').hidden = part !== 'ask'
    $('mb-sheet').hidden = part !== 'sheet'
    $('mb-marked').hidden = part !== 'marked'
    $('mb-card').hidden = true
    $('mb-rules').hidden = true
    frame.setPage('play')
    frame.help.hidden = false
  }

  // --- Tests -----------------------------------------------------------------------------------

  function startTest(category, level, n) {
    const kept = book(`${category}-${level}`)[n]
    bash = {
      mode: 'test',
      category,
      level,
      n,
      questions: makeTest(category, level, n),
      answers: kept?.answers?.slice() ?? new Array(QUESTIONS).fill(''),
      at: kept?.at ?? 0,
      time: kept?.time ?? 0,
      reviewing: kept?.reviewing ?? false,
      done: kept?.done ?? null,
      right: kept?.right ?? 0,
    }
    bash.typed = bash.answers[bash.at]
    prefs().at[bookId(bash)] = n
    saveGame()
    $('mb-name').textContent = `Test ${n}`
    showClock()
    if (bash.done) return showMarked()
    if (bash.reviewing) showSheet()
    else {
      show('ask')
      showAsk()
    }
    startClock()
    firstRules()
  }

  function saveTest() {
    if (!bash || bash.mode !== 'test' || bash.done) return
    const { answers, at, time, reviewing } = bash
    const kept = book(bookId(bash))
    if (!answers.some(Boolean) && !kept[bash.n] && time < 5) return // untouched
    kept[bash.n] = { answers, at, time: Math.round(time * 10) / 10, reviewing }
    saveBook(bookId(bash))
  }

  function showAsk() {
    const quiz = bash.mode === 'quiz'
    const q = quiz ? bash.q : bash.questions[bash.at]
    $('mb-count').textContent = quiz ? `${bash.right} right` : `Question ${bash.at + 1} of ${QUESTIONS}`
    $('mb-question').textContent = q ? `${q.text} =` : ''
    $('mb-answer').textContent = bash.typed
    $('mb-answer').classList.toggle('empty', !bash.typed)
    $('mb-back').hidden = quiz
    $('mb-review').hidden = quiz
    $('mb-back').disabled = !quiz && bash.at === 0
    nextKey.textContent = quiz ? 'Next' : bash.reviewing ? 'Done' : bash.at === QUESTIONS - 1 ? 'Review' : 'Next'
  }

  // Next: keeps the answer (blank is allowed) and moves on; after the last, or while reviewing,
  // back to the review sheet.
  function nextQuestion() {
    bash.answers[bash.at] = bash.typed
    if (bash.reviewing || bash.at === QUESTIONS - 1) {
      saveTest()
      return showSheet()
    }
    goTo(bash.at + 1)
  }

  function goTo(i) {
    bash.at = i
    bash.typed = bash.answers[i]
    show('ask')
    showAsk()
    saveTest()
  }

  $('mb-back').addEventListener('click', () => {
    if (!bash || bash.at === 0) return
    bash.answers[bash.at] = bash.typed
    goTo(bash.at - 1)
  })
  $('mb-review').addEventListener('click', () => {
    bash.answers[bash.at] = bash.typed
    showSheet()
  })

  // The review sheet: every question with its answer; blanks stand out. Tap one to change it. The
  // clock keeps going (user: "can review before submitting but costs time").
  function showSheet() {
    bash.reviewing = true
    show('sheet')
    const blanks = bash.answers.filter((a) => !a).length
    $('mb-sheet-note').textContent = blanks ? `${blanks} question${blanks > 1 ? 's are' : ' is'} blank. Tap any question to change it. The clock keeps going.` : 'Tap any question to change it. The clock keeps going.'
    $('mb-list').replaceChildren(
      ...bash.questions.map((q, i) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: `mb-row${bash.answers[i] ? '' : ' blank'}` })
        b.innerHTML = '<span class="mb-row-n"></span><span class="mb-row-q"></span><b class="mb-row-a"></b>'
        b.querySelector('.mb-row-n').textContent = i + 1
        b.querySelector('.mb-row-q').textContent = `${q.text} =`
        b.querySelector('.mb-row-a').textContent = bash.answers[i] || '?'
        b.addEventListener('click', () => goTo(i))
        return b
      }),
    )
    saveTest()
  }

  // Hand in: marked all at once, like a real test.
  $('mb-handin').addEventListener('click', () => {
    if (!bash || bash.done) return
    stopClock()
    bash.right = bash.questions.filter((q, i) => Number(bash.answers[i]) === q.answer && bash.answers[i] !== '').length
    bash.done = today()
    const kept = book(bookId(bash))
    const before = bestTime(kept, bash.n)
    kept[bash.n] = { answers: bash.answers, time: Math.round(bash.time), done: bash.done, right: bash.right }
    saveBook(bookId(bash))
    sound.celebrate()
    showMarked(before)
  })

  const bestTime = (kept, skip) => {
    const times = Object.entries(kept).filter(([n, t]) => t.done && Number(n) !== skip && gradeOf(t.right) === 'A').map(([, t]) => t.time)
    return times.length ? Math.min(...times) : null
  }

  // The marked test: the grade, then every question with ✓ or ✗ and the right answer beside a
  // wrong one. Final; opened again from the book, it looks the same.
  function showMarked(bestBefore) {
    show('marked')
    stopClock()
    const { right, time } = bash
    $('mb-grade').textContent = gradeOf(right)
    const lines = [`${right} right of ${QUESTIONS} · ${Math.round((100 * right) / QUESTIONS)}%`]
    if (panel.settings.showClock) lines.push(`Time ${clockText(time)}`)
    if (bestBefore !== undefined && panel.settings.showClock && gradeOf(right) === 'A') lines.push(bestBefore === null ? 'Your first A time in this book' : time < bestBefore ? 'A new best A time!' : `Your best A time: ${clockText(bestBefore)}`)
    $('mb-score').replaceChildren(...lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })))
    $('mb-marks').replaceChildren(
      ...bash.questions.map((q, i) => {
        const given = bash.answers[i]
        const ok = given !== '' && Number(given) === q.answer
        const li = Object.assign(document.createElement('li'), { className: ok ? 'right' : 'wrong' })
        li.innerHTML = '<span class="mb-row-n"></span><span class="mb-row-q"></span><b class="mb-row-a"></b><span class="mb-mark"></span><span class="mb-fix"></span>'
        li.querySelector('.mb-row-n').textContent = i + 1
        li.querySelector('.mb-row-q').textContent = `${q.text} =`
        li.querySelector('.mb-row-a').textContent = given || '–'
        li.querySelector('.mb-mark').textContent = ok ? '✓' : '✗'
        li.querySelector('.mb-fix').textContent = ok ? '' : q.answer
        return li
      }),
    )
    $('mb-marks').scrollTop = 0
    const next = nextOpen(bookId(bash), bash.n)
    $('mb-next').textContent = next ? `Next: test ${next}` : 'Back to the book'
    $('mb-next').onclick = () => (next ? startTest(bash.category, bash.level, next) : openBook(bookId(bash), bash.n))
  }

  // --- Pop Quiz ----------------------------------------------------------------------------------

  function startQuiz(category, level) {
    bash = { mode: 'quiz', category, level, typed: '', left: QUIZ_SECONDS, right: 0, wrong: 0, running: false, q: null, done: null }
    $('mb-name').textContent = 'Pop Quiz'
    show('ask')
    showAsk()
    showClock()
    const best = prefs().best[bookId(bash)]
    card('Pop Quiz', [title(bash), 'One minute. One try a question: a wrong answer stays wrong.', best ? `Your best: ${best}` : 'No score yet: this one sets it.'], 'Start', () => {
      bash.running = true
      newQuizQuestion()
      startClock()
    })
    firstRules()
  }

  function newQuizQuestion() {
    let q
    do q = question(bash.category, bash.level, Math.random)
    while (bash.q && q.text === bash.q.text)
    bash.q = q
    bash.typed = ''
    showAsk()
  }

  // One try: right counts toward the score, wrong is gone. A short, quiet mark either way.
  let flashTimer = 0
  function submitQuiz() {
    if (!bash.typed) return
    const ok = Number(bash.typed) === bash.q.answer
    if (ok) bash.right++
    else bash.wrong++
    if (ok) sound.chime()
    else sound.soft()
    const flash = $('mb-flash')
    flash.textContent = ok ? '✓' : `✗ ${bash.q.answer}`
    flash.className = `mb-flash show ${ok ? 'right' : 'wrong'}`
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flash.className = 'mb-flash'), 700)
    newQuizQuestion()
  }

  function endQuiz() {
    bash.running = false
    stopClock()
    const key = bookId(bash)
    const best = prefs().best[key] ?? 0
    const better = bash.right > best
    if (better) {
      prefs().best[key] = bash.right
      saveGame()
    }
    sound.celebrate()
    const { category, level } = bash
    card("Time's up!", [`${bash.right} right, ${bash.wrong} wrong`, better ? (best ? 'A new best!' : 'Your first score.') : `Your best: ${best}`], 'Again', () => startQuiz(category, level))
  }

  // A card over the screen: the Pop Quiz start and end. The second button goes home.
  function card(heading, lines, action, onAction) {
    $('mb-card-title').textContent = heading
    $('mb-card-lines').replaceChildren(...lines.map((t) => Object.assign(document.createElement('span'), { textContent: t })))
    $('mb-card-go').textContent = action
    $('mb-card-go').onclick = onAction
    $('mb-card').hidden = false
    $('mb-card').querySelector('#mb-card-go').focus?.()
  }
  $('mb-card-home').addEventListener('click', () => showHome())
  $('mb-card-go').addEventListener('click', () => ($('mb-card').hidden = true), { capture: true })

  // --- The clock ---------------------------------------------------------------------------------
  // A test's stopwatch and Pop Quiz's countdown count only while the screen is in full view: not
  // under the rules, Settings or a card, nor when the app is hidden.

  let ticking = 0
  let lastTick = 0
  const inView = () => bash && !document.hidden && !$('mb-screen').hidden && $('mb-rules').hidden && $('mb-card').hidden && $('mb-marked').hidden && !document.querySelector('dialog[open]')
  function startClock() {
    stopClock()
    lastTick = performance.now()
    ticking = setInterval(tick, 200)
  }
  function stopClock() {
    clearInterval(ticking)
    ticking = 0
  }
  let lastSaved = 0
  function tick() {
    const now = performance.now()
    const dt = Math.min(now - lastTick, 1000) / 1000
    lastTick = now
    if (!inView()) return
    if (bash.mode === 'test') {
      bash.time += dt
      if (bash.time - lastSaved > 10) {
        lastSaved = bash.time
        saveTest()
      }
    } else if (bash.running) {
      bash.left = Math.max(0, bash.left - dt)
      if (bash.left === 0) endQuiz()
    }
    showClock()
  }
  function showClock() {
    if (!bash) return
    const quiz = bash.mode === 'quiz'
    // Pop Quiz's countdown always shows: it is the game. A test's stopwatch follows Settings.
    $('mb-clock-wrap').hidden = !quiz && !panel.settings.showClock
    $('mb-clock').textContent = clockText(quiz ? Math.ceil(bash.left) : bash.time)
  }
  document.addEventListener('visibilitychange', () => {
    lastTick = performance.now()
    if (document.hidden) saveTest()
  })

  // --- Rules -----------------------------------------------------------------------------------

  const RULES_SEEN = 'rules-mathbash'
  function firstRules() {
    if (tips().includes(RULES_SEEN)) return
    tips().push(RULES_SEEN)
    saveGame()
    $('mb-rules').hidden = false
  }
  $('mb-rules').addEventListener('click', () => ($('mb-rules').hidden = true))

  // The computer's keyboard: digits, Backspace, Enter.
  document.addEventListener('keydown', (e) => {
    if (!bash || $('mb-screen').hidden || document.querySelector('dialog[open]')) return
    if (/^[0-9]$/.test(e.key)) press(e.key)
    else if (e.key === 'Backspace') press('⌫')
    else if (e.key === 'Enter') {
      if (!$('mb-card').hidden) $('mb-card-go').click()
      else press('Next')
    } else return
    e.preventDefault()
  })

  return {
    startTest,
    startQuiz,
    get current() {
      return bash
    },
    // Leaving the screen: keep the test's place, stop the clock. A Pop Quiz left early is dropped.
    leave() {
      saveTest()
      stopClock()
      bash = null
      $('mb-screen').hidden = true
    },
    // Home while on the screen: a test goes back to its book, Pop Quiz to the launch page.
    home() {
      const b = bash
      if (b?.mode === 'test') openBook(bookId(b), b.n)
      else showHome()
    },
    help: () => ($('mb-rules').hidden = false),
    active: () => !!bash,
    showClock,
  }
}
