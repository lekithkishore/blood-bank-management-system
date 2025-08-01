document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("requestForm");
  const status = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  // Prefill helpful fields if available
  try {
    const userName = sessionStorage.getItem("userName");
    const userPhone = sessionStorage.getItem("userPhone");
    if (userName && !document.getElementById("patient").value) {
      document.getElementById("patient").value = userName;
    }
    if (userPhone && !document.getElementById("contact").value) {
      document.getElementById("contact").value = userPhone;
    }
  } catch {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    const hospital = getTrimmed("hospital");
    const patient = getTrimmed("patient");
    const blood = document.getElementById("blood").value;
    const units = parseInt(document.getElementById("units").value, 10);
    const dateNeeded = document.getElementById("date").value; // expected YYYY-MM-DD from <input type="date">
    const contact = getTrimmed("contact");

    // Try to read an optional location field if present
    const locationInput = document.getElementById("location");
    const location = locationInput ? (locationInput.value || "").trim() : "Unknown/Not specified";

    // Basic validations
    if (!hospital || !patient || !blood || !units || !dateNeeded || !contact) {
      return setError("Please fill in all fields.");
    }
    if (units < 1) {
      return setError("Units must be at least 1.");
    }
    if (!isValidPhone(contact)) {
      return setError("Please enter a valid contact number (digits, +, - and spaces allowed).");
    }
    if (!isFutureOrToday(dateNeeded)) {
      return setError("Date Needed cannot be in the past.");
    }

    // Get requester email (required by backend). Try storage first; if missing, prompt once.
    let email =
      sessionStorage.getItem("userEmail") ||
      localStorage.getItem("email") ||
      "";

    if (!email) {
      email = (prompt("Enter your email (required to contact you):") || "").trim();
      if (!email) {
        return setError("Email is required to submit a request.");
      }
    }

    // Compose payload for /admin/requests
    const payload = {
      name: patient,               // patient/requester name
      email,                       // requester email (contact)
      phone: contact,              // contact number
      blood,                       // required blood group
      units,                       // number of units
      neededBy: toYMD(dateNeeded), // keep YYYY-MM-DD
      hospital,                    // hospital/center
      location,                    // city/area (or default)
      notes: ""                    // optional extra info
    };

    // Submit to backend (creates a Request that the admin can Accept/Reject)
    submitBtn.disabled = true;
    setInfo("Submitting request…");

    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess("✅ Request submitted successfully. The admin will review and notify matching donors.");
        form.reset();
      } else {
        setError((data && data.message) || "Failed to submit request.");
      }
    } catch (err) {
      console.error("request submit error:", err);
      setError("Server error. Please try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ===== helpers ===== */
  function getTrimmed(id) {
    return (document.getElementById(id).value || "").trim();
  }
  function setInfo(msg) {
    status.style.color = "";
    status.textContent = msg;
  }
  function setSuccess(msg) {
    status.style.color = "green";
    status.textContent = msg;
  }
  function setError(msg) {
    status.style.color = "red";
    status.textContent = msg;
  }
  function clearStatus() {
    status.textContent = "";
    status.style.color = "";
  }
  function isValidPhone(s) {
    // Allow digits, spaces, +, -, parentheses; must contain at least 7 digits
    const digits = (s.match(/\d/g) || []).length;
    return /^[\d\s()+-]+$/.test(s) && digits >= 7;
  }
  function isFutureOrToday(yyyy_mm_dd) {
    try {
      const d = new Date(yyyy_mm_dd + "T00:00:00");
      const now = new Date();
      // zero out today for compare
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= today;
    } catch {
      return false;
    }
  }
  function toYMD(v) {
    // Accepts "YYYY-MM-DD" or "DD-MM-YYYY" and returns "YYYY-MM-DD"
    if (!v) return "";
    v = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;                  // already Y-M-D
    const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);               // D-M-Y
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v;
  }
});
