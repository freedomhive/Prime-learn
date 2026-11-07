(function () {
  const tv = window.TrueValue;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { properties: [], activeFilter: "All" };

  window.TV_REALTY_PHONE = "8275872736";
  window.TV_REALTY_WHATSAPP = "918275872736";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function priceText(property) {
    if (property.price_display === "request" || property.price === null || property.price === undefined || property.price === "") return "Price on request";
    const n = Number(property.price);
    if (!Number.isFinite(n)) return "Price on request";
    if (n >= 10000000) return "₹" + (n / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr";
    if (n >= 100000) return "₹" + (n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " L";
    return "₹" + n.toLocaleString("en-IN");
  }

  function imageUrl(path) {
    return path && tv.supabase ? tv.publicImageUrl(path) : "";
  }

  function place(p) {
    return [p.locality, p.city].filter(Boolean).join(", ") || p.location || "Nashik";
  }

  function card(p) {
    const img = imageUrl(p.cover_image_path);
    const badge = [p.property_type || "Property", p.transaction_type || "Sale"].join(" · ");
    const meta = [p.carpet_area ? `${p.carpet_area} ${p.area_unit || "sq. ft."}` : "", p.bedrooms ? `${p.bedrooms} bedrooms` : ""].filter(Boolean).join(" · ");
    return `<article class="property-card"><a href="property.html?id=${encodeURIComponent(p.id)}" aria-label="View ${esc(p.title)}"><div class="property-photo">${img ? `<img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy" onerror="this.style.display='none'">` : ""}<span class="property-badge">${esc(badge)}</span></div></a><div class="property-info"><h3>${esc(p.title)}</h3><p class="property-location">⌖ ${esc(place(p))}</p><div class="property-meta"><span class="property-price">${esc(priceText(p))}<small>${esc(meta || "Published listing")}</small></span><a class="property-arrow" href="property.html?id=${encodeURIComponent(p.id)}" aria-label="Property details">↗</a></div></div></article>`;
  }

  function currentFilters() {
    return {
      term: ($("#property-search")?.value || "").trim().toLowerCase(),
      transaction: $("#transaction-filter")?.value || "",
      min: Number($("#min-price")?.value || 0),
      max: Number($("#max-price")?.value || 0),
      sort: $("#sort-filter")?.value || "newest"
    };
  }

  function render() {
    const grid = $("#property-grid");
    if (!grid) return;
    const filters = currentFilters();
    let items = state.properties.filter((p) => {
      const searchable = [p.title, p.location, p.locality, p.city, p.description, p.property_type].join(" ").toLowerCase();
      const price = Number(p.price || 0);
      return (state.activeFilter === "All" || p.property_type === state.activeFilter)
        && (!filters.term || searchable.includes(filters.term))
        && (!filters.transaction || p.transaction_type === filters.transaction)
        && (!filters.min || price >= filters.min)
        && (!filters.max || price <= filters.max);
    });
    if (filters.sort === "price_asc") items = items.sort((a, b) => Number(a.price || Infinity) - Number(b.price || Infinity));
    else if (filters.sort === "price_desc") items = items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    else items = items.sort((a, b) => new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at));
    grid.innerHTML = items.length ? items.map(card).join("") : `<div class="empty-state"><span class="empty-icon">⌂</span><h3>${state.properties.length ? "No matching properties." : "Our listings are being prepared."}</h3><p>${state.properties.length ? "Try a different search or category." : "Published listings will appear here after Supabase is configured and properties are added through the admin panel."}</p><a class="button button-outline" href="index.html#contact">Enquire about a property</a></div>`;
  }

  function setupFilters() {
    $$(".filter-pill").forEach((button) => button.addEventListener("click", () => {
      $$(".filter-pill").forEach((x) => x.classList.toggle("active", x.dataset.filter === button.dataset.filter));
      state.activeFilter = button.dataset.filter || "All";
      render();
    }));
    ["#property-search", "#transaction-filter", "#min-price", "#max-price", "#sort-filter"].forEach((selector) => $(selector)?.addEventListener("input", render));
    $("#clear-filters")?.addEventListener("click", () => {
      ["#property-search", "#transaction-filter", "#min-price", "#max-price", "#sort-filter"].forEach((selector) => { const el = $(selector); if (el) el.value = selector === "#sort-filter" ? "newest" : ""; });
      state.activeFilter = "All";
      $$(".filter-pill").forEach((x) => x.classList.toggle("active", x.dataset.filter === "All"));
      render();
    });
    $$(".category-strip [data-category]").forEach((a) => a.addEventListener("click", () => {
      state.activeFilter = a.dataset.category || "All";
      $$(".filter-pill").forEach((x) => x.classList.toggle("active", x.dataset.filter === state.activeFilter));
      render();
    }));
  }

  async function loadProperties() {
    const grid = $("#property-grid");
    if (!grid) return;
    if (!tv.isConfigured) {
      tv.showConfigError(grid);
      return;
    }
    try {
      const { data, error } = await tv.supabase
        .from("properties")
        .select("id,title,description,property_type,transaction_type,price,price_display,location,locality,city,carpet_area,area_unit,bedrooms,cover_image_path,created_at,updated_at")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      state.properties = data || [];
      render();
    } catch (error) {
      grid.innerHTML = `<div class="empty-state"><h3>Listings are temporarily unavailable.</h3><p>${esc(error.message || "Unable to load published properties.")}</p></div>`;
    }
  }

  function setupChrome() {
    $("#year") && ($("#year").textContent = new Date().getFullYear());
    const toggle = $(".menu-toggle"), nav = $(".main-nav");
    toggle?.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$(".main-nav a").forEach((a) => a.addEventListener("click", () => {
      nav?.classList.remove("open");
      toggle?.setAttribute("aria-expanded", "false");
    }));
  }

  function setupLeadForm() {
    const leadForm = $("#lead-form");
    async function loadEnquiryProperties() {
      const select = $("#enquiry-property");
      if (!select || !tv.isConfigured) return;
      const { data } = await tv.supabase.from("properties").select("id,title,location").eq("status", "published").order("title").limit(200);
      (data || []).forEach((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = `${p.title}${p.location ? ` · ${p.location}` : ""}`;
        select.append(option);
      });
      const preselected = new URLSearchParams(location.search).get("property_id");
      if (preselected && [...select.options].some((x) => x.value === preselected)) select.value = preselected;
    }
    leadForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(leadForm);
      const name = String(data.get("name") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const category = String(data.get("category") || "Any property");
      const area = String(data.get("area") || "").trim();
      const button = leadForm.querySelector("button[type=submit]");
      const status = $("#form-message");
      if (!tv.isConfigured) { if (status) status.textContent = "Online enquiries are temporarily unavailable. Please call or WhatsApp our team."; return; }
      button.disabled = true;
      button.textContent = "Sending…";
      const { error } = await tv.supabase.functions.invoke("public-enquiry", { body: {
        name, phone, email: String(data.get("email") || "").trim(), interested_in: category,
        property_type: category === "Any property" ? "" : category, property_id: data.get("property_id") || null,
        preferred_location: area, message: String(data.get("message") || "").trim(), website: String(data.get("website") || "")
      } });
      button.disabled = false;
      button.innerHTML = 'Send enquiry <span>↗</span>';
      if (error) {
        if (status) status.textContent = error.message || "Could not save the enquiry. Please call or WhatsApp our team.";
        return;
      }
      if (status) status.textContent = "Thank you. Your enquiry has been received by our team.";
      leadForm.reset();
      const linked = new URLSearchParams(location.search).get("property_id");
      if (linked) $("#enquiry-property").value = linked;
    });
    loadEnquiryProperties();
  }

  setupChrome();
  setupFilters();
  setupLeadForm();
  loadProperties();
})();
