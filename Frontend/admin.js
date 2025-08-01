// Admin Dashboard Logic

document.addEventListener("DOMContentLoaded", async () => {
  await fetchAllUsers();          // users table + users map
  setupAlertForm();               // send alerts

  await loadAllDonations();       // list donations
  setupCreateDonationForm();      // add donation

  await loadResponses();          // donor responses
  await loadAlertsList();         // alerts with delete
  setInterval(loadResponses, 20000); // refresh responses every 20s

  // NEW: Requests
  setupCreateRequestForm();
  await loadActiveRequests();
  await loadRequestHistory(); // initial page
  setupRequestHistoryControls();

  // modal events
  setupHistoryModal();
});

// Keep a local map so we can show "Donor Name" and "Blood Group" in donations
let __usersByEmail = new Map();

// ===== USERS =====
async function fetchAllUsers() {
  const tableBody = document.getElementById("userTableBody");
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/users");
    const data = await res.json();

    if (!res.ok || !data.success) {
      tableBody.innerHTML = "<tr><td colspan='7'>Failed to load users</td></tr>";
      return;
    }

    const users = data.users || [];
    if (users.length === 0) {
      tableBody.innerHTML = "<tr><td colspan='7'>No users found</td></tr>";
      return;
    }

    __usersByEmail = new Map(users.map(u => [u.email, u]));

    tableBody.innerHTML = "";
    users.forEach(user => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${safe(user.name)}</td>
        <td>${safe(user.email)}</td>
        <td>${safe(user.blood)}</td>
        <td>${safe(user.gender)}</td>
        <td>${user.age ?? "-"}</td>
        <td>
          <button class="viewHistoryBtn" data-email="${escapeAttr(user.email)}" data-name="${escapeAttr(user.name || user.email)}">
            View
          </button>
        </td>
        <td>
          <button class="editUserBtn" data-id="${user._id}">Edit</button>
          <button class="deleteUserBtn" data-id="${user._id}" style="background:#eee;color:#333;">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    // handlers
    tableBody.querySelectorAll(".viewHistoryBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        openDonorHistory(btn.getAttribute("data-email"), btn.getAttribute("data-name"));
      });
    });

    tableBody.querySelectorAll(".editUserBtn").forEach(btn => {
      btn.addEventListener("click", () => onEditUser(btn.getAttribute("data-id")));
    });

    tableBody.querySelectorAll(".deleteUserBtn").forEach(btn => {
      btn.addEventListener("click", () => onDeleteUser(btn.getAttribute("data-id")));
    });

  } catch (err) {
    console.error("Error fetching users:", err);
    tableBody.innerHTML = "<tr><td colspan='7'>Server error</td></tr>";
  }
}

async function onEditUser(userId) {
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/users");
    const data = await res.json();
    if (!res.ok || !data.success) {
      return alert("Failed to load current user.");
    }
    const current = (data.users || []).find(u => u._id === userId);
    if (!current) return alert("User not found.");

    const name = prompt("Name:", current.name || "") ?? current.name;
    const blood = prompt("Blood group (e.g., O+):", current.blood || "") ?? current.blood;
    const gender = prompt("Gender (male/female/other):", current.gender || "") ?? current.gender;
    const ageStr = prompt("Age:", current.age ?? "") ?? current.age;
    const age = String(ageStr).trim() === "" ? current.age : Number(ageStr);

    const payload = { name, blood, gender, age };

    const pres = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const pdata = await pres.json();
    if (pres.ok && pdata.success) {
      alert("✅ User updated");
      await fetchAllUsers();
      await loadAllDonations(); // refresh names/blood in donations table too
    } else {
      alert(pdata.message || "Failed to update user");
    }
  } catch (err) {
    console.error("edit user error", err);
    alert("Server error");
  }
}

