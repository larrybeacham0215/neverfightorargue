# Uploading the files — where you're stuck

That screen is waiting for files, but the folder probably isn't on your computer yet. Everything I've sent so far has been individual files, never the whole thing as one download.

**Download `nfoaa-github.zip` first.** Then follow this.

Good news: **ignore what I said earlier about hidden files.** You don't need `.nojekyll` or `CNAME`. GitHub creates `CNAME` automatically when you set the custom domain later, and `.nojekyll` only matters for files starting with an underscore — none of yours do. That was the hardest part and it turns out you can skip it.

---

## 1. Unzip it

**Mac:** double-click `nfoaa-github.zip` in your Downloads. A folder called `nfoaa-github` appears next to it.

**Windows:** right-click → **Extract All** → **Extract**.

---

## 2. Open the folder

Double-click `nfoaa-github` so you're looking *inside* it. You should see:

```
404.html
GO-LIVE-NOW.md
LAUNCH-GUIDE.md
README.md
assets            (folder)
chapters          (folder)
index.html
robots.txt
site.webmanifest
sitemap.xml
supabase          (folder)
unsubscribe       (folder)
```

If instead you see a single `nfoaa-github` folder sitting on its own, you're one level too high. Double-click it.

---

## 3. Select everything inside

**Mac:** click once in the window, then `Cmd + A`
**Windows:** click once in the window, then `Ctrl + A`

Everything highlights — all the files *and* all four folders.

> **This is the part that goes wrong.** Select the things *inside* the folder, not the folder itself. If you drag `nfoaa-github` as a whole, GitHub buries everything one level down and the site won't load.

---

## 4. Drag it onto the GitHub page

Keep both windows visible. Drag the highlighted selection onto the big dashed box that says **"Drag files here to add them to your repository."**

Let go. GitHub lists everything it received — that takes a few seconds, and the folders expand into their individual files, which is normal.

> **Don't use "choose your files" for this.** That opens a file picker, and file pickers can't select folders alongside files. Dragging is the only way that brings `assets`, `chapters`, `supabase`, and `unsubscribe` across properly.

---

## 5. Commit

Scroll down. In the **Commit changes** box, the message field already says "Add files via upload" — that's fine, leave it.

Click the green **Commit changes** button.

---

## 6. Check it landed right

You'll be back at your repo's main page. You should see this list:

```
assets
chapters
supabase
unsubscribe
404.html
GO-LIVE-NOW.md
LAUNCH-GUIDE.md
README.md
index.html
robots.txt
site.webmanifest
sitemap.xml
```

**The test that matters: is `index.html` in that list?** If yes, you're done and can move to Step 3 of GO-LIVE-NOW (turning on Pages).

If instead you see a single folder called `nfoaa-github`, the wrong thing got dragged. Fix it by opening that folder in GitHub, or just delete the repo and start over — nothing is lost.

---

## If dragging won't work at all

Some browsers and setups fight this. Upload in two passes instead:

**Pass 1 — the loose files.** On the upload page click **choose your files**, select just the files (no folders): `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, and the three `.md` files. Commit.

**Pass 2 — the folders.** Click **Add file → Upload files** again, and drag the `assets` folder in on its own. Commit. Repeat for `chapters`, `unsubscribe`, and `supabase`.

Slower, but it always works.

---

## Then keep going

Back to **GO-LIVE-NOW.md**, Step 3 — switching on GitHub Pages. Ignore the notes about hidden files; you don't need them.
