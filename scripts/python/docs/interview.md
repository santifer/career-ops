# Interview

Interview preparation tools.

## Modules

### `match_star.py`
Matches behavioral interview questions to STAR stories from the user's story bank (`interview-prep/story-bank.md`). Uses fuzzy matching to find the best-fit story for each question.

```
python -m scripts.python.interview.match_star
npm run star
```

## Data Sources

- `interview-prep/story-bank.md` — accumulated STAR+R stories
- `interview-prep/{company}-{role}.md` — company-specific interview intel
- `cv.md` — experience and achievements

## CLI Bridge

```bash
python -m scripts.python.interview match-star
```