async function onDeleteUser(userId) {
  if (!confirm("Delete this user? This cannot be undone.")) return;
  try {
    const dres = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/users/${userId}`, {
      method: "DELETE"
    });
    const ddata = await dres.json();
    if (dres.ok && ddata.success) {
      alert("✅ User deleted");
      await fetchAllUsers();
      await loadAllDonations(); // mapping changed; refresh
    } else {
      alert(ddata.message || "Failed to delete user");
    }
  } catch (err) {
    console.error("delete user error", err);
    alert("Server error");
  }
}

// ===== ALERTS: form =====
function setupAlertForm() {
  const alertForm = document.getElementById("alertForm");
  if (!alertForm) return;
  alertForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const group = document.getElementById("group").value;      // "" means all
    const message = document.getElementById("message").value.trim();

    if (!message) {
      alert("Please enter a message.");
      return;
    }

    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, group })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert("✅ Alert sent!");
        alertForm.reset();
        setTimeout(() => {
          loadResponses();
          loadAlertsList();
        }, 500);
      } else {
        alert(data.message || "⚠️ Failed to send alert.");
      }
    } catch (err) {
      console.error("Alert error:", err);
      alert("❌ Server error while sending alert.");
    }
  });
}

// ===== DONATIONS: list/create/delete =====
async function loadAllDonations() {
  const body = document.getElementById("donationTableBody");
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/donations");
    const data = await res.json();

    if (!res.ok || !data.success) {
      body.innerHTML = "<tr><td colspan='5'>Failed to load donations</td></tr>";
      return;
    }

    const rows = data.donations || [];
    if (!rows.length) {
      body.innerHTML = "<tr><td colspan='5'>No donations yet</td></tr>";
      return;
    }

    body.innerHTML = "";
    rows.forEach(d => {
      const u = __usersByEmail.get(d.email);
      const donorName = u?.name || d.email || "-";
      const donorBlood = u?.blood || "-";

      body.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${safe(donorName)}</td>
          <td>${safe(donorBlood)}</td>
          <td>${safe(d.date)}</td>
          <td>${safe(d.status)}</td>
          <td>
            <button class="deleteDonationBtn" data-id="${d._id}" style="background:#eee;color:#333;">Delete</button>
          </td>
        </tr>
      `);
    });

    body.querySelectorAll(".deleteDonationBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (!confirm("Delete this donation record?")) return;
        try {
          const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/donations/${id}`, { method: "DELETE" });
          const data = await res.json();
          if (res.ok && data.success) {
            await loadAllDonations();
            alert("🗑️ Donation deleted");
          } else {
            alert(data.message || "Failed to delete");
          }
        } catch (err) {
          console.error("delete donation error", err);
          alert("Server error");
        }
      });
    });

  } catch (err) {
    console.error("donations load error", err);
    body.innerHTML = "<tr><td colspan='5'>Server error</td></tr>";
  }
}

function setupCreateDonationForm() {
  const form = document.getElementById("createDonationForm");
  const statusEl = document.getElementById("dn-status-text");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.style.color = "";
    statusEl.textContent = "Saving…";

    const email = document.getElementById("dn-email").value.trim();
    const date = document.getElementById("dn-date").value;
    const bank = document.getElementById("dn-bank").value.trim();
    const status = document.getElementById("dn-status").value;

    if (!email || !date || !bank) {
      statusEl.style.color = "red";
      statusEl.textContent = "Please fill all fields.";
      return;
    }

    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, date, bloodBank: bank, status })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        statusEl.style.color = "green";
        statusEl.textContent = "✅ Added";
        form.reset();
        await loadAllDonations();
      } else {
        statusEl.style.color = "red";
        statusEl.textContent = data.message || "Failed";
      }
    } catch (err) {
      console.error("create donation error", err);
      statusEl.style.color = "red";
      statusEl.textContent = "Server error";
    }
  });
}

// ===== RESPONSES (existing) =====
async function loadResponses() {
  const body = document.getElementById("responsesBody");
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/alerts");
    const data = await res.json();

    if (!res.ok || !data.success) {
      body.innerHTML = "<tr><td colspan='7'>Failed to load responses</td></tr>";
      return;
    }

    const rows = [];
    (data.alerts || []).forEach(a => {
      (a.responses || []).forEach(r => {
        rows.push({
          alertId: a._id,
          message: a.message,
          group: a.group,
          email: r.email,
          status: r.status,
          eta: r.eta || "",
          respondedAt: r.respondedAt
        });
      });
    });

    if (!rows.length) {
      body.innerHTML = "<tr><td colspan='7'>No responses yet</td></tr>";
      return;
    }

    rows.sort((a, b) => new Date(b.respondedAt || 0) - new Date(a.respondedAt || 0));

    body.innerHTML = "";
    rows.forEach(row => {
      const etaDateOnly = (row.eta && row.eta.length >= 10) ? row.eta.slice(0,10) : "";
      body.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${safe(row.email)}</td>
          <td>${safe(cap(row.status))}</td>
          <td>${safe(formatEta(row.eta))}</td>
          <td>${safe(row.message)}</td>
          <td>${safe(formatDateTime(row.respondedAt))}</td>
          <td>
            <button class="createFromRespBtn"
              data-email="${escapeAttr(row.email)}"
              data-date="${escapeAttr(etaDateOnly)}">
              Create Donation
            </button>
          </td>
          <td>
            <button class="deleteResponseBtn"
              data-alert-id="${escapeAttr(row.alertId)}"
              data-email="${escapeAttr(row.email)}"
              data-responded="${escapeAttr(row.respondedAt || '')}"
              style="background:#eee;color:#333;">
              Delete
            </button>
          </td>
        </tr>
      `);
    });

    // existing Create Donation click
    body.querySelectorAll(".createFromRespBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        let date = btn.getAttribute("data-date");
        if (!date) date = prompt("Enter donation date (YYYY-MM-DD):") || "";
        const bank = prompt("Enter Blood Bank name:") || "";
        if (!email || !date || !bank) {
          alert("Email, Date and Blood Bank are required.");
          return;
        }
        await createDonationFromResponse(email, date, bank);
      });
    });

    // Delete response click
    body.querySelectorAll(".deleteResponseBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const alertId = btn.getAttribute("data-alert-id");
        const email   = btn.getAttribute("data-email");
        const respondedAt = btn.getAttribute("data-responded"); // optional
        if (!confirm("Delete this response?")) return;
        try {
          const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/alerts/${alertId}/responses`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, respondedAt })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            await loadResponses();
            alert("🗑️ Response deleted");
          } else {
            alert(data.message || "Failed to delete");
          }
        } catch (err) {
          console.error("delete response error", err);
          alert("Server error");
        }
      });
    });

  } catch (err) {
    console.error("responses load error", err);
    body.innerHTML = "<tr><td colspan='7'>Server error</td></tr>";
  }
}

async function createDonationFromResponse(email, date, bloodBank) {
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, date, bloodBank, status: "Scheduled" })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert("✅ Donation created");
      await loadAllDonations();
    } else {
      alert(data.message || "Failed to create donation");
    }
  } catch (err) {
    console.error("create from response error", err);
    alert("Server error");
  }
}

// ===== ALERTS LIST =====
async function loadAlertsList() {
  const body = document.getElementById("alertsBody");
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/alerts");
    const data = await res.json();

    if (!res.ok || !data.success) {
      body.innerHTML = "<tr><td colspan='4'>Failed to load alerts</td></tr>";
      return;
    }

    const alerts = data.alerts || [];
    if (!alerts.length) {
      body.innerHTML = "<tr><td colspan='4'>No alerts</td></tr>";
      return;
    }

    // newest last for readability
    alerts.sort((a,b)=> new Date(a.createdAt||0) - new Date(b.createdAt||0));

    body.innerHTML = "";
    alerts.forEach(a => {
      body.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${safe(a.message)}</td>
          <td>${safe(a.group || "All")}</td>
          <td>${safe(formatDateTime(a.createdAt))}</td>
          <td>
            <button class="deleteAlertBtn" data-id="${a._id}" style="background:#eee;color:#333;">Delete</button>
          </td>
        </tr>
      `);
    });

    body.querySelectorAll(".deleteAlertBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (!confirm("Delete this alert?")) return;
        try {
          const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/alerts/${id}`, { method: "DELETE" });
          const data = await res.json();
          if (res.ok && data.success) {
            await loadAlertsList();
            alert("🗑️ Alert deleted");
          } else {
            alert(data.message || "Failed to delete alert");
          }
        } catch (err) {
          console.error("delete alert error", err);
          alert("Server error");
        }
      });
    });

  } catch (err) {
    console.error("alerts load error", err);
    body.innerHTML = "<tr><td colspan='4'>Server error</td></tr>";
  }
}

// ===== Donor History modal =====
let __historyState = { email: "", name: "", all: [], shown: 0, pageSize: 7 };

function setupHistoryModal(){
  const modal = document.getElementById("historyModal");
  const closeBtn = document.getElementById("historyClose");
  const loadMore = document.getElementById("historyLoadMore");
  const reload = document.getElementById("historyReload");

  if (closeBtn) closeBtn.addEventListener("click", closeHistoryModal);
  if (modal) modal.addEventListener("click", (e)=> {
    if (e.target === modal) closeHistoryModal();
  });
  if (loadMore) loadMore.addEventListener("click", renderMoreHistory);
  if (reload) reload.addEventListener("click", async ()=>{
    if (!__historyState.email) return;
    await fetchHistory(__historyState.email, __historyState.name, true);
  });
}

function openDonorHistory(email, name){
  fetchHistory(email, name, true);
  const modal = document.getElementById("historyModal");
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden","false");
}

function closeHistoryModal(){
  const modal = document.getElementById("historyModal");
  modal.style.display = "none";
  modal.setAttribute("aria-hidden","true");
}

async function fetchHistory(email, name, reset=false){
  const title = document.getElementById("historyTitle");
  const list = document.getElementById("historyList");
  const loadMore = document.getElementById("historyLoadMore");

  title.textContent = `Donation History — ${name}`;
  list.textContent = "Loading…";
  loadMore.style.display = "none";

  try {
    const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/donations/${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      list.textContent = "Failed to load history.";
      return;
    }

    const all = (data.donations || []).slice(); // already sorted desc on backend
    __historyState = { email, name, all, shown: 0, pageSize: 7 };
    renderMoreHistory();
  } catch (err) {
    console.error("history fetch error", err);
    list.textContent = "Server error.";
  }
}

function renderMoreHistory(){
  const { all, shown, pageSize } = __historyState;
  const list = document.getElementById("historyList");
  const loadMore = document.getElementById("historyLoadMore");

  if (!all.length) {
    list.innerHTML = `<div class="soft">No donation records yet.</div>`;
    loadMore.style.display = "none";
    return;
  }

  // render as table (append mode)
  if (shown === 0) {
    list.innerHTML = `
      <table class="table-sm" style="width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;">Date</th>
            <th style="text-align:left;">Blood Bank</th>
            <th style="text-align:left;">Status</th>
          </tr>
        </thead>
        <tbody id="historyTbody"></tbody>
      </table>
    `;
  }

  const tbody = document.getElementById("historyTbody");
  const nextChunk = all.slice(shown, shown + pageSize);
  nextChunk.forEach(d => {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${safe(d.date)}</td>
        <td>${safe(d.bloodBank || "—")}</td>
        <td>${safe(d.status || "—")}</td>
      </tr>
    `);
  });

  __historyState.shown += nextChunk.length;
  loadMore.style.display = (__historyState.shown < all.length) ? "inline-block" : "none";
}

