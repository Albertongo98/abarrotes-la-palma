// Editor visual de La Palma.
// Cómo funciona: el token de GitHub vive cifrado en acceso.json; con usuario+contraseña se descifra en el navegador,
// se edita la página directamente (como Canva) y "Guardar" sube el nuevo index.html al repositorio.
// GitHub Actions publica el cambio en 1-2 minutos.
(() => {
  const REPO = 'Albertongo98/abarrotes-la-palma';
  const API = `https://api.github.com/repos/${REPO}/contents/`;
  const BLOQUE = '.sf-offer-card, .sf-dep, .sf-contact-item, .sf-timeline-item, li, .sf-gallery img, section, header, footer';
  const COLORES = { '--verde': 'Verde', '--verde-oscuro': 'Verde oscuro', '--crema': 'Crema', '--oro': 'Dorado', '--tinta': 'Texto' };

  let token, archivo, sha, sitio, sel, sucio = false;
  const historial = [];

  /* ── utilidades ── */
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const desdeB64 = (t) => Uint8Array.from(atob(t.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const texto = (t) => new TextEncoder().encode(t);

  async function gh(ruta, opciones = {}) {
    const r = await fetch(API + ruta, { ...opciones, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(r.status === 401 ? 'El permiso de GitHub venció o es inválido. Avísale a Alberto.' : `GitHub respondió ${r.status}`);
    return r.json();
  }
  async function subir(ruta, base64, mensaje, shaPrevio) {
    return gh(ruta, { method: 'PUT', body: JSON.stringify({ message: mensaje, content: base64, ...(shaPrevio && { sha: shaPrevio }) }) });
  }

  async function clave(usuario, pass, sal) {
    const base = await crypto.subtle.importKey('raw', texto(usuario.trim().toLowerCase() + ':' + pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function cifrar(usuario, pass, secreto) {
    const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await clave(usuario, pass, sal), texto(secreto)));
    return JSON.stringify({ sal: b64(sal), iv: b64(iv), datos: b64(datos) }, null, 2);
  }
  async function descifrar(usuario, pass, acceso) {
    const k = await clave(usuario, pass, desdeB64(acceso.sal));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: desdeB64(acceso.iv) }, k, desdeB64(acceso.datos)));
  }

  /* ── estilos del editor ── */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .ed-fondo{position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:9999;font-family:system-ui,sans-serif;padding:16px}
    .ed-caja{background:#fff;color:#1a2e1a;border-radius:16px;padding:24px;width:100%;max-width:380px;display:grid;gap:12px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
    .ed-caja h2{margin:0;font-size:1.3rem}.ed-caja p{margin:0;font-size:.85rem;color:#4a6350}
    .ed-caja input{padding:12px;border:1px solid #ccc;border-radius:10px;font-size:1rem;width:100%}
    .ed-caja button,.ed-barra button,.ed-barra label{padding:10px 14px;border:0;border-radius:10px;background:#2a5c35;color:#fff;font-size:.9rem;cursor:pointer;font-weight:600;white-space:nowrap}
    .ed-caja .ed-sec{background:#eee;color:#333}.ed-err{color:#c00!important}
    .ed-barra{position:fixed;left:0;right:0;bottom:0;z-index:9998;background:#15110a;padding:8px;display:flex;gap:6px;overflow-x:auto;font-family:system-ui,sans-serif;box-shadow:0 -4px 20px rgba(0,0,0,.3)}
    .ed-barra button,.ed-barra label{background:#333;display:inline-flex;align-items:center;gap:4px}
    .ed-barra .ed-guardar{background:#e8b923;color:#1a1406}.ed-barra .ed-sep{width:1px;background:#555;flex:0 0 1px}
    .ed-barra input[type=color]{width:28px;height:22px;border:0;padding:0;background:none}
    .ed-colores{position:fixed;bottom:60px;left:8px;z-index:9998;background:#fff;border-radius:12px;padding:12px;display:none;gap:8px;box-shadow:0 6px 30px rgba(0,0,0,.35);font:14px system-ui}
    .ed-colores label{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .ed-aviso{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:10000;background:#1a3820;color:#fff;padding:12px 18px;border-radius:12px;font:600 14px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:90vw}
    #sitio.editando{padding-bottom:70px}
    #sitio.editando *{cursor:text}#sitio.editando img,#sitio.editando video{cursor:pointer}
    #sitio.editando .ed-sel{outline:3px dashed #e8b923!important;outline-offset:3px}
    #sitio.editando [data-oculto]{display:revert!important;opacity:.35}
    #sitio.editando .sf-header{position:static}
  </style>`);

  function aviso(msg, ms = 3500) {
    const d = Object.assign(document.createElement('div'), { className: 'ed-aviso', textContent: msg });
    document.body.appendChild(d); setTimeout(() => d.remove(), ms);
  }
  function caja(html) {
    const f = Object.assign(document.createElement('div'), { className: 'ed-fondo' });
    f.innerHTML = `<form class="ed-caja">${html}</form>`;
    document.body.appendChild(f);
    return f;
  }

  /* ── 1. entrar ── */
  async function iniciar() {
    const r = await fetch('acceso.json?' + Date.now());
    if (!r.ok) return configurar();
    const acceso = await r.json();
    const f = caja(`<h2>✏️ Editar La Palma</h2><p>Escribe tu usuario y contraseña.</p>
      <input name="u" placeholder="Usuario" autocomplete="username" required>
      <input name="p" type="password" placeholder="Contraseña" autocomplete="current-password" required>
      <p class="ed-err"></p><button>Entrar</button><button type="button" class="ed-sec">Cancelar</button>`);
    f.querySelector('.ed-sec').onclick = salir;
    f.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const err = f.querySelector('.ed-err'); err.textContent = 'Revisando…';
      try { token = await descifrar(e.target.u.value, e.target.p.value, acceso); }
      catch { err.textContent = 'Usuario o contraseña incorrectos.'; return; }
      try { await cargarUltimaVersion(); } catch (x) { err.textContent = x.message; return; }
      f.remove(); editar();
    };
  }

  // Primera vez (o para cambiar el permiso): Alberto pega el token de GitHub y define usuario/contraseña.
  function configurar() {
    const f = caja(`<h2>🔧 Primera configuración</h2><p>Solo para el administrador. Pega el token de GitHub (fine-grained, permiso Contents: Read and write sobre este repositorio) y define el usuario y contraseña del editor.</p>
      <input name="t" placeholder="Token de GitHub (github_pat_…)" required>
      <input name="u" placeholder="Usuario para el editor" required>
      <input name="p" type="password" placeholder="Contraseña para el editor" minlength="10" required>
      <p class="ed-err"></p><button>Guardar acceso</button><button type="button" class="ed-sec">Cancelar</button>`);
    f.querySelector('.ed-sec').onclick = salir;
    f.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const err = f.querySelector('.ed-err'); err.textContent = 'Guardando…';
      try {
        token = e.target.t.value.trim();
        const previo = await gh('acceso.json').catch(() => null);
        await subir('acceso.json', b64(texto(await cifrar(e.target.u.value, e.target.p.value, token))), 'Configurar acceso del editor', previo?.sha);
        await cargarUltimaVersion();
        f.remove(); editar(); aviso('Acceso guardado ✓');
      } catch (x) { err.textContent = x.message; }
    };
  }

  // Lo publicado tarda en actualizarse; editamos siempre sobre lo último guardado en GitHub.
  async function cargarUltimaVersion() {
    const d = await gh('index.html?ref=main&t=' + Date.now());
    sha = d.sha;
    archivo = new TextDecoder().decode(desdeB64(d.content));
    const bloque = archivo.slice(archivo.indexOf('<!--SITIO-->') + 12, archivo.indexOf('<!--/SITIO-->'));
    document.getElementById('sitio').outerHTML = bloque.trim();
  }

  /* ── 2. editar ── */
  function editar() {
    sitio = document.getElementById('sitio');
    sitio.classList.add('editando');
    sitio.contentEditable = 'true';
    document.execCommand('styleWithCSS', false, true);

    sitio.addEventListener('click', (e) => {
      if (e.target.closest('a')) e.preventDefault();
      seleccionar(e.target);
    }, true);
    let ultimaTecla = 0;
    sitio.addEventListener('keydown', () => { if (Date.now() - ultimaTecla > 1500) marcar(); ultimaTecla = Date.now(); });
    addEventListener('beforeunload', (e) => { if (sucio) e.preventDefault(); });

    const barra = document.createElement('div');
    barra.className = 'ed-barra';
    barra.innerHTML = `
      <button data-a="guardar" class="ed-guardar">💾 Guardar</button>
      <button data-a="deshacer">↶ Deshacer</button><span class="ed-sep"></span>
      <button data-a="negrita"><b>B</b></button><button data-a="cursiva"><i>I</i></button>
      <button data-a="mas">A+</button><button data-a="menos">A−</button>
      <label>🖍 Texto <input type="color" data-a="color" value="#1a2e1a"></label>
      <label>🎨 Fondo <input type="color" data-a="fondo" value="#ffffff"></label>
      <button data-a="izq">⬅</button><button data-a="centro">⬌</button><span class="ed-sep"></span>
      <button data-a="imagen">🖼 Imagen</button><button data-a="enlace">🔗 Enlace</button><span class="ed-sep"></span>
      <button data-a="duplicar">⧉ Duplicar</button><button data-a="subir">↑ Subir</button><button data-a="bajar">↓ Bajar</button>
      <button data-a="ocultar">👁 Ocultar/mostrar</button><button data-a="borrar">🗑 Borrar</button><span class="ed-sep"></span>
      <button data-a="colores">🎨 Colores del sitio</button><button data-a="clave">🔑 Contraseña</button><button data-a="salir">✖ Salir</button>`;
    document.body.appendChild(barra);
    barra.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }); // conserva la selección de texto
    barra.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) acciones[b.dataset.a]?.(); });
    barra.addEventListener('change', (e) => acciones[e.target.dataset.a]?.(e.target.value));

    const panel = document.createElement('div');
    panel.className = 'ed-colores';
    panel.innerHTML = '<strong>Colores del sitio</strong>' + Object.entries(COLORES).map(([v, n]) =>
      `<label>${n} <input type="color" data-v="${v}" value="${sitio.style.getPropertyValue(v).trim()}"></label>`).join('');
    panel.addEventListener('input', (e) => { sitio.style.setProperty(e.target.dataset.v, e.target.value); sucio = true; });
    document.body.appendChild(panel);
    acciones.colores = () => { panel.style.display = panel.style.display === 'grid' ? 'none' : 'grid'; };

    aviso('Toca cualquier texto para escribir. Toca una imagen para cambiarla. Al terminar, presiona 💾 Guardar.', 6000);
  }

  function seleccionar(el) {
    sel?.classList.remove('ed-sel');
    sel = el === sitio ? null : el;
    sel?.classList.add('ed-sel');
  }
  const bloque = () => sel?.closest(BLOQUE);
  const haySeleccionDeTexto = () => !getSelection().isCollapsed && sitio.contains(getSelection().anchorNode);

  function marcar() {
    historial.push(sitio.innerHTML);
    if (historial.length > 60) historial.shift();
    sucio = true;
  }
  function necesita(el, que) { if (!el) aviso(`Primero toca ${que} en la página.`); return el; }

  const acciones = {
    negrita: () => { marcar(); document.execCommand('bold'); },
    cursiva: () => { marcar(); document.execCommand('italic'); },
    mas: () => tamano(1.12),
    menos: () => tamano(1 / 1.12),
    color: (c) => { if (!c) return; marcar(); haySeleccionDeTexto() ? document.execCommand('foreColor', false, c) : necesita(sel, 'un texto') && (sel.style.color = c); },
    fondo: (c) => { if (!c) return; const b = necesita(bloque(), 'una tarjeta o sección'); if (b) { marcar(); b.style.background = c; } },
    izq: () => alinear('left'),
    centro: () => alinear('center'),
    deshacer: () => { if (!historial.length) return aviso('No hay más cambios para deshacer.'); sitio.innerHTML = historial.pop(); sel = null; },
    duplicar: () => { const b = necesita(bloque(), 'una tarjeta'); if (b) { marcar(); b.after(b.cloneNode(true)); aviso('Duplicado ✓ (aparece justo después)'); } },
    subir: () => { const b = necesita(bloque(), 'una tarjeta'); if (b?.previousElementSibling) { marcar(); b.previousElementSibling.before(b); b.scrollIntoView({ block: 'center' }); } },
    bajar: () => { const b = necesita(bloque(), 'una tarjeta'); if (b?.nextElementSibling) { marcar(); b.nextElementSibling.after(b); b.scrollIntoView({ block: 'center' }); } },
    ocultar: () => { const b = necesita(bloque(), 'una tarjeta o sección'); if (b) { marcar(); b.toggleAttribute('data-oculto'); aviso(b.hasAttribute('data-oculto') ? 'Oculto: los visitantes no lo verán (aquí se ve transparente).' : 'Visible otra vez ✓'); } },
    borrar: () => { const b = necesita(bloque(), 'lo que quieres borrar'); if (b && confirm('¿Borrar lo seleccionado?')) { marcar(); b.remove(); sel = null; } },
    enlace: () => {
      const a = sel?.closest('a');
      const url = prompt('Dirección del enlace (ej. https://wa.me/52656…):', a?.getAttribute('href') || 'https://');
      if (!url) return;
      marcar();
      if (a) a.setAttribute('href', url);
      else if (haySeleccionDeTexto()) document.execCommand('createLink', false, url);
      else aviso('Selecciona con el dedo/mouse el texto que será enlace.');
    },
    imagen: elegirImagen,
    guardar,
    clave: cambiarClave,
    salir,
  };

  function tamano(f) {
    if (!necesita(sel, 'un texto')) return;
    marcar(); sel.style.fontSize = parseFloat(getComputedStyle(sel).fontSize) * f + 'px';
  }
  function alinear(a) { const el = necesita(sel, 'un texto'); if (el) { marcar(); el.style.textAlign = a; } }

  /* ── imágenes y videos ── */
  function elegirImagen() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,video/mp4' });
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      const esVideo = f.type.startsWith('video');
      if (f.size > 50e6) return aviso('Ese archivo pesa más de 50 MB, es demasiado grande.');
      aviso('Subiendo archivo…', 2500);
      try {
        const datos = esVideo ? new Uint8Array(await f.arrayBuffer()) : await reducir(f);
        const ruta = `${esVideo ? 'video' : 'img'}/subidas/${Date.now()}.${esVideo ? 'mp4' : 'jpg'}`;
        await subir(ruta, b64(datos), 'Subir ' + ruta);
        const local = URL.createObjectURL(new Blob([datos], { type: esVideo ? 'video/mp4' : 'image/jpeg' }));
        marcar();
        const destino = sel?.closest('img, video');
        if (destino && (destino.tagName === 'VIDEO') === esVideo) {
          destino.src = local; destino.dataset.ruta = ruta;
        } else if (sel?.tagName === 'SECTION' && !esVideo) {
          sel.style.background = `linear-gradient(rgba(10,10,6,.6), rgba(10,10,6,.75)), url('${local}') center / cover`;
          sel.dataset.fondo = ruta;
        } else {
          const nuevo = document.createElement(esVideo ? 'video' : 'img');
          Object.assign(nuevo, { src: local, alt: '' });
          if (esVideo) { nuevo.controls = true; nuevo.className = 'sf-video'; }
          nuevo.dataset.ruta = ruta;
          const lugar = sel?.closest('.sf-offer-img') || null;
          if (lugar) lugar.replaceChildren(nuevo);
          else if (sel) sel.after(nuevo);
          else return aviso('Primero toca dónde quieres poner la imagen.');
        }
        aviso('Listo ✓ Recuerda presionar 💾 Guardar.');
      } catch (x) { aviso('No se pudo subir: ' + x.message, 6000); }
    };
    input.click();
  }

  // Reduce fotos del celular (5-10 MB) a ~200 KB para que la página cargue rápido.
  async function reducir(f) {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ── 3. guardar ── */
  function htmlLimpio() {
    const c = sitio.cloneNode(true);
    c.removeAttribute('contenteditable'); c.classList.remove('editando');
    if (!c.className) c.removeAttribute('class');
    c.querySelectorAll('.ed-sel').forEach((el) => { el.classList.remove('ed-sel'); if (!el.className) el.removeAttribute('class'); });
    c.querySelectorAll('[data-ruta]').forEach((el) => { el.setAttribute('src', el.dataset.ruta); el.removeAttribute('data-ruta'); });
    c.querySelectorAll('[data-fondo]').forEach((el) => {
      el.style.background = `linear-gradient(rgba(10,10,6,.6), rgba(10,10,6,.75)), url('${el.dataset.fondo}') center / cover`;
      el.removeAttribute('data-fondo');
    });
    return c.outerHTML;
  }

  async function guardar() {
    aviso('Guardando…', 2000);
    try {
      const nuevo = archivo.slice(0, archivo.indexOf('<!--SITIO-->') + 12) + '\n' + htmlLimpio() + '\n' + archivo.slice(archivo.indexOf('<!--/SITIO-->'));
      const r = await subir('index.html', b64(texto(nuevo)), 'Cambios desde el editor', sha);
      sha = r.content.sha; archivo = nuevo; sucio = false;
      aviso('¡Guardado! ✓ La página pública se actualiza en 1 o 2 minutos.', 6000);
    } catch (x) {
      aviso(x.message.includes('409') ? 'Alguien más guardó cambios. Sal y vuelve a entrar para ver la última versión.' : 'No se pudo guardar: ' + x.message, 8000);
    }
  }

  function cambiarClave() {
    const f = caja(`<h2>🔑 Cambiar contraseña</h2>
      <input name="u" placeholder="Usuario" required>
      <input name="p" type="password" placeholder="Contraseña nueva (mínimo 10)" minlength="10" required>
      <p class="ed-err"></p><button>Guardar</button><button type="button" class="ed-sec">Cancelar</button>`);
    f.querySelector('.ed-sec').onclick = () => f.remove();
    f.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const previo = await gh('acceso.json');
        await subir('acceso.json', b64(texto(await cifrar(e.target.u.value, e.target.p.value, token))), 'Cambiar contraseña del editor', previo.sha);
        f.remove(); aviso('Contraseña cambiada ✓');
      } catch (x) { f.querySelector('.ed-err').textContent = x.message; }
    };
  }

  function salir() {
    if (sucio && !confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
    sucio = false;
    location.href = location.pathname;
  }

  iniciar();
})();
