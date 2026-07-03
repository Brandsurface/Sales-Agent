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

function renderBrief(brief, markdown) {
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
    <a href="${downloadUrl}" download="${brief.company.name}.md" class="text-sm underline text-slate-600">Download som Markdown</a>
  `;
  resultEl.classList.remove("hidden");
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
      renderBrief(record.brief, record.markdown);
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
      renderBrief(outcome.brief, outcome.markdown);
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