// ===== REQUESTS (NEW) =====
let __rqHistory = { all: [], shown: 0, pageSize: 7, exhausted: false };

function setupCreateRequestForm() {
  const form = document.getElementById("createRequestForm");
  const statusEl = document.getElementById("rq-status-text");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.style.color = "";
    statusEl.textContent = "Saving…";

    const payload = {
      name: document.getElementById("rq-name").value.trim(),
      email: document.getElementById("rq-email").value.trim(),
      phone: document.getElementById("rq-phone").value.trim(),
      blood: document.getElementById("rq-blood").value,
      units: Number(document.getElementById("rq-units").value || 0),
      neededBy: document.getElementById("rq-neededBy").value,
      hospital: document.getElementById("rq-hospital").value.trim(),
      location: document.getElementById("rq-location").value.trim(),
      notes: document.getElementById("rq-notes").value.trim()
    };

    if (!payload.name || !payload.email || !payload.blood || !payload.units ||
        !payload.neededBy || !payload.hospital || !payload.location) {
      statusEl.style.color = "red";
      statusEl.textContent = "Please fill all required fields.";
      return;
    }

    try {
      const res = await fetch("http://localhost:5000https://blood-bank-management-system-u2p7.onrender.com/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        statusEl.style.color = "green";
        statusEl.textContent = "✅ Request added";
        form.reset();
        await loadActiveRequests();
        await reloadRequestHistory();
      } else {
        statusEl.style.color = "red";
        statusEl.textContent = data.message || "Failed to add request";
      }
    } catch (err) {
      console.error("create request error", err);
      statusEl.style.color = "red";
      statusEl.textContent = "Server error";
    }
  });
}

