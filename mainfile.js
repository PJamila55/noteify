
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  const ASSERTIVE_ID = "noteify-assertive-region";
  const POLITE_ID = "noteify-polite-region";
  const ANNOUNCE_GAP_MS = 350; // spacing between queued polite announcements
  const STORAGE_KEY = "noteify_lastVisit_" + location.href;

  const SEL = {
    notifList: "#notif-list",
    badge: "#badge",
    toast: "#toast",
    modal: "#info-modal",
    modalContent: "#info-modal .modal-content",
  };

  let speechQueue = [];
  let draining = false;

  // ---------------------------------------------------------------------
  // Live regions
  // ---------------------------------------------------------------------
  function createRegion(id, live) {
    let region = document.getElementById(id);
    if (region) return region;

    region = document.createElement("div");
    region.id = id;
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", live);
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

  // Assertive: for on-demand commands. Interrupts whatever NVDA is saying.
  function announceNow(message) {
    const region = createRegion(ASSERTIVE_ID, "assertive");
    region.textContent = "";
    window.setTimeout(function () {
      region.textContent = message;
    }, 50);
  }

  // Polite: for automatic events. Queued so every single one gets spoken.
  function enqueueAnnouncement(message) {
    if (!message) return;
    speechQueue.push(message);
    if (!draining) drainQueue();
  }

  function drainQueue() {
    if (speechQueue.length === 0) {
      draining = false;
      return;
    }
    draining = true;
    const message = speechQueue.shift();
    const region = createRegion(POLITE_ID, "polite");
    region.textContent = "";
    window.setTimeout(function () {
      region.textContent = message;
      window.setTimeout(drainQueue, ANNOUNCE_GAP_MS);
    }, 50);
  }

  // ---------------------------------------------------------------------
  // Page-specific watchers
  // ---------------------------------------------------------------------
  function getNotifText(item) {
    // Each .notif-item is: <div>message</div><div class="notif-time">...</div>
    // We only want the message, not the timestamp, to keep it concise.
    const first = item.querySelector(":scope > div:first-child");
    const text = first ? first.textContent : item.textContent;
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function watchNotifList() {
    const list = document.querySelector(SEL.notifList);
    if (!list) return;

    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;

          if (node.classList.contains("notif-item")) {
            const text = getNotifText(node);
            if (text) enqueueAnnouncement(text);
          } else if (node.id === "empty-msg") {
            // Fires when "Clear All" resets the list.
            enqueueAnnouncement("Notifications cleared.");
          }
        });
      });
    });

    observer.observe(list, { childList: true });
  }

  function watchToast() {
    const toast = document.querySelector(SEL.toast);
    if (!toast) return;

    const observer = new MutationObserver(function () {
      if (toast.classList.contains("active")) {
        const text = (toast.textContent || "").trim();
        if (text) enqueueAnnouncement("Popup: " + text);
      }
    });

    observer.observe(toast, { attributes: true, attributeFilter: ["class"] });
  }

  function watchModal() {
    const modal = document.querySelector(SEL.modal);
    if (!modal) return;

    const observer = new MutationObserver(function () {
      if (modal.classList.contains("active")) {
        const content = document.querySelector(SEL.modalContent);
        const text = content ? content.textContent.replace(/\s+/g, " ").trim() : "";
        enqueueAnnouncement("Modal opened: " + (text || "Info modal."));
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  // ---------------------------------------------------------------------
  // Return-visit tracking (kept simple, keyed to this exact page URL)
  // ---------------------------------------------------------------------
  function trackVisit() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get([STORAGE_KEY], function (result) {
      const previous = result ? result[STORAGE_KEY] : null;
      if (previous && previous.lastVisit) {
        const mins = Math.max(0, Math.round((Date.now() - previous.lastVisit) / 60000));
        const ago = mins < 1 ? "less than a minute ago" : mins === 1 ? "1 minute ago" : mins + " minutes ago";
        announceNow("Welcome back. Last visited " + ago + ".");
      }
      const toSave = {};
      toSave[STORAGE_KEY] = { lastVisit: Date.now() };
      chrome.storage.local.set(toSave);
    });
  }

  // ---------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------
  function announceSummary() {
    const badgeEl = document.querySelector(SEL.badge);
    const count = badgeEl ? parseInt(badgeEl.textContent, 10) || 0 : 0;

    if (count === 0) {
      announceNow("No notifications yet.");
      return;
    }

    const list = document.querySelector(SEL.notifList);
    const latestItem = list ? list.querySelector(".notif-item") : null; // newest is inserted first
    const latestText = latestItem ? getNotifText(latestItem) : "";

    announceNow(count + " notification" + (count === 1 ? "" : "s") + ". Latest: " + latestText + ".");
  }

  function announceHelp() {
    announceNow(
      "NOTEIFY commands: Alt plus S for a notification summary. Alt plus H to hear this list again. " +
      "Every new notification, popup, and modal on this page is announced automatically as it happens. " +
      "Press Control at any time to stop NVDA from speaking."
    );
  }

  // ---------------------------------------------------------------------
  // Keyboard handling — Alt-only, never conflicts with NVDA's own commands
  // ---------------------------------------------------------------------
  function isEditableTarget() {
    const active = document.activeElement;
    return !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
  }

  function handleKeydown(event) {
    if (isEditableTarget()) return;

    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyS") {
      event.preventDefault();
      announceSummary();
      return;
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyH") {
      event.preventDefault();
      announceHelp();
      return;
    }
  }

  // ---------------------------------------------------------------------
  // Init — only activates if this page has the expected dashboard structure
  // ---------------------------------------------------------------------
  function init() {
    if (!document.querySelector(SEL.notifList)) return; // not the target page; stay inert

    createRegion(ASSERTIVE_ID, "assertive");
    createRegion(POLITE_ID, "polite");

    trackVisit();
    watchNotifList();
    watchToast();
    watchModal();

    document.addEventListener("keydown", handleKeydown, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();