const form = document.getElementById("research-form");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");
const historyEl = document.getElementById("history");
const progressPanel = document.getElementById("progress-panel");
const terminalWrap = document.getElementById("terminal-wrap");
const terminalLog = document.getElementById("terminal-log");
const terminalStatus = document.getElementById("terminal-status");
const elapsedEl = document.getElementById("elapsed");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function badge(value, label) {
  const colors = {
    high: "bg-green-100 text-green-800",
    strong: "bg-green-100 text-green-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-red-100 text-red-800",
    weak: "bg-red-100 text-red-800",
  };
  return `<span class="text-xs font-medium px-2 py-1 rounded ${colors[value] || "bg-slate-100 text-slate-600"}">${escapeHtml(label ? `${label}: ${value}` : value)}</span>`;
}

/**
 * Builds a standalone, self-contained HTML document for a brief - a printable "proof
 * sheet" a rep can download, share, or print/save-as-PDF via the browser's print dialog.
 * All CSS is inlined and fonts are loaded from Google Fonts; no other external assets.
 */
function buildBriefDocumentHtml(brief, researchedAt) {
  const strengthTag = { strong: "STÆRKT", medium: "MELLEM", weak: "SVAGT" };
  const levelWord = { high: "HØJ", medium: "MELLEM", low: "LAV", strong: "STÆRKT", weak: "SVAGT" };
  const openingLines = brief.openingLines || (brief.openingLine ? [brief.openingLine] : []);
  const r = brief.company.registration;
  const dateStr = new Date(researchedAt).toLocaleDateString("da-DK", { year: "numeric", month: "long", day: "numeric" });

  const registrationLine = r
    ? [
        r.type && r.number ? `${r.type} ${r.number}` : r.number,
        r.vatId ? `VAT ${r.vatId}` : null,
        r.authority,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" &nbsp;·&nbsp; ")
    : "";

  const signalsHtml = brief.signals
    .map(
      (s, i) => `
      <div class="signal">
        <div class="signal-head">
          <span class="signal-num">${String(i + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(s.title)}</h3>
          <span class="tag tag-${s.strength || "medium"}">${strengthTag[s.strength] || "SIGNAL"}</span>
        </div>
        <p class="signal-desc">${escapeHtml(s.description)}</p>
        <div class="signal-meta">
          <div><span class="meta-label">Hvorfor Exemplar</span>${escapeHtml(s.whyForExemplar)}</div>
          <div><span class="meta-label">Ydelse</span>${escapeHtml(s.relevantService)}</div>
        </div>
        <p class="signal-source">Kilde: <a href="${escapeHtml(s.sourceUrl)}">${escapeHtml(s.sourceTitle)}</a>${s.sourceDate ? ` &nbsp;·&nbsp; ${escapeHtml(s.sourceDate)}` : ""}</p>
      </div>`
    )
    .join("");

  const contactsHtml =
    brief.decisionMakers.length === 0
      ? `<p class="muted">Ingen specifik kontakt fundet.</p>`
      : `<ul class="contacts">${brief.decisionMakers
          .map(
            (d) =>
              `<li>${d.name ? `<strong>${escapeHtml(d.name)}</strong> — ` : ""}${escapeHtml(d.title)} <span class="muted">(${escapeHtml(d.howToFind)})</span></li>`
          )
          .join("")}</ul>`;

  const openersHtml = openingLines
    .map((line) => `<div class="opener"><span class="quote-mark">&ldquo;</span>${escapeHtml(line)}</div>`)
    .join("");

  const questionsHtml = brief.followUpQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8" />
<title>Sales Dossier — ${escapeHtml(brief.company.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Petrona:ital,wght@0,500;0,600;1,500;1,600&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper: #fbf9f3;
    --ink: #201c15;
    --ink-soft: #5b5548;
    --accent: #b34328;
    --accent-soft: #eaceC0;
    --rule: #ddd4c2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: 'Archivo', sans-serif; font-size: 15px; line-height: 1.55;
  }
  .page { max-width: 780px; margin: 0 auto; padding: 56px 56px 64px; position: relative; }
  .crop { position: absolute; width: 18px; height: 18px; border: none; opacity: 0.55; }
  .crop::before, .crop::after { content: ""; position: absolute; background: var(--ink); }
  .crop::before { width: 18px; height: 1px; }
  .crop::after { width: 1px; height: 18px; }
  .crop-tl { top: 18px; left: 18px; }
  .crop-tr { top: 18px; right: 18px; }
  .crop-bl { bottom: 18px; left: 18px; }
  .crop-br { bottom: 18px; right: 18px; }

  .masthead {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.12em;
    color: var(--ink-soft); text-transform: uppercase;
    border-bottom: 1px solid var(--rule); padding-bottom: 14px; margin-bottom: 28px;
  }

  .stamp {
    position: absolute; top: 98px; right: 40px;
    border: 2px solid var(--accent); color: var(--accent);
    font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.08em; text-align: center; padding: 7px 12px;
    transform: rotate(-5deg); border-radius: 3px;
  }
  .stamp div + div { margin-top: 3px; padding-top: 3px; border-top: 1px solid var(--accent-soft); }

  .company-name {
    font-family: 'Petrona', serif; font-style: italic; font-weight: 600;
    font-size: 44px; line-height: 1.05; margin: 0 0 6px; max-width: 74%;
  }
  .website-line { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-soft); }
  .registration-line {
    display: inline-block; margin-top: 10px; font-family: 'IBM Plex Mono', monospace;
    font-size: 11px; color: var(--ink-soft); border: 1px solid var(--rule);
    padding: 4px 9px; border-radius: 3px;
  }

  .summary {
    font-size: 17px; line-height: 1.65; margin: 30px 0 8px; max-width: 92%;
  }
  .summary::first-letter {
    font-family: 'Petrona', serif; font-weight: 600; font-size: 46px; color: var(--accent);
    float: left; line-height: 0.8; padding: 4px 6px 0 0;
  }
  .fit-line { font-size: 13px; color: var(--ink-soft); margin-bottom: 34px; }
  .fit-line strong { color: var(--accent); }

  .section-title {
    font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--accent); display: flex; align-items: center;
    gap: 10px; margin: 40px 0 18px;
  }
  .section-title::after { content: ""; flex: 1; height: 1px; background: var(--rule); }

  .signal { break-inside: avoid; padding: 14px 0; border-top: 1px solid var(--rule); }
  .signal:last-child { border-bottom: 1px solid var(--rule); }
  .signal-head { display: flex; align-items: baseline; gap: 10px; }
  .signal-num { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); }
  .signal-head h3 { font-family: 'Petrona', serif; font-weight: 600; font-size: 19px; margin: 0; flex: 1; }
  .tag {
    font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.08em;
    padding: 3px 7px; border-radius: 2px; border: 1px solid currentColor; white-space: nowrap;
  }
  .tag-strong { color: var(--accent); }
  .tag-medium { color: var(--ink-soft); }
  .tag-weak { color: #a39d8c; }
  .signal-desc { margin: 8px 0; }
  .signal-meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px;
    font-size: 13px; color: var(--ink-soft); margin-bottom: 6px;
  }
  .meta-label {
    display: block; font-family: 'IBM Plex Mono', monospace; font-size: 10px;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-bottom: 2px;
  }
  .signal-source { font-size: 12px; color: var(--ink-soft); margin: 0; }
  .signal-source a { color: var(--ink-soft); }

  .contacts { padding-left: 18px; margin: 0; }
  .contacts li { margin-bottom: 6px; }
  .muted { color: var(--ink-soft); }

  .opener {
    font-family: 'Petrona', serif; font-style: italic; font-size: 17px;
    padding: 10px 0 10px 30px; position: relative; margin-bottom: 4px; break-inside: avoid;
  }
  .quote-mark {
    position: absolute; left: -4px; top: 2px; font-size: 34px; color: var(--accent-soft);
    font-style: normal;
  }

  ul.questions { list-style: none; padding: 0; margin: 0; }
  ul.questions li {
    position: relative; padding: 6px 0 6px 26px; font-size: 14px; border-bottom: 1px dashed var(--rule);
  }
  ul.questions li::before {
    content: ""; position: absolute; left: 0; top: 9px; width: 12px; height: 12px;
    border: 1.4px solid var(--ink-soft); border-radius: 2px;
  }

  .footer {
    margin-top: 48px; padding-top: 14px; border-top: 1px solid var(--rule);
    font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.08em;
    color: var(--ink-soft); text-transform: uppercase; display: flex; justify-content: space-between;
  }

  @media print {
    body { background: white; }
    .page { padding: 24px 8mm 8mm; max-width: none; }
    @page { margin: 16mm 14mm; }
  }
