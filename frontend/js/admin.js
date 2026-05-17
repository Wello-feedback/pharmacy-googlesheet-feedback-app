/**
 * Admin Dashboard Logic — Enhanced with Branch Management + Barcode
 */
(function () {
  "use strict";
  const API = window.location.origin;
  let state = { branch: "", page: 1, limit: 15, branches: [], editingBranch: null, deletingBranch: null };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  async function init() {
    await loadBranches();
    await Promise.all([loadAnalytics(), loadFeedback()]);
    setupEvents();
  }

  // ─── Branches ──────────────────────────────────────────
  async function loadBranches() {
    try {
      const r = await fetch(`${API}/api/branches`);
      state.branches = await r.json();
      const sel = $("#branch-filter");
      sel.innerHTML = '<option value="">All Branches</option>';
      state.branches.forEach((b) => {
        sel.innerHTML += `<option value="${b.code}">${b.code} - ${b.name}</option>`;
      });
    } catch (e) { console.error(e); }
  }

  // ─── Analytics ─────────────────────────────────────────
  async function loadAnalytics() {
    try {
      const q = state.branch ? `?branch_code=${state.branch}` : "";
      const r = await fetch(`${API}/api/feedback/analytics${q}`);
      const d = await r.json();
      $("#kpi-total").textContent = d.total_feedback || 0;
      $("#kpi-avg").textContent = d.avg_rating || "0.0";
      $("#kpi-today").textContent = d.today_count || 0;
      $("#kpi-negative").textContent = d.negative_count || 0;
      renderRatingBars(d.rating_distribution || {}, d.total_feedback || 0);
      renderTagBars(d.top_improvement_tags || []);
    } catch (e) { console.error(e); }
  }

  // ─── Feedback Table ─────────────────────────────────────
  async function loadFeedback() {
    const tbody = $("#feedback-tbody");
    tbody.innerHTML = '<tr><td colspan="8"><div class="loading-spinner"><div class="spinner"></div></div></td></tr>';
    try {
      let url = `${API}/api/feedback/list?page=${state.page}&limit=${state.limit}`;
      if (state.branch) url += `&branch_code=${state.branch}`;
      const search = $("#search-input");
      if (search && search.value) url += `&search=${encodeURIComponent(search.value)}`;
      const r = await fetch(url);
      const d = await r.json();
      renderTable(d.data, d.total, d.page, d.total_pages);
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load</h3></div></td></tr>';
    }
  }

  function renderTable(data, total, page, totalPages) {
    const tbody = $("#feedback-tbody");
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📭</div><h3>No feedback yet</h3><p>Feedback yahan dikhega jab customers submit karenge</p></div></td></tr>';
      $("#pagination").innerHTML = "";
      return;
    }
    tbody.innerHTML = data.map((f) => {
      const stars = "★".repeat(f.rating) + "☆".repeat(5 - f.rating);
      const rClass = f.rating >= 4 ? "badge-green" : f.rating <= 2 ? "badge-red" : "badge-amber";
      const tags = (f.improvement_tags || []).map((t) => `<span class="mini-tag">${t}</span>`).join("");
      const loc = f.latitude && f.longitude
        ? `<a class="map-link" href="https://maps.google.com/?q=${f.latitude},${f.longitude}" target="_blank">📍 View</a>`
        : '<span style="color:var(--text-muted)">—</span>';
      const dt = f.created_at ? new Date(f.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      return `<tr>
        <td>${dt}</td>
        <td><strong>${f.customer_name}</strong>${f.customer_mobile ? "<br><small style='color:var(--text-muted)'>" + f.customer_mobile + "</small>" : ""}</td>
        <td><small style="color:var(--text-muted)">${f.branch_code}</small> ${f.branch_name || ""}</td>
        <td><span class="rating-stars">${stars}</span> <span class="badge ${rClass}">${f.rating}</span></td>
        <td><div class="tags-cell">${tags || "—"}</div></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(f.comments || "").replace(/"/g, "&quot;")}">${f.comments || "—"}</td>
        <td>${loc}</td>
      </tr>`;
    }).join("");

    // Pagination
    let pagHtml = `<button class="page-btn" onclick="window._goPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>← Prev</button>`;
    const start = Math.max(1, page - 2), end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) {
      pagHtml += `<button class="page-btn ${i === page ? "active" : ""}" onclick="window._goPage(${i})">${i}</button>`;
    }
    pagHtml += `<span class="page-info">${total} total</span>`;
    pagHtml += `<button class="page-btn" onclick="window._goPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}>Next →</button>`;
    $("#pagination").innerHTML = pagHtml;
  }

  window._goPage = function (p) { if (p >= 1) { state.page = p; loadFeedback(); } };

  // ─── Rating Bars ────────────────────────────────────────
  function renderRatingBars(dist, total) {
    const c = $("#rating-bars");
    if (!c) return;
    const colors = { 5: "#22c55e", 4: "#84cc16", 3: "#f59e0b", 2: "#f97316", 1: "#ef4444" };
    let html = "";
    for (let i = 5; i >= 1; i--) {
      const count = dist[String(i)] || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      html += `<div class="rating-bar-row">
        <span class="rating-bar-label">${"★".repeat(i)} ${i}</span>
        <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
        <span class="rating-bar-count">${count}</span>
      </div>`;
    }
    c.innerHTML = html;
  }

  function renderTagBars(tags) {
    const c = $("#tag-bars");
    if (!c) return;
    if (!tags.length) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet</p>'; return; }
    const max = tags[0].count;
    c.innerHTML = tags.map((t) => `<div class="tag-bar-row">
      <span class="tag-bar-label" title="${t.tag}">${t.tag}</span>
      <div class="tag-bar-track"><div class="tag-bar-fill" style="width:${(t.count / max) * 100}%"></div></div>
      <span class="tag-bar-count">${t.count}</span>
    </div>`).join("");
  }

  // ═══════════════════════════════════════════════════════
  //  BRANCH MANAGEMENT
  // ═══════════════════════════════════════════════════════

  function showBranchManagement() {
    $("#branch-modal").classList.add("visible");
    renderBranchList();
  }

  function renderBranchList() {
    const container = $("#branch-list");
    if (!state.branches.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏪</div>
          <h3>No branches added yet</h3>
          <p>Click "Add New Branch" to get started</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="branch-table-wrapper">
        <table class="branch-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Branch Name</th>
              <th style="text-align:center;">QR / Barcode</th>
              <th style="text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.branches.map((b, i) => `
              <tr class="branch-row" style="animation-delay:${i * 0.03}s">
                <td><span class="branch-code-badge">${b.code}</span></td>
                <td class="branch-name-cell">${b.name}</td>
                <td style="text-align:center;">
                  <button class="btn-icon" onclick="window._showCodes('${b.code}','${b.name.replace(/'/g, "\\'")}')" title="View QR & Barcode">
                    <span>🔳</span>
                  </button>
                </td>
                <td style="text-align:center;">
                  <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="window._editBranch('${b.code}','${b.name.replace(/'/g, "\\'")}')" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="window._deleteBranch('${b.code}','${b.name.replace(/'/g, "\\'")}')" title="Delete">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="branch-count">${state.branches.length} branch${state.branches.length > 1 ? 'es' : ''} total</div>`;
  }

  // ─── Add Branch ──────────────────────────────────────
  function showAddBranch() {
    state.editingBranch = null;
    $("#branch-form-title").textContent = "Add New Branch";
    $("#branch-code-input").value = "";
    $("#branch-name-input").value = "";
    $("#branch-code-input").disabled = false;
    $("#branch-save-btn").textContent = "Save Branch";
    $("#branch-form-modal").classList.add("visible");
  }

  // ─── Edit Branch ─────────────────────────────────────
  window._editBranch = function (code, name) {
    state.editingBranch = code;
    $("#branch-form-title").textContent = "Edit Branch";
    $("#branch-code-input").value = code;
    $("#branch-name-input").value = name;
    $("#branch-code-input").disabled = false;
    $("#branch-save-btn").textContent = "Update Branch";
    $("#branch-form-modal").classList.add("visible");
  };

  // ─── Delete Branch ────────────────────────────────────
  window._deleteBranch = function (code, name) {
    state.deletingBranch = code;
    $("#delete-msg").innerHTML = `Are you sure you want to delete <strong>${name}</strong> (${code})?<br><small style="color:var(--text-muted)">This cannot be undone. Branches with existing feedback cannot be deleted.</small>`;
    $("#delete-modal").classList.add("visible");
  };

  async function confirmDelete() {
    const code = state.deletingBranch;
    if (!code) return;

    try {
      const r = await fetch(`${API}/api/branches/${code}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json();
        showToast(err.detail || "Delete failed", "error");
        return;
      }
      showToast("Branch deleted successfully!", "success");
      $("#delete-modal").classList.remove("visible");
      await loadBranches();
      renderBranchList();
      loadAnalytics();
    } catch (e) {
      showToast("Network error. Please try again.", "error");
    }
  }

  // ─── Save Branch (Add/Edit) ──────────────────────────
  async function saveBranch(e) {
    e.preventDefault();

    const code = $("#branch-code-input").value.trim();
    const name = $("#branch-name-input").value.trim();

    if (!code || !name) {
      showToast("Please fill both fields", "error");
      return;
    }
    if (code.length > 10) {
      showToast("Code must be 10 chars or less", "error");
      return;
    }

    const payload = { code, name };

    try {
      let r;
      if (state.editingBranch) {
        // Update
        r = await fetch(`${API}/api/branches/${state.editingBranch}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Add new
        r = await fetch(`${API}/api/branches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!r.ok) {
        const err = await r.json();
        showToast(err.detail || "Save failed", "error");
        return;
      }

      showToast(state.editingBranch ? "Branch updated!" : "Branch added!", "success");
      $("#branch-form-modal").classList.remove("visible");
      await loadBranches();
      renderBranchList();
    } catch (e) {
      showToast("Network error. Please try again.", "error");
    }
  }

  // ─── Show QR / Barcode Codes ──────────────────────────
  window._showCodes = function (code, name) {
    $("#code-preview-title").textContent = "Codes for " + code;
    $("#code-preview-branch").textContent = name;
    $("#preview-qr-img").src = `/api/qr/${code}`;
    $("#preview-barcode-img").src = `/api/barcode/${code}`;
    $("#download-qr-link").href = `/api/qr/${code}`;
    $("#download-qr-link").download = `qr_${code}.png`;
    $("#download-barcode-link").href = `/api/barcode/${code}`;
    $("#download-barcode-link").download = `barcode_${code}.png`;

    // Reset to QR tab
    switchCodeTab("qr");
    $("#code-preview-modal").classList.add("visible");
  };

  window.switchCodeTab = function (tab) {
    $$(".code-tab").forEach((t) => t.classList.remove("active"));
    $(`.code-tab[data-tab="${tab}"]`).classList.add("active");
    
    if (tab === "qr") {
      $("#code-preview-qr").style.display = "block";
      $("#code-preview-barcode").style.display = "none";
    } else {
      $("#code-preview-qr").style.display = "none";
      $("#code-preview-barcode").style.display = "block";
    }
  };

  // ─── Toast ─────────────────────────────────────────────
  function showToast(msg, type = "success") {
    const toast = $("#toast");
    const icon = $("#toast-icon");
    const msgEl = $("#toast-msg");

    icon.textContent = type === "success" ? "✅" : "❌";
    msgEl.textContent = msg;
    toast.className = `toast visible ${type}`;

    setTimeout(() => toast.classList.remove("visible"), 3500);
  }

  // ─── QR Modal (existing) ───────────────────────────────
  async function showQRModal() {
    $("#qr-modal").classList.add("visible");
    const grid = $("#qr-grid");
    grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const r = await fetch(`${API}/api/qr-all`);
      const list = await r.json();
      grid.innerHTML = list.map((b) => `<div class="qr-item">
        <img src="${b.qr_url}" alt="QR ${b.code}" loading="lazy"/>
        <div class="qr-branch">${b.code} - ${b.name}</div>
        <div class="qr-code-label"><a href="${b.qr_url}" download="qr_${b.code}.png">⬇ Download</a></div>
      </div>`).join("");
    } catch (e) { grid.innerHTML = '<p style="color:var(--text-muted)">Failed to load QR codes</p>'; }
  }

  // ─── Events ────────────────────────────────────────────
  function setupEvents() {
    $("#branch-filter").addEventListener("change", (e) => {
      state.branch = e.target.value; state.page = 1;
      loadAnalytics(); loadFeedback();
    });
    $("#search-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { state.page = 1; loadFeedback(); }
    });
    $("#search-btn").addEventListener("click", () => { state.page = 1; loadFeedback(); });
    $("#export-btn").addEventListener("click", () => {
      const q = state.branch ? `?branch_code=${state.branch}` : "";
      window.open(`${API}/api/feedback/export${q}`, "_blank");
    });

    // QR modal
    $("#qr-btn").addEventListener("click", showQRModal);

    // Branch Management
    $("#manage-branches-btn").addEventListener("click", showBranchManagement);
    $("#add-branch-btn").addEventListener("click", showAddBranch);
    $("#branch-form").addEventListener("submit", saveBranch);
    $("#confirm-delete-btn").addEventListener("click", confirmDelete);

    // Close modals on overlay click
    $$(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("visible");
      });
    });

    // ESC to close modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        $$(".modal-overlay.visible").forEach((m) => m.classList.remove("visible"));
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