async function loadActiveRequests() {
  const body = document.getElementById("requestsTableBody");
  if (!body) return;
  body.innerHTML = "<tr><td colspan='7'>Loading…</td></tr>";
  try {
    // Only pending items
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/requests?status=Pending");
    const data = await res.json();
    if (!res.ok || !data.success) {
      body.innerHTML = "<tr><td colspan='7'>Failed to load requests</td></tr>";
      return;
    }

    const rows = (data.requests || []);
    if (!rows.length) {
      body.innerHTML = "<tr><td colspan='7'>No active requests</td></tr>";
      return;
    }

    body.innerHTML = "";
    rows.forEach(r => {
      const nameEmail = `${safe(r.name)}<br><span class="soft">${safe(r.email)}</span>`;
      const hospLoc = `${safe(r.hospital)}<br><span class="soft">${safe(r.location)}</span>`;
      body.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${nameEmail}</td>
          <td>${safe(r.blood)}</td>
          <td>${safe(r.units)}</td>
          <td>${safe(r.neededBy)}</td>
          <td>${hospLoc}</td>
          <td>${safe(r.status)}</td>
          <td>
            <button class="acceptReqBtn" data-id="${r._id}">Accept</button>
            <button class="rejectReqBtn" data-id="${r._id}" style="background:#ffe0e0;color:#a00;">Reject</button>
            <button class="deleteReqBtn" data-id="${r._id}" style="background:#eee;color:#333;">Delete</button>
          </td>
        </tr>
      `);
    });

    // actions
    body.querySelectorAll(".acceptReqBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (!confirm("Accept this request and notify matching donors?")) return;
        await acceptRequest(id);
      });
    });

    body.querySelectorAll(".rejectReqBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (!confirm("Reject this request?")) return;
        await updateRequestStatus(id, "Rejected");
      });
    });

    body.querySelectorAll(".deleteReqBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (!confirm("Delete this request? This cannot be undone.")) return;
        await deleteRequest(id);
      });
    });

  } catch (err) {
    console.error("loadActiveRequests error", err);
    body.innerHTML = "<tr><td colspan='7'>Server error</td></tr>";
  }
}

function setupRequestHistoryControls(){
  const loadMore = document.getElementById("rqHistoryLoadMore");
  const reload = document.getElementById("rqHistoryReload");
  if (loadMore) loadMore.addEventListener("click", renderMoreRequestHistory);
  if (reload) reload.addEventListener("click", reloadRequestHistory);
}

async function loadRequestHistory(initial=false) {
  // first page
  __rqHistory = { all: [], shown: 0, pageSize: 7, exhausted: false };
  const list = document.getElementById("rq-history");
  const loadMore = document.getElementById("rqHistoryLoadMore");
  list.textContent = "Loading…";
  loadMore.style.display = "none";
  await fetchMoreRequestHistory(); // will render first 7
}

async function reloadRequestHistory(){
  __rqHistory = { all: [], shown: 0, pageSize: 7, exhausted: false };
  const list = document.getElementById("rq-history");
  list.textContent = "Loading…";
  document.getElementById("rqHistoryLoadMore").style.display = "none";
  await fetchMoreRequestHistory();
}

async function fetchMoreRequestHistory(){
  const { shown, pageSize, exhausted } = __rqHistory;
  if (exhausted) return;

  try {
    const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/requests/history?skip=${shown}&limit=${pageSize}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      document.getElementById("rq-history").textContent = "Failed to load history.";
      return;
    }
    const items = data.requests || [];
    if (shown === 0) {
      renderRequestHistoryTableSkeleton();
    }
    appendRequestHistoryRows(items);

    __rqHistory.shown += items.length;
    __rqHistory.exhausted = items.length < pageSize;

    const loadMore = document.getElementById("rqHistoryLoadMore");
    loadMore.style.display = __rqHistory.exhausted ? "none" : "inline-block";
  } catch (err) {
    console.error("request history load error", err);
    document.getElementById("rq-history").textContent = "Server error.";
  }
}

function renderRequestHistoryTableSkeleton(){
  const list = document.getElementById("rq-history");
  list.innerHTML = `
    <table class="table-sm" style="width:100%;">
      <thead>
        <tr>
          <th style="text-align:left;">Requested</th>
          <th style="text-align:left;">Name / Email</th>
          <th style="text-align:left;">Blood / Units</th>
          <th style="text-align:left;">Needed By</th>
          <th style="text-align:left;">Hospital / Location</th>
          <th style="text-align:left;">Status</th>
        </tr>
      </thead>
      <tbody id="rqHistoryTbody"></tbody>
    </table>
  `;
}
function appendRequestHistoryRows(items){
  const tbody = document.getElementById("rqHistoryTbody");
  if (!items.length && __rqHistory.shown === 0) {
    document.getElementById("rq-history").innerHTML = `<div class="soft">No request history yet.</div>`;
    return;
  }
  items.forEach(r => {
    const nameEmail = `${safe(r.name)}<br><span class="soft">${safe(r.email)}</span>`;
    const bloodUnits = `${safe(r.blood)} / ${safe(r.units)}`;
    const hospLoc = `${safe(r.hospital)}<br><span class="soft">${safe(r.location)}</span>`;
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${safe(formatDateTime(r.createdAt))}</td>
        <td>${nameEmail}</td>
        <td>${bloodUnits}</td>
        <td>${safe(r.neededBy)}</td>
        <td>${hospLoc}</td>
        <td>${safe(r.status)}</td>
      </tr>
    `);
  });
}
function renderMoreRequestHistory(){
  fetchMoreRequestHistory();
}

