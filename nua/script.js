// ============================================================
// rt59 — app interactiva Resolución Técnica N° 59
// Los datos de la norma viven en data/rt59.json
// ============================================================

let DATA = null; // se carga al iniciar

async function initApp() {
  try {
    const res = await fetch('data/rt59.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
    renderApp();
  } catch (e) {
    document.body.innerHTML = `
      <div style="padding:2rem;font-family:sans-serif;color:#c00">
        <h2>Error al cargar la norma</h2>
        <p>${e.message}</p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', initApp);

let currentCapId = null;
var paraHistory = []; // stack of previously viewed paragraphs
var backParaTimer = null;

// === NAVIGATION HELPERS ===

// Navigate to any paragraph by number — works from anywhere
function navigateToPara(num, fromSearch) {
  const key = String(num);
  const loc = DATA.lookup[key];
  if (!loc) return;
  
  const isMobile = window.innerWidth <= 900;
  
  // History tracking is now handled by navFromRef() before calling this function
  
  // Close mobile sidebar FIRST
  if (isMobile) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
  }
  
  // Load the chapter if not already loaded
  const needsLoad = currentCapId !== loc.cap;
  if (needsLoad) {
    selectCap(loc.cap, true);
  }
  
  // Update active section in sidebar
  document.querySelectorAll('.nav-sec').forEach(function(el) {
    el.classList.toggle('active', el.dataset.sec === loc.sec);
  });
  
  // Use manual scrollTop — scrollIntoView is unreliable inside overflow containers on mobile
  function doScroll() {
    const container = document.getElementById('mainContent');
    const target = document.getElementById('para-' + num);
    if (!container || !target) return;
    
    // Calculate target position relative to scroll container
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const currentScroll = container.scrollTop;
    const targetOffset = targetRect.top - containerRect.top + currentScroll;
    
    // Center the paragraph in the viewport
    const centered = targetOffset - (container.clientHeight / 2) + (target.offsetHeight / 2);
    container.scrollTop = Math.max(0, centered);
    
    // Highlight
    target.classList.add('highlighted');
    setTimeout(function() { target.classList.remove('highlighted'); }, 2500);
  }
  
  // Wait for: sidebar close animation (300ms) + DOM render
  const delay = isMobile ? 500 : (needsLoad ? 150 : 50);
  setTimeout(doScroll, delay);
}

// === BUILD SIDEBAR NAV ===

function buildNav() {
  const nav = document.getElementById('sidebarNav');
  let html = '';
  DATA.titulos.forEach(titulo => {
    html += '<div class="nav-titulo">' + titulo.nombre + '</div>';
    titulo.capitulos.forEach(cap => {
      const pc = cap.secciones.reduce((s,sec) => s + sec.parrafos.length, 0);
      const label = cap.num === 0 ? 'Introducci\u00f3n' : cap.num === 99 ? 'Ap\u00e9ndice A' : 'Cap. ' + cap.num + ': ' + cap.nombre;
      html += '<div class="nav-cap" data-cap="' + cap.id + '" onclick="selectCap(\'' + cap.id + '\')">' +
        '<span class="cap-icon">' + cap.icono + '</span>' +
        '<span>' + label + '</span>' +
        '<span class="cap-num">' + pc + '</span></div>';
      html += '<div class="nav-sections" data-cap-sections="' + cap.id + '">';
      cap.secciones.forEach(sec => {
        const r = sec.parrafos.length > 0 ? sec.parrafos[0].num + '\u2013' + sec.parrafos[sec.parrafos.length-1].num : '';
        html += '<a class="nav-sec" data-sec="' + sec.id + '" onclick="selectSec(\'' + cap.id + '\',\'' + sec.id + '\')">' + sec.nombre + ' <span class="sec-range">' + r + '</span></a>';
      });
      html += '</div>';
    });
  });
  if (DATA.glosario && DATA.glosario.length) {
    html += '<div class="nav-glosario" id="navGlosario" onclick="showGlosario()">' +
      '<span class="cap-icon">\ud83d\udcda</span><span>Glosario</span>' +
      '<span class="cap-num" style="margin-left:auto">' + DATA.glosario.length + '</span></div>';
  }
  nav.innerHTML = html;
}

function findCap(id) {
  for (const t of DATA.titulos) for (const c of t.capitulos) if (c.id === id) return c;
  return null;
}

// === FORMAT PARAGRAPH TEXT ===

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Add clickable cross-references to paragraph text
function addCrossRefs(html) {
  function linkNum(n) {
    if (DATA.lookup[n]) return '<span class="para-ref" onclick="navFromRef(event,' + n + ')">' + n + '</span>';
    return n;
  }
  
  // 1. Comma+and lists: "párrafos 179, 182 y 183"
  html = html.replace(
    /(p[aá]rrafos?)\s+(\d{1,4})\s*,\s*(\d{1,4})\s+(y)\s+(\d{1,4})/gi,
    function(m, w, n1, n2, conj, n3) {
      return w + ' ' + linkNum(n1) + ', ' + linkNum(n2) + ' ' + conj + ' ' + linkNum(n3);
    }
  );
  
  // 2. Comma pairs: "párrafos 50, 60"
  html = html.replace(
    /(p[aá]rrafos?)\s+(\d{1,4})\s*,\s*(\d{1,4})(?!\d)/gi,
    function(m, w, n1, n2) {
      return w + ' ' + linkNum(n1) + ', ' + linkNum(n2);
    }
  );
  
  // 3. Ranges: "párrafos 117 a 122" or "párrafos 117 al 122"
  html = html.replace(
    /(p[aá]rrafos?)\s+(\d{1,4})\s+(a|al|y)\s+(\d{1,4})/gi,
    function(m, w, n1, conj, n2) {
      return w + ' ' + linkNum(n1) + ' ' + conj + ' ' + linkNum(n2);
    }
  );
  
  // 4. "párrafo 6 o 7" / "párrafo 6 o del párrafo 7"
  html = html.replace(
    /(p[aá]rrafos?)\s+(\d{1,4})\s+(o)\s+(\d{1,4})/gi,
    function(m, w, n1, conj, n2) {
      return w + ' ' + linkNum(n1) + ' ' + conj + ' ' + linkNum(n2);
    }
  );
  
  // 5. Single references: "párrafo 50"
  // Rules 1-4 already wrapped compound refs, so "párrafo <span..." won't match \d here
  html = html.replace(
    /(p[aá]rrafos?)\s+(\d{1,4})(?!\d)/gi,
    function(m, w, n) {
      return w + ' ' + linkNum(n);
    }
  );
  
  // 6. "inciso X) del párrafo N" - the paragraph number should already be linked by rule 5
  // but let's ensure "inciso b) del párrafo" patterns work too (they do via rule 5)
  
  return html;
}

function formatParaText(raw) {
  var text = escapeHtml(raw);
  var lines = text.split('\n');
  var result = [];
  var inBlock = false;
  
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) { if (result.length > 0) inBlock = true; continue; }
    if (/^\([ivxlc]+\)|^\(\d+\)/.test(trimmed)) { result.push('<span class="sub-inciso">' + trimmed + '</span>'); continue; }
    if (/^[a-zA-Z]\)\s/.test(trimmed)) { result.push('<span class="inciso">' + trimmed + '</span>'); continue; }
    if (inBlock) { result.push('<span class="bloque">' + trimmed + '</span>'); inBlock = false; }
    else if (result.length === 0) { result.push(trimmed); }
    else {
      var last = result[result.length - 1];
      if (last.endsWith('</span>')) {
        var ci = last.lastIndexOf('</span>');
        result[result.length - 1] = last.substring(0, ci) + ' ' + trimmed + '</span>';
      } else { result[result.length - 1] = last + ' ' + trimmed; }
    }
  }
  
  var joined = result.join('');
  // Add clickable cross-references
  joined = addCrossRefs(joined);
  return joined;
}

// === RENDER CHAPTER ===

function selectCap(capId, suppressScroll) {
  var cap = findCap(capId);
  if (!cap) return;

  // Verificamos si el usuario hizo clic en el capítulo que ya está activo
  var isAlreadyOpen = (currentCapId === capId);

  if (isAlreadyOpen) {
    // Si ya es el capítulo actual, solo alternamos las clases para colapsar/expandir el menú
    var elCap = document.querySelector('.nav-cap[data-cap="' + capId + '"]');
    var elSec = document.querySelector('.nav-sections[data-cap-sections="' + capId + '"]');
    if (elCap) elCap.classList.toggle('active');
    if (elSec) elSec.classList.toggle('open');
    return; // Detenemos la función aquí para no re-renderizar todo el DOM
  }

  currentCapId = capId;
  document.querySelectorAll('.nav-cap').forEach(function(el) { el.classList.toggle('active', el.dataset.cap===capId); });
  document.querySelectorAll('.nav-sections').forEach(function(el) { el.classList.toggle('open', el.dataset.capSections===capId); });
  document.querySelectorAll('.nav-sec').forEach(function(el) { el.classList.remove('active'); });
  var ng = document.getElementById('navGlosario'); if(ng) ng.classList.remove('active');

  var title = cap.num === 0 ? 'Introducci\u00f3n' : cap.num === 99 ? 'Ap\u00e9ndice A' : 'Cap\u00edtulo ' + cap.num;
  var html = '<div class="content-header"><h1>' + cap.icono + ' ' + title + '</h1><div class="ch-subtitle">' + cap.nombre + '</div></div>';
  cap.secciones.forEach(function(sec) {
    html += '<div class="section-block" id="sec-' + sec.id + '"><h2 class="section-title">' + sec.nombre + '</h2>';
    sec.parrafos.forEach(function(p) {
      html += '<div class="paragraph" id="para-' + p.num + '" data-num="' + p.num + '">' +
        '<span class="para-num" title="Copiar referencia" onclick="copyRef(\'' + p.num + '\')"><span class="bullet"></span>' + p.num + '</span>' +
        '<span class="para-text">' + formatParaText(p.texto) + '</span></div>';
      if (p.subheader_after) {
        html += '<div class="section-subheader">' + p.subheader_after + '</div>';
      }
    });
    html += '</div>';
  });
  document.getElementById('mainInner').innerHTML = html;
  if (!suppressScroll) document.getElementById('mainContent').scrollTop = 0;
  if (!suppressScroll) closeMobile();
}

function selectSec(capId, secId) {
  if (currentCapId !== capId) selectCap(capId);
  document.querySelectorAll('.nav-sec').forEach(function(el) { el.classList.toggle('active', el.dataset.sec===secId); });
  setTimeout(function() { var el = document.getElementById('sec-' + secId); if(el) { var container = document.getElementById('mainContent'); var cRect = container.getBoundingClientRect(); var eRect = el.getBoundingClientRect(); container.scrollTop = eRect.top - cRect.top + container.scrollTop - 20; } }, 50);
  closeMobile();
}

function copyRef(num) {
  navigator.clipboard.writeText('\u00a7'+num).catch(function(){});
  var el = document.getElementById('para-'+num);
  if(el){el.classList.add('highlighted');setTimeout(function(){el.classList.remove('highlighted')},1500)}
}

// === GLOSSARY ===

function showGlosario() {
  currentCapId = null;
  document.querySelectorAll('.nav-cap').forEach(function(el){el.classList.remove('active')});
  document.querySelectorAll('.nav-sections').forEach(function(el){el.classList.remove('open')});
  document.querySelectorAll('.nav-sec').forEach(function(el){el.classList.remove('active')});
  var ng = document.getElementById('navGlosario'); if(ng) ng.classList.add('active');

  var html = '<div class="content-header"><h1>\ud83d\udcda Glosario</h1><div class="ch-subtitle">' + DATA.glosario.length + ' t\u00e9rminos definidos en la RT 54</div></div>';
  html += '<div class="glosario-search"><div class="glosario-wrap">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>' +
    '<input type="text" class="glosario-input" placeholder="Filtrar t\u00e9rminos..." oninput="filterGlosario(this.value)" autocomplete="off">' +
    '</div></div><div id="glosarioList">' + renderGlosarioEntries(DATA.glosario) + '</div>';
  document.getElementById('mainInner').innerHTML = html;
  document.getElementById('mainContent').scrollTop = 0;
  closeMobile();
}

function renderGlosarioEntries(entries) {
  var html = '';
  var currentLetter = '';
  entries.forEach(function(e) {
    var letter = e.termino.charAt(0).toUpperCase();
    if (letter !== currentLetter) { currentLetter = letter; html += '<div class="glosario-letter">' + letter + '</div>'; }
    html += '<div class="glosario-entry"><div class="glosario-term">' + escapeHtml(e.termino) + '</div><div class="glosario-def">' + escapeHtml(e.definicion) + '</div></div>';
  });
  return html;
}

function filterGlosario(q) {
  var list = document.getElementById('glosarioList');
  if (!q.trim()) { list.innerHTML = renderGlosarioEntries(DATA.glosario); return; }
  var filtered = DATA.glosario.filter(function(e) { return e.termino.toLowerCase().includes(q.toLowerCase()) || e.definicion.toLowerCase().includes(q.toLowerCase()); });
  list.innerHTML = filtered.length ? renderGlosarioEntries(filtered) : '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.85rem">Sin resultados</div>';
}

// === SEARCH ===

var searchTimer;
function handleSearch(q) {
  clearTimeout(searchTimer);
  var nav = document.getElementById('sidebarNav');
  var res = document.getElementById('searchResults');
  if (!q.trim()) { nav.style.display=''; res.classList.remove('visible'); return; }
  searchTimer = setTimeout(function() { doSearch(q.trim()); }, 180);
}

function doSearch(query) {
  var nav = document.getElementById('sidebarNav');
  var res = document.getElementById('searchResults');
  nav.style.display='none';
  res.classList.add('visible');

  var q = query.toLowerCase();
  // Detect if user is searching for a specific paragraph number
  var isPara = /^§?\d+$/.test(query.trim());
  var pNum = isPara ? query.replace('§','').trim() : null;

  // If exact paragraph search, show as top result (don't auto-navigate or clear input)
  if (isPara && DATA.lookup[pNum]) {
    var loc = DATA.lookup[pNum];
    var cap = findCap(loc.cap);
    var capLabel = getCapLabel(loc.cap);
    var secName = '';
    var pText = '';
    if (cap) {
      for (var si = 0; si < cap.secciones.length; si++) {
        for (var pi = 0; pi < cap.secciones[si].parrafos.length; pi++) {
          if (String(cap.secciones[si].parrafos[pi].num) === pNum) {
            pText = cap.secciones[si].parrafos[pi].texto.substring(0, 140);
            secName = cap.secciones[si].nombre;
            break;
          }
        }
      }
    }
    res.innerHTML = '<div style="padding:4px 12px 8px;font-size:.65rem;color:rgba(255,255,255,.25)">P\u00e1rrafo encontrado</div>' +
      '<div class="search-result" onclick="clearSearchAndGo(' + pNum + ')">' +
      '<div class="sr-para">' + pNum + '</div>' +
      '<div class="sr-text">' + escapeHtml(pText) + '\u2026</div>' +
      '<div class="sr-cap">' + capLabel + ' \u203a ' + secName + '</div></div>';
    return;
  }

  var hits = [];
  DATA.titulos.forEach(function(t) { t.capitulos.forEach(function(cap) { cap.secciones.forEach(function(sec) {
    sec.parrafos.forEach(function(p) {
      var pn = String(p.num);
      // For text search, check both section name and paragraph content
      var txt = p.texto.toLowerCase();
      var nm = sec.nombre.toLowerCase().includes(q);
      if (txt.includes(q) || nm) {
        hits.push({p:p, sec:sec, cap:cap, score: nm ? 50 : 10});
      }
    });
  }); }); });

  // Also search glossary
  if (DATA.glosario) {
    DATA.glosario.forEach(function(e) {
      if (e.termino.toLowerCase().includes(q) || e.definicion.toLowerCase().includes(q)) {
        hits.push({p:{num:'G',texto:e.termino+': '+e.definicion},sec:{nombre:'Glosario'},cap:{id:'_glosario',num:'G',nombre:'Glosario'},score:e.termino.toLowerCase().includes(q)?45:5,isGlosario:true});
      }
    });
  }

  hits.sort(function(a,b) { return b.score-a.score; });
  hits = hits.slice(0, 50);

  if (!hits.length) {
    res.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.3);font-size:.82rem">Sin resultados para "' + escapeHtml(query) + '"</div>';
    return;
  }

  var html = '<div style="padding:4px 12px 8px;font-size:.65rem;color:rgba(255,255,255,.25)">' + hits.length + ' resultado' + (hits.length>1?'s':'') + '</div>';
  hits.forEach(function(h) {
    var snip = getSnippet(h.p.texto, query);
    if (h.isGlosario) {
      html += '<div class="search-result" onclick="goToGlosario(\'' + escapeAttr(query) + '\')">' +
        '<div class="sr-para">\ud83d\udcda Glosario</div><div class="sr-text">' + snip + '</div></div>';
    } else {
      html += '<div class="search-result" onclick="clearSearchAndGo(' + h.p.num + ')">' +
        '<div class="sr-para">' + h.p.num + '</div><div class="sr-text">' + snip + '</div>' +
        '<div class="sr-cap">' + getCapLabel(h.cap.id) + ' \u203a ' + h.sec.nombre + '</div></div>';
    }
  });
  res.innerHTML = html;
}

function getCapLabel(capId) {
  var cap = findCap(capId);
  if (!cap) return '';
  if (cap.num === 0) return 'Intro';
  if (cap.num === 99) return 'Ap. A';
  return 'Cap. ' + cap.num;
}

function escapeAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function getSnippet(text, query) {
  var q = query.toLowerCase();
  var idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return escapeHtml(text.substring(0,100)) + '\u2026';
  var s = Math.max(0, idx-40), e = Math.min(text.length, idx+query.length+60);
  var snip = (s>0?'\u2026':'') + text.substring(s,e) + (e<text.length?'\u2026':'');
  var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','gi');
  return escapeHtml(snip).replace(re,'<mark>$1</mark>');
}

function clearSearchAndGo(pNum) {
  document.getElementById('searchInput').value = '';
  document.getElementById('sidebarNav').style.display = '';
  document.getElementById('searchResults').classList.remove('visible');
  navigateToPara(pNum, true);
}

function goToGlosario(query) {
  document.getElementById('searchInput').value='';
  document.getElementById('sidebarNav').style.display='';
  document.getElementById('searchResults').classList.remove('visible');
  showGlosario();
  setTimeout(function() {
    var input = document.querySelector('.glosario-input');
    if (input) { input.value = query; filterGlosario(query); }
  }, 100);
}

// === MOBILE ===
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('open'); }
function closeMobile() { if(window.innerWidth<=900){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('open');} }

// === BACK TO TOP ===
document.getElementById('mainContent').addEventListener('scroll', function() {
  document.getElementById('backTop').classList.toggle('visible', this.scrollTop > 400);
});

// === WELCOME ===
function showWelcome() {
  var tp=0,ts=0,tc=0;
  DATA.titulos.forEach(function(t){t.capitulos.forEach(function(c){tc++;c.secciones.forEach(function(s){ts++;tp+=s.parrafos.length});});});
  var gn = DATA.glosario ? DATA.glosario.length : 0;
  document.getElementById('mainInner').innerHTML =
    '<div class="welcome">' +
    '<div class="welcome-icon"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 4.5C19.5 4 18.2 3.8 17 3.8c-1.8 0-3.8.5-5 1.7C10.8 4.3 8.8 3.8 7 3.8c-1.2 0-2.5.2-4 .7v14c1.5-.5 2.8-.7 4-.7 1.8 0 3.8.5 5 1.7 1.2-1.2 3.2-1.7 5-1.7 1.2 0 2.5.2 4 .7V4.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5.5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>' +
    '<h2>RT 59 \u2014 Norma Unificada Argentina</h2>' +
    '<p>Explor\u00e1 la Resoluci\u00f3n T\u00e9cnica N\u00b0 54 (T.O. RT 59) de forma interactiva. Seleccion\u00e1 un cap\u00edtulo en el men\u00fa lateral o busc\u00e1 por n\u00famero de p\u00e1rrafo o palabra clave.</p>' +
    '<div class="stats">' +
    '<div class="stat"><div class="stat-num">' + tc + '</div><div class="stat-label">Cap\u00edtulos</div></div>' +
    '<div class="stat"><div class="stat-num">' + tp + '</div><div class="stat-label">P\u00e1rrafos</div></div>' +
    '<div class="stat"><div class="stat-num">' + gn + '</div><div class="stat-label">Glosario</div></div>' +
    '</div>' +
    '<div class="hint">Atajo: <kbd>Ctrl</kbd>+<kbd>K</kbd> o <kbd>/</kbd> para buscar</div>' +
    '</div>';
}

// === KEYBOARD SHORTCUTS ===
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey && e.key==='k') || (e.key==='/' && document.activeElement.tagName!=='INPUT')) {
    e.preventDefault(); document.getElementById('searchInput').focus();
  }
  if (e.key==='Escape') {
    document.getElementById('searchInput').blur();
    document.getElementById('searchInput').value='';
    handleSearch('');
  }
});

// === TAB SWITCHING ===
function switchTab(tab) {
  document.getElementById('tabNorma').classList.toggle('active', tab === 'norma');
  document.getElementById('tabSoporte').classList.toggle('active', tab === 'soporte');
  
  if (tab === 'soporte') {
    // Hide sidebar nav elements
    document.getElementById('sidebarNav').style.display = 'none';
    document.getElementById('searchResults').classList.remove('visible');
    document.querySelector('.search-box').style.display = 'none';
    
    // Show support page in main content
    showSoporte();
  } else {
    // Restore sidebar nav
    document.getElementById('sidebarNav').style.display = '';
    document.querySelector('.search-box').style.display = '';
    showWelcome();
  }
}

function showSoporte() {
  currentCapId = null;
  var waMsg = encodeURIComponent('Buenas! me contacto para realizar una sugerencia y/o cambio de la NUA interactiva');
  var waUrl = 'https://wa.me/5493885107356?text=' + waMsg;
  
  document.getElementById('mainInner').innerHTML =
    '<div class="soporte-page">' +
    '<div class="soporte-icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
    '<h2>Bienvenido/a a la NUA interactiva</h2>' +
    '<p class="soporte-sub">Si ten\u00e9s alguna recomendaci\u00f3n y/o sugerencia para mejorar la app, contactate conmigo</p>' +
    '<div class="soporte-buttons">' +
    '<a href="' + waUrl + '" target="_blank" rel="noopener" class="soporte-btn whatsapp">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
    'Enviar mensaje por WhatsApp</a>' +
    '</div>' +
    '<div class="soporte-footer">NUA Interactiva \u2014 Contador Santiago Tolaba</div>' +
    '</div>';
  
  document.getElementById('mainContent').scrollTop = 0;
}

// === PARAGRAPH BACK NAVIGATION ===

// Called when clicking a cross-reference link inside a paragraph
function navFromRef(event, targetNum) {
  // Find the source paragraph by walking up the DOM
  var el = event.target;
  while (el && !el.classList.contains('paragraph')) el = el.parentElement;
  var sourceNum = el ? el.dataset.num : null;
  
  if (sourceNum && String(sourceNum) !== String(targetNum)) {
    // Save source paragraph AND its exact scroll position for precise return
    var container = document.getElementById('mainContent');
    paraHistory.push({
      num: sourceNum,
      cap: currentCapId,
      scrollTop: container ? container.scrollTop : 0
    });
    showBackButton(sourceNum);
  }
  
  navigateToPara(targetNum, true);
}

function showBackButton(fromPara) {
  var btn = document.getElementById('backPara');
  var label = document.getElementById('backParaNum');
  label.textContent = '\u00b0 ' + fromPara;
  btn.classList.add('visible');
  // Button stays until user clicks 'volver'
}

function goBackPara() {
  if (paraHistory.length === 0) return;
  var entry = paraHistory.pop();
  // Hide the back button
  document.getElementById('backPara').classList.remove('visible');
  
  // If we need to load a different chapter first
  if (currentCapId !== entry.cap) {
    selectCap(entry.cap, true);
  }
  
  var isMobile = window.innerWidth <= 900;
  var delay = isMobile ? 400 : 80;
  
  setTimeout(function() {
    var container = document.getElementById('mainContent');
    var el = document.getElementById('para-' + entry.num);
    
    if (container && el) {
      // If same chapter: restore exact scroll position (pixel-perfect)
      if (entry.scrollTop !== undefined) {
        container.scrollTop = entry.scrollTop;
      }
      // Highlight the source paragraph
      el.classList.add('highlighted');
      setTimeout(function() { el.classList.remove('highlighted'); }, 2500);
    }
    
    // Show button for remaining history
    if (paraHistory.length > 0) showBackButton(paraHistory[paraHistory.length - 1].num);
  }, delay);
}

function renderApp() {
  buildNav();
  showWelcome();
}