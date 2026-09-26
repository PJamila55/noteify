(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  const HOSTNAME = window.location.hostname || "this page";
  const STORAGE_KEY = "silentUpdates_lastVisit_" + HOSTNAME;
  const MAX_QUEUE_LENGTH = 200;
  const LIVE_REGION_ID = "silent-updates-live-region";
  const REVISIT_PROMPT_DELAY_MS = 4000; // window to gather changes before asking
  const ACTION_WINDOW_MS = 10000; // how long 1/2/3 stay active after a summary

  const NOTIFICATION_KEYWORDS = ["notification", "notif", "alert", "toast", "badge", "unread", "chat", "message"];
  const POPUP_KEYWORDS = ["modal", "popup", "overlay", "dialog"];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let changeQueue = []; // {text, timestamp, isNotification, isPopup}
  let openPopups = []; // element refs currently believed to be open popups
  let lastNotificationElement = null;

  let awaitingPromptResponse = false;
  let awaitingAction = false;
  let actionTimeoutId = null;

  let lastSummarySnapshot = []; // frozen copy of queue text at last summary, for "3 = full details"

  // ---------------------------------------------------------------------
  // Invisible aria-live region
  // ---------------------------------------------------------------------
  function createLiveRegion() {
    let region = document.getElementById(LIVE_REGION_ID);
    if (region) return region;

    region = document.createElement("div");
    region.id = LIVE_REGION_ID;
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "assertive");
    region.setAttribute("aria-atomic", "true");

    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      padding: "0",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: "0",
    });

    (document.body || document.documentElement).appendChild(region);
    return region;
  }

  function announce(message) {
    const region = createLiveRegion();
    region.textContent = "";
    window.setTimeout(function () {
      region.textContent = message;
    }, 50);
  }

  // ---------------------------------------------------------------------
  // Return-visit tracking
  // ---------------------------------------------------------------------
  function minutesAgo(timestamp) {
    const diffMs = Date.now() - timestamp;
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) return "less than a minute ago";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return mins + " minutes ago";
    const hours = Math.round(mins / 60);
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return hours + " hours ago";
    const days = Math.round(hours / 24);
    return days === 1 ? "1 day ago" : days + " days ago";
  }

  function trackVisit() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get([STORAGE_KEY], function (result) {
      const previous = result ? result[STORAGE_KEY] : null;

      if (previous && previous.lastVisit) {
        const ago = minutesAgo(previous.lastVisit);
        announce("Welcome back to " + HOSTNAME + ". Last visited " + ago + ".");

        // Give the page a short window to load in dynamic content, then
        // ASK (don't force) whether the user wants a summary.
        window.setTimeout(maybeOfferRevisitSummary, REVISIT_PROMPT_DELAY_MS);
      }

      const record = { lastVisit: Date.now() };
      const toSave = {};
      toSave[STORAGE_KEY] = record;
      chrome.storage.local.set(toSave);
    });
  }

  function maybeOfferRevisitSummary() {
    if (changeQueue.length === 0) return; // nothing changed, stay silent
    awaitingPromptResponse = true;
    announce("New changes detected in site interface. Would you like a summary? Press Alt plus Y for yes, Alt plus N for no.");
  }

  // ---------------------------------------------------------------------
  // Classification helpers
  // ---------------------------------------------------------------------
  function matchesKeywords(node, keywords) {
    if (!(node instanceof Element)) return false;
    const cls = typeof node.className === "string" ? node.className : "";
    const hay = (cls + " " + (node.id || "") + " " + (node.getAttribute("role") || "")).toLowerCase();
    return keywords.some(function (k) { return hay.indexOf(k) !== -1; });
  }

  function isPopupNode(node) {
    if (!(node instanceof Element)) return false;
    const role = node.getAttribute("role");
    return matchesKeywords(node, POPUP_KEYWORDS) || role === "dialog" || role === "alertdialog";
  }

  function isNotificationNode(node) {
    if (!(node instanceof Element)) return false;
    const role = node.getAttribute("role");
    return (
      matchesKeywords(node, NOTIFICATION_KEYWORDS) ||
      role === "alert" ||
      role === "status" ||
      node.hasAttribute("aria-live")
    );
  }

  function getAccessibleLabel(el) {
    if (!el) return null;
    const label = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"));
    if (label) return label.trim();
    const text = (el.innerText !== undefined ? el.innerText : el.textContent || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 40) : null;
  }

  // ---------------------------------------------------------------------
  // Noise filtering / text extraction
  // ---------------------------------------------------------------------
  function isNoiseElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName;
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "LINK" || tag === "META" || node.id === LIVE_REGION_ID;
  }

  function extractReadableText(node) {
    if (!node) return "";
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.id === LIVE_REGION_ID || node.closest?.("#" + LIVE_REGION_ID)) return "";
      if (isNoiseElement(node)) return "";
    }
    let text = "";
    if (node.nodeType === Node.TEXT_NODE) {
      text = node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text = node.innerText !== undefined ? node.innerText : node.textContent || "";
    }
    return text.replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------------
  // Silent mutation queue
  // ---------------------------------------------------------------------
  function enqueueChange(node, text) {
    if (!text) return;

    const isPopup = isPopupNode(node);
    const isNotification = isNotificationNode(node);

    changeQueue.push({ text: text, timestamp: Date.now(), isNotification: isNotification, isPopup: isPopup });
    if (changeQueue.length > MAX_QUEUE_LENGTH) {
      changeQueue.splice(0, changeQueue.length - MAX_QUEUE_LENGTH);
    }

    if (isPopup && node instanceof Element) openPopups.push(node);
    if (isNotification && node instanceof Element) lastNotificationElement = node;
  }

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === LIVE_REGION_ID || node.querySelector?.("#" + LIVE_REGION_ID)) return;
          if (isNoiseElement(node)) return;
        }
        const text = extractReadableText(node);
        if (text) enqueueChange(node, text);
      });

      // Keep the popup list honest if the page removes its own popups.
      mutation.removedNodes.forEach(function (node) {
        openPopups = openPopups.filter(function (el) {
          return el !== node && !(node.contains && node.contains(el));
        });
        if (lastNotificationElement === node) lastNotificationElement = null;
      });
    }
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return;
    const observer = new MutationObserver(handleMutations);
    observer.observe(target, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------
  // Summary + quick actions
  // ---------------------------------------------------------------------
  function armActionWindow() {
    awaitingAction = true;
    if (actionTimeoutId) window.clearTimeout(actionTimeoutId);
    actionTimeoutId = window.setTimeout(function () {
      awaitingAction = false;
    }, ACTION_WINDOW_MS);
  }

  function announceSummary() {
    awaitingPromptResponse = false;

    if (changeQueue.length === 0) {
      announce("No silent background updates detected on this page.");
      return;
    }

    const count = changeQueue.length;
    const hasNotification = changeQueue.some(function (e) { return e.isNotification; }) && !!lastNotificationElement;
    const hasPopups = openPopups.filter(function (el) { return el.isConnected; }).length > 0;

    let message = count + " update" + (count === 1 ? "" : "s") + " detected.";
    if (hasNotification) {
      const label = getAccessibleLabel(lastNotificationElement) || "new activity";
      message += " Notification: " + (label.length > 60 ? label.slice(0, 60) + "…" : label) + ".";
    }
    if (hasPopups) {
      message += " Popup detected.";
    }

    const opts = [];
    if (hasPopups) opts.push("Alt plus 1 to dismiss popups");
    if (hasNotification) opts.push("Alt plus 2 to jump to notification");
    opts.push("Alt plus 3 for full details");
    message += " Press " + opts.join(", ") + ".";

    announce(message);

    lastSummarySnapshot = changeQueue.slice();
    changeQueue = [];
    armActionWindow();
  }

  function dismissPopups() {
    const popups = openPopups.filter(function (el) { return el.isConnected; });
    if (popups.length === 0) {
      announce("No popups to dismiss.");
      return;
    }
    let dismissed = 0;
    popups.forEach(function (el) {
      const closeBtn = el.querySelector('[aria-label*="close" i], .close, [class*="close" i], button[title*="close" i]');
      if (closeBtn) {
        closeBtn.click();
      } else {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      }
      dismissed++;
    });
    openPopups = [];
    announce("Attempted to dismiss " + dismissed + " popup" + (dismissed === 1 ? "" : "s") + ".");
  }

  function jumpToNotification() {
    const el = lastNotificationElement;
    if (!el || !el.isConnected) {
      announce("No notification element found.");
      return;
    }
    let target = el.matches("button, a, [tabindex], input, select, textarea") ? el : el.querySelector("button, a, [tabindex], input, select, textarea");
    if (!target) {
      target = el;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    }
    target.scrollIntoView({ block: "center" });
    target.focus();
    const label = getAccessibleLabel(target) || "notification";
    announce("Focus moved to " + label + ". Press Enter to open.");
  }

  function readFullDetails() {
    if (lastSummarySnapshot.length === 0) {
      announce("No details available.");
      return;
    }
    const list = lastSummarySnapshot
      .map(function (e, i) { return "Update " + (i + 1) + ": " + e.text; })
      .join(". ");
    announce(list.length > 500 ? list.slice(0, 500) + "…" : list);
  }

  function announceHelp() {
    announce(
      "NOTEIFY commands: Alt plus S for an update summary. Alt plus Y or Alt plus N to answer the new changes prompt. " +
      "After a summary: Alt plus 1 to dismiss popups, Alt plus 2 to jump to a notification, Alt plus 3 for full details. " +
      "Alt plus H to hear this list again. Press Control at any time to stop NVDA from speaking. " +
      "All NOTEIFY commands use Alt so they never conflict with NVDA's own single-letter browse mode commands."
    );
  }

  // ---------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------
  function isEditableTarget() {
    const active = document.activeElement;
    return !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
  }

  function handleKeydown(event) {
    if (isEditableTarget()) return;

    // Alt + S — on-demand summary
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      announceSummary();
      return;
    }

    // Alt + H — help / command list
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "h" || event.key === "H")) {
      event.preventDefault();
      announceHelp();
      return;
    }

    // Every remaining NOTEIFY command requires Alt. This is deliberate:
    // NVDA's browse mode reserves bare letters/numbers (h, k, b, l, t, f,
    // and 1-6 for heading levels, etc.) for its own quick-navigation and
    // swallows those keystrokes before the page ever sees them. Keeping
    // everything on Alt+<key> avoids any overlap with NVDA's own commands.
    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    if (awaitingPromptResponse && (event.key === "y" || event.key === "Y")) {
      event.preventDefault();
      announceSummary();
      return;
    }
    if (awaitingPromptResponse && (event.key === "n" || event.key === "N")) {
      event.preventDefault();
      awaitingPromptResponse = false;
      announce("Okay. Press Alt+S anytime for a summary.");
      return;
    }

    if (awaitingAction && event.key === "1") {
      event.preventDefault();
      dismissPopups();
      return;
    }
    if (awaitingAction && event.key === "2") {
      event.preventDefault();
      jumpToNotification();
      return;
    }
    if (awaitingAction && event.key === "3") {
      event.preventDefault();
      readFullDetails();
      return;
    }
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    createLiveRegion();
    trackVisit();
    startObserver();
    document.addEventListener("keydown", handleKeydown, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();