// HTML for the meal-plan feature. Two pages:
//   renderLoginPage(base, showError) - the password gate
//   renderAppPage(base, stored)      - the interactive rotation, seeded with state
//
// Visual design (CSS, fonts, colour tokens, layout) is carried over verbatim from
// the original Claude.ai artifact reference so the page looks identical. The only
// real change is persistence: the client now talks to `${base}/api/state` instead
// of republishing the artifact.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const STYLES = `<style>
  :root {
    --paper: #f1efe6;
    --paper-card: #fbfaf6;
    --ink: #1f2a24;
    --ink-soft: #6b7365;
    --line: #d9d5c6;
    --batch: #6b7d3f;
    --batch-bg: #e5eace;
    --fresh: #2f6284;
    --fresh-bg: #dbe7ee;
    --zero: #a5731f;
    --zero-bg: #f2e2bd;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #1b1e19; --paper-card: #23271f; --ink: #ece8db; --ink-soft: #a9ab9a;
      --line: #3a3e33; --batch: #adc37f; --batch-bg: #333d26;
      --fresh: #92c0dc; --fresh-bg: #24333c; --zero: #e6bd6f; --zero-bg: #3c331d;
    }
  }
  :root[data-theme="dark"] {
    --paper: #1b1e19; --paper-card: #23271f; --ink: #ece8db; --ink-soft: #a9ab9a;
    --line: #3a3e33; --batch: #adc37f; --batch-bg: #333d26;
    --fresh: #92c0dc; --fresh-bg: #24333c; --zero: #e6bd6f; --zero-bg: #3c331d;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Inter', sans-serif;
    padding: 36px 20px 60px;
  }
  .sheet { max-width: 980px; margin: 0 auto; }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 22px;
  }
  h1 {
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 2.1rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .cycle-tag {
    font-size: 0.82rem;
    color: var(--ink-soft);
    font-weight: 500;
    white-space: nowrap;
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-bottom: 18px;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  #status { font-weight: 500; min-height: 1em; transition: opacity 0.3s; }
  #status.err { color: var(--zero); }
  .linkbtn {
    font-family: 'Inter', sans-serif;
    font-size: 0.78rem;
    color: var(--ink-soft);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .linkbtn:hover { color: var(--ink); }

  .legend {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    padding: 12px 0 26px;
    border-bottom: 2px solid var(--ink);
    margin-bottom: 26px;
  }
  .legend-item { display: flex; align-items: center; gap: 7px; font-size: 0.85rem; font-weight: 500; color: var(--ink-soft); }
  .dot { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
  .dot.batch { background: var(--batch); }
  .dot.fresh { background: var(--fresh); }
  .dot.zero { background: var(--zero); }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .card {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 20px 22px;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: attr(data-week);
    position: absolute;
    top: -8px;
    right: 4px;
    font-family: 'Fraunces', serif;
    font-weight: 700;
    font-size: 4.6rem;
    color: var(--ink);
    opacity: 0.06;
    line-height: 1;
  }
  .card-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ink-soft);
    margin-bottom: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: 66px 1fr;
    gap: 10px;
    align-items: center;
    padding: 7px 0;
    border-top: 1px solid var(--line);
  }
  .row:first-of-type { border-top: none; padding-top: 0; }

  .tag {
    font-size: 0.66rem;
    font-weight: 700;
    padding: 3px 0;
    text-align: center;
    border-radius: 5px;
    letter-spacing: 0.01em;
  }
  .tag.batch { background: var(--batch-bg); color: var(--batch); }
  .tag.fresh { background: var(--fresh-bg); color: var(--fresh); }
  .tag.zero { background: var(--zero-bg); color: var(--zero); }

  .dish-select {
    font-family: 'Fraunces', serif;
    font-weight: 500;
    font-size: 1.02rem;
    color: var(--ink);
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    padding: 2px 0;
    width: 100%;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .dish-select:hover, .dish-select:focus {
    border-bottom: 1px solid var(--line);
    outline: none;
  }

  .dishlist-section {
    margin-top: 34px;
    padding-top: 24px;
    border-top: 2px solid var(--ink);
  }
  .dishlist-headrow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 18px;
  }
  .dishlist-headrow h2 {
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 1.25rem;
    margin: 0;
  }

  .dish-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .dish-col h3 {
    font-size: 0.7rem;
    font-weight: 700;
    margin: 0 0 10px;
  }
  .dish-col.batch h3 { color: var(--batch); }
  .dish-col.fresh h3 { color: var(--fresh); }
  .dish-col.zero h3 { color: var(--zero); }

  .dish-col ul {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    font-size: 0.88rem;
    color: var(--ink);
  }
  .dish-col li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .dish-col li:first-child { border-top: none; }
  .rm {
    border: none;
    background: none;
    color: var(--ink-soft);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
    flex-shrink: 0;
  }
  .rm:hover { color: var(--ink); }

  .add-form {
    display: flex;
    gap: 6px;
  }
  .add-form input {
    flex: 1;
    min-width: 0;
    font-family: 'Inter', sans-serif;
    font-size: 0.82rem;
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper-card);
    color: var(--ink);
  }
  .add-form button {
    font-family: 'Inter', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 7px 12px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .add-form button:hover { background: var(--line); }

  /* Login gate */
  .gate { max-width: 340px; margin: 12vh auto 0; text-align: center; }
  .gate h1 { font-size: 1.7rem; margin-bottom: 6px; }
  .gate p { color: var(--ink-soft); font-size: 0.9rem; margin: 0 0 22px; }
  .gate form { display: flex; flex-direction: column; gap: 10px; }
  .gate input {
    font-family: 'Inter', sans-serif;
    font-size: 0.95rem;
    padding: 11px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper-card);
    color: var(--ink);
  }
  .gate button {
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    padding: 11px 12px;
    border-radius: 8px;
    border: none;
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }
  .gate .err { color: var(--zero); font-size: 0.82rem; min-height: 1em; }

  @media print {
    body { padding: 16px; background: #fff; }
    .card { break-inside: avoid; }
    .add-form, .rm, .meta-row { display: none; }
  }

  @media (max-width: 680px) {
    .grid { grid-template-columns: 1fr; }
    .dish-cols { grid-template-columns: 1fr; }
    h1 { font-size: 1.7rem; }
  }
</style>`;

export function renderLoginPage(base, showError) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Meal rotation</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
${FONTS}
${STYLES}
</head>
<body>
  <div class="gate">
    <h1>Meal rotation</h1>
    <p>This page is private. Enter the password to continue.</p>
    <form method="POST" action="${esc(base)}/login" autocomplete="off">
      <input type="password" name="password" placeholder="Password" aria-label="Password" autofocus required>
      <button type="submit">Enter</button>
      <div class="err">${showError ? 'Incorrect password.' : ''}</div>
    </form>
  </div>
</body>
</html>`;
}

export function renderAppPage(base, stored) {
  // Serialise state safely for embedding in a <script> tag.
  const initial = JSON.stringify({
    version: stored.version,
    updatedAt: stored.updatedAt,
    data: stored.data,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dinner &amp; lunch rotation</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
${FONTS}
${STYLES}
</head>
<body>
<div class="sheet">

  <div class="title-row">
    <h1>Dinner &amp; lunch rotation</h1>
    <div class="cycle-tag">Loops every 8 weeks</div>
  </div>

  <div class="meta-row">
    <span id="status"></span>
    <form method="POST" action="${esc(base)}/logout" style="margin:0"><button type="submit" class="linkbtn">Log out</button></form>
  </div>

  <div class="legend">
    <div class="legend-item"><span class="dot batch"></span>Batch &amp; freeze</div>
    <div class="legend-item"><span class="dot fresh"></span>Fresh-finish</div>
    <div class="legend-item"><span class="dot zero"></span>Zero effort</div>
  </div>

  <noscript><p>This page needs JavaScript enabled.</p></noscript>
  <div class="grid" id="grid"></div>

  <div class="dishlist-section">
    <div class="dishlist-headrow">
      <h2>Full dish list</h2>
    </div>
    <div class="dish-cols">
      <div class="dish-col batch" data-cat="batch">
        <h3>Batch &amp; freeze</h3>
        <ul id="list-batch"></ul>
        <form class="add-form" data-cat="batch">
          <input type="text" placeholder="Add a dish…" maxlength="60" aria-label="Add a batch dish" />
          <button type="submit">Add</button>
        </form>
      </div>
      <div class="dish-col fresh" data-cat="fresh">
        <h3>Fresh-finish</h3>
        <ul id="list-fresh"></ul>
        <form class="add-form" data-cat="fresh">
          <input type="text" placeholder="Add a dish…" maxlength="60" aria-label="Add a fresh dish" />
          <button type="submit">Add</button>
        </form>
      </div>
      <div class="dish-col zero" data-cat="zero">
        <h3>Zero effort</h3>
        <ul id="list-zero"></ul>
        <form class="add-form" data-cat="zero">
          <input type="text" placeholder="Add a dish…" maxlength="60" aria-label="Add a zero-effort dish" />
          <button type="submit">Add</button>
        </form>
      </div>
    </div>
  </div>

</div>

<script type="application/json" id="initial-state">${initial}</script>
<script>${clientScript(base)}</script>
</body>
</html>`;
}

// The browser-side controller. Renders from state, saves edits to the API, and
// polls so an edit made on one phone shows up on the other.
function clientScript(base) {
  return `(function () {
  "use strict";
  var API = ${JSON.stringify(base + '/api/state')};
  var POLL_MS = 5000;

  var initial = JSON.parse(document.getElementById("initial-state").textContent);
  var state = initial.data;
  var version = initial.version;
  var saving = false;
  var pollTimer = null;

  var CAT_LABEL = { batch: "Batch", fresh: "Fresh", zero: "Zero" };
  var CATS = ["batch", "fresh", "zero"];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function status(msg, isErr) {
    var el = document.getElementById("status");
    el.textContent = msg;
    el.className = isErr ? "err" : "";
    el.style.opacity = msg ? "1" : "0";
  }

  function renderSelect(weekIdx, cat, selected, options) {
    var opts = options.slice();
    if (selected && opts.indexOf(selected) === -1) opts.push(selected);
    var html = opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === selected ? " selected" : "") + '>' + esc(o) + '</option>';
    }).join("");
    return '<select class="dish-select" data-week="' + weekIdx + '" data-cat="' + cat + '">' + html + '</select>';
  }

  function renderGrid() {
    var html = state.weeks.map(function (week, i) {
      var rows = CATS.map(function (cat) {
        return '<div class="row"><span class="tag ' + cat + '">' + CAT_LABEL[cat] + '</span>' +
          renderSelect(i, cat, week[cat], state.categories[cat]) + '</div>';
      }).join("");
      return '<div class="card" data-week="' + (i + 1) + '"><div class="card-label">Week ' + (i + 1) + '</div>' + rows + '</div>';
    }).join("");
    document.getElementById("grid").innerHTML = html;
  }

  function renderLists() {
    CATS.forEach(function (cat) {
      var items = state.categories[cat];
      document.getElementById("list-" + cat).innerHTML = items.map(function (item, i) {
        return '<li>' + esc(item) +
          '<button class="rm" data-cat="' + cat + '" data-idx="' + i + '" aria-label="Remove ' + esc(item) + '">\\u00d7</button></li>';
      }).join("");
    });
  }

  function renderAll() { renderGrid(); renderLists(); }

  function save() {
    saving = true;
    status("Saving…");
    return fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: state })
    }).then(function (r) {
      if (r.status === 401) { location.reload(); return null; }
      if (!r.ok) throw new Error("save failed");
      return r.json();
    }).then(function (res) {
      if (res) { version = res.version; status("Saved \\u2713"); setTimeout(function () { status(""); }, 1200); }
    }).catch(function () {
      status("Couldn't save — check connection", true);
    }).then(function () { saving = false; });
  }

  function poll() {
    if (saving) return;
    // Don't yank state out from under an open dropdown or a half-typed dish.
    var ae = document.activeElement;
    if (ae && (ae.tagName === "SELECT" || ae.tagName === "INPUT")) return;
    fetch(API, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (res && res.version > version) {
          state = res.data;
          version = res.version;
          renderAll();
          status("Updated from your other device");
          setTimeout(function () { status(""); }, 1500);
        }
      })
      .catch(function () {});
  }

  // --- Wire up interactions (event delegation on stable containers) ---
  document.getElementById("grid").addEventListener("change", function (e) {
    var sel = e.target.closest(".dish-select");
    if (!sel) return;
    var i = parseInt(sel.getAttribute("data-week"), 10);
    var cat = sel.getAttribute("data-cat");
    state.weeks[i][cat] = sel.value;
    save();
  });

  document.querySelectorAll(".dish-col ul").forEach(function (ul) {
    ul.addEventListener("click", function (e) {
      var btn = e.target.closest(".rm");
      if (!btn) return;
      var cat = btn.getAttribute("data-cat");
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      state.categories[cat].splice(idx, 1);
      renderAll();
      save();
    });
  });

  document.querySelectorAll(".add-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var cat = form.getAttribute("data-cat");
      var input = form.querySelector("input");
      var value = input.value.trim();
      input.value = "";
      if (!value) return;
      var exists = state.categories[cat].some(function (x) { return x.toLowerCase() === value.toLowerCase(); });
      if (exists) return;
      state.categories[cat].push(value);
      renderAll();
      save();
    });
  });

  renderAll();
  pollTimer = setInterval(poll, POLL_MS);
})();`;
}
