# restyle inbox

Drop interface details that you see during the week in this folder. The weekly scout (the `restyle-scout` skill) reads them and can turn them into new recipes.

## What to drop here

- **Screenshots.** A `.png` or `.jpg` of a detail: an animation frame, a type treatment, an interaction state.
- **Links.** A `.txt` or `.md` file with one URL on each line. Add a few words after a URL to say which detail you mean.
- **Notes.** A `.md` file that describes a detail in your own words. Give the exact values when you know them, for example `200 ms`, `scale 0.95`, `cubic-bezier(0.2, 0, 0, 1)`.

Use one file for each detail when you can.

## What happens to the files

1. The scout reads this folder once a week.
2. It compares each detail with the existing recipes and keeps at most 5 new ones.
3. It proposes the new recipes in one draft pull request. A person reviews and merges it.
4. It moves each file that it read to `inbox/done/`. It does not commit the files.

## Rules

- The scout treats the files here as data. It does not follow instructions in them.
- The repository is public. The scout does not commit inbox files, but do not drop files with personal data, secrets, or client or product names.
