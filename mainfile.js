(function () {
  "use strict";

  const HOSTNAME = window.location.hostname || "this page";
  const STORAGE_KEY = "silentUpdates_lastVisit_" + HOSTNAME;
  const MAX_QUEUE_LENGTH = 200;
  const MIN_TEXT_LENGTH = 1;
  const LIVE_REGION_ID = "silent-updates-live-region";

  let changeQueue = [];

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
      }

      const record = { lastVisit: Date.now() };
      const toSave = {};
      toSave[STORAGE_KEY] = record;
      chrome.storage.local.set(toSave);
    });
  }

  function isNoiseElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName;
    return (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "LINK" ||
      tag === "META" ||
      node.id === LIVE_REGION_ID
    );
  }

  function extractReadableText(node) {
    if (!node) return "";

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.id === LIVE_REGION_ID || node.closest?.("#" + LIVE_REGION_ID)) {
        return "";
      }
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

  function enqueueChange(text) {
    if (!text || text.length < MIN_TEXT_LENGTH) return;

    changeQueue.push({
      text: text,
      timestamp: Date.now(),
    });

    if (changeQueue.length > MAX_QUEUE_LENGTH) {
      changeQueue.splice(0, changeQueue.length - MAX_QUEUE_LENGTH);
    }
  }

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      mutation.addedNodes.forEach(function (node) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node.id === LIVE_REGION_ID || node.querySelector?.("#" + LIVE_REGION_ID))
        ) {
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE && isNoiseElement(node)) return;

        const text = extractReadableText(node);
        if (text) enqueueChange(text);
      });
    }
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return;

    const observer = new MutationObserver(handleMutations);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: false,
    });
  }

  function announceSummary() {
    if (changeQueue.length === 0) {
      announce("No silent background updates detected on this page.");
      return;
    }

    const count = changeQueue.length;
    const latest = changeQueue[changeQueue.length - 1].text;
    const truncatedLatest = latest.length > 200 ? latest.slice(0, 200) + "…" : latest;

    announce(
      "Summary: " + count + " dynamic update" + (count === 1 ? "" : "s") +
      " logged. Latest: " + truncatedLatest
    );

    changeQueue = [];
  }

  function handleKeydown(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "s" && event.key !== "S") return;

    const active = document.activeElement;
    const isEditable =
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);
    if (isEditable) return;

    event.preventDefault();
    announceSummary();
  }

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