</style>
</head>
<body>
  <div class="page">
    <span class="crop crop-tl"></span><span class="crop crop-tr"></span>
    <span class="crop crop-bl"></span><span class="crop crop-br"></span>

    <div class="masthead">
      <span>Exemplar &nbsp;·&nbsp; Sales Dossier</span>
      <span>${escapeHtml(dateStr)}</span>
    </div>

    <div class="stamp">
      <div>FIT: ${levelWord[brief.fit?.level] || "?"}</div>
      <div>CONF: ${levelWord[brief.confidence] || "?"}</div>
    </div>

    <h1 class="company-name">${escapeHtml(brief.company.name)}</h1>
    <div class="website-line">${escapeHtml(brief.company.website || "")}</div>
    ${registrationLine ? `<div class="registration-line">${registrationLine}</div>` : ""}

    <p class="summary">${escapeHtml(brief.summary)}</p>
    ${brief.fit ? `<p class="fit-line"><strong>Fit-vurdering:</strong> ${escapeHtml(brief.fit.rationale)}</p>` : ""}

    <div class="section-title">Signaler — stærkeste først</div>
    ${signalsHtml}

    <div class="section-title">Hvem du skal spørge efter</div>
    ${contactsHtml}

    <div class="section-title">Åbningsreplikker</div>
    ${openersHtml}

    <div class="section-title">Opfølgende spørgsmål</div>
    <ul class="questions">${questionsHtml}</ul>

    <div class="footer">
      <span>Genereret af Exemplar Sales Agent</span>
      <span>${escapeHtml(brief.company.name)}</span>
    </div>
  </div>
