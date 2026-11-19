/*
 * Página del atleta (§8 de CLAUDE.md). Sin frameworks ni build.
 * - El token viaja en location.hash: GitHub Pages nunca lo recibe.
 * - Todo texto del servidor se pinta con textContent (sin innerHTML con datos).
 * - Los POST van con Content-Type text/plain para evitar el preflight de CORS.
 */
(function () {
  'use strict';

  var API = (window.TUBICI_CONFIG || {}).apiUrl;
  var FORMATO_TOKEN = /^[A-Za-z0-9]{16}$/;
  var ZONA = 'America/Bogota';
  var MAX_DESCARGAS = 2; // fotos simultáneas (cada una ~200 KB en base64)

  var contenido = document.getElementById('contenido');
  var token = leerToken();

  // ------------------------------------------------------------------ API

  function ErrorApi(codigo, mensaje) {
    this.codigo = codigo;
    this.message = mensaje;
  }

  function leer(respuesta) {
    if (!respuesta.ok) throw new ErrorApi('HTTP_' + respuesta.status, 'Error de red');
    return respuesta.json().then(function (cuerpo) {
      if (!cuerpo || cuerpo.ok !== true) {
        var e = (cuerpo && cuerpo.error) || {};
        throw new ErrorApi(e.code || 'ERROR', e.message || 'Error del servidor');
      }
      return cuerpo.data;
    });
  }

  function apiGet(parametros) {
    var url = API + '?' + new URLSearchParams(parametros).toString();
    return fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }).then(leer);
  }

  function apiPost(cuerpo) {
    return fetch(API, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      // text/plain es una "petición simple": el navegador no hace preflight (Apps Script no lo soporta).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    }).then(leer);
  }

  // ------------------------------------------------------------------ Utilidades

  function leerToken() {
    var crudo = (location.hash || '').replace(/^#/, '');
    var t;
    try {
      t = decodeURIComponent(crudo).trim();
    } catch (e) {
      return null; // Link cortado o mal copiado (p. ej. "#%E0"): se trata como no válido.
    }
    return FORMATO_TOKEN.test(t) ? t : null;
  }

  function clonar(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
  }

  function mostrar(nodo, enfocar) {
    contenido.replaceChildren(nodo);
    contenido.setAttribute('aria-busy', 'false');
    if (enfocar) (nodo.querySelector('h1') || contenido).focus({ preventScroll: false });
  }

  function campo(raiz, nombre) {
    return raiz.querySelector('[data-campo="' + nombre + '"]');
  }

  function texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function fecha(iso, conHora) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var opciones = { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' };
    if (conHora) { opciones.hour = 'numeric'; opciones.minute = '2-digit'; }
    return new Intl.DateTimeFormat('es-CO', opciones).format(d);
  }

  function pesos(valor) {
    var n = Number(texto(valor).replace(/[^\d]/g, ''));
    if (!n) return texto(valor);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  }

  function llenarLista(dl, filas) {
    filas.forEach(function (f) {
      if (!texto(f[1])) return;
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = f[0];
      dd.textContent = texto(f[1]);
      dl.append(dt, dd);
    });
  }

  // ------------------------------------------------------------------ Estados

  function cargar() {
    contenido.setAttribute('aria-busy', 'true');
    if (!API || !token) return mostrar(clonar('t-no-valido'), true);
    apiGet({ action: 'verRegistro', t: token })
      .then(function (data) { mostrar(pintarRegistro(data), true); })
      .catch(function (e) {
        // Token inexistente o sin momento 1 cerrado: el servidor responde NO_ENCONTRADO, sin pistas.
        if (e instanceof ErrorApi && e.codigo === 'NO_ENCONTRADO') return mostrar(clonar('t-no-valido'), true);
        var nodo = clonar('t-error-red');
        nodo.querySelector('[data-accion="reintentar"]').addEventListener('click', cargar);
        mostrar(nodo, true);
      });
  }

  function pintarRegistro(d) {
    var a = d.atleta || {};
    var r = clonar('t-registro');

    campo(r, 'nombre').textContent = texto(a.nombre);
    var numero = campo(r, 'numero');
    numero.textContent = texto(d.numero);
    numero.parentElement.style.setProperty('--digitos', String(Math.max(texto(d.numero).length, 1)));
    var t = campo(r, 'fechaRecepcion');
    t.textContent = fecha(d.fechaRecepcion, false);
    t.dateTime = texto(d.fechaRecepcion);

    llenarLista(r.querySelector('[data-lista="bici"]'), [
      ['Marca', a.marca], ['Referencia', a.referencia], ['Tipo', a.tipo], ['Serial', a.serial],
      ['Color', a.color], ['Año', a.anio], ['Valor declarado', pesos(a.valor)], ['Observaciones', a.observaciones]
    ]);
    llenarLista(r.querySelector('[data-lista="persona"]'), [
      ['Nombre', a.nombre], ['Cédula', a.cedula], ['Celular', a.celular], ['Correo', a.correo], ['Equipo', a.equipo]
    ]);

    var fotos = Array.isArray(d.fotos) ? d.fotos : [];
    if (fotos.length) pintarFotos(r.querySelector('[data-lista="fotos"]'), fotos);
    else r.querySelector('[data-si="fotos"]').remove();

    if (texto(d.comentarios)) campo(r, 'comentarios').textContent = texto(d.comentarios);
    else r.querySelector('[data-si="comentarios"]').remove();

    campo(r, 'terminos').textContent = texto(d.terminos);

    var zona = r.querySelector('[data-zona="respuesta"]');
    if (d.aceptacion && d.aceptacion.aceptado) zona.append(pintarAceptado(d.aceptacion));
    else zona.append(pintarFormulario(zona, d.versionTyc));
    return r;
  }

  // ------------------------------------------------------------------ Fotos (carga diferida)

  var cola = [];
  var activas = 0;

  function encolar(tarea) {
    cola.push(tarea);
    siguiente();
  }

  function siguiente() {
    while (activas < MAX_DESCARGAS && cola.length) {
      activas++;
      cola.shift()().finally(function () { activas--; siguiente(); });
    }
  }

  function pintarFotos(ul, nombres) {
    var observador = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entradas) {
          entradas.forEach(function (e) {
            if (!e.isIntersecting) return;
            observador.unobserve(e.target);
            encolar(function () { return cargarFoto(e.target); });
          });
        }, { rootMargin: '200px 0px' })
      : null;

    nombres.forEach(function (nombre, i) {
      var li = document.createElement('li');
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'foto';
      boton.dataset.nombre = nombre;
      boton.disabled = true;
      boton.setAttribute('aria-label', 'Foto ' + (i + 1) + ' de ' + nombres.length + ' (' + nombre.replace(/\.jpg$/, '') + '), cargando');
      li.append(boton);
      ul.append(li);
      if (observador) observador.observe(boton);
      else encolar(function () { return cargarFoto(boton); });
    });
  }

  function cargarFoto(boton) {
    var nombre = boton.dataset.nombre;
    var etiqueta = boton.getAttribute('aria-label').replace(', cargando', '');
    return apiGet({ action: 'verFoto', t: token, f: nombre })
      .then(function (d) {
        var img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = 'data:' + (d.mime || 'image/jpeg') + ';base64,' + d.base64;
        boton.replaceChildren(img);
        boton.disabled = false;
        boton.classList.add('lista');
        boton.setAttribute('aria-label', etiqueta + ', ampliar');
        boton.addEventListener('click', function () { ampliar(img.src, etiqueta); });
      })
      .catch(function () {
        boton.classList.add('fallida');
        boton.textContent = 'No se pudo cargar';
        boton.disabled = false;
        boton.setAttribute('aria-label', etiqueta + ', no se pudo cargar. Tocar para reintentar');
        boton.addEventListener('click', function reintentar() {
          boton.removeEventListener('click', reintentar);
          boton.classList.remove('fallida');
          boton.textContent = '';
          boton.disabled = true;
          encolar(function () { return cargarFoto(boton); });
        });
      });
  }

  var visor = document.getElementById('visor');
  function ampliar(src, etiqueta) {
    var img = document.getElementById('visor-img');
    img.src = src;
    img.alt = etiqueta;
    if (typeof visor.showModal === 'function') visor.showModal();
  }
  visor.querySelector('[data-accion="cerrar"]').addEventListener('click', function () { visor.close(); });
  visor.addEventListener('click', function (e) { if (e.target === visor) visor.close(); });

  // ------------------------------------------------------------------ Aceptación

  var PREGUNTAS = [
    ['puestaAPunto', '¿Acepto que se realice una puesta a punto de Mi Bici?'],
    ['cascoZapatillas', '¿Acepto el transporte de mi casco y zapatillas?'],
    ['lavado', '¿Acepto que sea lavada mi Bici después del evento?']
  ];

  function pintarAceptado(ac) {
    var n = clonar('t-aceptado');
    var t = campo(n, 'fecha');
    t.textContent = fecha(ac.fecha, true);
    t.dateTime = texto(ac.fecha);
    // "11:47 p. m." ya termina en punto: no se agrega otro.
    if (/\.$/.test(t.textContent)) campo(n, 'punto').remove();
    var dl = n.querySelector('[data-lista="respuestas"]');
    llenarLista(dl, [['Acepto los términos y condiciones', ac.aceptaTerminos ? 'Sí' : 'No']].concat(
      PREGUNTAS.map(function (p) { return [p[1], ac[p[0]] ? 'Sí' : 'No']; })
    ));
    return n;
  }

  function pintarFormulario(zona, versionTyc) {
    var f = clonar('t-formulario');
    var boton = f.querySelector('button[type="submit"]');
    var errorEnvio = campo(f, 'errorEnvio');

    f.addEventListener('change', function (e) {
      // Al responder, se quita el error de esa pregunta.
      var nombre = e.target.name;
      var err = f.querySelector('#error-' + nombre);
      if (err) err.hidden = true;
      var grupo = e.target.closest('.pregunta, .casilla');
      if (grupo) grupo.classList.remove('con-error');
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEnvio.hidden = true;
      var respuestas = {};
      var primeroConError = null;

      var acepta = f.querySelector('#acepta');
      if (!acepta.checked) {
        f.querySelector('#error-acepta').hidden = false;
        acepta.closest('.casilla').classList.add('con-error');
        primeroConError = acepta;
      }
      PREGUNTAS.forEach(function (p) {
        var marcada = f.querySelector('input[name="' + p[0] + '"]:checked');
        if (marcada) { respuestas[p[0]] = marcada.value === 'si'; return; }
        f.querySelector('#error-' + p[0]).hidden = false;
        var grupo = f.querySelector('[data-pregunta="' + p[0] + '"]');
        grupo.classList.add('con-error');
        primeroConError = primeroConError || grupo.querySelector('input');
      });
      if (primeroConError) { primeroConError.focus(); return; }

      boton.disabled = true;
      boton.textContent = 'Enviando…';
      apiPost({
        action: 'aceptar',
        token: token,
        aceptaTerminos: true,
        puestaAPunto: respuestas.puestaAPunto,
        cascoZapatillas: respuestas.cascoZapatillas,
        lavado: respuestas.lavado,
        // Versión de los T&C que el atleta leyó: si cambiaron mientras tanto, el servidor lo rechaza.
        versionTyc: versionTyc
      })
        .then(function (ac) { terminar(zona, ac); })
        .catch(function (err) {
          if (err instanceof ErrorApi && err.codigo === 'YA_ACEPTADO') return cargar(); // otra pestaña ya aceptó
          if (err instanceof ErrorApi && err.codigo === 'TYC_CAMBIADO') {
            alert(err.message); // Los T&C se actualizaron: se recarga para mostrar el texto nuevo.
            return cargar();
          }
          errorEnvio.textContent = err instanceof ErrorApi && err.codigo === 'DATOS_INVALIDOS'
            ? err.message
            : 'No se pudo enviar tu aceptación. Revisa tu conexión y vuelve a intentarlo.';
          errorEnvio.hidden = false;
          boton.disabled = false;
          boton.textContent = 'Aceptar';
        });
    });
    return f;
  }

  function terminar(zona, ac) {
    var gracias = clonar('t-gracias');
    zona.replaceChildren(gracias, pintarAceptado(ac));
    gracias.focus();
    gracias.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  window.addEventListener('hashchange', function () { token = leerToken(); cargar(); });
  cargar();
})();
