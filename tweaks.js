// Shared tweak logic for Uplift — palette + wordmark + featured layout.
(function () {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "palette": "paper",
    "mark": "masthead",
    "featured": "cover"
  }/*EDITMODE-END*/;

  const STORAGE_KEY = "uplift.tweaks";

  function readStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) { return {}; }
  }
  function writeStored(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  const state = Object.assign({}, TWEAK_DEFAULTS, readStored());

  function apply() {
    const html = document.documentElement;
    html.setAttribute("data-palette", state.palette);
    html.setAttribute("data-mark", state.mark);
    html.setAttribute("data-featured", state.featured);
    // reflect on tweak panel buttons if present
    document.querySelectorAll(".tweaks-opts button").forEach((b) => {
      const k = b.dataset.key; const v = b.dataset.value;
      if (k && v) b.setAttribute("aria-pressed", state[k] === v ? "true" : "false");
    });
  }

  function set(key, value) {
    state[key] = value;
    writeStored(state);
    apply();
    try {
      window.parent.postMessage({
        type: "__edit_mode_set_keys",
        edits: { [key]: value }
      }, "*");
    } catch (e) {}
  }

  // Apply immediately on script load
  apply();

  // Edit-mode integration — listener first, then announce
  function openPanel() {
    const p = document.getElementById("tweaks-panel");
    if (p) p.classList.add("is-open");
  }
  function closePanel() {
    const p = document.getElementById("tweaks-panel");
    if (p) p.classList.remove("is-open");
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "__activate_edit_mode") openPanel();
    if (d.type === "__deactivate_edit_mode") closePanel();
  });

  // Wire up buttons once DOM ready
  function wire() {
    document.querySelectorAll(".tweaks-opts button").forEach((b) => {
      b.addEventListener("click", () => set(b.dataset.key, b.dataset.value));
    });
    const closeBtn = document.querySelector(".tweaks-close");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    apply();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  try {
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
  } catch (e) {}

  window.UpliftTweaks = { set, state };
})();
