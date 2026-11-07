(function () {
  const tv = window.TrueValue;
  const root = document.querySelector("#property-detail");
  const id = new URLSearchParams(location.search).get("id");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let images = [];
  let active = 0;

  function priceText(p) {
    if (p.price_display === "request" || p.price === null || p.price === undefined) return "Price on request";
    const n = Number(p.price);
    if (!Number.isFinite(n)) return "Price on request";
    if (n >= 10000000) return "₹" + (n / 10000000).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr";
    if (n >= 100000) return "₹" + (n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " L";
    return "₹" + n.toLocaleString("en-IN");
  }

  function imageUrl(path) {
    return path && tv.supabase ? tv.publicImageUrl(path) : "";
  }

  function spec(label, value) {
    return value ? `<span>${esc(value)}${label ? ` ${esc(label)}` : ""}</span>` : "";
  }

  function bindGallery() {
    document.querySelectorAll("[data-thumb]").forEach((button) => button.addEventListener("click", () => {
      active = Number(button.dataset.thumb);
      const main = document.querySelector(".detail-hero");
      if (main && images[active]) main.src = imageUrl(images[active].storage_path);
      document.querySelectorAll("[data-thumb]").forEach((x) => x.classList.toggle("active", x === button));
    }));
    document.querySelector(".detail-hero")?.addEventListener("click", () => {
      if (images[active]) window.open(imageUrl(images[active].storage_path), "_blank", "noopener");
    });
    document.querySelector("[data-copy-property]")?.addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(location.href);
      event.currentTarget.textContent = "Link copied";
    });
  }

  function render(p, imageRows) {
    images = imageRows.length ? imageRows : (p.cover_image_path ? [{ storage_path: p.cover_image_path, alt_text: p.title }] : []);
    const hero = images[0] ? imageUrl(images[0].storage_path) : "";
    const place = [p.locality, p.city, p.state].filter(Boolean).join(", ") || p.location || "Nashik";
    const area = p.carpet_area ? `${p.carpet_area} ${p.area_unit || "sq. ft."}` : "";
    const features = Array.isArray(p.features) ? p.features : [];
    const message = `Hello True Value Realty, I am enquiring about ${p.title}. ${location.href}`;
    const enquiryUrl = `index.html?property_id=${encodeURIComponent(p.id)}#contact`;
    document.title = `${p.title} | True Value Realty`;
    root.innerHTML = `<p class="eyebrow">PROPERTY DETAILS · ${esc(p.property_type || "PROPERTY")}</p><h1>${esc(p.title)}</h1><p class="property-location">⌖ ${esc(place)}</p>${hero ? `<img class="detail-hero" src="${esc(hero)}" alt="${esc(p.title)}">` : ""}${images.length > 1 ? `<div class="detail-thumbs">${images.map((img, i) => `<button class="${i === 0 ? "active" : ""}" data-thumb="${i}"><img src="${esc(imageUrl(img.storage_path))}" alt="${esc(img.alt_text || p.title)}"></button>`).join("")}</div>` : ""}<div class="detail-layout"><section><div class="detail-specs"><span>${esc(p.transaction_type || "Sale")}</span>${spec("", area)}${spec("bedrooms", p.bedrooms)}${spec("bathrooms", p.bathrooms)}${spec("", p.parking)}${spec("", p.furnishing_status)}</div><h2>About this property</h2><p class="detail-description">${esc(p.description || "Contact True Value Realty for current details about this property.")}</p>${features.length ? `<h3>Features</h3><div class="detail-specs">${features.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}<p class="listing-note">Confirm all property details, title/ownership, applicable approvals, pricing and availability independently before proceeding.</p></section><aside class="detail-card"><p class="eyebrow">ASKING PRICE</p><p class="property-price">${esc(priceText(p))}</p><p class="property-location">${esc(place)}</p><a class="button button-gold full-width" target="_blank" rel="noopener noreferrer" href="${tv.whatsAppLink(message)}">Enquire on WhatsApp ↗</a><a class="button button-outline full-width" style="margin-top:10px" href="${enquiryUrl}">Send enquiry to our team</a><a class="button button-outline full-width" style="margin-top:10px" href="tel:${tv.config.BUSINESS_PHONE}">Call about this property</a><button class="button button-outline full-width" style="margin-top:10px" data-copy-property type="button">Copy property link</button><p class="form-disclaimer">Your enquiry will include this property title and page link.</p></aside></div>`;
    bindGallery();
  }

  async function run() {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    if (!root) return;
    if (!id) {
      root.innerHTML = '<div class="empty-state"><h2>No property selected.</h2><a class="button button-outline" href="properties.html">Browse properties</a></div>';
      return;
    }
    if (!tv.isConfigured) {
      tv.showConfigError(root);
      return;
    }
    try {
      const { data: property, error } = await tv.supabase.from("properties").select("*").eq("id", id).eq("status", "published").single();
      if (error || !property) throw error || new Error("Listing unavailable");
      const { data: imageRows } = await tv.supabase.from("property_images").select("*").eq("property_id", id).order("sort_order");
      render(property, imageRows || []);
    } catch (error) {
      root.innerHTML = '<div class="empty-state"><h2>This listing is unavailable.</h2><p>It may have been removed or is no longer published.</p><a class="button button-outline" href="properties.html">Browse properties</a></div>';
    }
  }

  run();
})();