</body>
</html>`;
}

function renderBrief(brief, markdown, researchedAt = new Date().toISOString()) {
  const signalsHtml = brief.signals
    .map(
      (s) => `
      <div class="border-l-4 ${s.strength === "strong" ? "border-green-400" : s.strength === "weak" ? "border-red-300" : "border-slate-300"} pl-3 py-1 mb-3">
        <p class="font-semibold">${escapeHtml(s.title)} ${s.strength ? badge(s.strength) : ""}</p>
        <p class="text-sm text-slate-700">${escapeHtml(s.description)}</p>
        <p class="text-sm mt-1"><span class="font-medium">Hvorfor Exemplar:</span> ${escapeHtml(s.whyForExemplar)}</p>
        <p class="text-sm"><span class="font-medium">Relevant ydelse:</span> ${escapeHtml(s.relevantService)}</p>
        <p class="text-xs text-slate-500 mt-1">
          Kilde: <a class="underline" href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(s.sourceTitle)}</a>
          ${s.sourceDate ? `(${escapeHtml(s.sourceDate)})` : ""}
        </p>
      </div>`
    )
    .join("");

  const contactsHtml =
    brief.decisionMakers.length === 0
      ? '<p class="text-sm text-slate-500">Ingen specifik kontakt fundet.</p>'
      : brief.decisionMakers
          .map(
            (d) =>
              `<li class="text-sm">${d.name ? `<strong>${escapeHtml(d.name)}</strong> - ` : ""}${escapeHtml(d.title)} <span class="text-slate-500">(${escapeHtml(d.howToFind)})</span></li>`
          )
          .join("");

  const questionsHtml = brief.followUpQuestions.map((q) => `<li class="text-sm">${escapeHtml(q)}</li>`).join("");

  const r = brief.company.registration;
  const registrationHtml = r
    ? `<p class="text-sm text-slate-600 mb-3">
        ${r.type ? escapeHtml(r.type) : "Registrering"}${r.number ? `: ${escapeHtml(r.number)}` : ""}
        ${r.vatId ? ` | VAT ${escapeHtml(r.vatId)}` : ""}
        ${r.authority ? ` | ${escapeHtml(r.authority)}` : ""}
        ${r.sourceUrl ? `(<a class="underline" href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener">kilde</a>)` : ""}
      </p>`
    : "";

  // Backward compatible with briefs saved before openingLines/fit were introduced.
  const openingLines = brief.openingLines || (brief.openingLine ? [brief.openingLine] : []);
  const openersHtml = openingLines
    .map((line) => `<p class="italic border-l-4 border-slate-300 pl-3 mb-2">${escapeHtml(line)}</p>`)
    .join("");

  const fitHtml = brief.fit
    ? `<p class="mb-4 text-sm"><span class="font-medium">Fit:</span> ${badge(brief.fit.level)} ${escapeHtml(brief.fit.rationale)}</p>`
    : "";

  const blob = new Blob([markdown], { type: "text/markdown" });
  const downloadUrl = URL.createObjectURL(blob);

  resultEl.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <h2 class="text-xl font-bold">${escapeHtml(brief.company.name)}</h2>
      ${badge(brief.confidence, "confidence")}
    </div>
    <p class="text-sm text-slate-500 mb-1">${escapeHtml(brief.company.website || "")}</p>
    ${registrationHtml}
    <p class="mb-2">${escapeHtml(brief.summary)}</p>
    ${fitHtml}
    <h3 class="font-semibold mb-2">Signaler - grunde til at ringe nu (stærkeste først)</h3>
    ${signalsHtml}
    <h3 class="font-semibold mb-2 mt-4">Hvem skal du spørge efter</h3>
    <ul class="list-disc list-inside space-y-1 mb-4">${contactsHtml}</ul>
    <h3 class="font-semibold mb-2">Forslag til åbningsreplikker</h3>
    ${openersHtml}
    <h3 class="font-semibold mb-2 mt-4">Opfølgende spørgsmål</h3>
    <ul class="list-disc list-inside space-y-1 mb-4">${questionsHtml}</ul>
    <div class="flex flex-wrap items-center gap-4 pt-2 border-t mt-4">
      <a href="${downloadUrl}" download="${escapeHtml(brief.company.name)}.md" class="text-sm underline text-slate-600">Download som Markdown</a>
      <button type="button" id="download-html-btn" class="text-sm underline text-slate-600">Download flot HTML</button>
      <button type="button" id="print-pdf-btn" class="text-sm font-medium bg-amber-700 text-white rounded px-3 py-1.5 hover:bg-amber-800">Print / Gem som PDF</button>
    </div>
  `;
  resultEl.classList.remove("hidden");

  const documentHtml = buildBriefDocumentHtml(brief, researchedAt);

  document.getElementById("download-html-btn").addEventListener("click", () => {
    const htmlBlob = new Blob([documentHtml], { type: "text/html" });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    const a = document.createElement("a");
    a.href = htmlUrl;
    a.download = `${brief.company.name}.html`;
    a.click();
    URL.revokeObjectURL(htmlUrl);
  });

  document.getElementById("print-pdf-btn").addEventListener("click", () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Kunne ikke åbne printvinduet - tjek om din browser blokerer pop-ups.");
      return;
    }
    printWindow.document.write(documentHtml);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  });
}

