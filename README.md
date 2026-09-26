# NOTEIFY

A Chrome/Edge browser extension (Manifest V3) that announces dynamic
interface changes to screen readers like NVDA. This build is deliberately
simplified and **tailored to one specific test page** — the "Interactive
Dashboard" (`hello.html`) — rather than trying to guess at arbitrary sites'
structure.

## Files

- `manifest.json` — Manifest V3 config (`storage` permission, injects on all URLs, NOTEIFY icon)
- `content.js` — Page-specific logic (see "How It Works" below)
- `logo.png` — **Placeholder icon.** Replace with your real logo (same filename) — no manifest changes needed.
- `hello.html`, `hello.css`, `script.js` — Your test dashboard, saved here so it's ready to test immediately
- `README.md` — This file

## Install (Load Unpacked)

1. Download/unzip this folder (keep all files together).
2. Swap the placeholder `logo.png` for your real logo (same filename).
3. Go to `chrome://extensions` (or `edge://extensions`).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select this folder.
6. In NOTEIFY's **Details**, turn on **"Allow access to file URLs"** — required since you'll be testing with a local `file://` page.

## Why "only this page"?

`content.js` checks for `#notif-list` on `init()`. If that element isn't on
the page, NOTEIFY does nothing at all — no observers, no announcements. That
means the extension is safe to leave loaded everywhere (it won't misfire on
random sites), but its actual behavior is written specifically against
`hello.html`'s structure: `#notif-list`, `#toast`, `#info-modal`, and
`#badge`. This is what let me drop all the generic keyword-guessing
("is this a popup? a notification?") from the earlier build.

## How It Works

NOTEIFY watches three elements directly, instead of the whole page:

1. **`#notif-list`** — every time a new `.notif-item` is inserted (from
   `addNotification()`), its message text (not the timestamp) is queued for
   announcement. This covers "Send 3 Notifs" and every single item in the
   "FLOODGATES" flood — **all 25**, not just the first or last.
2. **`#toast`** — when it gains the `active` class, its text is announced as
   `"Popup: <message>"`.
3. **`#info-modal`** — when it gains the `active` class, its heading and body
   text are announced as `"Modal opened: <text>"`.
4. **Clearing** — when "Clear All" resets the list back to the empty-state
   message, NOTEIFY announces `"Notifications cleared."`

### Why every single notification actually gets spoken

Two things had to change from the earlier generic build to make "announce
every single one, concisely" actually true, especially for the 25-item flood:

- **Two separate `aria-live` regions.** Alt+S and Alt+H use an
  **`assertive`** region, which interrupts speech immediately — appropriate
  since the user just asked a direct question. Automatic notifications use a
  **`polite`** region instead, which NVDA *queues* rather than interrupting.
  That's what stops rapid notifications from cutting each other off or
  getting dropped.
- **A small internal pacing queue.** Each queued message is written to the
  polite region roughly 350ms apart. Without this, DOM updates faster than
  that risk being coalesced into a single browser mutation event before
  NVDA (or any assistive tech) ever gets a chance to notice the intermediate
  ones. With it, the flood takes about 9 seconds to fully announce all 25
  items — slower than the flood itself, but nothing gets skipped.
- **Narrow observers.** Unlike the earlier build, nothing watches
  `document.body`. Only `#notif-list`, `#toast`, and `#info-modal` are
  observed directly, so NOTEIFY's own live-region announcements can never be
  picked back up as "page changes" — the repetition bug from before is
  structurally impossible here.

## Commands

| Key | What it does |
|---|---|
| **Alt + S** | On-demand summary: unread count + latest notification, e.g. *"5 notifications. Latest: INSANE ALERT #5: High load detected!"* |
| **Alt + H** | Announces the command list |
| **Ctrl** (NVDA's own shortcut) | Hard stop — instantly silences whatever NVDA is currently saying |

Both Alt commands use `event.code` (physical key) rather than `event.key`,
and skip firing while focus is in a text field, so they stay reliable across
keyboard layouts and never hijack normal typing.

## Testing With NVDA

1. Start NVDA.
2. Open `hello.html` in Chrome via `file://` (with "Allow access to file
   URLs" enabled per the install steps above).
3. Reload once — NVDA should announce *"Welcome back..."* from the second
   load onward (return-visit tracking is keyed to this exact page URL).
4. Click **"Send 3 Notifs"** — expect three short announcements ("You have
   mail", "You have mail", "You do NOT have mail") followed by "Popup: Added
   3 notifications!", each spoken distinctly.
5. Click **"Pop Text"** — expect "Popup: Hello i am a text".
6. Click **"Show Info"** — expect "Modal opened: Information Box. Popup
   modal test test, javascript."
7. Click **"FLOODGATES"** — expect all 25 "INSANE ALERT #n" items to be
   announced in order over the next several seconds, followed by the
   "FLOOD STARTED!" and "Flood completed!" toast announcements.
8. Click **"Clear All"** — expect "Notifications cleared."
9. Press **Alt+S** anytime to get a quick count + latest-item summary.
10. Press **Alt+H** to hear the command list.
11. While NVDA is mid-sentence, press **Ctrl** to confirm the hard-stop
    still works (this is NVDA's own behavior, unrelated to the extension).

## Notes / Limitations

- Since NOTEIFY is now scoped to this page's exact structure, it will not
  usefully announce anything on other sites — that's intentional per this
  request, not a bug. If you want a generic fallback for other pages again
  later, that's a separate mode we can add back in.
- The flood's ~9-second full readout is a deliberate trade-off: speaking
  every one of 25 rapid-fire items concisely and without collisions takes
  real time. If you'd rather have a faster but consolidated flood summary
  instead (e.g. "25 insane alerts detected" as one line), that's an easy
  alternate mode to add.
- NOTEIFY only reads/writes its own per-page visit timestamp in
  `chrome.storage.local` — no data leaves the browser.