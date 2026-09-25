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
    border: "0"
  });

  document.body.appendChild(region);

  return region;
}

function announce(message) {
  const region = createLiveRegion();

  region.textContent = "";

  window.setTimeout(function () {
    region.textContent = message;
  }, 50);
}

const STORAGE_KEY = "silentUpdates_lastVisit_" + HOSTNAME;

function trackVisit() {
  chrome.storage.local.get([STORAGE_KEY], function (result) {
    const previous = result[STORAGE_KEY];

    if (previous) {
      announce("Welcome back to " + HOSTNAME + ".");
    }

    const record = {
      lastVisit: Date.now()
    };

    const data = {};
    data[STORAGE_KEY] = record;

    chrome.storage.local.set(data);
  });
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