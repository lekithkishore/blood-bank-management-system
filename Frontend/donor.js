document.addEventListener("DOMContentLoaded", async () => {
  const email = sessionStorage.getItem("userEmail") || "";
  const blood = sessionStorage.getItem("userBlood") || "";

  if (!email) {
    const body = document.getElementById("donationBody");
    if (body) body.innerHTML = `<tr><td colspan="3">Please log in again.</td></tr>`;
    return;
  }

  await Promise.all([
    loadDonationHistory(email),
    loadRequests(blood, email)
    // popup removed
  ]);

  setupScheduleForm(email); // ⬅️ pass email so we can POST to backend
});

/* ================= Dismissed requests persistence ================= */
function getDismissedSet() {
  try {
    const raw = localStorage.getItem("dismissedAlerts");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function saveDismissedSet(set) {
  try {
    localStorage.setItem("dismissedAlerts", JSON.stringify(Array.from(set)));
  } catch {}
}

/* ============ Donation history ============ */
async function loadDonationHistory(email) {
  const body = document.getElementById("donationBody");
  try {
    const res = await fetch(`http://localhost:5000/donations/${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      body.innerHTML = `<tr><td colspan="3">Failed to load history.</td></tr>`;
      return;
    }

    const donations = data.donations || [];
    if (!donations.length) {
      body.innerHTML = `<tr><td colspan="3">No donation history yet.</td></tr>`;
      return;
    }

    body.innerHTML = "";
    donations.forEach(d => {
      body.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${escapeHtml(d.date)}</td>
          <td>${escapeHtml(d.bloodBank || "—")}</td>
          <td>${escapeHtml(d.status || "—")}</td>
        </tr>
      `);
    });
  } catch (err) {
    console.error("Error loading donations:", err);
    body.innerHTML = `<tr><td colspan="3">Server error.</td></tr>`;
  }
}

/* ============ Requests list (alerts from admin) ============ */
async function loadRequests(blood, email) {
  const wrap = document.getElementById("requestsList");
  const dismissed = getDismissedSet();

  try {
    const qs = blood ? `?blood=${encodeURIComponent(blood)}` : "";
    const res = await fetch(`http://localhost:5000/alerts${qs}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      wrap.textContent = "Failed to load requests.";
      return;
    }

    let alerts = data.alerts || [];
    // filter out ones the user has dismissed earlier
    alerts = alerts.filter(a => !dismissed.has(a._id));

    if (!alerts.length) {
      wrap.textContent = "No requests right now.";
      return;
    }

    wrap.innerHTML = "";
    alerts.forEach(a => {
      const alreadyResponded = (a.responses || []).some(r => r.email === email);
      const respondedLine = alreadyResponded
        ? `<p class="responded-line" style="color:green;margin:8px 0 0;">You already responded.</p>`
        : "";

      const card = document.createElement("div");
      card.className = "request-card";
      card.style.cssText = "border:1px solid #eee;border-radius:10px;padding:12px;margin-bottom:10px;background:#fff;";

      card.innerHTML = `
        <p style="margin:0 0 6px;"><strong>Message:</strong> ${escapeHtml(a.message)}</p>
        <p style="margin:0 0 6px;"><strong>Target:</strong> ${a.group ? escapeHtml(a.group) : "All"}</p>
        <p style="margin:0 0 10px;color:#666;"><small>${formatDateTime(a.createdAt)}</small></p>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <label for="eta-${a._id}">ETA:</label>
          <input type="datetime-local" id="eta-${a._id}" />
          <button class="acceptBtn" data-id="${a._id}">Accept</button>
          <button class="declineBtn" data-id="${a._id}" style="background:#eee;color:#333;">Decline</button>
          <button class="deleteBtn" data-id="${a._id}" title="Remove from this list" style="background:#fff;border:1px solid #ddd;color:#c00;">Delete</button>
        </div>
        ${respondedLine}
      `;

      wrap.appendChild(card);
    });

    // Accept handler
    wrap.querySelectorAll(".acceptBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const eta = (document.getElementById(`eta-${id}`) || {}).value;
        await respondToRequest(id, "accepted", eta, email);
        // keep the card, but refresh "responded" line
        await loadRequests(blood, email);
      });
    });

    // Decline handler — auto close on success
    wrap.querySelectorAll(".declineBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const eta = (document.getElementById(`eta-${id}`) || {}).value || "";
        const ok = await respondToRequest(id, "declined", eta, email);
        if (ok) {
          dismissed.add(id);
          saveDismissedSet(dismissed);
          // remove card immediately
          const card = btn.closest(".request-card");
          if (card) card.remove();
          // if list becomes empty, show placeholder
          if (!wrap.querySelector(".request-card")) {
            wrap.textContent = "No requests right now.";
          }
        }
      });
    });

    // Delete handler — local dismiss only
    wrap.querySelectorAll(".deleteBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        // optional confirm
        const card = btn.closest(".request-card");
        dismissed.add(id);
        saveDismissedSet(dismissed);
        if (card) card.remove();
        if (!wrap.querySelector(".request-card")) {
          wrap.textContent = "No requests right now.";
        }
      });
    });

  } catch (err) {
    console.error("requests load error", err);
    wrap.textContent = "Server error.";
  }
}

/* ============ Respond to a request ============ */
async function respondToRequest(alertId, status, eta, email) {
  if (!["accepted", "declined"].includes(status)) {
    alert("Invalid response.");
    return false;
  }
  try {
    const res = await fetch(`http://localhost:5000/alerts/${alertId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, status, eta })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(status === "accepted" ? "✅ Thanks for accepting!" : "Response recorded.");
      return true;
    } else {
      alert(data.message || "Could not record your response.");
      return false;
    }
  } catch (err) {
    console.error("respond error", err);
    alert("Server error. Try again later.");
    return false;
  }
}

/* ============ Schedule form → saves to backend ============ */
function setupScheduleForm(email) {
  const form = document.getElementById("scheduleForm");
  const status = document.getElementById("scheduleStatus");
  const dateInput = document.getElementById("donation-date");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const date = dateInput.value;
    if (!date) {
      status.style.color = "red";
      status.textContent = "Please pick a date.";
      return;
    }

    // ask donor for blood bank once
    const bank = prompt("Enter the blood bank / hospital name:") || "";
    if (!bank.trim()) {
      status.style.color = "red";
      status.textContent = "Blood bank is required.";
      return;
    }

    status.style.color = "";
    status.textContent = "Saving…";

    try {
      const res = await fetch("http://localhost:5000/admin/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, date, bloodBank: bank.trim(), status: "Scheduled" })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        status.style.color = "green";
        status.textContent = "✅ Scheduled!";
        await loadDonationHistory(email); // refresh donor view
        form.reset();
      } else {
        status.style.color = "red";
        status.textContent = data.message || "Failed to schedule.";
      }
    } catch (err) {
      console.error("schedule error", err);
      status.style.color = "red";
      status.textContent = "Server error.";
    }
  });
}

/* ============ Helpers ============ */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])
  );
}
function formatDateTime(dt) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return d.toLocaleString();
  } catch {
    return dt;
  }
}
