document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("adminLoginBtn");
  const emailField = document.getElementById("admin-email");
  const passwordField = document.getElementById("admin-password");
  const errorText = document.getElementById("admin-login-error");

  loginBtn.addEventListener("click", async () => {
    const email = emailField.value.trim();
    const password = passwordField.value;

    if (!email || !password) {
      errorText.textContent = "Please enter both email and password.";
      return;
    }

    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // ✅ Save admin session and redirect
        sessionStorage.setItem("adminLoggedIn", "true");
        // Optionally store email for display in admin header
        sessionStorage.setItem("adminEmail", email);

        alert("✅ Welcome back, Admin!");
        window.location.href = "admin.html";
      } else {
        errorText.textContent = result.message || "Invalid admin credentials.";
      }
    } catch (err) {
      console.error(err);
      errorText.textContent = "Server error. Try again later.";
    }
  });
});
