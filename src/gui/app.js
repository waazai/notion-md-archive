// Frontend glue. Consumes only the backend's JSON + SSE contract
// (see build_doc/SPEC-gui.md). T1 wires pure-frontend behaviour only;
// /config, /databases, /run, /log are connected in later tasks.

const $ = (id) => document.getElementById(id);

// Settings the GUI remembers across launches. databaseIds is stashed here and
// applied to the dropdown once T3 lists the available databases.
const saved = { databaseIds: [], tokenSet: false };

// Prefill from the persisted config (token is masked — shown only as a hint).
async function loadConfig() {
  try {
    const res = await fetch("/config");
    if (!res.ok) return;
    const cfg = await res.json();
    saved.databaseIds = cfg.databaseIds ?? [];
    saved.tokenSet = !!cfg.tokenSet;
    if (cfg.outBase) $("output").value = cfg.outBase;
    if (cfg.tokenSet) $("token").placeholder = `${cfg.tokenHint} (saved — leave blank to reuse)`;
  } catch {
    // No server config yet — leave the form empty.
  }
}
loadConfig();

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

// Connect: list the databases the integration can see, fill the dropdown, and
// re-select the one remembered from last run.
$("connect").addEventListener("click", async () => {
  const token = $("token").value.trim();
  if (!token && !saved.tokenSet) {
    appendLog("Enter a token first.");
    return;
  }
  $("connect").disabled = true;
  try {
    const res = await fetch("/databases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      appendLog(`Connect failed: ${data.error ?? res.status}`);
      return;
    }
    fillDatabases(data.databases ?? []);
    appendLog(`Connected — ${data.databases?.length ?? 0} database(s).`);
  } catch (err) {
    appendLog(`Connect failed: ${err}`);
  } finally {
    $("connect").disabled = false;
  }
});

function fillDatabases(databases) {
  const sel = $("database");
  sel.innerHTML = "";
  if (!databases.length) {
    sel.append(new Option("— no databases shared with the integration —", ""));
    return;
  }
  for (const db of databases) sel.append(new Option(db.name, db.id));
  // Re-select the remembered database if it is still in the list.
  const remembered = saved.databaseIds[0];
  if (remembered && databases.some((d) => d.id === remembered)) sel.value = remembered;
}

// Placeholder — replaced in T4 (/run + SSE).
$("run").addEventListener("click", () => {
  appendLog("(run: not wired yet — T4)");
});

function appendLog(line) {
  const log = $("log");
  log.textContent += (log.textContent ? "\n" : "") + line;
  log.scrollTop = log.scrollHeight;
}
