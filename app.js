/*
 * Página del atleta (§8 de CLAUDE.md). Sin frameworks ni build.
 * - v1.1: debajo del M1 muestra cada momento CERRADO (2 a 4) con su aceptación; en el M2, la
 *   autorización de Aliados (Sí/No, sin valor por defecto); en el M4, la invitación a calificar en Google.
 *   Con un backend 1.0 (sin "momentos") la página se ve igual que antes.
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
  var POLITICA_LOCAL = 'privacidad/'; // misma página publicada junto a esta (si el servidor no manda el link)

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

  /** Solo enlaces https sin espacios ni comillas (vienen de la hoja «Aceptación»). */
  function linkSeguro(v) {
    var s = texto(v);
    return /^https:\/\/[^\s"'<>\\]+$/.test(s) ? s : null;
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

    // v1.1: momentos 2 a 4 cerrados, en el orden que manda el servidor.
    var politica = linkSeguro(d.linkPolitica) || POLITICA_LOCAL;
    document.getElementById('link-politica').href = politica;
    var zonaMomentos = r.querySelector('[data-zona="momentos"]');
    (Array.isArray(d.momentos) ? d.momentos : []).forEach(function (m) {
      if (m && [2, 3, 4].indexOf(m.momento) >= 0) zonaMomentos.append(pintarMomento(m, politica));
    });
    return r;
  }

  // ------------------------------------------------------------------ Momentos 2 a 4 (v1.1)

  function pintarMomento(m, politica) {
    var s = clonar('t-momento');
    var titulo = campo(s, 'titulo');
    titulo.id = 'momento-' + m.momento + '-titulo';
    titulo.textContent = texto(m.nombre);
    s.setAttribute('aria-labelledby', titulo.id);
    campo(s, 'n').textContent = String(m.momento);
    var t = campo(s, 'fecha');
    t.textContent = fecha(m.fecha, false);
    t.dateTime = texto(m.fecha);
    if (!t.textContent) t.parentElement.remove();

    if (texto(m.informativo)) campo(s, 'informativo').textContent = texto(m.informativo);
    else campo(s, 'informativo').remove();

    var fotos = Array.isArray(m.fotos) ? m.fotos : [];
    if (fotos.length) pintarFotos(s.querySelector('[data-lista="fotos"]'), fotos);
    else s.querySelector('[data-si="fotos"]').remove();

    if (texto(m.comentarios)) campo(s, 'comentarios').textContent = texto(m.comentarios);
    else s.querySelector('[data-si="comentarios"]').remove();

    var zona = s.querySelector('[data-zona="respuesta"]');
    if (m.estado && m.estado.aceptado) {
      zona.append(pintarAceptadoMomento(m, m.estado));
      var resena = pintarResena(m);
      if (resena) zona.append(resena);
    } else if (m.aceptacion && texto(m.aceptacion.texto)) {
      zona.append(pintarFormularioMomento(zona, m, politica));
    } else {
      zona.remove(); // Sin texto de aceptación en la hoja: solo se informa.
    }
    return s;
  }

  function pintarAceptadoMomento(m, est) {
    var n = clonar('t-aceptado-momento');
    var t = campo(n, 'fecha');
    t.textContent = fecha(est.fecha, true);
    t.dateTime = texto(est.fecha);
    if (/\.$/.test(t.textContent)) campo(n, 'punto').remove();
    var filas = [];
    if (m.aceptacion && texto(m.aceptacion.texto)) filas.push([texto(m.aceptacion.texto), 'Sí']);
    if (m.aliados && texto(m.aliados.texto) && (est.autorizaAliados === 'SI' || est.autorizaAliados === 'NO')) {
      filas.push([texto(m.aliados.texto), est.autorizaAliados === 'SI' ? 'Sí' : 'No']);
    }
    llenarLista(n.querySelector('[data-lista="respuestas"]'), filas);
    return n;
  }

  /** M4: invitación a calificar en Google para TODOS los que aceptan (sin filtrar por satisfacción). */
  function pintarResena(m) {
    var r = m.resenaGoogle;
    var link = r && linkSeguro(r.link);
    if (!link || !texto(r.texto)) return null;
    var n = clonar('t-resena');
    campo(n, 'texto').textContent = texto(r.texto);
    campo(n, 'link').href = link;
    return n;
  }

  function pintarFormularioMomento(zona, m, politica) {
    var f = clonar('t-form-momento');
    var sufijo = '-m' + m.momento;
    var boton = f.querySelector('button[type="submit"]');
    var errorEnvio = campo(f, 'errorEnvio');

    var casilla = f.querySelector('[data-control="acepta"]');
    var etiqueta = campo(f, 'textoAceptacion');
    var errAcepta = f.querySelector('[data-error="acepta"]');
    casilla.id = 'acepta' + sufijo;
    etiqueta.htmlFor = casilla.id;
    etiqueta.textContent = texto(m.aceptacion.texto);
    errAcepta.id = 'error-acepta' + sufijo;
    casilla.setAttribute('aria-describedby', errAcepta.id);

    // M2: pregunta SEPARADA de Aliados, Sí o No, ninguna marcada por defecto.
    var conAliados = !!(m.aliados && texto(m.aliados.texto));
    var grupo = f.querySelector('[data-pregunta="aliados"]');
    var errAliados = f.querySelector('[data-error="aliados"]');
    if (conAliados) {
      grupo.hidden = false;
      campo(f, 'textoAliados').textContent = texto(m.aliados.texto);
      campo(f, 'linkPolitica').href = politica;
      errAliados.id = 'error-aliados' + sufijo;
      grupo.setAttribute('aria-describedby', errAliados.id);
    } else {
      grupo.remove();
    }

    f.addEventListener('change', function (e) {
      var err = e.target.name === 'aliados' ? errAliados : (e.target === casilla ? errAcepta : null);
      if (err) err.hidden = true;
      var g = e.target.closest('.pregunta, .casilla');
      if (g) g.classList.remove('con-error');
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEnvio.hidden = true;
      var primero = null;
      if (!casilla.checked) {
        errAcepta.hidden = false;
        casilla.closest('.casilla').classList.add('con-error');
        primero = casilla;
      }
      var aliados = null;
      if (conAliados) {
        var marcada = f.querySelector('input[name="aliados"]:checked');
        if (marcada) aliados = marcada.value === 'si';
        else {
          errAliados.hidden = false;
          grupo.classList.add('con-error');
          primero = primero || grupo.querySelector('input');
        }
      }
      if (primero) { primero.focus(); return; }

      var cuerpo = {
        action: 'aceptarMomento',
        token: token,
        momento: m.momento,
        acepta: true,
        // Versión del texto que el atleta leyó: si cambió mientras tanto, el servidor lo rechaza.
        versionTexto: m.aceptacion.version
      };
      if (conAliados) {
        cuerpo.autorizaAliados = aliados;
        cuerpo.versionAliados = m.aliados.version;
      }
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      apiPost(cuerpo)
        .then(function (est) { terminarMomento(zona, m, est); })
        .catch(function (err) {
          var codigo = err instanceof ErrorApi ? err.codigo : '';
          if (codigo === 'YA_ACEPTADO') return cargar(); // otra pestaña ya aceptó
          if (codigo === 'TEXTO_CAMBIADO') {
            alert(err.message); // El texto se actualizó: se recarga para mostrar el nuevo.
            return cargar();
          }
          errorEnvio.textContent = codigo === 'DATOS_INVALIDOS' || codigo === 'MOMENTO_NO_CERRADO'
            ? err.message
            : 'No se pudo enviar tu confirmación. Revisa tu conexión y vuelve a intentarlo.';
          errorEnvio.hidden = false;
          boton.disabled = false;
          boton.textContent = 'Aceptar';
        });
    });
    return f;
  }

  function terminarMomento(zona, m, est) {
    var gracias = clonar('t-gracias-momento');
    campo(gracias, 'texto').textContent = texto(m.agradecimiento) || 'Gracias por confirmar.';
    var nodos = [gracias, pintarAceptadoMomento(m, est)];
    var resena = pintarResena(m);
    if (resena) nodos.push(resena);
    zona.replaceChildren.apply(zona, nodos);
    gracias.focus();
    gracias.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
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
