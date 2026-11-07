(function () {
  const cfg = window.TRUE_VALUE_CONFIG || {};
  const missing = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes("YOUR_") || cfg.SUPABASE_ANON_KEY.includes("YOUR_");

  window.TrueValue = {
    config: cfg,
    supabase: missing ? null : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    }),
    isConfigured: !missing
  };

  window.TrueValue.showConfigError = function (target) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!host || window.TrueValue.isConfigured) return;
    host.innerHTML = '<div class="notice error"><strong>Supabase is not configured.</strong><br>Open <code>assets/js/config.js</code> and add your Supabase project URL and public anon key.</div>';
  };

  window.TrueValue.formatINR = function (value) {
    if (value === null || value === undefined || value === "") return "";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
  };

  window.TrueValue.priceText = function (property) {
    return property.price_display === "request" || !property.price ? "Price on Request" : window.TrueValue.formatINR(property.price);
  };

  window.TrueValue.publicImageUrl = function (path) {
    if (!path || !window.TrueValue.supabase) return "";
    return window.TrueValue.supabase.storage.from(window.TrueValue.config.STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  window.TrueValue.whatsAppLink = function (message) {
    return "https://wa.me/" + window.TrueValue.config.WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message || "Hello True Value Realty, I would like to enquire about a property.");
  };

  window.TrueValue.propertyUrl = function (id) {
    return new URL("property.html?id=" + encodeURIComponent(id), window.location.href).href;
  };
})();
