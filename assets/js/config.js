// ============================================
// CONFIGURACIÓN DE LA ZENON — completar acá
// ============================================
// Este es el único archivo que necesitás editar para dejar
// el sitio funcionando con tus datos reales.

const CONFIG = {
  // Tu número de WhatsApp con código de país, SIN + ni espacios ni guiones.
  // Ejemplo Argentina Tucumán: 54 9 381 1234567  ->  "5493811234567"
  whatsappNumber: "5493811234567",

  // Datos de tu repo de GitHub donde vive products.json y las fotos.
  githubOwner: "ferialazaenon32",
  githubRepo: "catalogo_feria",
  githubBranch: "main",

  // Nombre y ubicación que se muestran en el cartel superior del catálogo.
  feriaNombre: "Feria La Zenon",
  feriaUbicacion: "San Miguel de Tucumán - Tucumán",
  feriaMensaje: "Ropa y objetos con historia, a precio de feria",

  // Hash SHA-256 de la contraseña del panel de administración.
  // NO pongas la contraseña en texto plano acá.
  // Para generar el hash: abrí admin.html, tocá "generar hash desde una
  // contraseña" en la pantalla de login la primera vez, o corré en la
  // consola del navegador:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('tuClave'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
  adminPasswordHash: "6f81c9631b92802c55dc98c5f2dce660d3773ff466010b2d51e33f8f07e39482",
};