function renderRawMemo(memo, warning) {
  resultEl.innerHTML = `
    <div class="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded px-3 py-2 mb-4">${escapeHtml(warning || "Kunne ikke strukturere svaret.")}</div>
    <h3 class="font-semibold mb-2">Rå research-memo</h3>
    <pre class="whitespace-pre-wrap text-sm bg-slate-50 border rounded p-3">${escapeHtml(memo)}</pre>
  `;
  resultEl.classList.remove("hidden");
}

// --- Live progress panel: phase rail + streaming terminal feed ---

const PHASES = ["registration", "research", "structuring"];
let elapsedTimer = null;

function resetProgressPanel() {
  progressPanel.classList.remove("hidden");
  terminalWrap.classList.remove("hidden");
  document.getElementById("toggle-terminal").textContent = "skjul log ▾";
  terminalLog.innerHTML = "";
  terminalStatus.textContent = "";
  document.querySelectorAll(".phase-step").forEach((el) => el.classList.remove("active", "done"));

  const start = Date.now();
  elapsedEl.textContent = "00:00";
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    elapsedEl.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
}

function stopProgressPanel() {
  clearInterval(elapsedTimer);
}

function setPhase(phase) {
  const idx = PHASES.indexOf(phase);
  document.querySelectorAll(".phase-step").forEach((el) => {
    const stepIdx = PHASES.indexOf(el.dataset.phase);
    el.classList.toggle("done", stepIdx < idx);
    el.classList.toggle("active", stepIdx === idx);
  });
  terminalStatus.textContent = "";
}

function appendDelta(text) {
  terminalLog.textContent += text;
  terminalWrap.scrollTop = terminalWrap.scrollHeight;
}

function setStatusNote(text) {
  terminalStatus.textContent = `> ${text}`;
}

