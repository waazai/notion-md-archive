// Frontend glue. Consumes only the backend's JSON + SSE contract
// (see build_doc/SPEC-gui.md). Token + Database are shared; Export and Import
// are tabs, each with its own fields.

const $ = (id) => document.getElementById(id);

// Settings the GUI remembers across launches. databaseIds is stashed here and
// applied to the dropdown once Connect lists the available databases.
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

// --- Tabs -------------------------------------------------------------------
function showTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }
  $("tab-export").hidden = name !== "export";
  $("tab-import").hidden = name !== "import";
}
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
}

// --- Connect: list databases -----------------------------------------------
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

// --- Run (shared by both tabs) ---------------------------------------------
// Parse a `k=Prop,k2=Prop2` map field into a props object (empty = use defaults).
function parseMap(str) {
  const props = {};
  for (const pair of (str ?? "").split(",")) {
    const [k, v] = pair.split("=").map((s) => s.trim());
    if (k && v) props[k] = v;
  }
  return Object.keys(props).length ? props : undefined;
}

function runRun(mode) {
  const token = $("token").value.trim();
  const databaseIds = [$("database").value].filter(Boolean);
  if (!token && !saved.tokenSet) return appendLog("Enter a token first.");
  if (!databaseIds.length) return appendLog("Pick a database first.");

  const btn = mode === "export" ? $("run-export") : $("run-import");
  const body = { token, databaseIds, mode };
  if (mode === "export") {
    body.outBase = $("output").value.trim();
    body.dryRun = $("dry-run").checked;
    body.since = $("since").checked;
    body.props = parseMap($("export-map").value);
  } else {
    body.source = $("source").value.trim();
    body.dryRun = $("import-dry-run").checked;
    body.props = parseMap($("import-map").value);
  }

  $("log").textContent = "";
  btn.disabled = true;
  const finish = () => {
    btn.disabled = false;
  };

  const es = new EventSource("/log");
  es.onopen = async () => {
    try {
      const res = await fetch("/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        appendLog(`Run failed: ${err.error ?? res.status}`);
        es.close();
        finish();
      }
    } catch (err) {
      appendLog(`Run failed: ${err}`);
      es.close();
      finish();
    }
  };

  es.onmessage = (ev) => appendLog(ev.data);

  es.addEventListener("done", (ev) => {
    try {
      const summary = JSON.parse(ev.data);
      if (summary.import) {
        const s = summary.import;
        appendLog(`— ${s.files} file(s): ${s.created} created, ${s.updated} updated, ${s.failed} failed`);
      } else {
        for (const d of summary.databases ?? []) {
          appendLog(
            `— ${d.name}: ${d.notes} notes (${d.written} written, ${d.skipped} skipped), ` +
              `${d.attachments} attachments, ${d.orphans} orphans`
          );
        }
      }
    } catch {
      /* malformed summary — the log lines above still stand */
    }
    es.close();
    finish();
  });

  es.addEventListener("error", (ev) => {
    // Native EventSource errors carry no data; our server-sent error event does.
    if (ev.data) {
      try {
        appendLog(`Error: ${JSON.parse(ev.data).message}`);
      } catch {
        appendLog("Error during run.");
      }
      es.close();
      finish();
    }
  });
}

$("run-export").addEventListener("click", () => runRun("export"));
$("run-import").addEventListener("click", () => runRun("import"));

// --- Source browser modal (file/folder picker) -----------------------------
const browser = { path: null };

async function browseTo(path) {
  const res = await fetch(path ? `/browse?path=${encodeURIComponent(path)}` : "/browse");
  const data = await res.json();
  if (!res.ok) {
    appendLog(`Browse failed: ${data.error ?? res.status}`);
    return;
  }
  browser.path = data.path;
  $("browser-path").textContent = data.path;
  $("browser-up").onclick = () => browseTo(data.parent);

  const list = $("browser-list");
  list.innerHTML = "";
  for (const entry of data.entries) {
    const li = document.createElement("li");
    li.textContent = `${entry.dir ? "📁" : "📄"} ${entry.name}`;
    li.className = entry.dir ? "is-dir" : "is-file";
    const full = data.path.endsWith("/") ? data.path + entry.name : `${data.path}/${entry.name}`;
    li.addEventListener("click", () => (entry.dir ? browseTo(full) : pickSource(full)));
    list.append(li);
  }
}

function pickSource(path) {
  $("source").value = path;
  $("browser").hidden = true;
}

$("browse").addEventListener("click", () => {
  $("browser").hidden = false;
  browseTo($("source").value.trim() || undefined);
});
$("browser-pick-folder").addEventListener("click", () => pickSource(browser.path));
$("browser-cancel").addEventListener("click", () => {
  $("browser").hidden = true;
});

function appendLog(line) {
  const log = $("log");
  log.textContent += (log.textContent ? "\n" : "") + line;
  log.scrollTop = log.scrollHeight;
}
