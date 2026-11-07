(function () {
  const tv = window.TrueValue;
  const form = document.querySelector("#login-form");
  const resetForm = document.querySelector("#reset-form");
  const message = document.querySelector("#login-message");

  function say(text) {
    if (message) message.textContent = text;
  }

  async function redirectIfLoggedIn() {
    if (!tv.isConfigured) return;
    const { data } = await tv.supabase.auth.getSession();
    if (data.session) location.href = "index.html";
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    say("");
    if (!tv.isConfigured) {
      say("Supabase is not configured. Update assets/js/config.js first.");
      return;
    }
    const button = form.querySelector("button[type=submit]");
    const fd = new FormData(form);
    button.disabled = true;
    button.textContent = "Signing in...";
    const { error } = await tv.supabase.auth.signInWithPassword({
      email: String(fd.get("email") || "").trim(),
      password: String(fd.get("password") || "")
    });
    button.disabled = false;
    button.textContent = "Sign in ↗";
    if (error) {
      say(error.message || "Sign-in failed. Check your credentials.");
      return;
    }
    location.href = "index.html";
  });

  resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tv.isConfigured) {
      say("Supabase is not configured. Update assets/js/config.js first.");
      return;
    }
    const email = String(new FormData(resetForm).get("reset_email") || "").trim();
    if (!email) {
      say("Enter your admin email to request a reset link.");
      return;
    }
    const { error } = await tv.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname.replace(/\/admin\/login\.html$/, "/admin/login.html")
    });
    say(error ? error.message : "If password reset is enabled, Supabase will send a reset link.");
  });

  redirectIfLoggedIn();
})();
