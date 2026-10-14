/*
  Redibujar sin reemplazar. Las vistas arman su HTML entero, como siempre, y
  pintar() lo compara con lo que ya hay en pantalla: solo cambia lo distinto.
  Así lo que queda en su lugar puede pasar de un estado al otro (los colores y
  las barras con transiciones de CSS, los números rodando o contando) en vez
  de borrarse y aparecer de golpe.

  - data-key: el mismo renglón aunque cambie de lugar (hábitos, pendientes).
  - data-num: un número; al cambiar, rueda o cuenta hasta el nuevo valor.
  - Las clases que pone el movimiento (luz, deslizando, tachando) se respetan.
*/

import { numeroHasta } from './movimiento.js';

var PROPIAS = ['luz', 'deslizando', 'tachando'];

export function pintar(caja, html) {
  var t = document.createElement('template');
  t.innerHTML = html;
  hijos(caja, t.content);
}

function clave(n) { return n.nodeType === 1 ? n.getAttribute('data-key') : null; }
function mismo(a, b) { return a.nodeType === b.nodeType && a.nodeName === b.nodeName && !clave(a) && !clave(b); }

/* Sin clave, se busca desde esa posición en adelante una pieza del mismo tipo
   y la misma clase: si apareció o desapareció algo antes (un renglón que un mes
   tiene y otro no), lo que sigue se encuentra igual en vez de reemplazarse. */
function parecido(de, i, nn) {
  var ref = de.childNodes[i] || null;
  for (var n = ref; n; n = n.nextSibling) {
    if (mismo(n, nn) && (n.nodeType !== 1 || n.className === nn.className)) return n;
  }
  return ref && mismo(ref, nn) ? ref : null;
}

function hijos(de, a) {
  var viejos = {}, nuevos = Array.prototype.slice.call(a.childNodes);
  Array.prototype.forEach.call(de.childNodes, function (n) { var k = clave(n); if (k) viejos[k] = n; });
  nuevos.forEach(function (nn, i) {
    var ref = de.childNodes[i] || null, k = clave(nn), usar = null;
    if (k) { usar = viejos[k] || null; delete viejos[k]; }
    else usar = parecido(de, i, nn);
    if (usar) {
      // Lo que se queda no se mueve: mover un nodo le borra el estado y su
      // transición no arranca. Se corre al final lo que había en el medio
      // (si nadie más lo usa, se va al terminar).
      while (de.childNodes[i] !== usar) de.appendChild(de.childNodes[i]);
      nodo(usar, nn);
    } else {
      de.insertBefore(nn, ref);
    }
  });
  // Cada posición ya tiene su nodo: lo que sobra quedó al final.
  while (de.childNodes.length > nuevos.length) de.removeChild(de.lastChild);
}

function nodo(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  atributos(a, b);
  if (a.hasAttribute('data-num')) {
    var de = parseInt(a.getAttribute('data-valor') || a.textContent, 10), hasta = parseInt(b.textContent, 10);
    a.setAttribute('data-valor', b.textContent);
    if (isNaN(de) || isNaN(hasta)) a.textContent = b.textContent;
    else numeroHasta(a, de, hasta);
    return;
  }
  hijos(a, b);
  var foco = document.activeElement === a;
  if (a.tagName === 'INPUT' && !foco && a.type !== 'file') a.value = b.getAttribute('value') || '';
  if (a.tagName === 'SELECT' && !foco) {
    var sel = b.querySelector('option[selected]');
    a.value = sel ? sel.value : (a.options[0] ? a.options[0].value : '');
  }
}

function atributos(a, b) {
  for (var i = a.attributes.length - 1; i >= 0; i--) {
    var n = a.attributes[i].name;
    // El estilo en línea lo maneja el movimiento; el valor de un número, pintar.
    if (n !== 'style' && n !== 'data-valor' && !b.hasAttribute(n)) a.removeAttribute(n);
  }
  for (var j = 0; j < b.attributes.length; j++) {
    var at = b.attributes[j], v = at.value;
    if (at.name === 'class') {
      PROPIAS.forEach(function (c) { if (a.classList.contains(c)) v += ' ' + c; });
    }
    if (a.getAttribute(at.name) !== v) a.setAttribute(at.name, v);
  }
}
