(function () {
  const tv = window.TrueValue;
  const $ = (s) => document.querySelector(s);
  const state = { user: null, properties: [], editingId: "", selectedFiles: [], existingImages: [], deletedImages: [], coverIndex: 0 };
  const form = $("#property-form");
  const msg = $("#admin-message");
  const list = $("#admin-properties");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function message(text) {
    if (msg) msg.textContent = text || "";
  }

  function money(p) {
    if (p.price_display === "request" || p.price === null || p.price === undefined || p.price === "") return "Price on request";
    return Number(p.price).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  }

  function numberOrNull(fd, key) {
    const value = fd.get(key);
    return value === "" || value === null ? null : Number(value);
  }

  function collect() {
    const fd = new FormData(form);
    return {
      title: String(fd.get("title") || "").trim(),
      slug: String(fd.get("slug") || "").trim() || null,
      description: String(fd.get("description") || "").trim() || null,
      property_type: String(fd.get("property_type") || ""),
      transaction_type: String(fd.get("transaction_type") || "Sale"),
      price: numberOrNull(fd, "price"),
      price_display: String(fd.get("price_display") || "exact"),
      location: String(fd.get("location") || "").trim(),
      locality: String(fd.get("locality") || "").trim() || null,
      city: String(fd.get("city") || "Nashik").trim() || "Nashik",
      state: String(fd.get("state") || "Maharashtra").trim() || "Maharashtra",
      pin_code: String(fd.get("pin_code") || "").trim() || null,
      carpet_area: numberOrNull(fd, "carpet_area"),
      built_up_area: numberOrNull(fd, "built_up_area"),
      plot_area: numberOrNull(fd, "plot_area"),
      area_unit: String(fd.get("area_unit") || "sq. ft."),
      bedrooms: numberOrNull(fd, "bedrooms"),
      bathrooms: numberOrNull(fd, "bathrooms"),
      parking: String(fd.get("parking") || "").trim() || null,
      furnishing_status: String(fd.get("furnishing_status") || "") || null,
      features: String(fd.get("features") || "").split(",").map((x) => x.trim()).filter(Boolean),
      featured: fd.get("featured") === "on",
      status: String(fd.get("status") || "draft")
    };
  }

  function validate(data) {
    if (!form.elements.authorised.checked) return "Confirm that the listing and photos are accurate and authorised.";
    if (!data.title || !data.property_type || !data.transaction_type || !data.location) return "Complete the title, type, listing type, and location.";
    if (data.price_display === "exact" && (data.price === null || !Number.isFinite(data.price) || data.price < 0)) return "Enter a valid non-negative price or choose Price on request.";
    return "";
  }

  async function requireAdmin() {
    if (!tv.isConfigured) {
      $("#admin-root").innerHTML = '<div class="empty-state"><h2>Supabase is not configured.</h2><p>Update assets/js/config.js first.</p></div>';
      return false;
    }
    const { data } = await tv.supabase.auth.getSession();
    if (!data.session) {
      location.href = "login.html";
      return false;
    }
    state.user = data.session.user;
    const { data: admin, error } = await tv.supabase.from("admin_users").select("user_id,role,is_active").eq("user_id", state.user.id).maybeSingle();
    if (error || !admin || admin.is_active === false || (admin.role && !["owner", "manager"].includes(admin.role))) {
      await tv.supabase.auth.signOut();
      $("#admin-root").innerHTML = '<div class="empty-state"><h2>Not authorised.</h2><p>This account is not active or does not have property management access.</p><a class="button button-outline" href="index.html">Open CRM</a></div>';
      return false;
    }
    const header = document.querySelector(".site-header");
    if (header && !header.querySelector("[data-crm-link]")) {
      const link = document.createElement("a");
      link.href = "index.html";
      link.className = "button button-outline";
      link.dataset.crmLink = "true";
      link.textContent = "CRM dashboard";
      header.prepend(link);
    }
    return true;
  }

  function renderOverview() {
    const box = $("#admin-overview");
    if (!box) return;
    const count = (status) => state.properties.filter((p) => p.status === status).length;
    box.innerHTML = `<span>Total <strong>${state.properties.length}</strong></span><span>Published <strong>${count("published")}</strong></span><span>Draft <strong>${count("draft")}</strong></span><span>Archived <strong>${count("archived")}</strong></span>`;
  }

  function filtered() {
    const q = ($("#admin-search")?.value || "").toLowerCase();
    const status = $("#admin-status")?.value || "";
    return state.properties.filter((p) => {
      const haystack = [p.title, p.location, p.locality, p.city, p.property_type].join(" ").toLowerCase();
      return (!q || haystack.includes(q)) && (!status || p.status === status);
    });
  }

  function render() {
    renderOverview();
    const rows = filtered();
    list.innerHTML = rows.length ? rows.map((p) => `<article class="admin-property-row"><div><h3>${esc(p.title)}</h3><p>${esc(p.location || p.locality || "")} · ${esc(money(p))}</p><span class="status-chip">${esc(p.status)}</span>${p.featured ? '<span class="status-chip">featured</span>' : ""}</div><div class="row-actions"><button class="small-button" data-edit="${esc(p.id)}">Edit</button><button class="small-button" data-status="${esc(p.id)}" data-next="${p.status === "published" ? "draft" : "published"}">${p.status === "published" ? "Unpublish" : "Publish"}</button><button class="small-button" data-status="${esc(p.id)}" data-next="archived">Archive</button><button class="small-button danger" data-delete="${esc(p.id)}">Delete</button>${p.status === "published" ? `<a class="small-button" target="_blank" href="../property.html?id=${esc(p.id)}">Open</a>` : ""}</div></article>`).join("") : '<p class="muted">No properties match this view.</p>';
  }

  async function load() {
    list.innerHTML = '<p class="muted">Loading...</p>';
    const { data, error } = await tv.supabase.from("properties").select("*").order("updated_at", { ascending: false });
    if (error) {
      list.innerHTML = '<p class="muted">Could not load properties. Check admin authorisation and RLS policies.</p>';
      return;
    }
    state.properties = data || [];
    render();
  }

  function reset() {
    state.editingId = "";
    state.selectedFiles = [];
    state.existingImages = [];
    state.deletedImages = [];
    state.coverIndex = 0;
    form.reset();
    form.elements.city.value = "Nashik";
    form.elements.state.value = "Maharashtra";
    form.elements.area_unit.value = "sq. ft.";
    form.elements.status.value = "draft";
    $("#editor-title").textContent = "Add a property";
    renderImages();
    message("");
  }

  function fillForm(p) {
    reset();
    state.editingId = p.id;
    form.elements.id.value = p.id;
    Object.entries(p).forEach(([key, value]) => {
      const input = form.elements[key];
      if (!input) return;
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
    });
    $("#editor-title").textContent = "Edit property";
  }

  async function edit(id) {
    const p = state.properties.find((x) => x.id === id);
    if (!p) return;
    fillForm(p);
    const { data } = await tv.supabase.from("property_images").select("*").eq("property_id", id).order("sort_order");
    state.existingImages = data || [];
    const cover = state.existingImages.findIndex((img) => img.is_cover);
    state.coverIndex = cover >= 0 ? cover : 0;
    renderImages();
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderImages() {
    const box = $("#image-preview");
    if (!box) return;
    const existing = state.existingImages.map((img, index) => ({ kind: "existing", index, src: tv.publicImageUrl(img.storage_path), name: img.alt_text || "Property image" }));
    const selected = state.selectedFiles.map((file, index) => ({ kind: "new", index, src: URL.createObjectURL(file), name: file.name }));
    const all = existing.concat(selected);
    box.innerHTML = all.length ? all.map((img, i) => `<div class="image-chip"><img src="${esc(img.src)}" alt="${esc(img.name)}"><label><input type="radio" name="cover_choice" value="${i}" ${i === state.coverIndex ? "checked" : ""}> Cover</label><button type="button" data-remove-image="${img.kind}:${img.index}">Remove</button></div>`).join("") : '<p class="muted">No images selected yet.</p>';
  }

  function addFiles(files) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const max = 6 * 1024 * 1024;
    [...files].forEach((file) => {
      if (!allowed.includes(file.type)) return message(`${file.name} is not a supported image type.`);
      if (file.size > max) return message(`${file.name} is larger than 6 MB.`);
      state.selectedFiles.push(file);
    });
    renderImages();
  }

  async function uploadImages(propertyId, title) {
    const rows = [];
    for (let i = 0; i < state.selectedFiles.length; i += 1) {
      const file = state.selectedFiles[i];
      message(`Uploading ${file.name}...`);
      const ext = file.name.split(".").pop().toLowerCase();
      const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await tv.supabase.storage.from(tv.config.STORAGE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw new Error(`Image upload failed for ${file.name}: ${error.message}`);
      rows.push({ property_id: propertyId, storage_path: path, alt_text: title, sort_order: state.existingImages.length + i });
    }
    if (rows.length) {
      const { error } = await tv.supabase.from("property_images").insert(rows);
      if (error) throw error;
    }
  }

  async function syncImages(propertyId, title) {
    for (const img of state.deletedImages) {
      await tv.supabase.from("property_images").delete().eq("id", img.id);
      await tv.supabase.storage.from(tv.config.STORAGE_BUCKET).remove([img.storage_path]);
    }
    await uploadImages(propertyId, title);
    const { data: imgs } = await tv.supabase.from("property_images").select("*").eq("property_id", propertyId).order("sort_order");
    if (!imgs?.length) {
      await tv.supabase.from("properties").update({ cover_image_path: null }).eq("id", propertyId);
      return;
    }
    const chosen = imgs[Math.min(state.coverIndex, imgs.length - 1)] || imgs[0];
    await tv.supabase.from("property_images").update({ is_cover: false }).eq("property_id", propertyId);
    await tv.supabase.from("property_images").update({ is_cover: true }).eq("id", chosen.id);
    await tv.supabase.from("properties").update({ cover_image_path: chosen.storage_path }).eq("id", propertyId);
  }

  async function save(event) {
    event.preventDefault();
    message("");
    const data = collect();
    const validation = validate(data);
    if (validation) return message(validation);
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      let id = state.editingId;
      if (id) {
        const { error } = await tv.supabase.from("properties").update(data).eq("id", id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await tv.supabase.from("properties").insert(data).select("id").single();
        if (error) throw error;
        id = inserted.id;
      }
      await syncImages(id, data.title);
      message("Property saved.");
      reset();
      await load();
    } catch (error) {
      message(error.message || "Save failed. Check your admin access and Supabase policies.");
    } finally {
      button.disabled = false;
      button.textContent = "Save property";
    }
  }

  async function changeStatus(id, status) {
    const { error } = await tv.supabase.from("properties").update({ status }).eq("id", id);
    if (error) return message(error.message);
    await load();
  }

  async function remove(id) {
    if (!confirm("Delete this property and its uploaded image files? This cannot be undone.")) return;
    const { data: imgs } = await tv.supabase.from("property_images").select("storage_path").eq("property_id", id);
    if (imgs?.length) await tv.supabase.storage.from(tv.config.STORAGE_BUCKET).remove(imgs.map((x) => x.storage_path));
    const { error } = await tv.supabase.from("properties").delete().eq("id", id);
    if (error) return message(error.message);
    await load();
  }

  function bind() {
    form.addEventListener("submit", save);
    $("#reset-form-button")?.addEventListener("click", reset);
    $("#refresh-list")?.addEventListener("click", load);
    $("#logout-button")?.addEventListener("click", async () => { await tv.supabase.auth.signOut(); location.href = "login.html"; });
    $("#images")?.addEventListener("change", (event) => addFiles(event.target.files));
    $("#admin-search")?.addEventListener("input", render);
    $("#admin-status")?.addEventListener("input", render);
    document.addEventListener("change", (event) => {
      if (event.target.name === "cover_choice") state.coverIndex = Number(event.target.value);
    });
    document.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit]");
      const deleteButton = event.target.closest("[data-delete]");
      const statusButton = event.target.closest("[data-status]");
      const removeButton = event.target.closest("[data-remove-image]");
      if (editButton) edit(editButton.dataset.edit);
      if (deleteButton) remove(deleteButton.dataset.delete);
      if (statusButton) changeStatus(statusButton.dataset.status, statusButton.dataset.next);
      if (removeButton) {
        const [kind, raw] = removeButton.dataset.removeImage.split(":");
        const index = Number(raw);
        if (kind === "existing") state.deletedImages.push(...state.existingImages.splice(index, 1));
        else state.selectedFiles.splice(index, 1);
        state.coverIndex = 0;
        renderImages();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const ok = await requireAdmin();
    if (!ok) return;
    bind();
    reset();
    load();
  });
})();