// Actions for requests
async function acceptRequest(id) {
  try {
    // 1) Mark accepted (server returns updated request)
    let res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/requests/${id}/accept`, { method: "PATCH" });
    let data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.message || "Failed to accept request");
      return;
    }
    const req = data.request;

    // 2) Notify donors of same blood group using existing alerts endpoint
    const message = buildRequestAlertMessage(req);
    res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, group: req.blood })
    });
    const alertData = await res.json();
    if (res.ok && alertData.success) {
      alert("✅ Request accepted & donors notified");
    } else {
      alert(alertData.message || "Accepted, but failed to send alert");
    }

    await loadActiveRequests();
    await reloadRequestHistory();
    // Optional: refresh alerts list
    setTimeout(() => { loadAlertsList(); }, 400);
  } catch (err) {
    console.error("acceptRequest error", err);
    alert("Server error");
  }
}

function buildRequestAlertMessage(req) {
  const parts = [
    `Urgent ${req.blood} blood needed`,
    req.units ? ` (${req.units} unit${Number(req.units) > 1 ? "s" : ""})` : "",
    req.hospital ? ` at ${req.hospital}` : "",
    req.location ? `, ${req.location}` : "",
    req.neededBy ? ` by ${req.neededBy}` : "",
    req.name ? ` for ${req.name}` : "",
    req.phone ? ` (Contact: ${req.phone})` : ""
  ];
  return parts.join("").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
}

async function updateRequestStatus(id, status) {
  try {
    const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ Request ${status.toLowerCase()}`);
      await loadActiveRequests();
      await reloadRequestHistory();
    } else {
      alert(data.message || "Failed to update request");
    }
  } catch (err) {
    console.error("updateRequestStatus error", err);
    alert("Server error");
  }
}

