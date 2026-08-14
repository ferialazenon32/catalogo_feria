// ============================================
// Panel de administración de La Zenon
// ============================================
// Modelo de seguridad (importante, léelo):
// 1) La contraseña de esta pantalla es solo un filtro para que no cualquiera
//    que encuentre /admin.html empiece a toquetear. Se compara como hash
//    SHA-256, nunca queda en texto plano en el código.
// 2) La protección REAL es el token de GitHub (Personal Access Token).
//    Sin un token válido con permiso de escritura sobre TU repo, nadie puede
//    modificar el catálogo, aunque adivine la contraseña. El token nunca se
//    guarda en el código ni en el repo: vos lo pegás cada vez que entrás y
//    queda solo en la memoria de esta pestaña (sessionStorage), se borra
//    solo al cerrarla.
// 3) Generá el token en https://github.com/settings/tokens (fine-grained),
//    con acceso SOLO a este repositorio y permiso "Contents: Read and write".
//    No le des más permisos que esos.

const LS_INTENTOS = "laZenon_intentosFallidos";
const LS_BLOQUEO = "laZenon_bloqueadoHasta";
const SS_TOKEN = "laZenon_ghToken";

let productosAdmin = [];
let productosSha = null; // sha del blob products.json en GitHub, necesario para actualizar
let editandoId = null;
let seleccionados = new Set();

// ---------- utilidades ----------

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function apiBase() {
  return `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}`;
}

