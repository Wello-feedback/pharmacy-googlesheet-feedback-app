/**
 * Pharmacy Feedback System - Customer Form Logic
 * Handles: Star Rating, Tags, GPS Location, Form Submission
 */

(function () {
  "use strict";

  // ─── Configuration ──────────────────────────────────────
  const API_BASE = window.location.origin;
  const RATING_LABELS = [
    "",
    "😟 Very Poor",
    "😕 Below Average",
    "😐 Average",
    "😊 Good",
    "🤩 Excellent!",
  ];

  const IMPROVEMENT_TAGS = [
    { id: "wait_time", label: "Wait Time", icon: "⏳" },
    { id: "staff_behavior", label: "Staff Behavior", icon: "🤝" },
    { id: "cleanliness", label: "Cleanliness", icon: "🧹" },
    { id: "stock", label: "Stock Availability", icon: "📦" },
    { id: "billing", label: "Billing Speed", icon: "💳" },
    { id: "medicine_info", label: "Medicine Info", icon: "💊" },
    { id: "pricing", label: "Pricing", icon: "💰" },
    { id: "overall_service", label: "Overall Service", icon: "⭐" },
  ];

  // ─── State ──────────────────────────────────────────────
  let state = {
    branchCode: null,
    branchName: null,
    rating: 0,
    selectedTags: [],
    latitude: null,
    longitude: null,
    locationStatus: "detecting", // detecting | success | failed
  };

  // ─── DOM Elements ───────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Initialize ─────────────────────────────────────────
  function init() {
    // Get branch code from URL
    const params = new URLSearchParams(window.location.search);
    state.branchCode = params.get("branch");

    if (!state.branchCode) {
      showError("Invalid Link", "This feedback link is invalid. Please scan the QR code provided at the pharmacy.");
      return;
    }

    // Fetch branch details
    fetchBranchDetails();

    // Request location
    requestLocation();

    // Render tags
    renderTags();

    // Setup event listeners
    setupStarRating();
    setupForm();
    setupCharCounter();
  }

  // ─── Fetch Branch Details ───────────────────────────────
  async function fetchBranchDetails() {
    try {
      const res = await fetch(`${API_BASE}/api/branches`);
      const branches = await res.json();
      const branch = branches.find((b) => b.code === state.branchCode);

      if (!branch) {
        showError("Branch Not Found", "This branch is not in our system. Please scan the correct QR code.");
        return;
      }

      state.branchName = branch.name;
      const badgeEl = $(".branch-badge-text");
      if (badgeEl) badgeEl.textContent = `${branch.code} - ${branch.name}`;
    } catch (err) {
      console.error("Failed to fetch branch:", err);
      // Still allow form use with branch code
      const badgeEl = $(".branch-badge-text");
      if (badgeEl) badgeEl.textContent = `Branch: ${state.branchCode}`;
    }
  }

  // ─── Location (Silent Capture) ──────────────────────────
  function requestLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.latitude = pos.coords.latitude;
        state.longitude = pos.coords.longitude;
        state.locationStatus = "success";
      },
      () => {
        state.locationStatus = "failed";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // ─── Star Rating ────────────────────────────────────────
  function setupStarRating() {
    const container = $(".star-rating");
    if (!container) return;

    // Create 5 stars
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "star-btn";
      btn.dataset.rating = i;
      btn.setAttribute("aria-label", `Rate ${i} star${i > 1 ? "s" : ""}`);
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>`;
      btn.addEventListener("click", () => setRating(i));
      container.appendChild(btn);
    }
  }

  function setRating(value) {
    state.rating = value;

    // Update stars
    $$(".star-btn").forEach((btn) => {
      const r = parseInt(btn.dataset.rating);
      btn.classList.toggle("active", r <= value);
    });

    // Update label
    const label = $(".rating-label");
    if (label) {
      label.textContent = RATING_LABELS[value];
      label.classList.add("active");
    }

    // Clear rating error
    const errorEl = $("#rating-error");
    if (errorEl) errorEl.classList.remove("visible");
  }

  // ─── Improvement Tags ──────────────────────────────────
  function renderTags() {
    const container = $(".tags-grid");
    if (!container) return;

    IMPROVEMENT_TAGS.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip";
      chip.dataset.tagId = tag.id;
      chip.innerHTML = `<span class="tag-icon">${tag.icon}</span><span>${tag.label}</span>`;
      chip.addEventListener("click", () => toggleTag(tag.id, chip));
      container.appendChild(chip);
    });
  }

  function toggleTag(tagId, chipEl) {
    const idx = state.selectedTags.indexOf(tagId);
    if (idx > -1) {
      state.selectedTags.splice(idx, 1);
      chipEl.classList.remove("selected");
    } else {
      state.selectedTags.push(tagId);
      chipEl.classList.add("selected");
    }
  }

  // ─── Character Counter ─────────────────────────────────
  function setupCharCounter() {
    const textarea = $("#comments");
    const counter = $(".char-count");
    if (!textarea || !counter) return;

    textarea.addEventListener("input", () => {
      const len = textarea.value.length;
      counter.textContent = `${len}/500`;
      if (len > 500) {
        textarea.value = textarea.value.substring(0, 500);
        counter.textContent = "500/500";
      }
    });
  }

  // ─── Form Submission ───────────────────────────────────
  function setupForm() {
    const form = $("#feedback-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleSubmit();
    });
  }

  async function handleSubmit() {
    // Validate
    let isValid = true;

    const nameInput = $("#customer-name");
    const nameError = $("#name-error");
    if (!nameInput.value.trim() || nameInput.value.trim().length < 2) {
      nameInput.classList.add("error");
      if (nameError) nameError.classList.add("visible");
      isValid = false;
    } else {
      nameInput.classList.remove("error");
      if (nameError) nameError.classList.remove("visible");
    }

    if (state.rating === 0) {
      const ratingError = $("#rating-error");
      if (ratingError) ratingError.classList.add("visible");
      isValid = false;
    }

    if (!isValid) return;

    // Get tag labels (not IDs) for readable data
    const selectedTagLabels = state.selectedTags.map((id) => {
      const tag = IMPROVEMENT_TAGS.find((t) => t.id === id);
      return tag ? tag.label : id;
    });

    const payload = {
      branch_code: state.branchCode,
      customer_name: nameInput.value.trim(),
      customer_mobile: ($("#customer-mobile") && $("#customer-mobile").value.trim()) || "",
      rating: state.rating,
      improvement_tags: selectedTagLabels,
      comments: ($("#comments") && $("#comments").value.trim()) || "",
      latitude: state.latitude,
      longitude: state.longitude,
    };

    // Show loading state
    const submitBtn = $(".submit-btn");
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/feedback/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Submission failed");
      }

      // Show success
      showSuccess();
    } catch (err) {
      console.error("Submit error:", err);
      alert("Something went wrong! Please try again.\n\n" + err.message);
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  }

  // ─── Success Screen ────────────────────────────────────
  function showSuccess() {
    const form = $(".feedback-card");
    const success = $(".success-screen");
    if (form) form.style.display = "none";
    if (success) success.classList.add("visible");

    // Confetti burst
    createConfetti();
  }

  function createConfetti() {
    const colors = ["#1a5632", "#e8a838", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];
    const container = $(".feedback-container");

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement("div");
      confetti.style.cssText = `
        position: fixed;
        width: ${Math.random() * 8 + 4}px;
        height: ${Math.random() * 8 + 4}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}vw;
        top: -10px;
        border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
        pointer-events: none;
        z-index: 1000;
        animation: confettiFall ${Math.random() * 2 + 1.5}s ease-out forwards;
      `;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 4000);
    }

    // Add confetti keyframes dynamically
    if (!document.getElementById("confetti-style")) {
      const style = document.createElement("style");
      style.id = "confetti-style";
      style.textContent = `
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(${Math.random() * 720}deg); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ─── Error Screen ──────────────────────────────────────
  function showError(title, message) {
    const container = $(".feedback-container");
    if (!container) return;

    container.innerHTML = `
      <div class="feedback-header">
        <div class="pharmacy-logo">
          <img src="wellopharmacy-trasperent.png" alt="Wello Pharmacy" style="width:72px;height:72px;object-fit:contain;"/>
        </div>
      </div>
      <div class="feedback-card">
        <div class="error-container">
          <div class="error-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h2>${title}</h2>
          <p>${message}</p>
        </div>
      </div>
    `;
  }

  // ─── Input Cleanup Listeners ────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    init();

    // Clear error state on input
    const nameInput = document.getElementById("customer-name");
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        nameInput.classList.remove("error");
        const err = document.getElementById("name-error");
        if (err) err.classList.remove("visible");
      });
    }
  });
})();
