(function () {
  "use strict";

  const BANK = window.BANK_SOAL || {};
  const PAKET = [1, 2, 3];
  const LETTERS = ["A", "B", "C", "D"];
  const KEY_SESSION = "ncat:sesi";
  const KEY_RESULT = (p) => "ncat:hasil:" + p;
  const KEY_MATERI_DONE = "ncat:materi:selesai";
  const KEY_MATERI_LAST = "ncat:materi:terakhir";
  const KEY_MATERI_FONT = "ncat:materi:font";
  const MATERI = window.MATERI || null;

  const app = document.getElementById("app");
  const topbarRight = document.getElementById("topbarRight");

  let session = null;   // tes yang sedang berjalan
  let timerId = null;

  /* ---------------- Utilitas ---------------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* abaikan */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* abaikan */ } },
  };

  function fmtTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (h ? h + ":" : "") + pad(m) + ":" + pad(s);
  }

  function fmtDuration(ms) {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60), s = total % 60;
    return m ? `${m} mnt ${s} dtk` : `${s} dtk`;
  }

  // Nama bagian di tiap PDF sedikit berbeda, disamakan untuk statistik
  function shortSection(bagian) {
    if (/manajerial/i.test(bagian)) return "Kompetensi Manajerial";
    if (/sosial/i.test(bagian)) return "Kompetensi Sosial Kultural";
    if (/teknis/i.test(bagian)) return "Kompetensi Teknis Keperawatan";
    return bagian || "Lainnya";
  }

  function scrollTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  /* ---------------- Modal ---------------- */
  function modal({ title, body, actions }) {
    const el = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = body;
    const box = document.getElementById("modalActions");
    box.innerHTML = "";
    const close = () => { el.hidden = true; document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.cls || "btn-outline");
      b.textContent = a.label;
      b.onclick = () => { close(); if (a.onClick) a.onClick(); };
      box.appendChild(b);
    });
    el.onclick = (e) => { if (e.target === el) close(); };
    document.addEventListener("keydown", onKey);
    el.hidden = false;
    box.lastChild && box.lastChild.focus();
  }

  /* ---------------- Beranda ---------------- */
  function renderHome() {
    stopTimer();
    session = null;
    topbarRight.innerHTML = "";
    document.onkeydown = null;

    const saved = store.get(KEY_SESSION);
    const cards = PAKET.map((p) => {
      const data = BANK[p];
      if (!data) {
        return `<div class="paket"><div class="paket-title">TES ${p}</div>
          <p class="paket-desc">File soal <b>soal/tes${p}.js</b> belum tersedia.</p></div>`;
      }
      const n = data.soal.length;
      const sections = [...new Set(data.soal.map((q) => shortSection(q.bagian)))];
      const last = store.get(KEY_RESULT(p));
      const resume = saved && saved.paket === p && saved.endsAt > Date.now();
      return `
        <div class="paket">
          <div class="paket-head">
            <div class="paket-title">TES ${p}</div>
            <div class="paket-badge">${p}</div>
          </div>
          <div class="paket-meta">
            <span class="chip">${n} soal</span>
            <span class="chip">${data.durasiMenit} menit</span>
            <span class="chip">1 poin / soal</span>
          </div>
          <p class="paket-desc">${sections.map(esc).join(" &middot; ")}</p>
          ${last ? `<div class="paket-last">Nilai terakhir: <b>${last.skor}/${n}</b>
              &middot; <a href="#" data-review="${p}" style="color:var(--pink-600)">lihat review</a></div>` : ""}
          <button class="btn btn-primary" data-start="${p}">${resume ? "Lanjutkan TES " + p : "Mulai TES " + p}</button>
        </div>`;
    }).join("");

    app.innerHTML = `
      <section class="hero">
        <span class="eyebrow">Semangat belajar, Nabila!</span>
        <h1>Nabila Computer Asisten Test</h1>
        <p>Aplikasi ini dibuat untuk membantu nabila belajar dan mengerjakan simulasi tes, semoga membantu
           dan sayang senang dengan aplikasinyaaaaa. SEMANGATTTTT SAYAAAAAAA</p>
      </section>
      <section class="paket-grid">${cards}</section>
      ${materiCard()}
      <section class="info-card">
        <h3>Petunjuk pengerjaan</h3>
        <ul>
          <li>Pilih satu jawaban yang paling tepat untuk setiap soal. Jawaban benar bernilai 1 poin.</li>
          <li>Gunakan tombol <b>Ragu-ragu</b> untuk menandai soal yang ingin diperiksa lagi.</li>
          <li>Tes otomatis selesai ketika waktu habis. Jawaban tersimpan di perangkat ini bila halaman tertutup.</li>
          <li>Pintasan keyboard: tombol <b>A</b>–<b>D</b> memilih jawaban, panah <b>&larr;</b> / <b>&rarr;</b> berpindah soal.</li>
        </ul>
      </section>`;

    app.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => startTest(+b.dataset.start)));
    const materiBtn = document.getElementById("openMateri");
    if (materiBtn) materiBtn.addEventListener("click", () => renderMateri(store.get(KEY_MATERI_LAST) || 0));
    app.querySelectorAll("[data-review]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const p = +a.dataset.review;
      renderReview(p, store.get(KEY_RESULT(p)), "semua");
    }));
    scrollTop();
  }

  /* ---------------- Tes ---------------- */
  function startTest(p) {
    const data = BANK[p];
    const saved = store.get(KEY_SESSION);
    const same = saved && saved.paket === p && saved.answers.length === data.soal.length;
    if (same && saved.endsAt <= Date.now()) {
      session = saved;  // waktu habis saat berada di beranda: nilai jawaban yang tersimpan
      return finishTest(true);
    }
    if (same) {
      session = saved;
    } else {
      const n = data.soal.length;
      session = {
        paket: p,
        answers: Array(n).fill(null),
        ragu: Array(n).fill(false),
        current: 0,
        startedAt: Date.now(),
        endsAt: Date.now() + data.durasiMenit * 60 * 1000,
      };
    }
    store.set(KEY_SESSION, session);
    renderExam();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    topbarRight.innerHTML = `<span class="timer" id="timer" title="Sisa waktu">⏱ <span id="timerVal">--:--</span></span>`;
    const tick = () => {
      const left = session.endsAt - Date.now();
      const el = document.getElementById("timer");
      document.getElementById("timerVal").textContent = fmtTime(left);
      el.classList.toggle("low", left <= 5 * 60 * 1000);
      if (left <= 0) {
        finishTest(true);
      }
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function save() { store.set(KEY_SESSION, session); }

  function renderExam() {
    const data = BANK[session.paket];
    app.innerHTML = `
      <div class="exam">
        <section class="card q-card" id="qCard"></section>
        <aside class="card side" id="side">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h4>TES ${session.paket} &middot; Navigasi Soal</h4>
            <button class="btn btn-ghost btn-sm nav-toggle" id="navClose" aria-label="Tutup navigasi">✕</button>
          </div>
          <div class="sub" id="progressText"></div>
          <div class="progress"><span id="progressBar"></span></div>
          <div class="nums" id="nums">
            ${data.soal.map((q, i) => `<button class="num" data-go="${i}" aria-label="Soal ${i + 1}">${i + 1}</button>`).join("")}
          </div>
          <div class="legend"><span class="l-ans">Dijawab</span><span class="l-ragu">Ragu-ragu</span><span>Belum</span></div>
          <button class="btn btn-primary" id="finishBtn">Selesai &amp; Kumpulkan</button>
        </aside>
      </div>`;

    document.getElementById("nums").addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      goTo(+b.dataset.go);
      document.getElementById("side").classList.remove("open");
    });
    document.getElementById("navClose").onclick = () => document.getElementById("side").classList.remove("open");
    document.getElementById("finishBtn").addEventListener("click", confirmFinish);
    document.onkeydown = onExamKey;
    renderQuestion();
  }

  function renderQuestion() {
    const data = BANK[session.paket];
    const i = session.current;
    const q = data.soal[i];
    const n = data.soal.length;
    const ans = session.answers[i];

    document.getElementById("qCard").innerHTML = `
      <div class="q-top">
        <span class="q-no">Soal ${i + 1} <span style="color:var(--muted);font-weight:600;font-size:14px">/ ${n}</span></span>
        <div class="q-tags">
          <span class="chip">${esc(shortSection(q.bagian))}</span>
          ${q.kategori ? `<span class="chip">${esc(q.kategori)}</span>` : ""}
        </div>
      </div>
      <p class="q-text">${esc(q.soal)}</p>
      <div class="opts" role="radiogroup" aria-label="Pilihan jawaban">
        ${q.opsi.map((o, k) => `
          <button class="opt ${ans === LETTERS[k] ? "selected" : ""}" role="radio"
                  aria-checked="${ans === LETTERS[k]}" data-opt="${LETTERS[k]}">
            <span class="letter">${LETTERS[k]}</span><span class="txt">${esc(o)}</span>
          </button>`).join("")}
      </div>
      <div class="q-nav">
        <button class="btn btn-outline" id="prevBtn" ${i === 0 ? "disabled" : ""}>&larr; <span class="label">Sebelumnya</span></button>
        <div class="mid">
          <button class="btn btn-warn ${session.ragu[i] ? "on" : ""}" id="raguBtn">${session.ragu[i] ? "✓ " : ""}Ragu-ragu</button>
          <button class="btn btn-ghost nav-toggle" id="navToggle">☰ No. Soal</button>
        </div>
        ${i === n - 1
          ? `<button class="btn btn-primary" id="endBtn">Selesai</button>`
          : `<button class="btn btn-primary" id="nextBtn"><span class="label">Berikutnya</span> &rarr;</button>`}
      </div>`;

    document.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => choose(b.dataset.opt)));
    document.getElementById("prevBtn").onclick = () => goTo(i - 1);
    const next = document.getElementById("nextBtn");
    if (next) next.onclick = () => goTo(i + 1);
    const end = document.getElementById("endBtn");
    if (end) end.onclick = confirmFinish;
    document.getElementById("raguBtn").onclick = toggleRagu;
    document.getElementById("navToggle").onclick = () => document.getElementById("side").classList.toggle("open");

    updateNav();
  }

  function updateNav() {
    const n = session.answers.length;
    const answered = session.answers.filter(Boolean).length;
    document.querySelectorAll("#nums .num").forEach((b, idx) => {
      b.classList.toggle("answered", !!session.answers[idx] && !session.ragu[idx]);
      b.classList.toggle("ragu", session.ragu[idx]);
      b.classList.toggle("current", idx === session.current);
    });
    document.getElementById("progressText").textContent = `${answered} dari ${n} soal dijawab`;
    document.getElementById("progressBar").style.width = (answered / n) * 100 + "%";
  }

  function choose(letter) {
    const i = session.current;
    session.answers[i] = session.answers[i] === letter ? null : letter;
    save();
    document.querySelectorAll("[data-opt]").forEach((b) => {
      const on = b.dataset.opt === session.answers[i];
      b.classList.toggle("selected", on);
      b.setAttribute("aria-checked", on);
    });
    updateNav();
  }

  function toggleRagu() {
    session.ragu[session.current] = !session.ragu[session.current];
    save();
    renderQuestion();
  }

  function goTo(i) {
    if (i < 0 || i >= session.answers.length) return;
    session.current = i;
    save();
    renderQuestion();
    if (window.innerWidth <= 900) document.getElementById("qCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onExamKey(e) {
    if (!session || !document.getElementById("modal").hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (LETTERS.includes(k)) choose(k);
    else if (e.key === "ArrowRight") goTo(session.current + 1);
    else if (e.key === "ArrowLeft") goTo(session.current - 1);
  }

  function confirmFinish() {
    const n = session.answers.length;
    const answered = session.answers.filter(Boolean).length;
    const ragu = session.ragu.filter(Boolean).length;
    modal({
      title: "Kumpulkan jawaban?",
      body: `
        <p>Setelah dikumpulkan, jawaban tidak dapat diubah lagi.</p>
        <div class="summary-list">
          <div><b>${answered}</b>Dijawab</div>
          <div><b>${n - answered}</b>Belum</div>
          <div><b>${ragu}</b>Ragu-ragu</div>
        </div>
        ${n - answered ? `<p style="color:var(--bad);font-size:14px">Masih ada ${n - answered} soal yang belum dijawab.</p>` : ""}`,
      actions: [
        { label: "Periksa lagi", cls: "btn-outline" },
        { label: "Ya, kumpulkan", cls: "btn-primary", onClick: () => finishTest(false) },
      ],
    });
  }

  function finishTest(timeUp) {
    if (!session) return;
    stopTimer();
    document.onkeydown = null;
    const data = BANK[session.paket];
    const finishedAt = Math.min(Date.now(), session.endsAt);
    const skor = data.soal.reduce((s, q, i) => s + (session.answers[i] === q.kunci ? 1 : 0), 0);
    const result = {
      paket: session.paket,
      answers: session.answers,
      ragu: session.ragu,
      skor,
      durasi: finishedAt - session.startedAt,
      selesai: finishedAt,
      waktuHabis: timeUp,
    };
    store.set(KEY_RESULT(session.paket), result);
    store.del(KEY_SESSION);
    session = null;
    renderResult(result);
    if (timeUp) {
      modal({
        title: "Waktu habis",
        body: "<p>Waktu pengerjaan telah berakhir. Jawaban Anda sudah dikumpulkan secara otomatis.</p>",
        actions: [{ label: "Lihat hasil", cls: "btn-primary" }],
      });
    }
  }

  /* ---------------- Hasil / Statistik ---------------- */
  function statusOf(q, ans) {
    if (!ans) return "empty";
    return ans === q.kunci ? "ok" : "bad";
  }

  function groupStats(soal, answers, keyFn) {
    const map = new Map();
    soal.forEach((q, i) => {
      const k = keyFn(q);
      if (!k) return;
      if (!map.has(k)) map.set(k, { name: k, benar: 0, total: 0 });
      const g = map.get(k);
      g.total++;
      if (answers[i] === q.kunci) g.benar++;
    });
    return [...map.values()];
  }

  function barRows(groups) {
    return groups.map((g) => {
      const pct = Math.round((g.benar / g.total) * 100);
      const cls = pct >= 80 ? "good" : pct < 60 ? "low" : "";
      return `
        <div class="bar-row">
          <div class="name">${esc(g.name)}<small>${pct}% benar</small></div>
          <div class="bar ${cls}"><span style="width:${pct}%"></span></div>
          <div class="val">${g.benar}/${g.total}</div>
        </div>`;
    }).join("");
  }

  function verdictOf(skor, n) {
    // Interpretasi dari petunjuk paket soal: 48–60 siap; 36–47 cukup; < 36 ulangi materi dasar
    const pct = skor / n;
    if (pct >= 0.8) return { cls: "good", label: "Siap menghadapi tes", text: "Hasil yang sangat baik. Pertahankan dan tetap review soal yang masih salah." };
    if (pct >= 0.6) return { cls: "mid", label: "Cukup", text: "Sudah cukup baik. Perkuat bagian yang masih banyak salah pada statistik di bawah." };
    return { cls: "low", label: "Perlu latihan lagi", text: "Ulangi materi dasar, lalu coba kerjakan paket ini kembali." };
  }

  function renderResult(result) {
    topbarRight.innerHTML = `<button class="btn btn-ghost btn-sm" id="homeBtn">Beranda</button>`;
    document.getElementById("homeBtn").onclick = renderHome;

    const data = BANK[result.paket];
    const soal = data.soal;
    const n = soal.length;
    const benar = result.skor;
    const kosong = result.answers.filter((a) => !a).length;
    const salah = n - benar - kosong;
    const pct = Math.round((benar / n) * 100);
    const v = verdictOf(benar, n);
    const C = 2 * Math.PI * 88;

    const bySection = groupStats(soal, result.answers, (q) => shortSection(q.bagian));
    const byCategory = groupStats(soal, result.answers, (q) => q.kategori);

    app.innerHTML = `
      <section class="card result-hero">
        <div class="ring">
          <svg viewBox="0 0 200 200">
            <circle class="ring-bg" cx="100" cy="100" r="88" fill="none" stroke-width="16"/>
            <circle class="ring-fg" id="ringFg" cx="100" cy="100" r="88" fill="none" stroke-width="16"
                    stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
          </svg>
          <div class="ring-label"><b>${benar}</b><span>dari ${n} poin &middot; ${pct}%</span></div>
        </div>
        <div>
          <span class="verdict ${v.cls}">${v.label}</span>
          <h2>Hasil TES ${result.paket}</h2>
          <p>${v.text}${result.waktuHabis ? " (Tes dikumpulkan otomatis karena waktu habis.)" : ""}</p>
          <div class="actions">
            <button class="btn btn-primary" id="reviewBtn">Review Jawaban</button>
            <button class="btn btn-outline" id="retryBtn">Ulangi TES ${result.paket}</button>
            <button class="btn btn-ghost" id="backBtn">Kembali ke Beranda</button>
          </div>
        </div>
      </section>

      <section class="stats">
        <div class="card stat ok"><div class="k">Benar</div><div class="v">${benar}</div></div>
        <div class="card stat bad"><div class="k">Salah</div><div class="v">${salah}</div></div>
        <div class="card stat empty"><div class="k">Tidak dijawab</div><div class="v">${kosong}</div></div>
        <div class="card stat time"><div class="k">Waktu pengerjaan</div><div class="v" style="font-size:22px">${fmtDuration(result.durasi)}</div></div>
      </section>

      <div class="two-col">
        <section class="card breakdown">
          <h3>Skor per bagian</h3>
          ${barRows(bySection)}
        </section>
        <section class="card breakdown">
          <h3>Skor per kompetensi / bidang</h3>
          ${barRows(byCategory)}
        </section>
      </div>

      <section class="card breakdown">
        <h3>Peta jawaban</h3>
        <div class="answer-map" id="answerMap">
          ${soal.map((q, i) => `<button class="num r-${statusOf(q, result.answers[i])}" data-rv="${i}"
              title="Soal ${i + 1}">${i + 1}</button>`).join("")}
        </div>
        <div class="legend" style="margin-top:14px">
          <span class="l-ok">Benar</span><span class="l-bad">Salah</span><span class="l-empty">Tidak dijawab</span>
        </div>
        <div style="color:var(--muted);font-size:12.5px;margin-top:6px">Klik nomor soal untuk langsung melihat pembahasannya.</div>
      </section>`;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fg = document.getElementById("ringFg");
      if (fg) fg.style.strokeDashoffset = C * (1 - benar / n);
    }));

    document.getElementById("reviewBtn").onclick = () => renderReview(result.paket, result, "semua");
    document.getElementById("retryBtn").onclick = () => startTest(result.paket);
    document.getElementById("backBtn").onclick = renderHome;
    document.getElementById("answerMap").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rv]");
      if (b) renderReview(result.paket, result, "semua", +b.dataset.rv);
    });
    scrollTop();
  }

  /* ---------------- Review ---------------- */
  function renderReview(p, result, filter, focusIdx) {
    if (!result) return renderHome();
    topbarRight.innerHTML = `<button class="btn btn-ghost btn-sm" id="homeBtn">Beranda</button>`;
    document.getElementById("homeBtn").onclick = renderHome;

    const soal = BANK[p].soal;
    const counts = { semua: soal.length, benar: 0, salah: 0, kosong: 0, ragu: 0 };
    soal.forEach((q, i) => {
      const s = statusOf(q, result.answers[i]);
      counts[{ ok: "benar", bad: "salah", empty: "kosong" }[s]]++;
      if (result.ragu && result.ragu[i]) counts.ragu++;
    });

    const match = (q, i) => {
      const s = statusOf(q, result.answers[i]);
      return filter === "semua" || (filter === "benar" && s === "ok") || (filter === "salah" && s === "bad") ||
        (filter === "kosong" && s === "empty") || (filter === "ragu" && result.ragu && result.ragu[i]);
    };

    const items = soal.map((q, i) => {
      if (!match(q, i)) return "";
      const ans = result.answers[i];
      const s = statusOf(q, ans);
      const statusLabel = { ok: "✓ Benar", bad: "✗ Salah", empty: "— Tidak dijawab" }[s];
      return `
        <article class="card rv ${s}" id="rv-${i}">
          <div class="rv-top">
            <span class="q-no">Soal ${i + 1}</span>
            <div class="q-tags">
              ${q.kategori ? `<span class="chip">${esc(q.kategori)}</span>` : `<span class="chip">${esc(shortSection(q.bagian))}</span>`}
              ${result.ragu && result.ragu[i] ? `<span class="chip" style="background:var(--warn-bg);color:#8a5800">Ragu-ragu</span>` : ""}
              <span class="status ${s}">${statusLabel}</span>
            </div>
          </div>
          <p class="q-text">${esc(q.soal)}</p>
          <div class="opts">
            ${q.opsi.map((o, k) => {
              const L = LETTERS[k];
              const isKey = L === q.kunci;
              const isWrong = L === ans && !isKey;
              const tag = isKey && L === ans ? "Jawaban Anda ✓" : isKey ? "Kunci" : isWrong ? "Jawaban Anda" : "";
              return `<div class="opt ${isKey ? "key" : ""} ${isWrong ? "wrong" : ""}">
                  <span class="letter">${L}</span><span class="txt">${esc(o)}</span>
                  ${tag ? `<span class="tag">${tag}</span>` : ""}
                </div>`;
            }).join("")}
          </div>
          <div class="explain">
            <b>Jawaban Anda:</b> ${ans ? ans : "tidak dijawab"} &nbsp;&middot;&nbsp; <b>Kunci:</b> ${q.kunci}<br>
            <b>Pembahasan:</b> ${esc(q.pembahasan)}
          </div>
        </article>`;
    }).join("");

    const f = (key, label) =>
      `<button class="btn btn-outline btn-sm ${filter === key ? "active" : ""}" data-filter="${key}">${label} (${counts[key]})</button>`;

    app.innerHTML = `
      <div class="review-head">
        <div>
          <h2>Review Jawaban TES ${p}</h2>
          <div style="color:var(--muted);font-size:14px">Skor ${result.skor}/${soal.length} &middot; jawaban Anda dibandingkan dengan kunci dan pembahasan</div>
        </div>
        <button class="btn btn-outline btn-sm" id="toResult">&larr; Statistik</button>
      </div>
      <div class="filters" style="margin-bottom:16px">
        ${f("semua", "Semua")}${f("benar", "Benar")}${f("salah", "Salah")}${f("kosong", "Tidak dijawab")}${f("ragu", "Ragu-ragu")}
      </div>
      <div class="review-list">${items || `<div class="card empty-note">Tidak ada soal pada filter ini.</div>`}</div>
      <div style="text-align:center;margin-top:22px">
        <button class="btn btn-primary" id="toTop">↑ Kembali ke atas</button>
      </div>`;

    app.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => renderReview(p, result, b.dataset.filter)));
    document.getElementById("toResult").onclick = () => renderResult(result);
    document.getElementById("toTop").onclick = scrollTop;

    if (focusIdx != null) {
      const el = document.getElementById("rv-" + focusIdx);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else {
      scrollTop();
    }
  }

  /* ---------------- Materi belajar ---------------- */
  // Konten HTML materi berasal dari tools/konversi_materi.py (teks sudah di-escape di sana)

  function chapterParts(judul) {
    const m = judul.match(/^(Bagian\s+\d+)\s*:\s*(.+)$/);
    return m ? { label: m[1], title: m[2] } : { label: "Pengantar", title: judul };
  }

  function chapterMinutes(sec) {
    const text = sec.blok.map((b) =>
      b.t === "table" ? b.rows.flat().join(" ") : b.items ? b.items.join(" ") : b.html || b.text || "").join(" ");
    const words = text.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 150));
  }

  function materiDone() {
    const d = store.get(KEY_MATERI_DONE);
    return Array.isArray(d) ? d : [];
  }

  function materiCard() {
    if (!MATERI) return "";
    const total = MATERI.bagian.length;
    const done = materiDone().length;
    const pct = Math.round((done / total) * 100);
    const minutes = MATERI.bagian.reduce((s, b) => s + chapterMinutes(b), 0);
    return `
      <section class="materi-card">
        <div class="materi-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5v13c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5z"/><path d="M12 6v13"/>
          </svg>
        </div>
        <div class="materi-card-body">
          <div class="materi-card-title">Materi Belajar</div>
          <p>Ringkasan ${total} bab: kompetensi manajerial, sosial kultural, regulasi, keselamatan pasien,
             keperawatan dasar, bidang klinis, dan strategi mengerjakan CAT. &plusmn; ${minutes} menit membaca.</p>
          <div class="materi-card-progress">
            <div class="progress"><span style="width:${pct}%"></span></div>
            <span>${done}/${total} bab selesai</span>
          </div>
        </div>
        <button class="btn btn-primary" id="openMateri">${done ? "Lanjutkan Belajar" : "Buka Materi"}</button>
      </section>`;
  }

  function renderBlock(b) {
    switch (b.t) {
      case "h":
        return `<h3 class="m-h" id="${b.id}">${esc(b.text)}</h3>`;
      case "p":
        // Paragraf yang seluruhnya tebal (mis. "Catatan kritis:") menjadi label kecil
        if (/^<strong>[^<]*<\/strong>$/.test(b.html)) return `<div class="m-label">${b.html}</div>`;
        return `<p class="m-p">${b.html}</p>`;
      case "ol":
        return `<ol class="m-steps">${b.items.map((it) => `<li>${it}</li>`).join("")}</ol>`;
      case "ul": {
        const keyed = b.items.filter((it) => it.startsWith("<strong>")).length >= b.items.length / 2;
        if (!keyed) return `<ul class="m-list">${b.items.map((it) => `<li>${it}</li>`).join("")}</ul>`;
        return `<div class="m-points">${b.items.map((it) => {
          const m = it.match(/^<strong>(.*?)<\/strong>\s*(.*)$/);
          if (!m) return `<div class="m-point"><div class="m-point-body">${it}</div></div>`;
          return `<div class="m-point"><div class="m-point-title">${m[1].replace(/[:.]\s*$/, "")}</div>
                  <div class="m-point-body">${m[2]}</div></div>`;
        }).join("")}</div>`;
      }
      case "table": {
        const [head, ...rows] = b.rows;
        return `
          <div class="m-table-wrap">
            <table class="m-table">
              <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
              <tbody>${rows.map((r) => `<tr>${r.map((c, k) =>
                `<td data-label="${esc(head[k] || "")}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </div>`;
      }
      default:
        return "";
    }
  }

  function renderMateri(idx) {
    if (!MATERI) return renderHome();
    stopTimer();
    session = null;
    document.onkeydown = null;
    const total = MATERI.bagian.length;
    idx = Math.min(Math.max(0, idx | 0), total - 1);
    store.set(KEY_MATERI_LAST, idx);

    const sec = MATERI.bagian[idx];
    const { label, title } = chapterParts(sec.judul);
    const done = materiDone();
    const isDone = done.includes(idx);
    let hid = 0;
    const blocks = sec.blok.map((b) => (b.t === "h" ? Object.assign({ id: "sub-" + hid++ }, b) : b));
    const subs = blocks.filter((b) => b.t === "h");
    const font = store.get(KEY_MATERI_FONT) || 17;

    topbarRight.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="homeBtn">Beranda</button>
      <div class="read-bar"><span id="readBar"></span></div>`;
    document.getElementById("homeBtn").onclick = renderHome;

    const toc = MATERI.bagian.map((b, i) => {
      const p = chapterParts(b.judul);
      return `<button class="toc-item ${i === idx ? "active" : ""} ${done.includes(i) ? "done" : ""}" data-ch="${i}">
          <span class="toc-num">${done.includes(i) ? "✓" : i === 0 ? "i" : i}</span>
          <span class="toc-text"><small>${esc(p.label)}</small>${esc(p.title)}</span>
        </button>`;
    }).join("");

    const prev = idx > 0 ? chapterParts(MATERI.bagian[idx - 1].judul) : null;
    const next = idx < total - 1 ? chapterParts(MATERI.bagian[idx + 1].judul) : null;

    app.innerHTML = `
      <div class="materi">
        <aside class="toc">
          <div class="toc-head">
            <b>Daftar Bab</b>
            <span>${done.length}/${total} selesai</span>
          </div>
          <div class="progress"><span style="width:${(done.length / total) * 100}%"></span></div>
          <nav class="toc-list">${toc}</nav>
        </aside>

        <article class="chapter" style="--m-font:${font}px">
          <header class="chapter-hero">
            <span class="chapter-label">${esc(label)} &middot; ${idx + 1} dari ${total}</span>
            <h1>${esc(title)}</h1>
            <div class="chapter-meta">
              <span>&#9201; &plusmn; ${chapterMinutes(sec)} menit membaca</span>
              ${isDone ? `<span class="chapter-done">✓ Sudah dipelajari</span>` : ""}
              <div class="font-ctrl" role="group" aria-label="Ukuran huruf">
                <button class="btn btn-ghost btn-sm" data-font="-1" aria-label="Perkecil huruf">A&minus;</button>
                <button class="btn btn-ghost btn-sm" data-font="1" aria-label="Perbesar huruf">A+</button>
              </div>
            </div>
            ${subs.length > 1 ? `
              <div class="chapter-subs">
                <span>Di bab ini:</span>
                ${subs.map((s) => `<a href="#${s.id}" data-sub="${s.id}">${esc(s.text)}</a>`).join("")}
              </div>` : ""}
          </header>

          <div class="chapter-body">${blocks.map(renderBlock).join("")}</div>

          <footer class="chapter-foot">
            <button class="btn ${isDone ? "btn-outline" : "btn-primary"} done-btn" id="doneBtn">
              ${isDone ? "✓ Sudah dipelajari (klik untuk batal)" : "Tandai sudah dipelajari"}
            </button>
            <div class="chapter-nav">
              ${prev ? `<button class="btn btn-outline" data-ch="${idx - 1}">&larr; <span><small>Sebelumnya</small>${esc(prev.label)}</span></button>` : "<span></span>"}
              ${next
                ? `<button class="btn btn-primary" data-ch="${idx + 1}"><span><small>Berikutnya</small>${esc(next.label)}</span> &rarr;</button>`
                : `<button class="btn btn-primary" id="toTests"><span><small>Siap berlatih?</small>Kerjakan TES</span> &rarr;</button>`}
            </div>
          </footer>
        </article>
      </div>`;

    app.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => renderMateri(+b.dataset.ch)));
    app.querySelectorAll("[data-sub]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.sub).scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    app.querySelectorAll("[data-font]").forEach((b) => b.addEventListener("click", () => {
      const size = Math.min(22, Math.max(14, (store.get(KEY_MATERI_FONT) || 17) + +b.dataset.font));
      store.set(KEY_MATERI_FONT, size);
      app.querySelector(".chapter").style.setProperty("--m-font", size + "px");
    }));
    document.getElementById("doneBtn").onclick = () => {
      const d = materiDone().filter((i) => i !== idx);
      if (!isDone) d.push(idx);
      store.set(KEY_MATERI_DONE, d);
      // Setelah menandai selesai, lanjut ke bab berikutnya
      renderMateri(!isDone && next ? idx + 1 : idx);
    };
    const toTests = document.getElementById("toTests");
    if (toTests) toTests.onclick = () => {
      renderHome();
      document.querySelector(".paket-grid").scrollIntoView({ behavior: "smooth" });
    };

    // Tampilkan bab aktif di daftar bab (ke samping di HP, ke bawah di desktop) tanpa menggulir halaman
    const tocBox = app.querySelector(".toc");
    const list = app.querySelector(".toc-list");
    const a = app.querySelector(".toc-item.active").getBoundingClientRect();
    list.scrollLeft += a.left - list.getBoundingClientRect().left - 8;
    tocBox.scrollTop += a.top - tocBox.getBoundingClientRect().top - tocBox.clientHeight / 3;
    window.scrollTo({ top: 0 });
    updateReadBar();
  }

  function updateReadBar() {
    const bar = document.getElementById("readBar");
    if (!bar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? Math.min(1, window.scrollY / max) * 100 : 100) + "%";
  }
  window.addEventListener("scroll", updateReadBar, { passive: true });

  /* ---------------- Inisialisasi ---------------- */
  document.getElementById("brandLink").addEventListener("click", (e) => {
    e.preventDefault();
    if (session) {
      modal({
        title: "Keluar dari tes?",
        body: "<p>Waktu tetap berjalan. Jawaban Anda tersimpan dan tes dapat dilanjutkan dari beranda.</p>",
        actions: [
          { label: "Batal", cls: "btn-outline" },
          { label: "Ke beranda", cls: "btn-primary", onClick: renderHome },
        ],
      });
    } else {
      renderHome();
    }
  });

  // Tes yang waktunya habis saat halaman tertutup langsung dinilai
  const pending = store.get(KEY_SESSION);
  if (pending && BANK[pending.paket] && pending.endsAt <= Date.now()) {
    session = pending;
    finishTest(true);
  } else {
    renderHome();
  }
})();
