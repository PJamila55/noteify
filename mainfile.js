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