console.log("✅ JS loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const passwordInput = document.getElementById("password");

  // Create error message element
  const passwordMessage = document.createElement("div");
  passwordMessage.style.color = "red";
  passwordMessage.style.marginTop = "-10px";
  passwordMessage.style.marginBottom = "10px";
  passwordMessage.style.fontSize = "0.9em";
  passwordInput.insertAdjacentElement("afterend", passwordMessage);

  // Validation function
  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push("Minimum 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("At least one uppercase letter");
    }
    if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
      errors.push("At least one special character");
    }
    return errors;
  };

  // Show validation live
  passwordInput.addEventListener("input", () => {
    const password = passwordInput.value;
    const issues = validatePassword(password);
    passwordMessage.innerHTML = issues.length
      ? "❌ " + issues.join("<br>❌ ")
      : "<span style='color:lightgreen;'>✅ Password is strong</span>";
  });

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = form.password.value;
    const validationErrors = validatePassword(password);

    if (validationErrors.length) {
      alert("Please fix password issues before submitting.");
      return;
    }

    const data = {
      name: form.name.value,
      email: form.email.value,
      password: form.password.value,
      age: form.age.value,
      gender: form.gender.value,
      blood: form.blood.value,
    };

    try {
      const res = await fetch("https://blood-bank-management-system-u2p7.onrender.com/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      alert(result.message || "Signup successful!");
    } catch (err) {
      console.error("Error:", err);
      alert("Signup failed.");
    }
  });
});
