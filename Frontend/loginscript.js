document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const emailField = document.getElementById("email");
  const passwordField = document.getElementById("password");
  const errorText = document.getElementById("login-error");

  loginBtn.addEventListener("click", async () => {
    const email = emailField.value.trim();
    const password = passwordField.value;

    if (!email || !password) {
      errorText.textContent = "Please enter both email and password.";
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // ✅ Redirect on success
       sessionStorage.setItem("loggedIn", "true");
       sessionStorage.setItem("userEmail", email); // 👈 Add this
alert("✅ Welcome back! You have successfully logged in.");
window.location.href = "index.html";

      } else {
        // ❌ Show error on failure
        errorText.textContent = result.message || "Invalid credentials.";
      }
    } catch (err) {
      console.error(err);
      errorText.textContent = "Server error. Try again later.";
    }
  });
});
