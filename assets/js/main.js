// ============================================
// Catálogo público de La Zenon
// ============================================

const CATEGORIAS = [
  { id: "todos", label: "Todos", badge: "" },
  { id: "infantil", label: "Infantil", badge: "Infantil" },
  { id: "mujer-verano", label: "Mujer verano", badge: "Mujer verano" },
  { id: "mujer-invierno", label: "Mujer invierno", badge: "Mujer invierno" },
  { id: "hombre", label: "Hombre", badge: "Hombre" },
  { id: "accesorios", label: "Accesorios", badge: "Accesorios" },
  { id: "calzado", label: "Calzado", badge: "Calzado" },
  { id: "deco-bazar", label: "Deco / Bazar", badge: "Deco/Bazar" },
  { id: "ceramica-artesanal", label: "Cerámica artesanal outlet", badge: "Cerámica outlet" },
];

let TODOS_LOS_PRODUCTOS = [];
let categoriaActiva = "todos";
let busqueda = "";

// jsDelivr sirve el contenido "crudo" del repo público de GitHub como CDN
// gratuito, con caché global. Es más rápido y estable que pegarle directo
// a raw.githubusercontent.com para tráfico público.
function urlDatos() {
  const { githubOwner, githubRepo, githubBranch } = CONFIG;
  return `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${githubBranch}/data/products.json?t=${Date.now()}`;
}

function urlImagen(pathRelativo) {
  const { githubOwner, githubRepo, githubBranch } = CONFIG;
  return `https://cdn.jsdelivr.net/gh/${githubOwner}/${githubRepo}@${githubBranch}/${pathRelativo}`;
}

function formatoPrecio(n) {
  return "$ " + Number(n).toLocaleString("es-AR");
}

function linkWhatsapp(producto) {
  const msg = `Hola! Te escribo por "${producto.nombre}" (${formatoPrecio(producto.precio)}) que vi en el catálogo de La Zenon 💙`;
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

async function cargarProductos() {
  const grid = document.getElementById("grid");
  try {
    const res = await fetch(urlDatos(), { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo leer products.json");
    const data = await res.json();
    TODOS_LOS_PRODUCTOS = data.filter((p) => p.disponible !== false);
    TODOS_LOS_PRODUCTOS.sort((a, b) => (b.creado || "").localeCompare(a.creado || ""));
    render();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <p class="logo-word">uy...</p>
        <p>No pudimos cargar el catálogo todavía.<br>Si sos la admin: revisá que <code>config.js</code> tenga bien el usuario/repo de GitHub y que el repo sea público.</p>
      </div>`;
    console.error(err);
  }
}

function productosFiltrados() {
  return TODOS_LOS_PRODUCTOS.filter((p) => {
    const pasaCategoria = categoriaActiva === "todos" || p.categoria === categoriaActiva;
    const texto = (p.nombre + " " + (p.descripcion || "")).toLowerCase();
    const pasaBusqueda = busqueda.trim() === "" || texto.includes(busqueda.toLowerCase());
    return pasaCategoria && pasaBusqueda;
  });
}

function render() {
  renderChips();
  renderGrid();
}

function renderChips() {
  const cont = document.getElementById("chips");
  cont.innerHTML = "";
  CATEGORIAS.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (cat.id === categoriaActiva ? " active" : "");
    btn.textContent = cat.label;
    btn.setAttribute("aria-pressed", cat.id === categoriaActiva);
    btn.onclick = () => {
      categoriaActiva = cat.id;
      render();
    };
    cont.appendChild(btn);
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const items = productosFiltrados();

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p class="logo-word">nada por acá</p>
        <p>No encontramos prendas con ese filtro. Probá con otra categoría o borrá la búsqueda.</p>
      </div>`;
    return;
  }

  grid.innerHTML = items
    .map((p, i) => {
      const img = p.imagenes && p.imagenes[0] ? urlImagen(p.imagenes[0]) : "";
      const catBadge = CATEGORIAS.find((c) => c.id === p.categoria)?.badge || p.categoria;
      return `
        <article class="tag-card" tabindex="0" data-id="${p.id}">
          <div class="tag-hole"></div>
          <div class="tag-img-wrap">
            <span class="tag-badge">${catBadge}</span>
            ${img ? `<img loading="lazy" src="${img}" alt="${p.nombre}">` : ""}
          </div>
          <div class="tag-body">
            <p class="tag-nombre">${p.nombre}</p>
            <p class="tag-meta">${p.talle ? "Talle " + p.talle + " · " : ""}${p.estado || ""}</p>
            <p class="tag-precio">${formatoPrecio(p.precio)}</p>
            <a class="btn-wsp" href="${linkWhatsapp(p)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
              💬 Consultar
            </a>
          </div>
        </article>`;
    })
    .join("");

  grid.querySelectorAll(".tag-card").forEach((card) => {
    const abrir = () => abrirModal(card.dataset.id);
    card.addEventListener("click", abrir);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    });
  });
}

function abrirModal(id) {
  const p = TODOS_LOS_PRODUCTOS.find((x) => x.id === id);
  if (!p) return;
  const backdrop = document.getElementById("modal-backdrop");
  const imgs = (p.imagenes && p.imagenes.length ? p.imagenes : [])
    .map((src) => `<img src="${urlImagen(src)}" alt="${p.nombre}">`)
    .join("");
  const catLabel = CATEGORIAS.find((c) => c.id === p.categoria)?.label || p.categoria;

  document.getElementById("modal-content").innerHTML = `
    <button class="modal-close" aria-label="Cerrar" onclick="cerrarModal()">✕</button>
    <div class="modal-imgs">${imgs}</div>
    <div class="modal-body">
      <p class="tag-badge" style="position:static; display:inline-block; margin-bottom:8px;">${catLabel}</p>
      <p class="tag-nombre" style="font-size:1.15rem;">${p.nombre}</p>
      <p class="tag-meta">${p.talle ? "Talle " + p.talle + " · " : ""}${p.estado || ""}</p>
      <p class="tag-precio">${formatoPrecio(p.precio)}</p>
      <p class="modal-desc">${p.descripcion || ""}</p>
      <a class="btn-wsp-lg" href="${linkWhatsapp(p)}" target="_blank" rel="noopener">💬 Consultar por WhatsApp</a>
    </div>`;
  backdrop.classList.add("open");
  document.body.style.overflow = "hidden";
}

function cerrarModal() {
  document.getElementById("modal-backdrop").classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("feria-nombre").textContent = CONFIG.feriaNombre || "La Zenon";
  document.getElementById("feria-tagline").textContent = CONFIG.feriaMensaje || "";
  document.getElementById("feria-ubicacion").textContent = CONFIG.feriaUbicacion || "";

  document.getElementById("search").addEventListener("input", (e) => {
    busqueda = e.target.value;
    renderGrid();
  });

  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") cerrarModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });

  cargarProductos();
});
