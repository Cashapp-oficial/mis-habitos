/*
  Mis hábitos: el movimiento. Las mismas técnicas que se eligieron para Porkie
  el 14/10/2026: encadenar, transformar, deslizar un renglón, reacomodar,
  deshacer con cuenta regresiva, el campo que dice que no, cambiar en su lugar
  y la luz que sigue al mouse.

  Reglas: menos de medio segundo, desplazamientos de 8 a 12 px, siempre la
  misma curva y sin rebotes. Con "movimiento reducido" todo cambia de golpe.
  Con ?lento en la dirección, todo va cuatro veces más lento, para mirarlo.
*/

var reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
export function quieto() { return reducido.matches; }
export var S = /[?&]lento\b/.test(location.search) ? 4 : 1;
export var CURVA = 'cubic-bezier(0.2, 0, 0, 1)';

export function animar(el, frames, ms, opts) {
  if (!el || quieto() || !el.animate) return null;
  return el.animate(frames, Object.assign({ duration: ms * S, easing: CURVA, fill: 'both' }, opts || {}));
}

/* Corre fn una sola vez: cuando termina la animación o, si la pantalla se
   redibujó en el medio y la animación murió, cuando se cumple el tiempo. */
function alTerminar(a, ms, fn) {
  var hecho = false;
  function una() { if (!hecho) { hecho = true; fn(); } }
  if (a) a.onfinish = una;
  setTimeout(una, a ? ms * S + 120 : 0);
}

/* ---------- Encadenar: las piezas entran solapadas, 60 ms entre una y otra ---------- */

export function encadenar(vista) {
  if (quieto() || !vista) return;
  var piezas = [];
  Array.prototype.forEach.call(vista.children, function (n) {
    if (n.hidden || !n.offsetHeight) return;
    if (n.hasAttribute('data-cadena')) {
      Array.prototype.forEach.call(n.children, function (m) { if (m.offsetHeight) piezas.push(m); });
    } else piezas.push(n);
  });
  piezas.slice(0, 9).forEach(function (p, i) {
    animar(p, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 320,
      { delay: i * 60 * S, fill: 'backwards' });
  });
}

/* ---------- Números que cuentan hasta el nuevo valor ---------- */

export function contar(el, de, a, fmt) {
  fmt = fmt || String;
  if (!el) return;
  if (quieto() || de === a || isNaN(de)) { el.textContent = fmt(a); return; }
  var t0 = performance.now(), d = 380 * S;
  el.textContent = fmt(de);
  requestAnimationFrame(function paso(t) {
    if (!el.isConnected) return;
    var p = Math.min(1, (t - t0) / d), k = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(de + (a - de) * k));
    if (p < 1) requestAnimationFrame(paso);
  });
}

/* ---------- Cambiar en su lugar: cada celda que cambió se reimprime ---------- */

