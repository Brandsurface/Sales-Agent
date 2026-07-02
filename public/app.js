const form = document.getElementById("research-form");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submit-btn");
const historyEl = document.getElementById("history");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function confidenceBadge(confidence) {
  const colors = { high: "bg-green-100 text-green-800", medium: "bg-amber-100 text-amber-800", low: "bg-red-100 text-red-800" };
  return `<span class="text-xs font-medium px-2 py-1 rounded ${colors[confidence] || ""}">${escapeHtml(confidence)}</span>`;
}

function renderBrief(brief, markdown) {
  const signalsHtml = brief.signals
    .map(
      (s) => `
      <div class="border-l-4 border-slate-300 pl-3 py-1 mb-3">
        <p class="font-semibold">${escapeHtml(s.title)}</p>
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

  const blob = new Blob([markdown], { type: "text/markdown" });
  const downloadUrl = URL.createObjectURL(blob);

  resultEl.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <h2 class="text-xl font-bold">${escapeHtml(brief.company.name)}</h2>
      ${confidenceBadge(brief.confidence)}
    </div>
    <p class="text-sm text-slate-500 mb-1">${escapeHtml(brief.company.website || "")}</p>
    ${registrationHtml}
    <p class="mb-4">${escapeHtml(brief.summary)}</p>
    <h3 class="font-semibold mb-2">Signaler - grunde til at ringe nu</h3>
    ${signalsHtml}
    <h3 class="font-semibold mb-2 mt-4">Hvem skal du spørge efter</h3>
    <ul class="list-disc list-inside space-y-1 mb-4">${contactsHtml}</ul>
    <h3 class="font-semibold mb-2">Forslag til åbningsreplik</h3>
    <p class="italic border-l-4 border-slate-300 pl-3 mb-4">${escapeHtml(brief.openingLine)}</p>
    <h3 class="font-semibold mb-2">Opfølgende spørgsmål</h3>
    <ul class="list-disc list-inside space-y-1 mb-4">${questionsHtml}</ul>
    <a href="${downloadUrl}" download="${brief.company.name}.md" class="text-sm underline text-slate-600">Download som Markdown</a>
  `;
  resultEl.classList.remove("hidden");
}

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

  if (!companyName) return;

  submitBtn.disabled = true;
  statusEl.textContent = "Researcher... dette kan tage 30-90 sekunder.";
  resultEl.classList.add("hidden");

  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, website, notes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ukendt fejl");

    renderBrief(data.brief, data.markdown);
    statusEl.textContent = "Færdig.";
    loadHistory();
  } catch (err) {
    statusEl.textContent = `Fejl: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

loadHistory();