async function deleteRequest(id) {
  try {
    const res = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/requests/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok && data.success) {
      alert("🗑️ Request deleted");
      await loadActiveRequests();
      await reloadRequestHistory();
    } else {
      alert(data.message || "Failed to delete request");
    }
  } catch (err) {
    console.error("deleteRequest error", err);
    alert("Server error");
  }
}

// ===== Helpers =====
function safe(v) {
  return (v === undefined || v === null || v === "") ? "-" : String(v);
}
function cap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
function formatEta(eta){
  if (!eta) return "-";
  try { return new Date(eta).toLocaleString(); } catch { return eta; }
}
function formatDateTime(dt){
  if (!dt) return "-";
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// —— INVENTORY MODULE —— 
document.addEventListener("DOMContentLoaded", () => {
  // Ensure this runs after everything else
  fetchInventory();
  setupInventory();
});

function setupInventory() {
  const form = document.getElementById("inventoryForm");
  const statusEl = document.getElementById("inv-status-text");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.style.color = "";
    statusEl.textContent = "Saving…";
    const hospital = document.getElementById("inv-hospital").value.trim();
    const bloodGroup = document.getElementById("inv-bloodGroup").value;
    const units = Number(document.getElementById("inv-units").value);
    const dateAdded = document.getElementById("inv-date").value;
    if (!hospital || !bloodGroup || !units || !dateAdded) {
      statusEl.style.color = "red";
      statusEl.textContent = "Please fill all fields.";
      return;
    }
    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital, bloodGroup, units, dateAdded })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        statusEl.style.color = "green";
        statusEl.textContent = "✅ Added";
        form.reset();
        await fetchInventory();
      } else {
        statusEl.style.color = "red";
        statusEl.textContent = data.message || "Failed";
      }
    } catch (err) {
      console.error("create inventory error", err);
      statusEl.style.color = "red";
      statusEl.textContent = "Server error";
    }
  });
}