export function foto(raiz, sel) {
  return Array.prototype.map.call(raiz.querySelectorAll(sel), function (n) { return n.className; });
}
export function cambiarEnSuLugar(raiz, sel, antes, cual) {
  if (quieto() || !antes) return;
  var j = 0;
  raiz.querySelectorAll(sel).forEach(function (n, i) {
    if (antes[i] === undefined || antes[i] === n.className) return;
    var blanco = cual ? n.querySelector(cual) : n;
    animar(blanco, [{ opacity: 0.25, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], 300,
      { delay: Math.min(j++, 24) * 12 * S, fill: 'backwards' });
  });
}

/* Un toque que se nota: lo que tocaste se hunde apenas y vuelve. */
export function latido(el) {
  animar(el, [{ transform: 'scale(0.86)' }, { transform: 'none' }], 240, { fill: 'none' });
}

/* El día completo: un anillo se abre una sola vez alrededor del número. */
export function anillo(sobre) {
  if (quieto() || !sobre) return;
  var a = document.createElement('span');
  a.className = 'anillo-dia';
  a.setAttribute('aria-hidden', 'true');
  sobre.appendChild(a);
  alTerminar(animar(a, [{ opacity: 0.9, transform: 'translate(-50%, -50%) scale(0.7)' },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' }], 480), 480, function () { a.remove(); });
}

/* ---------- Reacomodar: lo que cambia de lugar se desliza hasta el nuevo ---------- */

export function reacomodar(raiz, sel, clave, cambiar) {
  if (quieto()) { cambiar(); return; }
  var antes = {};
  raiz.querySelectorAll(sel).forEach(function (n) { antes[clave(n)] = n.getBoundingClientRect(); });
  cambiar();
  raiz.querySelectorAll(sel).forEach(function (n) {
    var a = antes[clave(n)], b = n.getBoundingClientRect();
    if (!a) {
      animar(n, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 280, { fill: 'backwards' });
      return;
    }
    var dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    animar(n, [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }], 380, { fill: 'none' });
  });
}

/* ---------- Borrar: se tacha, se cierra, y vuelve si tocás Deshacer ---------- */

export function tachar(fila, luego) {
  if (quieto() || !fila || !fila.isConnected) { luego(); return; }
  var cs = getComputedStyle(fila);
  var linea = document.createElement('span');
  linea.className = 'tachado';
  linea.setAttribute('aria-hidden', 'true');
  fila.classList.add('tachando');
  fila.appendChild(linea);
  alTerminar(animar(linea, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 180), 180, function () {
    alTerminar(animar(fila, [
      { height: fila.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 }
    ], 220), 220, luego);
  });
}

/* La fila que vuelve: se abre y el tachado se retira. */
export function reaparecer(fila) {
  if (quieto() || !fila) return;
  var cs = getComputedStyle(fila);
  var linea = document.createElement('span');
  linea.className = 'tachado';
  linea.setAttribute('aria-hidden', 'true');
  fila.classList.add('tachando');
  fila.appendChild(linea);
  alTerminar(animar(fila, [
    { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 },
    { height: fila.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 }
  ], 240, { fill: 'none' }), 240, function () {
    alTerminar(animar(linea, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], 200), 200, function () {
      linea.remove();
      fila.classList.remove('tachando');
    });
  });
}

var aviso = null, avisoAccion = null, avisoTimer = null;
function cerrarDeshacer() {
  clearTimeout(avisoTimer);
  avisoAccion = null;
  if (!aviso || aviso.hidden) return;
  var a = animar(aviso, [{ opacity: 1, transform: 'translate(-50%, 0)' }, { opacity: 0, transform: 'translate(-50%, 10px)' }], 160);
  alTerminar(a, 160, function () { aviso.hidden = true; if (a) a.cancel(); });
}
/* Abajo, "Borraste X · Deshacer", con una línea que se consume en 5 segundos. */
export function ofrecerDeshacer(texto, deshacer) {
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.className = 'deshacer';
    aviso.setAttribute('role', 'status');
    aviso.hidden = true;
    aviso.innerHTML = '<span class="deshacer-texto"></span><button type="button" class="deshacer-btn">Deshacer</button><i class="deshacer-linea" aria-hidden="true"></i>';
    document.body.appendChild(aviso);
    aviso.querySelector('button').addEventListener('click', function () {
      var f = avisoAccion;
      cerrarDeshacer();
      if (f) f();
    });
  }
  aviso.querySelector('.deshacer-texto').textContent = texto;
  avisoAccion = deshacer;
  aviso.getAnimations().forEach(function (a) { a.cancel(); });
  aviso.hidden = false;
  animar(aviso, [{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], 220, { fill: 'none' });
  var linea = aviso.querySelector('.deshacer-linea');
  linea.getAnimations().forEach(function (a) { a.cancel(); });
  animar(linea, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], 5000, { easing: 'linear' });
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(cerrarDeshacer, 5000 * S);
}

/* ---------- El campo dice que no ---------- */

export function rechazar(campo, mensaje) {
  var form = campo.closest('form');
  campo.classList.add('mal');
  campo.setAttribute('aria-invalid', 'true');
  var ayuda = form.querySelector('.ayuda-mal') || (form.nextElementSibling && form.nextElementSibling.classList.contains('ayuda-mal') ? form.nextElementSibling : null);
  if (!ayuda) {
    ayuda = document.createElement('p');
    ayuda.className = 'ayuda-mal';
    ayuda.id = (campo.id || 'campo') + '-mal';
    ayuda.setAttribute('aria-live', 'polite');
    if (form.classList.contains('add')) form.appendChild(ayuda); else form.insertAdjacentElement('afterend', ayuda);
    campo.setAttribute('aria-describedby', ayuda.id);
  }
  ayuda.textContent = mensaje;
  animar(campo, [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
    { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], 300, { easing: 'ease-out', fill: 'none' });
  animar(ayuda, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 220, { delay: 80 * S, fill: 'backwards' });
  campo.focus();
  campo.addEventListener('input', function limpiar() {
    campo.removeEventListener('input', limpiar);
    campo.classList.remove('mal');
    campo.removeAttribute('aria-invalid');
    campo.removeAttribute('aria-describedby');
    ayuda.remove();
  });
}

/* ---------- Deslizar un renglón ----------
   opciones(fila) devuelve { der, izq }, cada uno { texto, clase, hacer, sigue }.
   El renglón sigue al dedo; pasado el umbral, el rótulo se agranda para
   avisar que al soltar pasa. "sigue": no vuelve, se va (para borrar). */

var UMBRAL = 84;
export function deslizable(raiz, filaSel, opciones) {
  raiz.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var fila = e.target.closest(filaSel);
    if (!fila || !raiz.contains(fila) || e.target.closest('input, select, textarea')) return;
    var ops = opciones(fila);
    if (!ops) return;
    var x0 = e.clientX, y0 = e.clientY, dx = 0, px = 0, activo = false, id = e.pointerId, tira = null;

    function mover(ev) {
      if (ev.pointerId !== id) return;
      var mx = ev.clientX - x0, my = ev.clientY - y0;
      if (!activo) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { terminar(); return; }
        if (Math.abs(mx) < 10) return;
        activo = true;
        fila.classList.add('deslizando');
        try { fila.setPointerCapture(id); } catch (err) { /* ya soltó */ }
        tira = document.createElement('span');
        tira.setAttribute('aria-hidden', 'true');
        fila.appendChild(tira);
      }
      dx = mx;
      var op = dx > 0 ? ops.der : ops.izq, a = Math.abs(dx);
      var r = op ? (a > 130 ? 130 + (a - 130) * 0.25 : a) : Math.min(a * 0.25, 20);
      px = (dx < 0 ? -1 : 1) * r;
      fila.style.setProperty('--dx', px + 'px');
      tira.className = 'desliza-tira ' + (dx > 0 ? 'der ' : 'izq ') + (op ? op.clase : '') + (op && a >= UMBRAL ? ' listo' : '');
      tira.textContent = op ? op.texto : '';
      tira.style.width = Math.abs(px) + 'px';
    }
    function terminar(ev) {
      if (ev && ev.pointerId !== id) return;
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', terminar);
      document.removeEventListener('pointercancel', terminar);
      if (!activo) return;
      // Que el clic que llega al soltar no cuente como un toque.
      function tragar(c) { c.stopPropagation(); c.preventDefault(); }
      window.addEventListener('click', tragar, true);
      setTimeout(function () { window.removeEventListener('click', tragar, true); }, 60);
      var op = dx > 0 ? ops.der : ops.izq;
      var pasa = !!op && Math.abs(dx) >= UMBRAL && (!ev || ev.type === 'pointerup');
      if (pasa && op.sigue) { op.hacer(fila); return; }
      volver(fila, tira, px, pasa ? op.hacer : null);
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', terminar);
    document.addEventListener('pointercancel', terminar);
  });
}
/* Borrar deslizando: el renglón termina de irse hacia el costado y se cierra. */
export function salirDeCostado(fila, luego) {
  var tira = fila.querySelector('.desliza-tira');
  var desde = parseFloat(fila.style.getPropertyValue('--dx')) || 0, hasta = -fila.offsetWidth;
  var cs = getComputedStyle(fila), t0 = performance.now(), d = 180 * S;
  requestAnimationFrame(function paso(t) {
    var p = quieto() ? 1 : Math.min(1, (t - t0) / d), v = desde + (hasta - desde) * (1 - Math.pow(1 - p, 3));
    fila.style.setProperty('--dx', v + 'px');
    if (tira) tira.style.width = Math.abs(v) + 'px';
    if (p < 1) { requestAnimationFrame(paso); return; }
    alTerminar(animar(fila, [
      { height: fila.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px' }
    ], 200), 200, luego);
  });
}

function volver(fila, tira, desde, luego) {
  var t0 = performance.now(), d = 200 * S;
  requestAnimationFrame(function paso(t) {
    var p = quieto() ? 1 : Math.min(1, (t - t0) / d), v = desde * Math.pow(1 - p, 3);
    fila.style.setProperty('--dx', v + 'px');
    if (tira) tira.style.width = Math.abs(v) + 'px';
    if (p < 1) { requestAnimationFrame(paso); return; }
    fila.classList.remove('deslizando');
    fila.style.removeProperty('--dx');
    if (tira) tira.remove();
    if (luego) luego(fila);
  });
}

/* ---------- Transformar: la celda crece hasta ser la pantalla siguiente ---------- */

export function crecerHasta(el, alTapar) {
  if (quieto()) { alTapar(); return; }
  var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  var capa = document.createElement('div');
  capa.className = 'crece';
  capa.setAttribute('aria-hidden', 'true');
  document.body.appendChild(capa);
  var fondo = getComputedStyle(document.body).backgroundColor;
  var a = animar(capa, [
    { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: cs.borderRadius, backgroundColor: cs.backgroundColor },
    { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px', borderRadius: '0px', backgroundColor: fondo }
  ], 320);
  alTerminar(a, 320, function () {
    alTapar();
    alTerminar(animar(capa, [{ opacity: 1 }, { opacity: 0 }], 200), 200, function () { capa.remove(); });
  });
}

/* ---------- El ejemplo se escribe solo en el campo vacío ---------- */

export function ejemplosQueSeEscriben(buscar, frases, enFoco) {
  if (quieto()) return;
  var i = 0, j = 0, borrando = false;
  function tick() {
    var inp = buscar();
    if (!inp || !inp.offsetParent || inp.value) { j = 0; borrando = false; setTimeout(tick, 600); return; }
    if (document.activeElement === inp) { inp.placeholder = enFoco; j = 0; borrando = false; setTimeout(tick, 600); return; }
    var f = frases[i];
    if (!borrando) {
      j++;
      inp.placeholder = f.slice(0, j);
      if (j >= f.length) { borrando = true; setTimeout(tick, 1600 * S); return; }
      setTimeout(tick, (55 + Math.random() * 45) * S);
    } else {
      j--;
      inp.placeholder = f.slice(0, j) || ' ';
      if (j <= 0) { borrando = false; i = (i + 1) % frases.length; setTimeout(tick, 350 * S); return; }
      setTimeout(tick, 22 * S);
    }
  }
  tick();
}

/* ---------- La luz sigue al mouse sobre las tarjetas (solo en compu) ---------- */

export function luzQueSigue() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var actual = null, pendiente = null;
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    pendiente = e;
    requestAnimationFrame(function () {
      if (!pendiente) return;
      var ev = pendiente; pendiente = null;
      var v = ev.target.closest && ev.target.closest('.vidrio');
      if (actual && actual !== v) actual.classList.remove('luz');
      actual = v;
      if (!v) return;
      var r = v.getBoundingClientRect();
      v.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
      v.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      v.classList.add('luz');
    });
  }, { passive: true });
  document.addEventListener('pointerleave', function () { if (actual) actual.classList.remove('luz'); actual = null; });
}
