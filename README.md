# AllTimer

A browser countdown for the months remaining in the year — pick a 1–4 month stretch from today and watch it tick down.

## Features

- Countdown from 1 to 4 months, defaulting to the months left in the current year
- Fullscreen mode for a pure countdown view
- Light and dark themes (follows system preference, remembers your choice)
- Editable motivational title
- Responsive: mobile, tablet, desktop
- Progress bar and target-date caption
- State persists in `localStorage`

## Run

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8765
# → http://localhost:8765
```

No build step, no dependencies — static HTML/CSS/JS.
