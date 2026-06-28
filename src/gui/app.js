// Frontend glue. Consumes only the backend's JSON + SSE contract
// (see build_doc/SPEC-gui.md). T1 wires pure-frontend behaviour only;
// /config, /databases, /run, /log are connected in later tasks.

const $ = (id) => document.getElementById(id);

// Mode toggle: show the option group for the selected direction. Pure frontend,
// no backend call — safe to ship in T1.
function syncMode() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value ?? "export";
  $("export-opts").hidden = mode !== "export";
  $("import-opts").hidden = mode !== "import";
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", syncMode);
}
syncMode();

// Placeholders — replaced in T2 (/config), T3 (/databases), T4 (/run + SSE).
$("connect").addEventListener("click", () => {
  appendLog("(connect: not wired yet — T3)");
});
$("run").addEventListener("click", () => {
  appendLog("(run: not wired yet — T4)");
});

function appendLog(line) {
  const log = $("log");
  log.textContent += (log.textContent ? "\n" : "") + line;
  log.scrollTop = log.scrollHeight;
}
