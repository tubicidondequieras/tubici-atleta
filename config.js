// Única configuración de la página: la URL /exec de la Web App de Apps Script.
// Es pública por diseño (el repositorio de esta carpeta es público). NUNCA pongas aquí la API_KEY:
// las acciones de esta página (verRegistro, verFoto, aceptar) solo usan el token del atleta.
window.TUBICI_CONFIG = Object.freeze({
  apiUrl: 'https://script.google.com/macros/s/AKfycbw4DLA8UtOkb7WsQx9Bk793sZmjCqRXPdK2U-8DLDMD-LdonUWQxEaFj4QndGqY5gOomQ/exec'
});
