# NOTEIFY

A Chrome/Edge browser extension (Manifest V3) that solves **"Interfaces That
Change Silently"** for screen reader users. It quietly tracks dynamic DOM
changes (live feeds, chat messages, score updates, popups/notifications) in
the background, and only speaks when the user asks — either through a
lightweight yes/no prompt on return visits, or on demand with **Alt + S**.

## Files

- `manifest.json` — Manifest V3 config (`storage` permission, injects on all URLs, NOTEIFY icon)
- `content.js` — Core logic: visit tracking, MutationObserver queue, prompts, hotkeys, quick actions
- `logo.png` — **Placeholder icon.** Replace this with your real NOTEIFY logo file before submitting — it just needs to keep the filename `logo.png` so `manifest.json` doesn't need any changes.
- `README.md` — This file
- `test.html` — Sample page for local testing

## Install (Load Unpacked)

1. Download/unzip this folder (keep all files together).
2. Swap the placeholder `logo.png` for your real logo (same filename).
3. Go to `chrome://extensions` (or `edge://extensions`).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select this folder.

## Commands

Every NOTEIFY command uses **Alt** as the modifier, on purpose — NVDA's
browse mode reserves bare letters and numbers for its own navigation (see
"Why Alt?" below), so nothing here should ever compete with NVDA.

| Key | When it works | What it does |
|---|---|---|
| **Alt + S** | Anytime | Gives a short summary of updates since the last summary |
| **Alt + H** | Anytime | Announces this command list out loud |
| **Alt + Y** | Only right after the "new changes detected" prompt | Hear the summary |
| **Alt + N** | Only right after the "new changes detected" prompt | Skip it — stays silent |
| **Alt + 1** | Only for ~10 seconds after a summary | Dismiss detected popups/modals |
| **Alt + 2** | Only for ~10 seconds after a summary | Move focus to the detected notification (press Enter to activate it) |
| **Alt + 3** | Only for ~10 seconds after a summary | Read the full detail list, not just the short version |
| **Ctrl** (NVDA's own shortcut) | Anytime speech is playing | **Hard stop** — instantly silences whatever NVDA is currently saying. Built into NVDA itself, not this extension, but it's the fastest way to cut off a long summary. |

None of these fire while you're typing in a text field, and they're only
"armed" during their specific window (prompt / post-summary), so they never
collide with normal typing or browsing.

### Why Alt for everything?

Two real conflicts came up in testing:

- **Ctrl+H is not ours.** Chrome/Edge reserve Ctrl+H as the built-in "Open
  History" shortcut — the browser intercepts it before any page script sees
  it, so no extension can override it. NOTEIFY's help command has always
  been **Alt+H**.
- **Bare keys clash with NVDA.** In NVDA's browse mode, unmodified letters
  and numbers are reserved for quick navigation — `1`–`6` jump between
  heading levels, and letters like `h`, `k`, `b`, `l`, `t`, `f` jump between
  headings, links, buttons, lists, tables, and form fields. NVDA consumes
  these keystrokes itself; they never reach the page's JavaScript. That's
  why the original bare `Y` / `N` / `1` / `2` / `3` bindings were unreliable.
  Requiring **Alt** sidesteps this entirely, since Alt-modified keys pass
  through to the page.

## How It Works

1. **Return-visit tracking**: On page load, NOTEIFY checks
   `chrome.storage.local` for a timestamp keyed to the current domain. If
   you've visited before, it announces *"Welcome back to example.com. Last
   visited 5 minutes ago."*

2. **Opt-in change prompt**: After the welcome-back message, NOTEIFY waits
   a few seconds to let the page settle. If any dynamic changes were
   silently detected in that window, it asks — it does not just start
   talking — *"New changes detected in site interface. Would you like a
   summary? Press Alt plus Y for yes, Alt plus N for no."* Alt+N keeps
   things quiet; you can still get a summary anytime with Alt+S.

3. **Silent mutation queue**: A `MutationObserver` watches for added DOM
   elements/text (scripts, styles, and blank whitespace are filtered out).
   Nothing is spoken as changes happen — they're just logged.

4. **Short, categorized summary**: Both Alt+Y and Alt+S produce the same
   compact announcement, e.g.:
   > "3 updates detected. Notification: New chat message. Press Alt plus 2 to jump to notification, Alt plus 3 for full details."

   It deliberately stays short — no line-by-line readout unless you ask
   for it with Alt+3.

5. **Quick actions**: Right after a summary, you get a short window to act:
   - **Alt+1 — Dismiss popups**: looks for a close button inside any
     detected modal/popup/dialog and clicks it; falls back to simulating
     an Escape keypress if no close button is found.
   - **Alt+2 — Jump to notification**: scrolls to and focuses the detected
     notification element (or its nearest clickable child, like a chat
     button), so pressing Enter opens it.
   - **Alt+3 — Full details**: reads every queued change in full, for when
     the short summary isn't enough.

## Testing With NVDA (using test.html)

1. Start NVDA.
2. In `chrome://extensions` → NOTEIFY's **Details**, turn on
   **"Allow access to file URLs"** (required for `file://` pages).
3. Open `test.html` in Chrome (drag it in, or use a `file://` path).
4. **Reload the page** — you should hear *"Welcome back..."* on the second
   load onward.
5. Click **"Add one update"** a few times within the first few seconds after
   reload — this simulates a chat/notification arriving. Within a few
   seconds you should hear the **Alt+Y / Alt+N prompt**.
6. Press **Alt+Y** — hear the short summary with your available options.
7. Try **Alt+3** to hear the full detail list, or press **Alt+S** anytime
   to re-check for new updates without waiting for the prompt.
8. Press **Alt+H** at any point to hear the full command list read back.
9. While NVDA is mid-sentence, press **Ctrl** to confirm the hard-stop
   works — this is NVDA's own behavior, unrelated to the extension code.

## Notes / Limitations

- Popup/notification detection is heuristic: it looks for common patterns
  (`role="dialog"`, `role="alert"`, class/id names containing "modal",
  "popup", "notification", "chat", etc.). Sites with unusual markup may
  not be classified correctly.
- NOTEIFY only reads/writes its own per-domain visit timestamp in
  `chrome.storage.local` — no data leaves the browser.
- The live region is visually hidden (off-screen, not `display:none`) so
  it stays in the accessibility tree while being invisible to sighted users,
  and is explicitly excluded from the MutationObserver to avoid feedback loops.
- The change queue is capped at 200 entries to avoid unbounded memory
  growth on very chatty pages.