document.getElementById("toggle-terminal").addEventListener("click", (e) => {
  const collapsed = terminalWrap.classList.toggle("hidden");
  e.target.textContent = collapsed ? "vis log ▸" : "skjul log ▾";
});

/** Reads the NDJSON stream from POST /api/research, dispatching one callback per event
 * type as each line arrives, so the UI can update live instead of waiting for one big
 * response after 1-3 minutes. */
async function streamResearch(payload, handlers) {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Ukendt fejl (intet svar fra serveren)");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Serverfejl (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      handlers[event.type]?.(event);
    }
  }
}

let providersData = null;

function populateModelsForProvider(providerId) {
  if (!providersData) return;
  const provider = providersData[providerId];
  const modelSelect = document.getElementById("model");
  modelSelect.innerHTML = '<option value="">Standard (fra server-config)</option>';
  if (!provider) return;

  provider.models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
  document.getElementById("researchMaxTokens").placeholder = String(provider.defaults.researchMaxTokens);
  document.getElementById("briefMaxTokens").placeholder = String(provider.defaults.briefMaxTokens);

  const hintEl = document.getElementById("provider-hint");
  hintEl.textContent = provider.available
    ? ""
    : `Kræver en API-nøgle på serveren (se .env.example) for at kunne bruges.`;
  hintEl.className = provider.available ? "text-xs text-slate-500 mt-1" : "text-xs text-red-600 mt-1";
}

async function loadModelOptions() {
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    providersData = data.providers;
    populateModelsForProvider(document.getElementById("provider").value);
  } catch {
    // Advanced settings are optional - if this fails, the form still works with server defaults.
  }
}

document.getElementById("provider").addEventListener("change", (e) => {
  populateModelsForProvider(e.target.value);
});

async function loadHistory() {
  const res = await fetch("/api/briefs");
  const items = await res.json();
  historyEl.innerHTML = items
    .map(
      (item) => `
      <li>
        <button data-id="${escapeHtml(item.id)}" class="history-item w-full text-left bg-white rounded shadow px-3 py-2 hover:bg-slate-100">
          <p class="font-medium text-sm">${escapeHtml(item.companyName)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(new Date(item.researchedAt).toLocaleString("da-DK"))}</p>
        </button>
      </li>`
    )
    .join("");

  historyEl.querySelectorAll(".history-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await fetch(`/api/briefs/${btn.dataset.id}`);
      if (!res.ok) return;
      const record = await res.json();
      renderBrief(record.brief, record.markdown, record.researchedAt);
    });
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const companyName = document.getElementById("companyName").value.trim();
  const website = document.getElementById("website").value.trim();
  const notes = document.getElementById("notes").value.trim();
  const provider = document.getElementById("provider").value;
  const model = document.getElementById("model").value || undefined;
  const researchMaxTokens = document.getElementById("researchMaxTokens").value || undefined;
  const briefMaxTokens = document.getElementById("briefMaxTokens").value || undefined;

  if (!companyName) return;

  submitBtn.disabled = true;
  statusEl.textContent = "Researcher... følg fremdriften i den live log herunder.";
  resultEl.classList.add("hidden");
  resetProgressPanel();

  let outcome = null;
  let streamError = null;

  try {
    await streamResearch(
      { companyName, website, notes, provider, model, researchMaxTokens, briefMaxTokens },
      {
        phase: (e) => setPhase(e.phase),
        delta: (e) => appendDelta(e.text),
        note: (e) => setStatusNote(e.text),
        done: (e) => {
          outcome = e;
        },
        warning: (e) => {
          outcome = e;
        },
        error: (e) => {
          streamError = e.error;
        },
      }
    );

    if (streamError) throw new Error(streamError);
    if (!outcome) throw new Error("Intet svar modtaget fra serveren.");

    document.querySelectorAll(".phase-step").forEach((el) => el.classList.add("done"));
    setStatusNote("Færdig.");

    if (outcome.brief) {
      renderBrief(outcome.brief, outcome.markdown, outcome.researchedAt);
      statusEl.textContent = "Færdig.";
    } else {
      renderRawMemo(outcome.memo, outcome.warning);
      statusEl.textContent = "Færdig (med advarsel).";
    }
    loadHistory();
  } catch (err) {
    setStatusNote(`Fejl: ${err.message}`);
    statusEl.textContent = `Fejl: ${err.message}`;
  } finally {
    stopProgressPanel();
    submitBtn.disabled = false;
  }
});

loadModelOptions();
loadHistory();
