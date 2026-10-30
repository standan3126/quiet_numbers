# Quiet Numbers

Number puzzles on clean paper in GameHub, played like a puzzle book: tap to pencil, drag to ink,
and nothing is checked until the page is full. No ads, no lives, no countdowns.

- **Sudoku:** every row, column and box holds 1 to 9 once.
- **Sum Cross:** a crossword of sums that must all come out true, filled from a bank of numbers.

Each has four books (Easy 600, Medium 600, Hard 450, Expert 300 puzzles). Every puzzle has one
answer and never needs a guess.

Play: https://standan3126.github.io/quiet_numbers/

| File | What it holds |
|---|---|
| `index.html`, `css/game.css` | Screens and looks (cream paper by day, warm dark at night) |
| `js/main.js` | Launch page, books, both play screens, Hint and Look, clock, saves |
| `js/sudoku.js` | Sudoku rules, solver, step-by-step grader and puzzle maker |
| `js/sumcross.js` | Sum Cross rules, puzzle maker and step-by-step checker |
| `js/sumcross-board.js` | Draws a Sum Cross puzzle |
| `data/` | The books, made ahead by `tools/make-sudoku.mjs` and `tools/make-sumcross.mjs` |

```
npm install
npm run serve     # http://localhost:4230/quiet-numbers/ (needs the hub folder next to this one)
npm test          # every puzzle, then the game in phone-sized browsers
```

Uses the GameHub toolbox from `/shared/v1/` (frame, Tap to Start, book, zoom and pan, saves, sounds).