function headersGH() {
  const token = sessionStorage.getItem(SS_TOKEN);
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

function mostrarError(msg) {
  const el = document.getElementById("admin-error");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

// ---------- login por contraseña + bloqueo anti fuerza bruta ----------

function segundosDeBloqueo() {
  const hasta = Number(localStorage.getItem(LS_BLOQUEO) || 0);
  const restante = Math.ceil((hasta - Date.now()) / 1000);
  return restante > 0 ? restante : 0;
}

function registrarIntentoFallido() {
  const intentos = Number(localStorage.getItem(LS_INTENTOS) || 0) + 1;
  localStorage.setItem(LS_INTENTOS, String(intentos));
  if (intentos >= 5) {
    const bloqueoMs = Math.min(intentos - 4, 6) * 30 * 1000; // crece hasta 3 min
    localStorage.setItem(LS_BLOQUEO, String(Date.now() + bloqueoMs));
  }
}

function limpiarIntentos() {
  localStorage.removeItem(LS_INTENTOS);
  localStorage.removeItem(LS_BLOQUEO);
}

async function intentarLogin(e) {
  e.preventDefault();
  mostrarError("");

  const restante = segundosDeBloqueo();
  if (restante > 0) {
    mostrarError(`Demasiados intentos. Probá de nuevo en ${restante}s.`);
    return;
  }

  const pass = document.getElementById("login-pass").value;
  const token = document.getElementById("login-token").value.trim();

  if (!CONFIG.adminPasswordHash || CONFIG.adminPasswordHash === "REEMPLAZAR_CON_TU_HASH") {
    mostrarError("Todavía no configuraste adminPasswordHash en config.js.");
    return;
  }

  const hash = await sha256Hex(pass);
  if (hash !== CONFIG.adminPasswordHash) {
    registrarIntentoFallido();
    mostrarError("Contraseña incorrecta.");
    return;
  }
  if (!token) {
    mostrarError("Pegá tu GitHub token para poder guardar cambios.");
    return;
  }

  limpiarIntentos();
  sessionStorage.setItem(SS_TOKEN, token);
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-screen").style.display = "block";
  await cargarProductosAdmin();
}

function cerrarSesion() {
  sessionStorage.removeItem(SS_TOKEN);
  location.reload();
}

// ---------- generador de hash (ayuda para primera configuración) ----------

function toggleHashPanel() {
  const panel = document.getElementById("hash-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

async function generarHashDesdeInput() {
  const pass = document.getElementById("hash-input").value;
  if (!pass) return;
  const hash = await sha256Hex(pass);
  document.getElementById("hash-output").value = hash;
  document.getElementById("hash-resultado").style.display = "block";
}

// ---------- lectura/escritura contra la API de GitHub ----------

async function cargarProductosAdmin() {
  const cont = document.getElementById("admin-list");
  cont.innerHTML = "<p>Cargando catálogo…</p>";
  try {
    const res = await fetch(`${apiBase()}/contents/data/products.json?ref=${CONFIG.githubBranch}`, {
      headers: headersGH(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Token inválido o sin permisos sobre el repo.");
    }
    if (!res.ok) throw new Error("No se pudo leer products.json (¿existe en el repo?)");
    const data = await res.json();
    productosSha = data.sha;
    const jsonTexto = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
    productosAdmin = JSON.parse(jsonTexto);
    renderAdminList();
  } catch (err) {
    cont.innerHTML = `<p class="admin-err">⚠️ ${err.message}</p>`;
    console.error(err);
  }
}

async function guardarProductsJson(mensaje) {
  const contenido = base64Utf8(JSON.stringify(productosAdmin, null, 2));
  const res = await fetch(`${apiBase()}/contents/data/products.json`, {
    method: "PUT",
    headers: { ...headersGH(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: mensaje,
      content: contenido,
      sha: productosSha,
      branch: CONFIG.githubBranch,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Error al guardar en GitHub");
  }
  const data = await res.json();
  productosSha = data.content.sha;
  purgarCacheJsDelivr();
}

function purgarCacheJsDelivr() {
  const { githubOwner, githubRepo, githubBranch } = CONFIG;
  const url = `https://purge.jsdelivr.net/gh/${githubOwner}/${githubRepo}@${githubBranch}/data/products.json`;
  // "no-cors" porque solo nos interesa disparar la purga, no necesitamos leer la respuesta.
  fetch(url, { mode: "no-cors" }).catch(() => {
    // Si falla (sin conexión, bloqueo del navegador, etc.) no es grave: el
    // caché de todas formas expira solo en un par de horas.
  });
}

function resizeImagen(file, maxAncho = 1100, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onload = () => {
      const escala = Math.min(1, maxAncho / img.width);
      const w = Math.round(img.width * escala);
      const h = Math.round(img.height * escala);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", calidad).split(",")[1]); // base64 sin encabezado
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function subirImagen(file, nombreArchivo) {
  const base64 = await resizeImagen(file);
  const path = `images/${nombreArchivo}`;
  const res = await fetch(`${apiBase()}/contents/${path}`, {
    method: "PUT",
    headers: { ...headersGH(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Subir imagen ${nombreArchivo}`,
      content: base64,
      branch: CONFIG.githubBranch,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Error al subir la imagen");
  }
  return path;
}

// ---------- render del listado admin ----------

function renderAdminList() {
  const cont = document.getElementById("admin-list");
  const selectAll = document.getElementById("select-all-checkbox");
  if (productosAdmin.length === 0) {
    cont.innerHTML = "<p>No hay prendas cargadas todavía.</p>";
    selectAll.style.display = "none";
    actualizarBulkBar();
    return;
  }
  selectAll.style.display = "";
  cont.innerHTML = productosAdmin
    .map(
      (p) => `
      <div class="admin-row ${p.disponible === false ? "admin-row-oculto" : ""}">
        <input type="checkbox" class="admin-checkbox" data-id="${p.id}" ${seleccionados.has(p.id) ? "checked" : ""} onchange="toggleSeleccion('${p.id}', this.checked)">
        <img src="${urlImagenAdmin(p.imagenes && p.imagenes[0])}" alt="" class="admin-thumb">
        <div class="admin-row-info">
          <strong>${p.nombre}</strong>
          <span>${p.categoria} · $ ${Number(p.precio).toLocaleString("es-AR")}</span>
          ${p.disponible === false ? '<span class="admin-tag-oculto">Oculto</span>' : ""}
        </div>
        <div class="admin-row-actions">
          <button onclick="editarProducto('${p.id}')">Editar</button>
          <button onclick="toggleDisponible('${p.id}')">${p.disponible === false ? "Mostrar" : "Ocultar"}</button>
          <button class="danger" onclick="borrarProducto('${p.id}')">Borrar</button>
        </div>
      </div>`
    )
    .join("");
  actualizarBulkBar();
}

function toggleSeleccion(id, marcado) {
  if (marcado) seleccionados.add(id);
  else seleccionados.delete(id);
  actualizarBulkBar();
}

function toggleSeleccionarTodas() {
  const marcar = document.getElementById("select-all-checkbox").checked;
  seleccionados = marcar ? new Set(productosAdmin.map((p) => p.id)) : new Set();
  renderAdminList();
}

function actualizarBulkBar() {
  const bar = document.getElementById("bulk-bar");
  const count = document.getElementById("bulk-count");
  const selectAll = document.getElementById("select-all-checkbox");
  if (seleccionados.size > 0) {
    bar.style.display = "flex";
    count.textContent = `${seleccionados.size} seleccionada${seleccionados.size > 1 ? "s" : ""}`;
  } else {
    bar.style.display = "none";
  }
  selectAll.checked = productosAdmin.length > 0 && seleccionados.size === productosAdmin.length;
}

function cancelarSeleccion() {
  seleccionados.clear();
  renderAdminList();
}

async function accionMasiva(tipo) {
  if (seleccionados.size === 0) return;

  if (tipo === "borrar") {
    const nombres = productosAdmin
      .filter((p) => seleccionados.has(p.id))
      .map((p) => p.nombre)
      .join(", ");
    if (!confirm(`¿Borrar ${seleccionados.size} prenda(s)?\n\n${nombres}\n\nEsto no borra las fotos del repo, solo las fichas.`)) return;
    productosAdmin = productosAdmin.filter((p) => !seleccionados.has(p.id));
  } else if (tipo === "ocultar") {
    productosAdmin.forEach((p) => { if (seleccionados.has(p.id)) p.disponible = false; });
  } else if (tipo === "mostrar") {
    productosAdmin.forEach((p) => { if (seleccionados.has(p.id)) p.disponible = true; });
  }

  const cantidad = seleccionados.size;
  seleccionados.clear();
  await guardarConEstado(() => guardarProductsJson(`Acción masiva (${tipo}) sobre ${cantidad} prenda(s)`));
}

function urlImagenAdmin(pathRelativo) {
  if (!pathRelativo) return "";
  return `https://cdn.jsdelivr.net/gh/${CONFIG.githubOwner}/${CONFIG.githubRepo}@${CONFIG.githubBranch}/${pathRelativo}`;
}

// ---------- formulario alta / edición ----------

function abrirFormNuevo() {
  editandoId = null;
  document.getElementById("form-titulo").textContent = "Nueva prenda";
  document.getElementById("f-nombre").value = "";
  document.getElementById("f-categoria").value = "infantil";
  document.getElementById("f-precio").value = "";
  document.getElementById("f-talle").value = "";
  document.getElementById("f-estado").value = "Buen estado";
  document.getElementById("f-descripcion").value = "";
  document.getElementById("f-imagenes").value = "";
  document.getElementById("form-modal").classList.add("open");
}

function editarProducto(id) {
  const p = productosAdmin.find((x) => x.id === id);
  if (!p) return;
  editandoId = id;
  document.getElementById("form-titulo").textContent = "Editar prenda";
  document.getElementById("f-nombre").value = p.nombre;
  document.getElementById("f-categoria").value = p.categoria;
  document.getElementById("f-precio").value = p.precio;
  document.getElementById("f-talle").value = p.talle || "";
  document.getElementById("f-estado").value = p.estado || "";
  document.getElementById("f-descripcion").value = p.descripcion || "";
  document.getElementById("f-imagenes").value = "";
  document.getElementById("form-modal").classList.add("open");
}

function cerrarForm() {
  document.getElementById("form-modal").classList.remove("open");
}

async function toggleDisponible(id) {
  const p = productosAdmin.find((x) => x.id === id);
  if (!p) return;
  p.disponible = p.disponible === false ? true : false;
  await guardarConEstado(() => guardarProductsJson(`Actualizar visibilidad de ${p.nombre}`));
}

async function borrarProducto(id) {
  const p = productosAdmin.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`¿Borrar "${p.nombre}" del catálogo? Esto no borra las fotos del repo, solo la ficha.`)) return;
  productosAdmin = productosAdmin.filter((x) => x.id !== id);
  await guardarConEstado(() => guardarProductsJson(`Borrar ${p.nombre}`));
}

async function guardarConEstado(fn) {
  const cont = document.getElementById("admin-list");
  try {
    await fn();
    renderAdminList();
  } catch (err) {
    alert("Error: " + err.message);
    console.error(err);
    await cargarProductosAdmin();
  }
}

async function guardarForm(e) {
  e.preventDefault();
  const btn = document.getElementById("form-submit");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const nombre = document.getElementById("f-nombre").value.trim();
    const categoria = document.getElementById("f-categoria").value;
    const precio = Number(document.getElementById("f-precio").value);
    const talle = document.getElementById("f-talle").value.trim();
    const estado = document.getElementById("f-estado").value.trim();
    const descripcion = document.getElementById("f-descripcion").value.trim();
    const archivos = document.getElementById("f-imagenes").files;

    if (!nombre || !precio) throw new Error("Completá al menos nombre y precio.");

    let id = editandoId;
    let imagenes = [];

    if (editandoId) {
      const existente = productosAdmin.find((x) => x.id === editandoId);
      imagenes = existente.imagenes || [];
    } else {
      id = "p" + Date.now();
    }

    if (archivos.length > 0) {
      const nuevas = [];
      for (let i = 0; i < archivos.length; i++) {
        const ext = archivos[i].name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const nombreArchivo = `${id}-${Date.now()}-${i}.${ext}`;
        const path = await subirImagen(archivos[i], nombreArchivo);
        nuevas.push(path);
      }
      imagenes = editandoId ? [...imagenes, ...nuevas] : nuevas;
    }

    const producto = {
      id,
      nombre,
      categoria,
      precio,
      talle,
      estado,
      descripcion,
      imagenes,
      disponible: editandoId ? productosAdmin.find((x) => x.id === editandoId).disponible !== false : true,
      creado: editandoId
        ? productosAdmin.find((x) => x.id === editandoId).creado
        : new Date().toISOString(),
    };

    if (editandoId) {
      productosAdmin = productosAdmin.map((x) => (x.id === editandoId ? producto : x));
    } else {
      productosAdmin.push(producto);
    }

    await guardarProductsJson(editandoId ? `Editar ${nombre}` : `Agregar ${nombre}`);
    renderAdminList();
    cerrarForm();
  } catch (err) {
    alert("Error: " + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-form").addEventListener("submit", intentarLogin);
  document.getElementById("logout-btn").addEventListener("click", cerrarSesion);
  document.getElementById("nuevo-btn").addEventListener("click", abrirFormNuevo);
  document.getElementById("producto-form").addEventListener("submit", guardarForm);
  document.getElementById("form-cancel").addEventListener("click", cerrarForm);
  document.getElementById("hash-helper").addEventListener("click", toggleHashPanel);
  document.getElementById("hash-generar-btn").addEventListener("click", generarHashDesdeInput);
  document.getElementById("select-all-checkbox").addEventListener("change", toggleSeleccionarTodas);
  document.getElementById("bulk-ocultar").addEventListener("click", () => accionMasiva("ocultar"));
  document.getElementById("bulk-mostrar").addEventListener("click", () => accionMasiva("mostrar"));
  document.getElementById("bulk-borrar").addEventListener("click", () => accionMasiva("borrar"));
  document.getElementById("bulk-cancelar").addEventListener("click", cancelarSeleccion);

  const restante = segundosDeBloqueo();
  if (restante > 0) mostrarError(`Demasiados intentos. Probá de nuevo en ${restante}s.`);

  // si ya había un token en esta pestaña (no se cerró), evita pedir todo de nuevo
  if (sessionStorage.getItem(SS_TOKEN)) {
    document.getElementById("login-token").value = "(ya cargado en esta pestaña)";
  }
});