async function fetchInventory() {
  const tbody = document.getElementById("inventoryBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>Loading…</td></tr>";
  try {
    const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/inventory");
    const data = await res.json();
    if (!res.ok || !data.success) {
      tbody.innerHTML = "<tr><td colspan='5'>Failed to load inventory</td></tr>";
      return;
    }
const items = data.inventory || []; // ← FIXED
    if (!items.length) {
      tbody.innerHTML = "<tr><td colspan='5'>No inventory records</td></tr>";
      return;
    }
    tbody.innerHTML = "";
    items.forEach(item => {
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${safe(item.hospital)}</td>
          <td>${safe(item.bloodGroup)}</td>
          <td>${safe(item.units)}</td>
<td>${item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "-"}</td>
          <td>
            <button class="deleteInventoryBtn" data-id="${escapeAttr(item._id)}" style="background:#eee;color:#333;">
              Delete
            </button>
             <button class="editInventoryBtn" data-id="${escapeAttr(item._id)}" style="background:#eee;color:#333;">Edit</button>
          </td>
        </tr>
      `);
    });
    document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("editInventoryBtn")) {
    const id = e.target.getAttribute("data-id");
    const row = e.target.closest("tr");
    const cells = row.querySelectorAll("td");

    const hospital = prompt("Edit Hospital:", cells[0].innerText);
    const bloodGroup = prompt("Edit Blood Group:", cells[1].innerText);
    const units = prompt("Edit Units:", cells[2].innerText);
const addedAt = prompt("Edit Date (MM/DD/YYYY):", cells[3].innerText);

    if (!hospital || !bloodGroup || !units) return;

    const response = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/api/inventory/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
body: JSON.stringify({ hospital, bloodGroup, units, addedAt })
});


    if (response.ok) {
      alert("Inventory updated");
      location.reload(); // refresh to reflect changes
    } else {
      alert("Update failed");
    }
  }
});

    tbody.querySelectorAll(".deleteInventoryBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id || !confirm("Delete this inventory record?")) return;
        try {
          const dres = await fetch(`https://blood-bank-management-system-u2p7.onrender.com/admin/inventory/${id}`, { method: "DELETE" });
          const j = await dres.json();
          if (dres.ok && j.success) {
            alert("🗑️ Inventory deleted");
            await fetchInventory();
          } else {
            alert(j.message || "Failed to delete inventory");
          }
        } catch (err) {
          console.error("delete inventory error", err);
          alert("Server error");
        }
      });
    });
  } catch (err) {
    console.error("inventory fetch error", err);
    tbody.innerHTML = "<tr><td colspan='5'>Server error</td></tr>";
  }
}
// —— end of INVENTORY MODULE —— 
