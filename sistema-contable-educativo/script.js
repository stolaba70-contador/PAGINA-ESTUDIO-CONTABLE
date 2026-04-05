const supabaseUrl = 'https://noluhzobkdqyfbyovfqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbHVoem9ia2RxeWZieW92ZnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDk2MDgsImV4cCI6MjA5MDgyNTYwOH0.WiTKdjtIEY7faHL2Wb3LsZ8xDXGC2td2B8kUqwyPUNQ';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ══════════════════════════════════════════
   ESTADO GLOBAL Y AUTENTICACIÓN
   ══════════════════════════════════════════ */
let isLoginMode = true;
let currentUser = null;
let asientos = [];
let cuentas = [];
let indices = {};
let mesCierre = '';
let modoInflacion = 'indices';
let modelosData = {};
let cierreData = [];
let lineIdCounter = 0;
let sessionToken = null;
let sessionCheckInterval = null;

db.auth.onAuthStateChange((event, session) => {
  if (session) {
    verificarAprobacion(session);
  } else {
    currentUser = null;
    sessionToken = null;
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    const authScreen = document.getElementById('authScreen');
    const appLayout = document.querySelector('.app-layout');
    const mobileHeader = document.querySelector('.mobile-header');
    if (authScreen) authScreen.style.display = 'flex';
    if (appLayout) appLayout.classList.add('app-hidden');
    if (mobileHeader) mobileHeader.classList.add('app-hidden');
  }
});

function generarToken() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
}

async function verificarAprobacion(session) {
  currentUser = session.user;

  // Consultar si el alumno está aprobado
  const { data: perfil } = await db
    .from('perfiles')
    .select('aprobado, session_token')
    .eq('id', currentUser.id)
    .single();

  if (!perfil || !perfil.aprobado) {
    alert('Tu cuenta está pendiente de aprobación por el profesor. Intentá más tarde.');
    await db.auth.signOut();
    return;
  }

  // Generar nuevo token y guardarlo — invalida cualquier sesión anterior
  sessionToken = generarToken();
  await db
    .from('perfiles')
    .update({ session_token: sessionToken })
    .eq('id', currentUser.id);

  // Si está aprobado, mostrar la app
  const authScreen = document.getElementById('authScreen');
  const appLayout = document.querySelector('.app-layout');
  const mobileHeader = document.querySelector('.mobile-header');

  if (authScreen) authScreen.style.display = 'none';
  if (appLayout) appLayout.classList.remove('app-hidden');
  if (mobileHeader) mobileHeader.classList.remove('app-hidden');

  const userEmail = currentUser.email;
  const navName = document.getElementById('navName');
  const navAvatar = document.getElementById('navAvatar');

  if (navName) navName.textContent = userEmail.split('@')[0];
  if (navAvatar) navAvatar.textContent = userEmail.charAt(0).toUpperCase();

  cargarDeLaNube();

  // Verificar cada 30 segundos que la sesión siga siendo válida
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  sessionCheckInterval = setInterval(verificarSesionActiva, 30000);
}

async function verificarSesionActiva() {
  if (!currentUser || !sessionToken) return;

  const { data: perfil } = await db
    .from('perfiles')
    .select('session_token')
    .eq('id', currentUser.id)
    .single();

  if (!perfil || perfil.session_token !== sessionToken) {
    clearInterval(sessionCheckInterval);
    alert('Tu sesión se cerró porque se inició sesión desde otro dispositivo.');
    await db.auth.signOut();
  }
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const btn = document.querySelector('#authForm button');
  const modeBtn = document.getElementById('authModeBtn');

  if (title) title.textContent = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
  if (subtitle) subtitle.textContent = isLoginMode ? 'Ingresá a la plataforma educativa' : 'Registrate para guardar tus trabajos';
  if (btn) btn.textContent = isLoginMode ? 'Ingresar' : 'Registrarse';
  if (modeBtn) modeBtn.textContent = isLoginMode ? '¿No tenés cuenta? Registrate acá' : '¿Ya tenés cuenta? Iniciá sesión';
}

async function handleAuth(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  
  if (!emailInput || !passInput) return;
  
  const email = emailInput.value;
  const password = passInput.value;

  try {
    if (isLoginMode) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      alert('¡Cuenta creada! El profesor debe aprobar tu cuenta antes de que puedas ingresar.');
      await db.auth.signOut();
      toggleAuthMode();
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function cerrarSesion() {
  if (currentUser) {
    await db
      .from('perfiles')
      .update({ session_token: null })
      .eq('id', currentUser.id);
  }
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  await db.auth.signOut();
}

const MODULES = {
  diario: { label: 'Libro Diario', description: 'Registración de asientos contables cronológicamente.', color: '#1b2a4a', colorLight: 'rgba(27,42,74,0.08)', colorBorder: 'rgba(27,42,74,0.2)', num: 'I', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><line x1="9" y1="8" x2="16" y2="8"/><line x1="9" y1="12" x2="14" y2="12"/></svg>' },
  mayores: { label: 'Libros Mayores', description: 'Cuentas individuales con Debe, Haber y saldos.', color: '#0e6377', colorLight: 'rgba(14,99,119,0.08)', colorBorder: 'rgba(14,99,119,0.2)', num: 'II', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>' },
  plan: { label: 'Plan de Cuentas', description: 'Estructura y codificación del plan de cuentas del ente.', color: '#6b4c11', colorLight: 'rgba(107,76,17,0.08)', colorBorder: 'rgba(107,76,17,0.2)', num: 'III', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>' },
  inflacion: { label: 'Ajuste por Inflación', description: 'Reexpresión de partidas por IPC.', color: '#8b6914', colorLight: 'rgba(139,105,20,0.08)', colorBorder: 'rgba(139,105,20,0.2)', num: 'IV', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>' },
  cierre: { label: 'Medición al Cierre', description: 'Valuación de activos y pasivos al cierre.', color: '#6b21a8', colorLight: 'rgba(107,33,168,0.08)', colorBorder: 'rgba(107,33,168,0.2)', num: 'V', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
  estados: { label: 'Estados Contables', description: 'ESP, ER, EEPN, EFE y notas.', color: '#166534', colorLight: 'rgba(22,101,52,0.08)', colorBorder: 'rgba(22,101,52,0.2)', num: 'VI', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>' },
  stock: { label: 'Stock (PEPS)', description: 'Fichas de stock por producto con método PEPS/FIFO.', color: '#b45309', colorLight: 'rgba(180,83,9,0.08)', colorBorder: 'rgba(180,83,9,0.2)', num: 'VII', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
  modelos: { label: 'Modelos Contables', description: 'Libro diario extendido con 6 modelos de Debe/Haber.', color: '#4338ca', colorLight: 'rgba(67,56,202,0.08)', colorBorder: 'rgba(67,56,202,0.2)', num: 'VIII', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>' }
};

let currentModule = 'home';


function saveData() {
  return guardarEnLaNube();
}

async function guardarEnLaNube() {
  if (!currentUser) return;

  const dataContable = {
    asientos: asientos,
    cuentas: cuentas,
    indices: indices,
    mesCierre: mesCierre,
    modoInflacion: modoInflacion,
    modelosData: modelosData,
    cierreData: cierreData
  };

  try {
    const { data: existente } = await db
      .from('trabajos_alumnos')
      .select('id')
      .eq('user_id', currentUser.id)
      .single();

    if (existente) {
      await db
        .from('trabajos_alumnos')
        .update({ datos: dataContable, actualizado_en: new Date() })
        .eq('id', existente.id);
    } else {
      await db
        .from('trabajos_alumnos')
        .insert([{ user_id: currentUser.id, datos: dataContable }]);
    }
  } catch (error) {
    console.error('Error al sincronizar con la nube:', error.message);
  }
}

async function cargarDeLaNube() {
  if (!currentUser) return;

  try {
    const { data, error } = await db
      .from('trabajos_alumnos')
      .select('datos')
      .eq('user_id', currentUser.id)
      .single();

    if (data && data.datos) {
      const d = data.datos;
      asientos = d.asientos || [];
      cuentas = d.cuentas || [];
      indices = d.indices || {};
      mesCierre = d.mesCierre || '';
      modoInflacion = d.modoInflacion || 'indices';
      modelosData = d.modelosData || {};
      cierreData = d.cierreData || [];
      ensurePNCuentas();
      
      // Refrescamos la pantalla para mostrar los datos recién descargados
      const activeModule = document.querySelector('.nav-item.active').dataset.module;
      navigate(activeModule);
    }
  } catch (error) {
    // Si el error es PGRST116 significa que es un alumno nuevo sin datos aún, lo cual es normal
    if (error.code !== 'PGRST116') {
      console.error('Error al cargar datos:', error.message);
    }
  }
}

/* ══════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════ */
function navigate(moduleId) {
  currentModule = moduleId;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.module === moduleId));
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = moduleId === 'home' ? '<strong>Inicio</strong>' : `<span class="breadcrumb-link" onclick="navigate('home')">Inicio</span> / <strong>${MODULES[moduleId].label}</strong>`;
  renderContent();
  if (window.innerWidth <= 768) { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }
}

function renderContent() {
  const area = document.getElementById('contentArea');
  if (currentModule === 'home') return renderDashboard(area);
  if (currentModule === 'diario') return renderDiario(area);
  if (currentModule === 'mayores') return renderMayores(area);
  if (currentModule === 'plan') return renderPlan(area);
  if (currentModule === 'inflacion') return renderInflacion(area);
  if (currentModule === 'stock') return renderStock(area);
  if (currentModule === 'modelos') return renderModelos(area);
  if (currentModule === 'estados') return renderEstadosOverview(area);
  if (currentModule === 'cierre') return renderCierre(area);
  renderPlaceholder(area, MODULES[currentModule]);
}

function renderDashboard(el) {
  const cards = Object.keys(MODULES).map((key, i) => {
    const m = MODULES[key];
    return `<div class="module-card" style="animation-delay:${i*0.08}s" onclick="navigate('${key}')">
      <div class="card-left-line" style="background:${m.color}"></div>
      <div class="card-header"><div class="card-icon" style="background:${m.colorLight};color:${m.color};border-color:${m.colorBorder}">${m.icon}</div><div class="card-number" style="color:${m.colorBorder}">${m.num}</div></div>
      <div class="card-title">${m.label}</div><div class="card-desc">${m.description}</div>
      <div class="card-footer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>Ingresar al módulo</div>
    </div>`;
  }).join('');
  
  el.innerHTML = `
    <div class="welcome-section" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px;">
      <div>
        <h2>Módulos del Sistema</h2>
        <p>Seleccioná un módulo para comenzar a trabajar con el ejercicio contable</p>
      </div>
      <div style="display:flex; gap:10px; background:var(--surface-2); padding:15px; border-radius:8px; border:1px solid var(--border); flex-wrap:wrap;">
        <input type="file" id="fileImport" style="display:none" accept=".json" onchange="importarDatos(event)">
        <button class="btn-asiento" style="background:var(--forest); border:none; color:#fff;" onclick="exportarDatos()">📥 Guardar JSON</button>
        <button class="btn-asiento" style="background:var(--navy); border:none; color:#fff;" onclick="document.getElementById('fileImport').click()">📤 Cargar JSON</button>
        <button class="btn-asiento" style="background:#4338ca; border:none; color:#fff;" onclick="generarReporte()">🖨️ Generar PDF</button>
        <button class="btn-asiento" style="background:var(--burgundy); border:none; color:#fff;" onclick="limpiarSistema()">🗑️ Nueva Consigna</button>
      </div>
    </div>
    <div class="dashboard-grid">${cards}</div>
  `;
}

function renderPlaceholder(el, m) {
  el.innerHTML = `<div class="module-placeholder"><div class="placeholder-icon" style="background:${m.colorLight};color:${m.color};border-color:${m.colorBorder}">${m.icon}</div><div class="placeholder-title">${m.label}</div><div class="placeholder-desc">${m.description}</div><div class="placeholder-badge" style="border-color:${m.colorBorder};color:${m.color}">En construcción</div></div>`;
}

/* ══════════════════════════════════════════
   LIBRO DIARIO
   ══════════════════════════════════════════ */
function renderDiario(el) {
  let rowsHTML = '';
  if (asientos.length === 0) {
    rowsHTML = '<div class="hoja-empty">No hay asientos registrados. Cargá tu primer asiento contable.</div>';
  } else {
    asientos.forEach((a, idx) => {
      if (!a || !a.fecha) return;
      const fechaStr = formatDate(a.fecha);
      const cierreBadge = a.esCierre ? '<span style="margin-left:8px; font-size:10px; background:var(--burgundy); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px;">Cierre</span>' : '';
      
      rowsHTML += `<div class="hoja-row row-asiento-num">
        <div class="col-fecha"></div>
        <div class="col-detalle">— ${idx + 1} — ${cierreBadge}</div>
        <div class="col-debe"></div>
        <div class="col-haber" style="justify-content:center; gap:4px;">
          <button class="btn-edit-asiento" onclick="editAsiento(${idx})" title="Editar asiento">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-del-asiento" onclick="deleteAsiento(${idx})" title="Eliminar asiento">✕</button>
        </div>
      </div>`;
      
      (a.debe || []).forEach((d, di) => {
        rowsHTML += `<div class="hoja-row row-deudora">
          <div class="col-fecha">${di === 0 ? fechaStr : ''}</div>
          <div class="col-detalle">${d.cuenta}</div>
          <div class="col-debe">${formatMoney(d.monto)}</div>
          <div class="col-haber"></div>
        </div>`;
      });
      (a.haber || []).forEach(h => {
        rowsHTML += `<div class="hoja-row row-acreedora">
          <div class="col-fecha"></div>
          <div class="col-detalle">${h.cuenta}</div>
          <div class="col-debe"></div>
          <div class="col-haber">${formatMoney(h.monto)}</div>
        </div>`;
      });
      if (a.glosa) {
        rowsHTML += `<div class="hoja-row row-glosa">
          <div class="col-fecha"></div>
          <div class="col-detalle">${a.glosa}</div>
          <div class="col-debe"></div>
          <div class="col-haber"></div>
        </div>`;
      }
      rowsHTML += `<div class="hoja-row row-separator"><div></div><div></div><div></div><div></div></div>`;
    });
  }

  el.innerHTML = `
    <div style="display:none" class="print-title">LIBRO DIARIO</div>
    <div style="display:none" class="print-subtitle">Sistema Contable Educativo</div>
    <div class="diario-toolbar">
      <h2>Libro Diario</h2>
      <div style="display:flex;gap:8px">
        ${asientos.length > 0 ? '<button class="topbar-btn" onclick="window.print()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-2px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button>' : ''}
        <button class="btn-asiento" onclick="openModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Cargar asiento manual
        </button>
      </div>
    </div>
    <div class="hoja-rayada">
      <div class="hoja-header">
        <div>Fecha</div><div>Detalle</div><div>Debe</div><div>Haber</div>
      </div>
      <div class="hoja-body">${rowsHTML}</div>
    </div>`;
}

function formatDate(d) {
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function formatMoney(n) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ══════════════════════════════════════════
   MODAL LOGIC
   ══════════════════════════════════════════ */
let editingAsientoIndex = null;

function openModal() {
  editingAsientoIndex = null;
  document.querySelector('.modal-header h3').textContent = 'Nuevo Asiento Contable';
  document.getElementById('asientoFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('asientoGlosa').value = '';
  const chkCierre = document.getElementById('asientoCierre');
  if(chkCierre) chkCierre.checked = false;
  document.getElementById('lineasDebe').innerHTML = '';
  document.getElementById('lineasHaber').innerHTML = '';
  addLine('debe');
  addLine('haber');
  updateBalance();
  document.getElementById('modalAsiento').classList.add('open');
}

function editAsiento(idx) {
  editingAsientoIndex = idx;
  const a = asientos[idx];
  
  document.querySelector('.modal-header h3').textContent = 'Editar Asiento N° ' + (idx + 1);
  document.getElementById('asientoFecha').value = a.fecha;
  document.getElementById('asientoGlosa').value = a.glosa || '';
  
  const chkCierre = document.getElementById('asientoCierre');
  if (chkCierre) chkCierre.checked = !!a.esCierre;
  
  document.getElementById('lineasDebe').innerHTML = '';
  document.getElementById('lineasHaber').innerHTML = '';
  
  (a.debe || []).forEach(d => {
    const id = addLine('debe');
    const row = document.getElementById(id);
    const inputCuenta = row.querySelector('.line-cuenta');
    inputCuenta.value = d.cuenta;
    row.querySelector('.line-monto').value = d.monto;
    if (d.qty) {
      row.querySelector('.line-qty').value = d.qty;
      row.querySelector('.line-price').value = d.price;
    }
    toggleStockFields(inputCuenta);
  });
  
  (a.haber || []).forEach(h => {
    const id = addLine('haber');
    const row = document.getElementById(id);
    const inputCuenta = row.querySelector('.line-cuenta');
    inputCuenta.value = h.cuenta;
    row.querySelector('.line-monto').value = h.monto;
    if (h.qty) {
      row.querySelector('.line-qty').value = h.qty;
      row.querySelector('.line-price').value = h.price;
    }
    toggleStockFields(inputCuenta);
  });
  
  updateBalance();
  document.getElementById('modalAsiento').classList.add('open');
}

function closeModal() {
  document.getElementById('modalAsiento').classList.remove('open');
}

function addLine(tipo) {
  const container = tipo === 'debe' ? document.getElementById('lineasDebe') : document.getElementById('lineasHaber');
  const id = 'line_' + (++lineIdCounter);
  const div = document.createElement('div');
  div.className = 'line-entry';
  div.id = id;
  div.innerHTML = `
    <div class="autocomplete-wrapper">
      <input type="text" placeholder="Buscar cuenta..." class="line-cuenta" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:6px;font-family:var(--sans);font-size:14px;background:var(--surface-2);" oninput="showAutocomplete(this)" onfocus="showAutocomplete(this)" autocomplete="off">
      <div class="autocomplete-list"></div>
    </div>
    <input type="number" placeholder="0.00" min="0" step="0.01" class="line-monto" data-tipo="${tipo}" oninput="updateBalance()" style="padding:10px 14px;border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:14px;background:var(--surface-2);">
    <span class="line-stock-fields" style="display:none;align-items:center;gap:6px">
      <input type="number" placeholder="Cant." min="1" step="1" class="line-qty" oninput="calcStockLine(this)" style="width:70px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:13px;background:rgba(180,83,9,0.04);">
      <input type="number" placeholder="P.Unit." min="0.01" step="0.01" class="line-price" oninput="calcStockLine(this)" style="width:85px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:13px;background:rgba(180,83,9,0.04);">
    </span>
    <button class="btn-remove-line" onclick="removeLine('${id}')">×</button>
  `;
  container.appendChild(div);
  return id;
}

function calcStockLine(el) {
  const row = el.closest('.line-entry');
  const qty = parseFloat(row.querySelector('.line-qty').value) || 0;
  const price = parseFloat(row.querySelector('.line-price').value) || 0;
  const montoInput = row.querySelector('.line-monto');
  if (qty > 0 && price > 0) {
    montoInput.value = (qty * price).toFixed(2);
    updateBalance();
  }
}

function isBienDeCambio(nombreCuenta) {
  const c = cuentas.find(c => c.nombre.toLowerCase() === nombreCuenta.toLowerCase());
  return c && c.rubro && c.rubro.toLowerCase().includes('bienes de cambio');
}

function toggleStockFields(input) {
  const row = input.closest('.line-entry');
  const fields = row.querySelector('.line-stock-fields');
  
  // Verificamos si el checkbox de "Asiento de Cierre" está marcado en el modal
  const chkCierre = document.getElementById('asientoCierre');
  const esAsientoCierre = chkCierre ? chkCierre.checked : false;

  // Si ES un asiento de cierre, ocultamos los campos de stock siempre
  if (esAsientoCierre) {
    fields.style.display = 'none';
    return;
  }

  // Si NO es de cierre, mantenemos la lógica normal de Bienes de Cambio
  if (isBienDeCambio(input.value.trim())) {
    fields.style.display = 'flex';
  } else {
    fields.style.display = 'none';
  }
}

function removeLine(id) {
  const el = document.getElementById(id);
  if (el) { el.remove(); updateBalance(); }
}

function updateBalance() {
  let totalD = 0, totalH = 0;
  document.querySelectorAll('.line-monto[data-tipo="debe"]').forEach(inp => { totalD += parseFloat(inp.value) || 0; });
  document.querySelectorAll('.line-monto[data-tipo="haber"]').forEach(inp => { totalH += parseFloat(inp.value) || 0; });

  document.getElementById('totalDebe').textContent = totalD.toFixed(2);
  document.getElementById('totalHaber').textContent = totalH.toFixed(2);

  const bar = document.getElementById('balanceBar');
  const status = document.getElementById('balanceStatus');
  const btn = document.getElementById('btnGuardar');

  const balanced = Math.abs(totalD - totalH) < 0.01 && totalD > 0;
  bar.className = 'balance-bar ' + (balanced ? 'balanced' : 'unbalanced');
  status.textContent = balanced ? '✓ Balanceado' : '⚠ Desbalanceado';
  btn.disabled = !balanced;
}

function guardarAsiento() {
  const fecha = document.getElementById('asientoFecha').value;
  const glosa = document.getElementById('asientoGlosa').value.trim();
  const chkCierre = document.getElementById('asientoCierre');
  const esCierre = chkCierre ? chkCierre.checked : false;

  const debe = [];
  let hayError = false;

  document.querySelectorAll('#lineasDebe .line-entry').forEach(row => {
    const cuenta = row.querySelector('.line-cuenta').value.trim();
    const monto = parseFloat(row.querySelector('.line-monto').value) || 0;
    if (cuenta && monto > 0) {
      const existe = cuentas.some(c => c.nombre.toLowerCase() === cuenta.toLowerCase());
      if (!existe) { alert('La cuenta "' + cuenta + '" no existe en tu Plan de Cuentas. Por favor, agregala primero.'); hayError = true; }
      const entry = { cuenta, monto };
      const qtyEl = row.querySelector('.line-qty');
      const priceEl = row.querySelector('.line-price');
      if (qtyEl && priceEl && isBienDeCambio(cuenta)) {
        entry.qty = parseFloat(qtyEl.value) || 0;
        entry.price = parseFloat(priceEl.value) || 0;
      }
      debe.push(entry);
    }
  });

  if (hayError) return;

  const haber = [];
  document.querySelectorAll('#lineasHaber .line-entry').forEach(row => {
    const cuenta = row.querySelector('.line-cuenta').value.trim();
    const monto = parseFloat(row.querySelector('.line-monto').value) || 0;
    if (cuenta && monto > 0) {
      const existe = cuentas.some(c => c.nombre.toLowerCase() === cuenta.toLowerCase());
      if (!existe) { alert('La cuenta "' + cuenta + '" no existe en tu Plan de Cuentas. Por favor, agregala primero.'); hayError = true; }
      const entry = { cuenta, monto };
      const qtyEl = row.querySelector('.line-qty');
      const priceEl = row.querySelector('.line-price');
      if (qtyEl && priceEl && isBienDeCambio(cuenta)) {
        entry.qty = parseFloat(qtyEl.value) || 0;
        entry.price = parseFloat(priceEl.value) || 0;
      }
      haber.push(entry);
    }
  });

  if (hayError) return;
  if (debe.length === 0 || haber.length === 0) return alert('El asiento debe tener al menos una cuenta deudora y una acreedora válidas.');

  const totalD = debe.reduce((s, d) => s + d.monto, 0);
  const totalH = haber.reduce((s, h) => s + h.monto, 0);
  if (Math.abs(totalD - totalH) >= 0.01) return alert('El asiento no está balanceado.');

  const nuevoAsiento = { fecha, glosa, esCierre, debe, haber };

  if (editingAsientoIndex !== null) {
    asientos[editingAsientoIndex] = nuevoAsiento;
  } else {
    asientos.push(nuevoAsiento);
  }

  asientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  saveData();

  closeModal();
  renderDiario(document.getElementById('contentArea'));
}

function deleteAsiento(idx) {
  if (!confirm('¿Eliminar el asiento N° ' + (idx + 1) + '?')) return;
  asientos.splice(idx, 1);
  saveData();
  renderDiario(document.getElementById('contentArea'));
}

/* ══════════════════════════════════════════
   LIBROS MAYORES
   ══════════════════════════════════════════ */
let mayorFilter = '';

function renderMayores(el) {
  if (asientos.length === 0) {
    el.innerHTML = `
      <div class="mayor-toolbar"><h2>Libros Mayores</h2></div>
      <div class="mayor-empty">No hay asientos en el Libro Diario. Registrá asientos para ver las cuentas mayores.</div>`;
    return;
  }

  const cuentasMap = {};
  asientos.forEach(a => {
    if (!a) return;
    (a.debe || []).forEach(d => {
      const key = d.cuenta.toLowerCase();
      if (!cuentasMap[key]) cuentasMap[key] = { nombre: d.cuenta, movimientos: [] };
      cuentasMap[key].movimientos.push({ fecha: a.fecha, detalle: a.glosa || '—', debe: d.monto, haber: 0 });
    });
    (a.haber || []).forEach(h => {
      const key = h.cuenta.toLowerCase();
      if (!cuentasMap[key]) cuentasMap[key] = { nombre: h.cuenta, movimientos: [] };
      cuentasMap[key].movimientos.push({ fecha: a.fecha, detalle: a.glosa || '—', debe: 0, haber: h.monto });
    });
  });

  const cuentasList = Object.values(cuentasMap).map(c => {
    const plan = cuentas.find(p => p.nombre.toLowerCase() === c.nombre.toLowerCase());
    const totalDebe = c.movimientos.reduce((s, m) => s + m.debe, 0);
    const totalHaber = c.movimientos.reduce((s, m) => s + m.haber, 0);
    c.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {
      codigo: plan ? plan.codigo : '—',
      nombre: c.nombre, movimientos: c.movimientos,
      totalDebe, totalHaber,
      saldo: Math.abs(totalDebe - totalHaber),
      tipo: totalDebe >= totalHaber ? 'deudor' : 'acreedor'
    };
  });

  cuentasList.sort((a, b) => {
    if (a.codigo === '—' && b.codigo === '—') return a.nombre.localeCompare(b.nombre);
    if (a.codigo === '—') return 1;
    if (b.codigo === '—') return -1;
    return a.codigo.localeCompare(b.codigo);
  });

  el.innerHTML = `
    <div class="mayor-toolbar">
      <h2>Libros Mayores</h2>
      <div class="mayor-search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="mayor-search" id="mayorSearch" placeholder="Buscar cuenta por nombre o código..." value="${mayorFilter}" oninput="filterMayores(this.value)">
      </div>
    </div>
    <div class="mayor-cards" id="mayorCards"></div>`;

  renderMayorCards(cuentasList);
}

function filterMayores(val) {
  mayorFilter = val;
  const el = document.getElementById('contentArea');
  if (currentModule === 'mayores') renderMayores(el);
  const input = document.getElementById('mayorSearch');
  if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
}

function renderMayorCards(cuentasList) {
  const container = document.getElementById('mayorCards');
  const q = mayorFilter.toLowerCase().trim();
  const filtered = q
    ? cuentasList.filter(c => c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q))
    : cuentasList;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="mayor-no-results">No se encontraron cuentas con ese criterio.</div>';
    return;
  }

  container.innerHTML = filtered.map((c, idx) => {
    const rowsHTML = c.movimientos.map(m => `
      <tr>
        <td class="td-fecha">${formatDate(m.fecha)}</td>
        <td class="td-detalle">${m.detalle}</td>
        <td class="td-monto">${m.debe > 0 ? formatMoney(m.debe) : ''}</td>
        <td class="td-monto">${m.haber > 0 ? formatMoney(m.haber) : ''}</td>
      </tr>`).join('');

    return `
      <div class="mayor-card" style="animation-delay:${idx * 0.05}s">
        <div class="mayor-card-header">
          <div class="mc-left">
            <span class="mc-code">${c.codigo}</span>
            <span class="mc-name">${c.nombre}</span>
          </div>
          <div class="mc-saldo">
            ${formatMoney(c.saldo)}
            <span class="saldo-tipo ${c.tipo}">${c.tipo === 'deudor' ? 'Deudor' : 'Acreedor'}</span>
          </div>
        </div>
        <table class="mayor-card-table">
          <thead><tr><th>Fecha</th><th>Detalle</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th></tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
        <div class="mayor-card-foot">
          <span><span class="foot-label">Debe</span> <span class="foot-val">${formatMoney(c.totalDebe)}</span></span>
          <span><span class="foot-label">Haber</span> <span class="foot-val">${formatMoney(c.totalHaber)}</span></span>
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   AJUSTE POR INFLACIÓN
   ══════════════════════════════════════════ */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function mesLabel(fecha) {
  if (!fecha) return '—';
  const [y, m] = fecha.split('-');
  return MESES[parseInt(m)-1] + y.slice(2);
}
function mesDisplay(str) {
  if (!str || str.length < 4) return '';
  const m = str.slice(0, 3).toLowerCase();
  const y = str.slice(3);
  const idx = MESES.indexOf(m);
  return idx >= 0 ? MESES_FULL[idx] + ' 20' + y : '';
}

function getMesesFromLD() {
  const mesesSet = new Set();
  asientos.forEach(a => { if (a && a.fecha) mesesSet.add(mesLabel(a.fecha)); });
  return Array.from(mesesSet).sort();
}

function getCoef(mesOrigen) {
  if (!mesOrigen || mesOrigen === '—') return 1;
  if (modoInflacion === 'coeficientes') {
    return parseFloat(indices[mesOrigen]) || 1;
  }
  const idxC = parseFloat(indices[mesCierre]) || 0;
  const idxO = parseFloat(indices[mesOrigen]) || 0;
  return (idxC > 0 && idxO > 0) ? idxC / idxO : 1;
}

function renderInflacion(el) {
  if (asientos.length === 0) {
    el.innerHTML = '<div class="inflacion-toolbar"><h2>Ajuste por Inflación</h2></div><div class="inflacion-empty">No hay asientos en el Libro Diario. Cargá asientos para trabajar con el ajuste.</div>';
    return;
  }

  const mesesLD = getMesesFromLD();
  const cuentasExcluidas = ['recpam'];

  const noMon = cuentas.filter(c => c.tipoMoneda === 'no_monetaria' && !cuentasExcluidas.includes(c.nombre.toLowerCase()));
  const mon = cuentas.filter(c => c.tipoMoneda === 'monetaria' && !cuentasExcluidas.includes(c.nombre.toLowerCase()));

  const coefLabel = modoInflacion === 'indices' ? 'Índice IPC' : 'Coeficiente';
  let coefItemsHTML = '';
  const allMeses = [...new Set([...mesesLD, ...(mesCierre ? [mesCierre] : [])])].sort();
  allMeses.forEach(m => {
    const isCierre = m === mesCierre;
    const val = indices[m] !== undefined ? indices[m] : '';
    coefItemsHTML += `<div class="coef-item ${isCierre ? 'cierre' : ''}">
      <span class="coef-mes">${m}</span>
      <input type="number" step="0.01" value="${val}" placeholder="${coefLabel}" onchange="updateIdx('${m}', this.value)">
    </div>`;
  });

  let indirectoHTML = '';
  let recpamIndD = 0, recpamIndH = 0;
  noMon.forEach(cuenta => {
    const esBdC = cuenta.rubro && cuenta.rubro.toLowerCase().includes('bienes de cambio');
    const esCMV = cuenta.rubro === 'Costo de los bienes vendidos y servicios prestados';

    if (esBdC) {
      const { fifo } = calcPEPS(cuenta.nombre, true);
      if (fifo.length === 0) return;
      fifo.forEach((layer, li) => {
        const saldo = layer.qty * layer.price;
        if (saldo < 0.01) return;
        const coef = getCoef(layer.mes);
        const reexp = saldo * coef;
        const diff = Math.abs(reexp - saldo);
        let rD = 0, rH = 0;
        
        if (diff >= 0.01) rH = diff;
        
        recpamIndD += rD; recpamIndH += rH;
        indirectoHTML += `<tr>
          <td class="td-code">${cuenta.codigo}</td><td class="td-cuenta">${li === 0 ? cuenta.nombre : '<span style="color:var(--text-muted);font-size:12px">↳ capa ' + (li+1) + '</span>'} <span style="font-size:10px;color:#b45309">(${layer.qty} u.)</span></td>
          <td class="td-num">${formatMoney(saldo)} <span style="font-size:10px;color:var(--text-muted)">D</span></td>
          <td class="td-num" style="color:var(--text-muted)">${layer.mes}</td>
          <td class="td-coef">${coef.toFixed(4)}</td>
          <td class="td-num" style="font-weight:600">${formatMoney(reexp)}</td>
          <td class="td-num">${rD > 0 ? formatMoney(rD) : ''}</td>
          <td class="td-num">${rH > 0 ? formatMoney(rH) : ''}</td>
        </tr>`;
      });
    } else if (esCMV) {
      const bdcCuentas = cuentas.filter(c => c.rubro && c.rubro.toLowerCase().includes('bienes de cambio'));
      const consumosTotales = {};
      
      bdcCuentas.forEach(bdc => {
        const { consumos } = calcPEPS(bdc.nombre, true);
        consumos.forEach(c => {
          if (!consumosTotales[c.mesOrigen]) consumosTotales[c.mesOrigen] = 0;
          consumosTotales[c.mesOrigen] += c.total;
        });
      });

      if (Object.keys(consumosTotales).length > 0) {
        let lineIdx = 0;
        Object.keys(consumosTotales).sort().forEach(mesOrigen => {
          const saldo = consumosTotales[mesOrigen];
          if (saldo < 0.01) return;
          const coef = getCoef(mesOrigen);
          const reexp = saldo * coef;
          const diff = Math.abs(reexp - saldo);
          let rD = 0, rH = 0;
          
          if (diff >= 0.01) rH = diff; 
          
          recpamIndD += rD; recpamIndH += rH;
          indirectoHTML += `<tr>
            <td class="td-code">${cuenta.codigo}</td><td class="td-cuenta">${lineIdx === 0 ? cuenta.nombre : '<span style="color:var(--text-muted);font-size:12px">↳ lote origen ' + mesOrigen + '</span>'} <span style="font-size:10px;color:var(--forest)">(PEPS)</span></td>
            <td class="td-num">${formatMoney(saldo)} <span style="font-size:10px;color:var(--text-muted)">D</span></td>
            <td class="td-num" style="color:var(--text-muted)">${mesOrigen}</td>
            <td class="td-coef">${coef.toFixed(4)}</td>
            <td class="td-num" style="font-weight:600">${formatMoney(reexp)}</td>
            <td class="td-num">${rD > 0 ? formatMoney(rD) : ''}</td>
            <td class="td-num">${rH > 0 ? formatMoney(rH) : ''}</td>
          </tr>`;
          lineIdx++;
        });
      } else {
        const movsPorMes = {};
        asientos.forEach(a => {
          if (!a || a.esCierre) return;
          const mes = mesLabel(a.fecha);
          let mD = 0, mH = 0;
          (a.debe || []).forEach(d => { if (d.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) mD += d.monto; });
          (a.haber || []).forEach(h => { if (h.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) mH += h.monto; });
          if (mD > 0 || mH > 0) {
            if (!movsPorMes[mes]) movsPorMes[mes] = { d: 0, h: 0 };
            movsPorMes[mes].d += mD;
            movsPorMes[mes].h += mH;
          }
        });

        let lineIdx = 0;
        Object.keys(movsPorMes).sort().forEach(mesOr => {
          const tD = movsPorMes[mesOr].d;
          const tH = movsPorMes[mesOr].h;
          const saldo = Math.abs(tD - tH);
          if (saldo >= 0.01) {
            const esD = tD >= tH;
            const coef = getCoef(mesOr);
            const reexp = saldo * coef;
            const diff = Math.abs(reexp - saldo);
            let rD = 0, rH = 0;
            if (diff >= 0.01) { if (esD) rH = diff; else rD = diff; }
            recpamIndD += rD; recpamIndH += rH;
            indirectoHTML += `<tr>
              <td class="td-code">${cuenta.codigo}</td><td class="td-cuenta">${lineIdx === 0 ? cuenta.nombre : '<span style="color:var(--text-muted);font-size:12px">↳ mov. ' + mesOr + '</span>'}</td>
              <td class="td-num">${formatMoney(saldo)} <span style="font-size:10px;color:var(--text-muted)">${esD?'D':'A'}</span></td>
              <td class="td-num" style="color:var(--text-muted)">${mesOr}</td>
              <td class="td-coef">${coef.toFixed(4)}</td>
              <td class="td-num" style="font-weight:600">${formatMoney(reexp)}</td>
              <td class="td-num">${rD > 0 ? formatMoney(rD) : ''}</td>
              <td class="td-num">${rH > 0 ? formatMoney(rH) : ''}</td>
            </tr>`;
            lineIdx++;
          }
        });
      }
    } else {
      const movsPorMes = {};
      asientos.forEach(a => {
        if (!a || a.esCierre) return;
        const mes = mesLabel(a.fecha);
        let mD = 0, mH = 0;
        (a.debe || []).forEach(d => { if (d.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) mD += d.monto; });
        (a.haber || []).forEach(h => { if (h.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) mH += h.monto; });
        if (mD > 0 || mH > 0) {
          if (!movsPorMes[mes]) movsPorMes[mes] = { d: 0, h: 0 };
          movsPorMes[mes].d += mD;
          movsPorMes[mes].h += mH;
        }
      });

      let lineIdx = 0;
      Object.keys(movsPorMes).sort().forEach(mesOr => {
        const tD = movsPorMes[mesOr].d;
        const tH = movsPorMes[mesOr].h;
        const saldo = Math.abs(tD - tH);
        if (saldo >= 0.01) {
          const esD = tD >= tH;
          const coef = getCoef(mesOr);
          const reexp = saldo * coef;
          const diff = Math.abs(reexp - saldo);
          let rD = 0, rH = 0;
          if (diff >= 0.01) { if (esD) rH = diff; else rD = diff; }
          recpamIndD += rD; recpamIndH += rH;
          indirectoHTML += `<tr>
            <td class="td-code">${cuenta.codigo}</td><td class="td-cuenta">${lineIdx === 0 ? cuenta.nombre : '<span style="color:var(--text-muted);font-size:12px">↳ mov. ' + mesOr + '</span>'}</td>
            <td class="td-num">${formatMoney(saldo)} <span style="font-size:10px;color:var(--text-muted)">${esD?'D':'A'}</span></td>
            <td class="td-num" style="color:var(--text-muted)">${mesOr}</td>
            <td class="td-coef">${coef.toFixed(4)}</td>
            <td class="td-num" style="font-weight:600">${formatMoney(reexp)}</td>
            <td class="td-num">${rD > 0 ? formatMoney(rD) : ''}</td>
            <td class="td-num">${rH > 0 ? formatMoney(rH) : ''}</td>
          </tr>`;
          lineIdx++;
        }
      });
    }
  });
  const recpamIndNeto = Math.abs(recpamIndD - recpamIndH);
  const recpamIndTipo = recpamIndD >= recpamIndH ? 'Deudor' : 'Acreedor';

  let directoHTML = '';
  let recpamDirPerd = 0, recpamDirGan = 0;
  mon.forEach(cuenta => {
    let movs = [];
    asientos.forEach(a => {
      if (!a || a.esCierre) return;
      const mes = mesLabel(a.fecha);
      (a.debe || []).forEach(d => { if (d.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) movs.push({ fecha: a.fecha, mes, monto: d.monto, lado: 'debe', glosa: a.glosa || '—' }); });
      (a.haber || []).forEach(h => { if (h.cuenta.toLowerCase() === cuenta.nombre.toLowerCase()) movs.push({ fecha: a.fecha, mes, monto: h.monto, lado: 'haber', glosa: a.glosa || '—' }); });
    });
    if (movs.length === 0) return;
    movs.sort((a, b) => a.fecha.localeCompare(b.fecha));

    let cardPerd = 0, cardGan = 0;
    const rowsHTML = movs.map(m => {
      const coef = getCoef(m.mes);
      const coefMinus1 = coef - 1;
      const resultado = m.monto * Math.abs(coefMinus1);
      let perd = 0, gan = 0;
      if (resultado >= 0.01) {
        if (m.lado === 'debe') perd = resultado; else gan = resultado;
      }
      cardPerd += perd; cardGan += gan;
      return `<tr>
        <td class="td-num" style="color:var(--text-muted)">${m.mes}</td>
        <td style="font-size:13px">${m.glosa}</td>
        <td class="td-num">${m.lado === 'debe' ? formatMoney(m.monto) : ''}</td>
        <td class="td-num">${m.lado === 'haber' ? formatMoney(m.monto) : ''}</td>
        <td class="td-coef">${coefMinus1.toFixed(4)}</td>
        <td class="td-num" style="color:var(--burgundy)">${perd > 0 ? formatMoney(perd) : ''}</td>
        <td class="td-num" style="color:var(--forest)">${gan > 0 ? formatMoney(gan) : ''}</td>
      </tr>`;
    }).join('');

    const cardRecpam = Math.abs(cardPerd - cardGan);
    const cardTipo = cardPerd >= cardGan ? 'Pérdida' : 'Ganancia';
    recpamDirPerd += cardPerd; recpamDirGan += cardGan;

    directoHTML += `<div class="directo-card">
      <div class="directo-card-head">
        <div><span class="dc-code">${cuenta.codigo}</span><span class="dc-name">${cuenta.nombre}</span></div>
        <div style="font-family:var(--mono);font-size:14px;font-weight:600;color:var(--navy)">${formatMoney(cardRecpam)} <span style="font-size:10px">${cardTipo}</span></div>
      </div>
      <table class="ajuste-table" style="min-width:650px">
        <thead><tr><th>Mes</th><th>Detalle</th><th class="r">Debe</th><th class="r">Haber</th><th class="c">Coef−1</th><th class="r th-recpam">Pérdida</th><th class="r th-recpam">Ganancia</th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <div class="directo-card-foot">
        <span><span class="foot-label">Pérdida</span><span class="foot-val">${formatMoney(cardPerd)}</span></span>
        <span><span class="foot-label">Ganancia</span><span class="foot-val">${formatMoney(cardGan)}</span></span>
      </div>
    </div>`;
  });
  const recpamDirNeto = Math.abs(recpamDirPerd - recpamDirGan);
  const recpamDirTipo = recpamDirPerd >= recpamDirGan ? 'Deudor' : 'Acreedor';

  const diff = Math.abs(recpamIndNeto - recpamDirNeto);

  el.innerHTML = `
    <div class="inflacion-toolbar"><h2>Ajuste por Inflación</h2></div>

    <div class="cierre-config">
      <label>Mes de cierre:</label>
      <input type="text" value="${mesCierre}" placeholder="ej: dic25" onblur="setMesCierre(this.value.toLowerCase().trim())">
      <span class="cierre-display">${mesDisplay(mesCierre)}</span>
      <div class="inf-mode-btns" style="margin-left:auto;margin-bottom:0">
        <button class="inf-mode-btn ${modoInflacion==='indices'?'active':''}" onclick="setModo('indices')">Índices IPC</button>
        <button class="inf-mode-btn ${modoInflacion==='coeficientes'?'active':''}" onclick="setModo('coeficientes')">Coeficientes</button>
      </div>
    </div>

    <div class="coef-panel">
      <h3>📊 ${coefLabel}s por mes <span style="font-size:12px;color:var(--text-muted);font-weight:400;margin-left:8px">(leídos del Libro Diario)</span></h3>
      <p class="coef-sub">${modoInflacion === 'indices' ? 'Cargá el índice IPC de cada mes. El coeficiente se calcula como: índice cierre ÷ índice origen.' : 'Cargá el coeficiente directamente para cada mes.'}</p>
      <div class="coef-grid">${coefItemsHTML || '<span style="color:var(--text-muted);font-style:italic">Sin meses detectados</span>'}</div>
    </div>

    ${!mesCierre ? '<div class="inflacion-empty">Ingresá el mes de cierre para calcular el ajuste.</div>' : `

    <div class="inf-section">
      <div class="inf-section-title">Método Indirecto <span class="inf-tag indirecto">Partidas No Monetarias</span></div>
      ${noMon.length === 0 ? '<div class="inflacion-empty">No hay cuentas no monetarias para ajustar.</div>' : `
      <div class="ajuste-wrap"><table class="ajuste-table">
        <thead><tr><th>Cód.</th><th>Cuenta</th><th class="r">Saldo</th><th class="r">Mes (LD)</th><th class="c">Coef.</th><th class="r">Reexpresado</th><th class="r th-recpam">RECPAM D</th><th class="r th-recpam">RECPAM H</th></tr></thead>
        <tbody>${indirectoHTML || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);font-style:italic">Sin movimientos</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5"></td><td class="td-num" style="font-family:var(--serif)">Totales</td><td class="td-num">${formatMoney(recpamIndD)}</td><td class="td-num">${formatMoney(recpamIndH)}</td></tr>
        <tr><td colspan="5"></td><td class="td-num" style="font-family:var(--serif)">RECPAM Indirecto</td><td colspan="2" class="td-num" style="text-align:center;font-size:15px;color:var(--navy)">${formatMoney(recpamIndNeto)} ${recpamIndTipo}</td></tr></tfoot>
      </table></div>`}
    </div>

    <div class="inf-section">
      <div class="inf-section-title">Método Directo <span class="inf-tag directo">Partidas Monetarias</span></div>
      ${mon.length === 0 ? '<div class="inflacion-empty">No hay cuentas monetarias en el Plan de Cuentas.</div>' : `
      ${directoHTML || '<div class="inflacion-empty">Sin movimientos en cuentas monetarias.</div>'}
      ${directoHTML ? `<div class="ajuste-wrap"><table class="ajuste-table" style="min-width:400px">
        <tfoot><tr><td style="font-family:var(--serif);font-size:14px">RECPAM Directo</td><td class="td-num" style="font-size:15px;color:var(--navy)">${formatMoney(recpamDirNeto)} ${recpamDirTipo}</td></tr></tfoot>
      </table></div>` : ''}`}
    </div>

    <div class="recpam-compare">
      <div class="rc-item" style="background:rgba(27,42,74,0.04)">
        <div class="rc-label">RECPAM Indirecto</div>
        <div class="rc-val">${formatMoney(recpamIndNeto)}</div>
        <div class="rc-tipo" style="color:var(--navy)">${recpamIndTipo}</div>
      </div>
      <div class="rc-item" style="background:rgba(139,105,20,0.06)">
        <div class="rc-label">RECPAM Directo</div>
        <div class="rc-val">${formatMoney(recpamDirNeto)}</div>
        <div class="rc-tipo" style="color:#8b6914">${recpamDirTipo}</div>
      </div>
      <div class="rc-item" style="background:${diff < 0.01 ? 'rgba(22,101,52,0.06)' : 'rgba(122,35,50,0.06)'}">
        <div class="rc-label">Diferencia</div>
        <div class="rc-val" style="color:${diff < 0.01 ? 'var(--forest)' : 'var(--burgundy)'}">${formatMoney(diff)}</div>
        <div class="rc-tipo">${diff < 0.01 ? '✓ Sin diferencia' : '⚠ Revisar'}</div>
      </div>
    </div>
    `}`;
}

function setModo(modo) { modoInflacion = modo; saveData(); renderInflacion(document.getElementById('contentArea')); }
function setMesCierre(val) { mesCierre = val; saveData(); renderInflacion(document.getElementById('contentArea')); }
function updateIdx(mes, val) { indices[mes] = parseFloat(val) || 0; saveData(); renderInflacion(document.getElementById('contentArea')); }

/* ══════════════════════════════════════════
   STOCK (PEPS / FIFO)
   ══════════════════════════════════════════ */
function getStockProducts() {
  const bdcCuentas = cuentas.filter(c => c.rubro && c.rubro.toLowerCase().includes('bienes de cambio'));
  const names = new Set();
  bdcCuentas.forEach(c => {
    asientos.forEach(a => {
      if (!a || a.esCierre) return;
      (a.debe || []).forEach(d => { if (d.cuenta.toLowerCase() === c.nombre.toLowerCase()) names.add(c.nombre); });
      (a.haber || []).forEach(h => { if (h.cuenta.toLowerCase() === c.nombre.toLowerCase()) names.add(c.nombre); });
    });
  });
  return Array.from(names).sort();
}

function calcPEPS(producto, ignorarCierre = false) {
  const fifo = []; 
  const rows = [];
  const consumos = []; 

  asientos.forEach(a => {
    if (!a || (ignorarCierre && a.esCierre)) return;
    const mes = mesLabel(a.fecha);
    
    (a.debe || []).forEach(d => {
      if (d.cuenta.toLowerCase() !== producto.toLowerCase()) return;
      const qty = d.qty || 0;
      const price = d.price || 0;
      if (qty <= 0) return;
      fifo.push({ qty, price, mes });
      
      rows.push({ 
        fecha: a.fecha, glosa: a.glosa || '', 
        eQty: qty, ePrice: price, eTotal: qty * price, 
        sQty: '', sPrice: '', sTotal: '', 
        layers: fifo.map(l => ({...l})) 
      });
    });
    
    (a.haber || []).forEach(h => {
      if (h.cuenta.toLowerCase() !== producto.toLowerCase()) return;
      const qty = h.qty || 0;
      if (qty <= 0) return;
      let remaining = qty;
      let salidaTotal = 0;
      
      while (remaining > 0 && fifo.length > 0) {
        const layer = fifo[0];
        const take = Math.min(remaining, layer.qty);
        salidaTotal += take * layer.price;
        consumos.push({ mesOrigen: layer.mes, mesSalida: mes, qty: take, total: take * layer.price });
        layer.qty -= take;
        remaining -= take;
        if (layer.qty <= 0) fifo.shift();
      }
      const avgPrice = qty > 0 ? salidaTotal / qty : 0;
      
      rows.push({ 
        fecha: a.fecha, glosa: a.glosa || '', 
        eQty: '', ePrice: '', eTotal: '', 
        sQty: qty, sPrice: avgPrice, sTotal: salidaTotal, 
        layers: fifo.map(l => ({...l})) 
      });
    });
  });

  return { rows, fifo, consumos };
}

function renderStock(el) {
  const products = getStockProducts();

  let productsHTML = '';
  products.forEach(prod => {
    const { rows, fifo } = calcPEPS(prod);
    let tbodyHTML = '';
    
    if (rows.length === 0) {
      tbodyHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text-muted);font-style:italic">Sin movimientos</td></tr>';
    } else {
      rows.forEach(r => {
        const layers = r.layers;
        const numLayers = layers.length;
        const showTotal = numLayers > 1;
        const rowSpan = showTotal ? numLayers + 1 : (numLayers === 0 ? 1 : 1);
        
        let tr = `<tr>`;
        tr += `<td rowspan="${rowSpan}" style="text-align:left;font-size:11px;color:var(--text-muted);vertical-align:top;padding-top:10px;">${formatDate(r.fecha)}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.eQty !== '' ? r.eQty : ''}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.ePrice !== '' ? formatMoney(r.ePrice) : ''}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.eTotal !== '' ? formatMoney(r.eTotal) : ''}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.sQty !== '' ? r.sQty : ''}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.sPrice !== '' ? formatMoney(r.sPrice) : ''}</td>`;
        tr += `<td rowspan="${rowSpan}" style="vertical-align:top;padding-top:10px;">${r.sTotal !== '' ? formatMoney(r.sTotal) : ''}</td>`;
        
        if (numLayers === 0) {
          tr += `<td>0</td><td>0.00</td><td style="font-weight:600">0.00</td></tr>`;
          tbodyHTML += tr;
        } else {
          tr += `<td>${layers[0].qty}</td>`;
          tr += `<td>${formatMoney(layers[0].price)}</td>`;
          tr += `<td style="font-weight:600">${formatMoney(layers[0].qty * layers[0].price)}</td></tr>`;
          tbodyHTML += tr;
          
          for (let i = 1; i < numLayers; i++) {
            tbodyHTML += `<tr>`;
            tbodyHTML += `<td style="text-align:right;">${layers[i].qty}</td>`;
            tbodyHTML += `<td>${formatMoney(layers[i].price)}</td>`;
            tbodyHTML += `<td style="font-weight:600">${formatMoney(layers[i].qty * layers[i].price)}</td>`;
            tbodyHTML += `</tr>`;
          }
          
          if (showTotal) {
            const totalQty = layers.reduce((sum, l) => sum + l.qty, 0);
            const totalVal = layers.reduce((sum, l) => sum + (l.qty * l.price), 0);
            tbodyHTML += `<tr style="background: rgba(27,42,74,0.02);">`;
            tbodyHTML += `<td style="text-align:right; font-weight:700; border-top:1px solid var(--border); color:var(--navy);">${totalQty}</td>`;
            tbodyHTML += `<td style="text-align:right; border-top:1px solid var(--border); color:var(--text-muted);">—</td>`;
            tbodyHTML += `<td style="font-weight:700; border-top:1px solid var(--border); color:var(--navy);">${formatMoney(totalVal)}</td>`;
            tbodyHTML += `</tr>`;
          }
        }
        
        tbodyHTML += `<tr><td colspan="10" style="height:4px; background:var(--surface-2); border-bottom:1px solid var(--border-light);"></td></tr>`;
      });
    }

    const totalFinalQty = fifo.reduce((s, l) => s + l.qty, 0);
    const totalFinalVal = fifo.reduce((s, l) => s + (l.qty * l.price), 0);

    productsHTML += `
      <div class="stock-card">
        <div class="stock-card-head">
          <span class="sc-name">${prod}</span>
          <span class="sc-stock">Exist.: ${totalFinalQty} u. — ${formatMoney(totalFinalVal)}</span>
        </div>
        <div style="overflow-x:auto">
        <table class="stock-table">
          <thead>
            <tr><th rowspan="2" class="group-head" style="width:70px">Fecha</th><th colspan="3" class="group-head">Entradas</th><th colspan="3" class="group-head">Salidas</th><th colspan="3" class="group-head">Existencia</th></tr>
            <tr><th class="sub">Cant.</th><th class="sub">Precio</th><th class="sub">Total</th><th class="sub">Cant.</th><th class="sub">Precio</th><th class="sub">Total</th><th class="sub">Cant.</th><th class="sub">Precio</th><th class="sub">Saldo</th></tr>
          </thead>
          <tbody>${tbodyHTML}</tbody>
        </table></div>
      </div>`;
  });

  el.innerHTML = `
    <div class="stock-toolbar"><h2>Stock — PEPS (FIFO)</h2></div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Las fichas se generan automáticamente desde el Libro Diario mostrando la anticuación de partidas (lotes separados).</div>
    ${products.length === 0 ? '<div class="stock-empty">No hay movimientos de stock. Cargá asientos con cuentas de Bienes de cambio (con cantidad y precio) en el Libro Diario.</div>' : productsHTML}
  `;
}

/* ══════════════════════════════════════════
   MODELOS CONTABLES
   ══════════════════════════════════════════ */

function updateModeloVal(asientoIdx, lineKey, model, col, val) {
  const key = asientoIdx + '_' + lineKey + '_' + model + '_' + col;
  if (val === '') {
    delete modelosData[key]; // Si borrás la celda, vuelve al valor por defecto
  } else {
    modelosData[key] = parseFloat(val) || 0;
  }
  saveData();
}

function getModeloVal(asientoIdx, lineKey, model, col, defaultVal) {
  const key = asientoIdx + '_' + lineKey + '_' + model + '_' + col;
  if (modelosData[key] !== undefined) return modelosData[key];
  return defaultVal; // Si no hay dato guardado, usa el monto original del asiento
}

function renderModelos(el) {
  if (asientos.length === 0) {
    el.innerHTML = '<div class="modelos-toolbar"><h2>Modelos Contables</h2></div><div class="modelos-empty">No hay asientos en el Libro Diario.</div>';
    return;
  }

  const mNames = ['M1','M2','M3','M4','M5','M6'];
  const mClasses = ['m1','m2','m3','m4','m5','m6'];

  let bodyHTML = '';
  asientos.forEach((a, idx) => {
    if (!a || !a.fecha) return;
    const fecha = formatDate(a.fecha);
    const isCierre = a.esCierre;
    const cierreBadge = isCierre ? '<span style="margin-left:8px; font-size:10px; background:var(--burgundy); color:#fff; padding:2px 6px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px;">Cierre</span>' : '';

    bodyHTML += `<tr><td class="td-sep" colspan="${4 + 12}">— ${idx+1} — ${cierreBadge}</td></tr>`;

    const lockAttr = !isCierre ? 'readonly class="locked-input"' : '';

    (a.debe || []).forEach((d, di) => {
      const lk = 'd' + di;
      const defaultVal = isCierre ? '' : d.monto;
      
      bodyHTML += `<tr>
        <td class="td-fecha">${di === 0 ? fecha : ''}</td>
        <td class="td-det" style="font-weight:600;color:var(--navy)">${d.cuenta}</td>
        <td class="td-num">${formatMoney(d.monto)}</td>
        <td></td>`;
      mNames.forEach((m, mi) => {
        // CORRECCIÓN: Si no es cierre, fuerza el valor original e ignora la memoria
        const dv = !isCierre ? defaultVal : getModeloVal(idx, lk, mi, 'd', defaultVal);
        const hv = !isCierre ? '' : getModeloVal(idx, lk, mi, 'h', '');
        
        bodyHTML += `<td><input type="number" step="0.01" placeholder="—" value="${dv !== '' ? dv : ''}" ${lockAttr} onchange="updateModeloVal(${idx},'${lk}',${mi},'d',this.value)"></td>
          <td><input type="number" step="0.01" placeholder="—" value="${hv !== '' ? hv : ''}" ${lockAttr} onchange="updateModeloVal(${idx},'${lk}',${mi},'h',this.value)"></td>`;
      });
      bodyHTML += '</tr>';
    });

    (a.haber || []).forEach((h, hi) => {
      const lk = 'h' + hi;
      const defaultVal = isCierre ? '' : h.monto;

      bodyHTML += `<tr>
        <td class="td-fecha"></td>
        <td class="td-det" style="padding-left:24px;color:var(--text-secondary)"><em>a</em> ${h.cuenta}</td>
        <td></td>
        <td class="td-num">${formatMoney(h.monto)}</td>`;
      mNames.forEach((m, mi) => {
        // CORRECCIÓN: Si no es cierre, fuerza el valor original e ignora la memoria
        const dv = !isCierre ? '' : getModeloVal(idx, lk, mi, 'd', '');
        const hv = !isCierre ? defaultVal : getModeloVal(idx, lk, mi, 'h', defaultVal);
        
        bodyHTML += `<td><input type="number" step="0.01" placeholder="—" value="${dv !== '' ? dv : ''}" ${lockAttr} onchange="updateModeloVal(${idx},'${lk}',${mi},'d',this.value)"></td>
          <td><input type="number" step="0.01" placeholder="—" value="${hv !== '' ? hv : ''}" ${lockAttr} onchange="updateModeloVal(${idx},'${lk}',${mi},'h',this.value)"></td>`;
      });
      bodyHTML += '</tr>';
    });
  });

  let thModels = '';
  mNames.forEach((m, mi) => {
    thModels += `<th colspan="2" class="${mClasses[mi]}" style="border-bottom:1px solid rgba(255,255,255,0.15)">${m}</th>`;
  });
  let thSub = '';
  mNames.forEach((m, mi) => {
    thSub += `<th class="${mClasses[mi]}" style="font-size:10px">D</th><th class="${mClasses[mi]}" style="font-size:10px">H</th>`;
  });

  el.innerHTML = `
    <div class="modelos-toolbar"><h2>Modelos Contables</h2></div>
    <div class="modelos-wrap">
      <table class="modelos-table">
        <thead>
          <tr>
            <th rowspan="2" class="base-col" style="width:70px">Fecha</th>
            <th rowspan="2" class="base-col">Detalle</th>
            <th rowspan="2" class="base-col" style="width:80px">Debe</th>
            <th rowspan="2" class="base-col" style="width:80px">Haber</th>
            ${thModels}
          </tr>
          <tr>${thSub}</tr>
        </thead>
        <tbody>${bodyHTML}</tbody>
      </table>
    </div>
  `;
}
/* ══════════════════════════════════════════
   UTILS & AUTOCOMPLETE
   ══════════════════════════════════════════ */
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('open'); }
function toggleCollapse() { document.getElementById('sidebar').classList.toggle('collapsed'); }

function showAutocomplete(input) {
  const wrapper = input.parentElement;
  const list = wrapper.querySelector('.autocomplete-list');
  const val = input.value.toLowerCase().trim();

  list.innerHTML = '';
  if (cuentas.length === 0) {
     list.innerHTML = '<div class="autocomplete-item empty-msg">Tu plan de cuentas está vacío. Creá cuentas antes de cargar asientos.</div>';
     list.style.display = 'block';
     return;
  }

  const matches = val ? cuentas.filter(c => c.nombre.toLowerCase().includes(val) || c.codigo.includes(val)) : cuentas;

  if (matches.length === 0) {
    list.innerHTML = '<div class="autocomplete-item empty-msg">No se encontraron cuentas que coincidan</div>';
  } else {
    matches.forEach(m => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = m.codigo + ' - ' + m.nombre;
      item.onclick = function() {
        input.value = m.nombre;
        list.style.display = 'none';
        try { toggleStockFields(input); } catch(e){}
        input.dispatchEvent(new Event('input')); 
      };
      list.appendChild(item);
    });
  }
  list.style.display = 'block';
}

document.addEventListener('click', function(e) {
  if (!e.target.classList.contains('line-cuenta')) {
    document.querySelectorAll('.autocomplete-list').forEach(l => l.style.display = 'none');
  }
});

/* ══════════════════════════════════════════
   PLAN DE CUENTAS — DATA & LOGIC
   ══════════════════════════════════════════ */
const ELEMENTOS = {
  '1': { nombre: 'ACTIVO', tieneCorrencia: true },
  '2': { nombre: 'PASIVO', tieneCorrencia: true },
  '3': { nombre: 'PATRIMONIO NETO', tieneCorrencia: true, subLabels: ['Aporte de los propietarios', 'Resultados acumulados'] },
  '4': { nombre: 'RESULTADOS POSITIVOS', tieneCorrencia: false },
  '5': { nombre: 'RESULTADOS NEGATIVOS', tieneCorrencia: false }
};

const RUBROS = {
  '1': {
    'Corriente': ['Caja y bancos', 'Inversiones financieras', 'Cuentas por cobrar a clientes en moneda', 'Cuentas por cobrar a clientes en especie', 'Créditos impositivos', 'Créditos con partes relacionadas', 'Otras cuentas por cobrar en moneda', 'Otras cuentas por cobrar en especie', 'Bienes de cambio', 'Otras inversiones', 'Otros activos'],
    'No corriente': ['Inversiones financieras', 'Cuentas por cobrar a clientes en moneda', 'Cuentas por cobrar a clientes en especie', 'Créditos impositivos', 'Créditos con partes relacionadas', 'Otras cuentas por cobrar en moneda', 'Otras cuentas por cobrar en especie', 'Bienes de cambio', 'Bienes de uso', 'Propiedades de inversión', 'Otras inversiones', 'Activos intangibles', 'Otros activos']
  },
  '2': {
    'Corriente': ['Proveedores de bienes y servicios', 'Préstamos y otros pasivos financieros', 'Deudas fiscales', 'Deudas laborales y previsionales', 'Deudas en especie', 'Deudas con partes relacionadas', 'Otras deudas', 'Subsidios y otras ayudas gubernamentales', 'Previsiones'],
    'No corriente': ['Proveedores de bienes y servicios', 'Préstamos y otros pasivos financieros', 'Deudas fiscales', 'Deudas laborales y previsionales', 'Deudas en especie', 'Deudas con partes relacionadas', 'Otras deudas', 'Subsidios y otras ayudas gubernamentales', 'Pasivo neto por impuesto diferido', 'Previsiones']
  },
  '3': { 'Aporte de los propietarios': ['Capital', 'Ajuste de Capital', 'Aportes Irrevocables de Capital', 'Primas de Emisión'], 'Resultados acumulados': ['Ganancias reservadas', 'Resultados diferidos', 'Resultados no asignados'] },
  '4': { '_': ['Ingresos por ventas de bienes y prestación de servicios', 'Otros ingresos'] },
  '5': { '_': ['Costo de los bienes vendidos y servicios prestados', 'Gastos de comercialización', 'Gastos de administración', 'Otros gastos operativos', 'Cambios en el valor razonable de propiedades de inversión', 'Pérdidas por desvalorización', 'Otros resultados financieros y por tenencia', 'Otros egresos'] }
};

const CUENTAS_PN_FIJAS = [
  { elemento:'3', correncia:'Aporte de los propietarios', rubro:'Capital', nombre:'Capital', codigo:'3.1.01.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Aporte de los propietarios', rubro:'Ajuste de Capital', nombre:'Ajuste de Capital', codigo:'3.1.02.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Aporte de los propietarios', rubro:'Aportes Irrevocables de Capital', nombre:'Aportes Irrevocables de Capital', codigo:'3.1.03.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Aporte de los propietarios', rubro:'Primas de Emisión', nombre:'Primas de Emisión', codigo:'3.1.04.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Ganancias reservadas', nombre:'Reserva Legal', codigo:'3.2.01.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Ganancias reservadas', nombre:'Reserva Estatutaria', codigo:'3.2.01.002', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Ganancias reservadas', nombre:'Reserva Facultativa', codigo:'3.2.01.003', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Resultados diferidos', nombre:'Resultados Diferidos', codigo:'3.2.02.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Resultados no asignados', nombre:'A. R. E. A.', codigo:'3.2.03.001', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Resultados no asignados', nombre:'Resultados Acumulados de Ejercicios Anteriores', codigo:'3.2.03.002', tipoMoneda:'no_monetaria' },
  { elemento:'3', correncia:'Resultados acumulados', rubro:'Resultados no asignados', nombre:'Resultado del Ejercicio', codigo:'3.2.03.003', tipoMoneda:'no_monetaria' }
];

function ensurePNCuentas() {
  CUENTAS_PN_FIJAS.forEach(pn => {
    const exists = cuentas.find(c => c.elemento === '3' && c.nombre.toLowerCase() === pn.nombre.toLowerCase());
    if (!exists) cuentas.push({...pn});
  });
  cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function renderPlan(el) {
  el.innerHTML = `
    <div class="plan-toolbar">
      <h2>Plan de Cuentas</h2>
      <span style="font-size:13px;color:var(--text-muted)">${cuentas.length} cuenta${cuentas.length !== 1 ? 's' : ''} registrada${cuentas.length !== 1 ? 's' : ''}</span>
    </div>

    <div class="plan-creator">
      <h3>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Crear nueva cuenta
      </h3>
      <div class="plan-steps">
        <div class="plan-step" id="step1">
          <div class="plan-step-num" id="stepNum1">1</div>
          <label>Elemento</label>
          <select id="selElemento" onchange="onElementoChange()">
            <option value="">— Seleccionar elemento —</option>
            <option value="1">1 — ACTIVO</option>
            <option value="2">2 — PASIVO</option>
            <option value="3">3 — PATRIMONIO NETO</option>
            <option value="4">4 — RESULTADOS POSITIVOS</option>
            <option value="5">5 — RESULTADOS NEGATIVOS</option>
          </select>
        </div>
        <div class="plan-step disabled" id="step2">
          <div class="plan-step-num" id="stepNum2">2</div>
          <label>Clasificación</label>
          <select id="selCorrencia" onchange="onCorrenciaChange()">
            <option value="">— Seleccionar —</option>
            <option value="Corriente">Corriente</option>
            <option value="No corriente">No corriente</option>
          </select>
        </div>
        <div class="plan-step disabled" id="step3">
          <div class="plan-step-num" id="stepNum3">3</div>
          <label>Rubro</label>
          <select id="selRubro" onchange="onRubroChange()">
            <option value="">— Seleccionar rubro —</option>
          </select>
        </div>
        <div class="plan-step disabled" id="step4">
          <div class="plan-step-num" id="stepNum4">4</div>
          <label>Cuenta</label>
          <input type="text" id="inputCuenta" placeholder="Ej: Banco Nación cta. cte." oninput="onCuentaInput()">
        </div>
        <div class="plan-step disabled" id="step5">
          <div class="plan-step-num" id="stepNum5">5</div>
          <label>Cualidad (Inflación)</label>
          <select id="selMonetaria" onchange="onMonetariaChange()">
            <option value="">— Seleccionar —</option>
            <option value="monetaria">Monetaria</option>
            <option value="no_monetaria">No monetaria</option>
          </select>
        </div>
      </div>
      <div class="plan-code-preview" id="codePreview">
        <span class="code-num" id="previewCode"></span>
        <span class="code-name" id="previewName"></span>
      </div>
      <div style="margin-top:16px">
        <button class="btn-crear-cuenta" id="btnCrearCuenta" disabled onclick="crearCuenta()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Crear cuenta
        </button>
      </div>
    </div>

    <div class="plan-tree" id="planTree"></div>
  `;
  renderTree();
}

function onElementoChange() {
  const val = document.getElementById('selElemento').value;
  const elem = ELEMENTOS[val];
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const step4 = document.getElementById('step4');
  const step5 = document.getElementById('step5');

  document.getElementById('selCorrencia').value = '';
  document.getElementById('selRubro').innerHTML = '<option value="">— Seleccionar rubro —</option>';
  document.getElementById('inputCuenta').value = '';
  document.getElementById('selMonetaria').value = '';
  
  step3.classList.add('disabled');
  step4.classList.add('disabled');
  step5.classList.add('disabled');
  updateStepNums();

  if (!val) {
    step2.classList.add('disabled');
    hidePreview();
    return;
  }

  document.getElementById('stepNum1').classList.add('done');
  if (val === '3') {
    step2.classList.add('disabled');
    step3.classList.add('disabled');
    step4.classList.add('disabled');
    step5.classList.add('disabled');
    document.getElementById('selCorrencia').value = '';
    alert('Las cuentas del Patrimonio Neto se generan automáticamente. Miralas en el árbol de abajo.');
    hidePreview();
    updateBtn();
    return;
  }

  if (elem.tieneCorrencia) {
    step2.classList.remove('disabled');
    const sel = document.getElementById('selCorrencia');
    if (elem.subLabels) { sel.innerHTML = '<option value="">— Seleccionar —</option>'; elem.subLabels.forEach(label => { sel.innerHTML += '<option value="'+label+'">'+label+'</option>'; }); } else { sel.innerHTML = '<option value="">— Seleccionar —</option><option value="Corriente">Corriente</option><option value="No corriente">No corriente</option>'; }
  } else {
    step2.classList.add('disabled');
    document.getElementById('selCorrencia').value = '_skip_';
    populateRubros(val, '_');
    step3.classList.remove('disabled');
  }
  hidePreview();
  updateBtn();
}

function onCorrenciaChange() {
  const elemVal = document.getElementById('selElemento').value;
  const corrVal = document.getElementById('selCorrencia').value;
  const step3 = document.getElementById('step3');
  const step4 = document.getElementById('step4');
  const step5 = document.getElementById('step5');

  document.getElementById('selRubro').innerHTML = '<option value="">— Seleccionar rubro —</option>';
  document.getElementById('inputCuenta').value = '';
  document.getElementById('selMonetaria').value = '';
  
  step4.classList.add('disabled');
  step5.classList.add('disabled');
  document.getElementById('stepNum4').classList.remove('done');
  document.getElementById('stepNum5').classList.remove('done');

  if (!corrVal) {
    step3.classList.add('disabled');
    hidePreview();
    updateBtn();
    return;
  }

  document.getElementById('stepNum2').classList.add('done');
  populateRubros(elemVal, corrVal);
  step3.classList.remove('disabled');
  hidePreview();
  updateBtn();
}

function populateRubros(elemKey, corrKey) {
  const rubros = RUBROS[elemKey]?.[corrKey] || [];
  const sel = document.getElementById('selRubro');
  sel.innerHTML = '<option value="">— Seleccionar rubro —</option>';
  rubros.forEach((r, i) => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  });
}

function onRubroChange() {
  const val = document.getElementById('selRubro').value;
  const step4 = document.getElementById('step4');
  const step5 = document.getElementById('step5');
  
  document.getElementById('inputCuenta').value = '';
  document.getElementById('selMonetaria').value = '';

  if (!val) {
    step4.classList.add('disabled');
    step5.classList.add('disabled');
    document.getElementById('stepNum4').classList.remove('done');
    document.getElementById('stepNum5').classList.remove('done');
    hidePreview();
    updateBtn();
    return;
  }

  document.getElementById('stepNum3').classList.add('done');
  step4.classList.remove('disabled');
  document.getElementById('inputCuenta').focus();
  updatePreview();
  updateBtn();
}

function onCuentaInput() {
  const val = document.getElementById('inputCuenta').value.trim();
  const step5 = document.getElementById('step5');
  
  if (val) {
    document.getElementById('stepNum4').classList.add('done');
    step5.classList.remove('disabled');
  } else {
    document.getElementById('stepNum4').classList.remove('done');
    step5.classList.add('disabled');
    document.getElementById('selMonetaria').value = '';
    document.getElementById('stepNum5').classList.remove('done');
  }
  
  updatePreview();
  updateBtn();
}

function onMonetariaChange() {
  const val = document.getElementById('selMonetaria').value;
  if (val) {
    document.getElementById('stepNum5').classList.add('done');
  } else {
    document.getElementById('stepNum5').classList.remove('done');
  }
  updateBtn();
}

function getCodigo() {
  const elemVal = document.getElementById('selElemento').value;
  if (!elemVal) return '';

  const elem = ELEMENTOS[elemVal];
  let code = elemVal;

  if (elem.tieneCorrencia) {
    const corrVal = document.getElementById('selCorrencia').value;
    if (!corrVal) return code;
    if (elem.subLabels) { code += '.' + (elem.subLabels.indexOf(corrVal) + 1); } else { code += '.' + (corrVal === 'Corriente' ? '1' : '2'); }
  } else {
    code += '.0';
  }

  const rubroSel = document.getElementById('selRubro');
  if (!rubroSel.value) return code;
  const rubroIdx = Array.from(rubroSel.options).findIndex(o => o.value === rubroSel.value);
  code += '.' + String(rubroIdx).padStart(2, '0');

  const cuentaNombre = document.getElementById('inputCuenta').value.trim();
  if (!cuentaNombre) return code + '.??';

  const existingInRubro = cuentas.filter(c => c.elemento === elemVal && c.correncia === getCorrencia() && c.rubro === rubroSel.value);
  const nextNum = String(existingInRubro.length + 1).padStart(2, '0');
  return code + '.' + nextNum;
}

function getCorrencia() {
  const elemVal = document.getElementById('selElemento').value;
  const elem = ELEMENTOS[elemVal];
  if (!elem) return '';
  if (!elem.tieneCorrencia) return '_';
  return document.getElementById('selCorrencia').value;
}

function updatePreview() {
  const code = getCodigo();
  const nombre = document.getElementById('inputCuenta').value.trim();
  const preview = document.getElementById('codePreview');

  if (code) {
    document.getElementById('previewCode').textContent = code;
    document.getElementById('previewName').textContent = nombre || '...';
    preview.classList.add('visible');
  } else {
    hidePreview();
  }
}

function hidePreview() {
  document.getElementById('codePreview').classList.remove('visible');
}

function updateStepNums() {
  ['stepNum1','stepNum2','stepNum3','stepNum4','stepNum5'].forEach(id => {
    document.getElementById(id).classList.remove('done');
  });
}

function updateBtn() {
  const elemVal = document.getElementById('selElemento').value;
  const rubroVal = document.getElementById('selRubro').value;
  const cuentaVal = document.getElementById('inputCuenta').value.trim();
  const monetariaVal = document.getElementById('selMonetaria').value;
  const elem = ELEMENTOS[elemVal];

  let ready = !!elemVal && !!rubroVal && !!cuentaVal && !!monetariaVal;
  if (elem && elem.tieneCorrencia) {
    const corrVal = document.getElementById('selCorrencia').value;
    ready = ready && !!corrVal;
  }

  document.getElementById('btnCrearCuenta').disabled = !ready;
}

function crearCuenta() {
  const elemVal = document.getElementById('selElemento').value;
  const correncia = getCorrencia();
  const rubro = document.getElementById('selRubro').value;
  const nombre = document.getElementById('inputCuenta').value.trim();
  const tipoMoneda = document.getElementById('selMonetaria').value;
  const codigo = getCodigo();

  if (!nombre || !tipoMoneda) return;

  const exists = cuentas.find(c => c.elemento === elemVal && c.correncia === correncia && c.rubro === rubro && c.nombre.toLowerCase() === nombre.toLowerCase());
  if (exists) return alert('Ya existe una cuenta con ese nombre en el mismo rubro.');

  cuentas.push({ elemento: elemVal, correncia, rubro, nombre, codigo, tipoMoneda });
  cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo));

  recalcCodes();

  document.getElementById('inputCuenta').value = '';
  document.getElementById('selMonetaria').value = '';
  document.getElementById('stepNum4').classList.remove('done');
  document.getElementById('stepNum5').classList.remove('done');
  document.getElementById('step5').classList.add('disabled');
  
  updatePreview();
  updateBtn();
  renderTree();
  saveData();
}

function recalcCodes() {
  const groups = {};
  cuentas.forEach(c => {
    const key = c.elemento + '|' + c.correncia + '|' + c.rubro;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  Object.values(groups).forEach(group => {
    group.forEach((c, i) => {
      const elem = c.elemento;
      const elemDef = ELEMENTOS[elem]; let corrPart = '0'; if (elemDef.tieneCorrencia) { if (elemDef.subLabels) { corrPart = String(elemDef.subLabels.indexOf(c.correncia) + 1); } else { corrPart = c.correncia === 'Corriente' ? '1' : '2'; } }
      const elemRubros = ELEMENTOS[elem].tieneCorrencia ? RUBROS[elem][c.correncia] : RUBROS[elem]['_'];
      const rubroIdx = elemRubros ? elemRubros.indexOf(c.rubro) + 1 : 0;
      c.codigo = elem + '.' + corrPart + '.' + String(rubroIdx).padStart(2, '0') + '.' + String(i + 1).padStart(2, '0');
    });
  });
}

function deleteCuenta(codigo) {
    if (codigo.startsWith('3.')) return alert('Las cuentas del Patrimonio Neto no se pueden eliminar.');
  cuentas = cuentas.filter(c => c.codigo !== codigo);
  recalcCodes();
  renderTree();
  saveData();
}

function renderTree() {
  const container = document.getElementById('planTree');
  if (cuentas.length === 0) {
    container.innerHTML = '<div class="plan-tree-empty">Aún no hay cuentas creadas. Usá el formulario de arriba para agregar cuentas al plan.</div>';
    return;
  }

  const tree = {};
  cuentas.forEach(c => {
    if (!c || !ELEMENTOS[c.elemento]) return;
    const elemName = ELEMENTOS[c.elemento].nombre;
    if (!tree[c.elemento]) tree[c.elemento] = { nombre: elemName, children: {} };

    let corrLabel = '';
    if (ELEMENTOS[c.elemento].tieneCorrencia) {
      corrLabel = c.correncia;
      if (!tree[c.elemento].children[corrLabel]) tree[c.elemento].children[corrLabel] = { nombre: corrLabel, children: {} };
      if (!tree[c.elemento].children[corrLabel].children[c.rubro]) tree[c.elemento].children[corrLabel].children[c.rubro] = { nombre: c.rubro, cuentas: [] };
      tree[c.elemento].children[corrLabel].children[c.rubro].cuentas.push(c);
    } else {
      if (!tree[c.elemento].children[c.rubro]) tree[c.elemento].children[c.rubro] = { nombre: c.rubro, cuentas: [] };
      tree[c.elemento].children[c.rubro].cuentas.push(c);
    }
  });

  let html = '';
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>';

  Object.keys(tree).sort().forEach(elemKey => {
    const elem = tree[elemKey];
    const elemId = 'elem_' + elemKey;
    const elemCount = cuentas.filter(c => c.elemento === elemKey).length;
    html += `<div class="tree-node">
      <div class="tree-row level-0" onclick="toggleTree('${elemId}')">
        <div class="tree-toggle expanded" id="toggle_${elemId}">${chevron}</div>
        <span class="tree-code">${elemKey}.0</span>
        <span class="tree-label">${elem.nombre}</span>
        <span class="tree-count">${elemCount}</span>
      </div>
      <div class="tree-children open" id="${elemId}">`;

    if (ELEMENTOS[elemKey].tieneCorrencia) {
      Object.keys(elem.children).forEach(corrKey => {
        const corr = elem.children[corrKey];
        const corrId = elemId + '_' + corrKey.replace(/\s/g, '');
       const elemDef2 = ELEMENTOS[elemKey]; const corrCode = elemKey + '.' + (elemDef2.subLabels ? (elemDef2.subLabels.indexOf(corrKey) + 1) : (corrKey === 'Corriente' ? '1' : '2'));
        const corrCount = Object.values(corr.children).reduce((s, r) => s + r.cuentas.length, 0);

        html += `<div class="tree-node">
          <div class="tree-row level-1" onclick="toggleTree('${corrId}')">
            <div class="tree-toggle expanded" id="toggle_${corrId}">${chevron}</div>
            <span class="tree-code">${corrCode}</span>
            <span class="tree-label">${corrKey}</span>
            <span class="tree-count">${corrCount}</span>
          </div>
          <div class="tree-children open" id="${corrId}">`;

        Object.keys(corr.children).forEach(rubroKey => {
          const rubro = corr.children[rubroKey];
          const rubroId = corrId + '_r' + rubroKey.replace(/\W/g, '').slice(0, 12);
          html += renderRubroNode(rubro, rubroId, 2);
        });

        html += `</div></div>`;
      });
    } else {
      Object.keys(elem.children).forEach(rubroKey => {
        const rubro = elem.children[rubroKey];
        const rubroId = elemId + '_r' + rubroKey.replace(/\W/g, '').slice(0, 12);
        html += renderRubroNode(rubro, rubroId, 1);
      });
    }

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

function renderRubroNode(rubro, rubroId, level) {
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>';
  
  // Si el rubro tiene 1 sola cuenta con el mismo nombre, colapsar en una sola fila
  if (rubro.cuentas.length === 1 && rubro.cuentas[0].nombre === rubro.nombre) {
    const c = rubro.cuentas[0];
    const badgeMonetaria = c.tipoMoneda === 'monetaria' 
      ? '<span style="margin-left:8px;font-size:10px;padding:2px 6px;border-radius:4px;background:var(--surface-3);color:var(--text-secondary)" title="Monetaria">M</span>'
      : '<span style="margin-left:8px;font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(22,101,52,0.1);color:var(--forest)" title="No Monetaria">NM</span>';
    return `<div class="tree-row level-${level}">
      <div style="width:20px;flex-shrink:0"></div>
      <span class="tree-code">${c.codigo.split('.').slice(0, 3).join('.')}</span>
      <span class="tree-label">${c.nombre} ${badgeMonetaria}</span>
      ${c.elemento !== '3' ? '<button class="btn-delete-cuenta" onclick="event.stopPropagation();deleteCuenta(\'' + c.codigo + '\')" title="Eliminar cuenta">×</button>' : ''}
    </div>`;
  }

  let html = `<div class="tree-node">
    <div class="tree-row level-${level}" onclick="toggleTree('${rubroId}')">
      <div class="tree-toggle expanded" id="toggle_${rubroId}">${chevron}</div>
      <span class="tree-code">${rubro.cuentas[0]?.codigo.split('.').slice(0, 3).join('.') || ''}</span>
      <span class="tree-label">${rubro.nombre}</span>
      <span class="tree-count">${rubro.cuentas.length}</span>
    </div>
    <div class="tree-children open" id="${rubroId}">`;

  rubro.cuentas.forEach(c => {
    const badgeMonetaria = c.tipoMoneda === 'monetaria' 
      ? '<span style="margin-left:8px;font-size:10px;padding:2px 6px;border-radius:4px;background:var(--surface-3);color:var(--text-secondary)" title="Monetaria">M</span>'
      : '<span style="margin-left:8px;font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(22,101,52,0.1);color:var(--forest)" title="No Monetaria">NM</span>';

    html += `<div class="tree-row level-${level + 1}">
      <div style="width:20px;flex-shrink:0"></div>
      <span class="tree-code">${c.codigo}</span>
      <span class="tree-label">${c.nombre} ${badgeMonetaria}</span>
      <button class="btn-delete-cuenta" onclick="event.stopPropagation();deleteCuenta('${c.codigo}')" title="Eliminar cuenta">×</button>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}

function toggleTree(id) {
  const children = document.getElementById(id);
  const toggle = document.getElementById('toggle_' + id);
  if (children) children.classList.toggle('open');
  if (toggle) toggle.classList.toggle('expanded');
}

/* ══════════════════════════════════════════
   ESTADOS CONTABLES
   ══════════════════════════════════════════ */
function getSaldosPorCuenta() {
  const saldos = {};
  cuentas.forEach(c => saldos[c.nombre.toLowerCase()] = 0);
  asientos.forEach(a => {
    if (!a) return;
    (a.debe || []).forEach(d => {
      const key = d.cuenta.toLowerCase();
      if (saldos.hasOwnProperty(key)) saldos[key] += d.monto;
    });
    (a.haber || []).forEach(h => {
      const key = h.cuenta.toLowerCase();
      if (saldos.hasOwnProperty(key)) saldos[key] -= h.monto;
    });
  });
  return saldos;
}

function sumarSaldosRubro(saldosCuentas, elemento, correncia, rubro) {
  let totalRubro = 0;
  const cuentasEnRubro = cuentas.filter(c => c.elemento === elemento && c.correncia === correncia && c.rubro === rubro);
  
  cuentasEnRubro.forEach(c => {
    const saldoNeto = saldosCuentas[c.nombre.toLowerCase()] || 0;
    if (elemento === '1' || elemento === '5') {
      totalRubro += saldoNeto; 
    } else {
      totalRubro += (saldoNeto * -1);
    }
  });
  return totalRubro;
}

function formatoParentesis(valor) {
  if (valor < 0) return `(${formatMoney(Math.abs(valor))})`;
  return formatMoney(valor);
}

let currentEstadoTab = 'esp';

function renderEstadosOverview(el) {
  if (asientos.length === 0 || cuentas.length === 0) {
    el.innerHTML = '<div class="mod-toolbar"><h2>Estados Contables</h2></div><div class="hoja-empty">Se requieren asientos y un plan de cuentas para generar los estados.</div>';
    return;
  }

  el.innerHTML = `
    <div class="mod-toolbar" style="margin-bottom: 10px;"><h2>Estados Contables</h2></div>
    <div class="estado-tabs">
      <button class="tab-btn active" id="tab-esp" onclick="switchEstado('esp')">Estado de Situación Patrimonial</button>
      <button class="tab-btn" id="tab-er" onclick="switchEstado('er')">Estado de Resultados</button>
    </div>
    <div id="estadoContentContainer"></div>
  `;
  switchEstado(currentEstadoTab);
}

function switchEstado(tab) {
  currentEstadoTab = tab;
  document.getElementById('tab-esp').classList.toggle('active', tab === 'esp');
  document.getElementById('tab-er').classList.toggle('active', tab === 'er');
  
  const container = document.getElementById('estadoContentContainer');
  const saldos = getSaldosPorCuenta(); 
  
  if (tab === 'esp') {
    renderESP(container, saldos);
  } else {
    renderER(container, saldos);
  }
}

function renderESP(container, saldosCuentas) {
  let html = `
    <div class="hoja-rayada" style="padding: 20px;">
      <h3 style="text-align:center; font-family:var(--serif); margin-bottom: 20px;">ESTADO DE SITUACIÓN PATRIMONIAL al cierre del ejercicio</h3>
      <table class="esp-table" style="width:100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border);">
            <th style="text-align:left; padding: 10px; font-family:var(--serif);">DETALLE</th>
            <th style="text-align:right; padding: 10px; font-family:var(--serif);">Importe ($)</th>
          </tr>
        </thead>
        <tbody>
  `;

  html += `<tr class="esp-elem-row"><td colspan="2" style="padding-top:15px;"><strong>A C T I V O</strong></td></tr>`;
  html += `<tr class="esp-sub-row"><td><em>Activo Corriente</em></td><td></td></tr>`;
  let totalActivoCorriente = 0;
  RUBROS['1']['Corriente'].forEach(rName => {
    const totalR = sumarSaldosRubro(saldosCuentas, '1', 'Corriente', rName);
    if (totalR !== 0) {
      html += `<tr class="esp-rubro-row"><td>${rName}</td><td style="text-align:right;">${formatMoney(totalR)}</td></tr>`;
      totalActivoCorriente += totalR;
    }
  });
  html += `<tr class="esp-total-row"><td><strong>Total Activo Corriente</strong></td><td style="text-align:right;"><strong>${formatMoney(totalActivoCorriente)}</strong></td></tr>`;

  html += `<tr class="esp-sub-row" style="padding-top:10px;"><td><em>Activo No Corriente</em></td><td></td></tr>`;
  let totalActivoNoCorriente = 0;
  RUBROS['1']['No corriente'].forEach(rName => {
    const totalR = sumarSaldosRubro(saldosCuentas, '1', 'No corriente', rName);
    if (totalR !== 0) {
      html += `<tr class="esp-rubro-row"><td>${rName}</td><td style="text-align:right;">${formatMoney(totalR)}</td></tr>`;
      totalActivoNoCorriente += totalR;
    }
  });
  html += `<tr class="esp-total-row"><td><strong>Total Activo No Corriente</strong></td><td style="text-align:right;"><strong>${formatMoney(totalActivoNoCorriente)}</strong></td></tr>`;
  
  const totalActivo = totalActivoCorriente + totalActivoNoCorriente;
  html += `<tr class="esp-final-row"><td><strong>TOTAL DEL ACTIVO</strong></td><td style="text-align:right; border-top: 2px solid var(--text); border-bottom: 2px solid var(--text);"><strong>${formatMoney(totalActivo)}</strong></td></tr>`;

  html += `<tr class="esp-elem-row"><td colspan="2" style="padding-top:25px;"><strong>P A S I V O</strong></td></tr>`;
  html += `<tr class="esp-sub-row"><td><em>Pasivo Corriente</em></td><td></td></tr>`;
  let totalPasivoCorriente = 0;
  RUBROS['2']['Corriente'].forEach(rName => {
    const totalR = sumarSaldosRubro(saldosCuentas, '2', 'Corriente', rName);
    if (totalR !== 0) {
      html += `<tr class="esp-rubro-row"><td>${rName}</td><td style="text-align:right;">${formatMoney(totalR)}</td></tr>`;
      totalPasivoCorriente += totalR;
    }
  });
  html += `<tr class="esp-total-row"><td><strong>Total Pasivo Corriente</strong></td><td style="text-align:right;"><strong>${formatMoney(totalPasivoCorriente)}</strong></td></tr>`;

  html += `<tr class="esp-sub-row" style="padding-top:10px;"><td><em>Pasivo No Corriente</em></td><td></td></tr>`;
  let totalPasivoNoCorriente = 0;
  RUBROS['2']['No corriente'].forEach(rName => {
    const totalR = sumarSaldosRubro(saldosCuentas, '2', 'No corriente', rName);
    if (totalR !== 0) {
      html += `<tr class="esp-rubro-row"><td>${rName}</td><td style="text-align:right;">${formatMoney(totalR)}</td></tr>`;
      totalPasivoNoCorriente += totalR;
    }
  });
  html += `<tr class="esp-total-row"><td><strong>Total Pasivo No Corriente</strong></td><td style="text-align:right;"><strong>${formatMoney(totalPasivoNoCorriente)}</strong></td></tr>`;
  
  const totalPasivo = totalPasivoCorriente + totalPasivoNoCorriente;
  html += `<tr class="esp-total-row"><td><strong>TOTAL DEL PASIVO</strong></td><td style="text-align:right;"><strong>${formatMoney(totalPasivo)}</strong></td></tr>`;

  html += `<tr class="esp-elem-row"><td colspan="2" style="padding-top:20px;"><strong>P A T R I M O N I O&nbsp;&nbsp;&nbsp;N E T O</strong></td></tr>`;
  
  let totalPN = 0;
  (ELEMENTOS['3'].subLabels || ['_']).forEach(sub => {
    (RUBROS['3'][sub] || []).forEach(rName => {
      const totalR = sumarSaldosRubro(saldosCuentas, '3', sub, rName);
      if (totalR !== 0) {
        html += `<tr class="esp-rubro-row PN-rubro"><td>${rName}</td><td style="text-align:right;">${formatMoney(totalR)}</td></tr>`;
        totalPN += totalR;
      }
    });
  });

  let totalRPos = 0;
  RUBROS['4']['_'].forEach(rName => totalRPos += sumarSaldosRubro(saldosCuentas, '4', '_', rName));
  
  let totalRNeg = 0;
  RUBROS['5']['_'].forEach(rName => totalRNeg += sumarSaldosRubro(saldosCuentas, '5', '_', rName));
  
  const resultadoEjercicio = totalRPos - totalRNeg;
  
  if (resultadoEjercicio !== 0) {
    html += `<tr class="esp-rubro-row PN-rubro"><td>Resultado del Ejercicio</td><td style="text-align:right;">${formatoParentesis(resultadoEjercicio)}</td></tr>`;
    totalPN += resultadoEjercicio;
  }

  html += `<tr class="esp-final-row"><td><strong>TOTAL DEL PATRIMONIO NETO</strong></td><td style="text-align:right;"><strong>${formatMoney(totalPN)}</strong></td></tr>`;

  const totalPasivoPN = totalPasivo + totalPN;
  html += `<tr class="esp-final-row" style="background: rgba(27,42,74,0.03);"><td><strong>TOTAL DEL PASIVO Y PATRIMONIO NETO</strong></td><td style="text-align:right; border-top: 2px solid var(--text); border-bottom: 4px double var(--text);"><strong>${formatMoney(totalPasivoPN)}</strong></td></tr>`;

  const diferencia = totalActivo - totalPasivoPN;
  if (Math.abs(diferencia) > 0.01) {
    html += `<tr><td colspan="2" style="color:var(--burgundy); text-align:center; padding: 15px; background: rgba(122,35,50,0.05); border-radius: 6px; margin-top: 10px;">⚠ El estado no balancea. Diferencia: ${formatMoney(diferencia)}. Verifique los asientos de cierre.</td></tr>`;
  } else {
    html += `<tr><td colspan="2" style="color:var(--forest); text-align:center; padding: 15px; font-weight:600;">✓ Ecuación Fundamental validada (Activo = Pasivo + PN)</td></tr>`;
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function renderER(container, saldos) {
  const ventas = sumarSaldosRubro(saldos, '4', '_', 'Ingresos por ventas de bienes y prestación de servicios');
  const cmv = sumarSaldosRubro(saldos, '5', '_', 'Costo de los bienes vendidos y servicios prestados');
  const resBruto = ventas - cmv;

  const gCom = sumarSaldosRubro(saldos, '5', '_', 'Gastos de comercialización');
  const gAdm = sumarSaldosRubro(saldos, '5', '_', 'Gastos de administración');
  const otrosGto = sumarSaldosRubro(saldos, '5', '_', 'Otros gastos operativos');
  const otrosIng = sumarSaldosRubro(saldos, '4', '_', 'Otros ingresos');
  const otrosEgresos = sumarSaldosRubro(saldos, '5', '_', 'Otros egresos');
  const desval = sumarSaldosRubro(saldos, '5', '_', 'Pérdidas por desvalorización');
  const cambValor = sumarSaldosRubro(saldos, '5', '_', 'Cambios en el valor razonable de propiedades de inversión');

  const resOperativo = resBruto - gCom - gAdm - otrosGto + otrosIng - otrosEgresos - desval - cambValor;
  
  let htmlResFin = `<tr class="esp-sub-row" style="padding-top:10px;"><td><em>Resultados financieros y por tenencia (incluye RECPAM)</em></td><td></td></tr>`;
  let totalResFin = 0;
  
  const cuentasFin = cuentas.filter(c => c.rubro === 'Otros resultados financieros y por tenencia');
  
  cuentasFin.forEach(c => {
    const saldoNeto = saldos[c.nombre.toLowerCase()] || 0;
    if (saldoNeto !== 0) {
      let valorMostrado = 0;
      if (c.elemento === '5') valorMostrado = -saldoNeto; 
      else if (c.elemento === '4') valorMostrado = -saldoNeto; 
      
      htmlResFin += `<tr class="esp-rubro-row"><td>${c.nombre}</td><td style="text-align:right;">${formatoParentesis(valorMostrado)}</td></tr>`;
      totalResFin += valorMostrado;
    }
  });

  if (totalResFin === 0) {
    htmlResFin += `<tr class="esp-rubro-row"><td>Sin movimientos</td><td style="text-align:right;">${formatoParentesis(0)}</td></tr>`;
  }
  
  const resEjercicio = resOperativo + totalResFin;

  let html = `
    <div class="hoja-rayada" style="padding: 20px;">
      <h3 style="text-align:center; font-family:var(--serif); margin-bottom: 20px;">ESTADO DE RESULTADOS por el ejercicio finalizado al cierre</h3>
      <table class="esp-table" style="width:100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border);">
            <th style="text-align:left; padding: 10px; font-family:var(--serif);">DETALLE</th>
            <th style="text-align:right; padding: 10px; font-family:var(--serif);">Importe ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="esp-sub-row"><td>Ingresos por ventas de bienes y prestación de servicios</td><td style="text-align:right;">${formatoParentesis(ventas)}</td></tr>
          <tr class="esp-sub-row"><td>Menos: Costo de los bienes vendidos y servicios prestados</td><td style="text-align:right;">${formatoParentesis(-cmv)}</td></tr>
          <tr class="esp-total-row"><td><strong>GANANCIA (PÉRDIDA) BRUTA</strong></td><td style="text-align:right;"><strong>${formatoParentesis(resBruto)}</strong></td></tr>
          
          <tr class="esp-sub-row" style="padding-top:10px;"><td>Gastos de comercialización</td><td style="text-align:right;">${formatoParentesis(-gCom)}</td></tr>
          <tr class="esp-sub-row"><td>Gastos de administración</td><td style="text-align:right;">${formatoParentesis(-gAdm)}</td></tr>
          <tr class="esp-sub-row"><td>Otros gastos operativos</td><td style="text-align:right;">${formatoParentesis(-otrosGto)}</td></tr>
          <tr class="esp-sub-row"><td>Otros ingresos</td><td style="text-align:right;">${formatoParentesis(otrosIng)}</td></tr>
          <tr class="esp-sub-row"><td>Cambios en el valor razonable de propiedades de inversión</td><td style="text-align:right;">${formatoParentesis(-cambValor)}</td></tr>
          <tr class="esp-sub-row"><td>Pérdidas por desvalorización</td><td style="text-align:right;">${formatoParentesis(-desval)}</td></tr>
          <tr class="esp-sub-row"><td>Otros egresos</td><td style="text-align:right;">${formatoParentesis(-otrosEgresos)}</td></tr>
          
          <tr class="esp-total-row"><td><strong>RESULTADO OPERATIVO</strong></td><td style="text-align:right;"><strong>${formatoParentesis(resOperativo)}</strong></td></tr>
          
          ${htmlResFin}
          
          <tr class="esp-final-row"><td><strong>RESULTADO DEL EJERCICIO</strong></td><td style="text-align:right; border-top: 2px solid var(--text); border-bottom: 4px double var(--text);"><strong>${formatoParentesis(resEjercicio)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = html;
}

/* ══════════════════════════════════════════
   MEDICIÓN AL CIERRE (ACTUALIZADO CON V. LÍMITE)
   ══════════════════════════════════════════ */
function renderCierre(el) {
  let tbodyHTML = '';
  
  if(cierreData.length === 0) {
     cierreData.push({
       cuenta: '', saldoCierre: '', 
       crUnitario: '', cantCR: '', crTotal: '', 
       vlUnitario: '', cantVL: '', vlTotal: '',
       medicion: '', cuentaResultado: 'Resultado por tenencia'
     });
  }

  cierreData.forEach((row, i) => {
     const saldo = parseFloat(row.saldoCierre) || 0;
     const med = parseFloat(row.medicion) || 0;
     const resTenencia = med - saldo;
     const resFormat = resTenencia !== 0 ? formatMoney(resTenencia) : '';
     const colorRes = resTenencia < 0 ? 'var(--burgundy)' : 'var(--forest)';

     tbodyHTML += `
       <tr data-index="${i}">
         <td>
           <div class="autocomplete-wrapper">
             <input type="text" class="line-cuenta cierre-input" placeholder="Buscar..." value="${row.cuenta}" oninput="showAutocomplete(this); updateCierreData(${i}, 'cuenta', this.value)" onfocus="showAutocomplete(this)">
             <div class="autocomplete-list"></div>
           </div>
         </td>
         <td><input type="number" step="0.01" class="cierre-input r" value="${row.saldoCierre}" oninput="updateCierreData(${i}, 'saldoCierre', this.value)"></td>
         
         <td style="background:rgba(27,42,74,0.02)"><input type="number" step="0.01" class="cierre-input r" placeholder="Unit." value="${row.crUnitario}" oninput="updateCierreData(${i}, 'crUnitario', this.value)"></td>
         <td style="background:rgba(27,42,74,0.02)"><input type="number" step="1" class="cierre-input r" placeholder="Cant." value="${row.cantCR}" oninput="updateCierreData(${i}, 'cantCR', this.value)"></td>
         <td style="background:rgba(27,42,74,0.05); font-weight:600; text-align:right; padding-right:10px;">${row.crTotal ? formatMoney(row.crTotal) : '0.00'}</td>

         <td style="background:rgba(180,83,9,0.02)"><input type="number" step="0.01" class="cierre-input r" placeholder="Unit." value="${row.vlUnitario}" oninput="updateCierreData(${i}, 'vlUnitario', this.value)"></td>
         <td style="background:rgba(180,83,9,0.02)"><input type="number" step="1" class="cierre-input r" placeholder="Cant." value="${row.cantVL}" oninput="updateCierreData(${i}, 'cantVL', this.value)"></td>
         <td style="background:rgba(180,83,9,0.05); font-weight:600; text-align:right; padding-right:10px;">${row.vlTotal ? formatMoney(row.vlTotal) : '0.00'}</td>

         <td><input type="number" step="0.01" class="cierre-input r" placeholder="Medición" value="${row.medicion}" oninput="updateCierreData(${i}, 'medicion', this.value)"></td>
         <td style="text-align:right; font-weight:700; color:${colorRes}; padding-right:14px; background:var(--surface-2);">${resFormat}</td>
         <td>
           <select class="cierre-input" style="font-size:11px;" onchange="updateCierreData(${i}, 'cuentaResultado', this.value)">
             <option value="Resultado por tenencia" ${row.cuentaResultado === 'Resultado por tenencia' ? 'selected' : ''}>RxT</option>
             <option value="Ajuste de capital para mantenimiento de la capacidad operativa" ${row.cuentaResultado === 'Ajuste de capital para mantenimiento de la capacidad operativa' ? 'selected' : ''}>Ajuste Cap. (MCO)</option>
           </select>
         </td>
         <td><button class="btn-del-cierre" onclick="deleteCierreRow(${i})">×</button></td>
       </tr>
     `;
  });

  el.innerHTML = `
    <div class="inflacion-toolbar">
      <h2>Medición al Cierre</h2>
      <button class="btn-asiento" onclick="addCierreRow()">+ Agregar fila</button>
    </div>
    <div class="ajuste-wrap">
      <table class="ajuste-table cierre-table" style="min-width: 1300px; font-size:12px;">
        <thead>
          <tr>
            <th rowspan="2" style="width:180px;">CUENTA</th>
            <th rowspan="2" class="r">SALDO AL CIERRE</th>
            <th colspan="3" style="background:var(--navy); color:#fff; text-align:center;">COSTO DE REPOSICIÓN</th>
            <th colspan="3" style="background:#b45309; color:#fff; text-align:center;">VALOR LÍMITE</th>
            <th rowspan="2" class="r">MEDICIÓN SELECC.</th>
            <th rowspan="2" class="r">RES. POR TENENCIA</th>
            <th rowspan="2">CTA. RESULTADO</th>
            <th rowspan="2"></th>
          </tr>
          <tr>
            <th class="sub r">Unitario</th><th class="sub r">Cant.</th><th class="sub r">Total</th>
            <th class="sub r">Unitario</th><th class="sub r">Cant.</th><th class="sub r">Total</th>
          </tr>
        </thead>
        <tbody>${tbodyHTML}</tbody>
      </table>
    </div>
  `;
}

function updateCierreData(index, field, value) {
  // 1. Actualizamos el dato en la memoria
  cierreData[index][field] = value;

  // 2. Realizamos los cálculos matemáticos
  const unitCR = parseFloat(cierreData[index].crUnitario) || 0;
  const cantCR = parseFloat(cierreData[index].cantCR) || 0;
  cierreData[index].crTotal = unitCR * cantCR;

  const unitVL = parseFloat(cierreData[index].vlUnitario) || 0;
  const cantVL = parseFloat(cierreData[index].cantVL) || 0;
  cierreData[index].vlTotal = unitVL * cantVL;

  const saldo = parseFloat(cierreData[index].saldoCierre) || 0;
  const med = parseFloat(cierreData[index].medicion) || 0;
  const resTenencia = med - saldo;

  // 3. Guardamos los cambios
  saveData();

  // 4. ACTUALIZACIÓN DINÁMICA: Buscamos la fila en el DOM para actualizar solo los totales
  const row = document.querySelector(`.cierre-table tbody tr[data-index="${index}"]`);
  if (row) {
    // Actualizamos el total de Reposición (celda 4)
    row.cells[4].textContent = cierreData[index].crTotal !== 0 ? formatMoney(cierreData[index].crTotal) : '0.00';
    
    // Actualizamos el total de Valor Límite (celda 7)
    row.cells[7].textContent = cierreData[index].vlTotal !== 0 ? formatMoney(cierreData[index].vlTotal) : '0.00';
    
    // Actualizamos el Resultado por Tenencia (celda 9)
    const tdRes = row.cells[9];
    tdRes.textContent = resTenencia !== 0 ? formatMoney(resTenencia) : '';
    tdRes.style.color = resTenencia < 0 ? 'var(--burgundy)' : 'var(--forest)';
  }
}

function addCierreRow() {
  cierreData.push({cuenta: '', saldoCierre: '', crUnitario: '', crTotal: '', medicion: '', cuentaResultado: 'Resultado por tenencia'});
  saveData();
  renderCierre(document.getElementById('contentArea'));
}

function deleteCierreRow(index) {
  cierreData.splice(index, 1);
  saveData();
  renderCierre(document.getElementById('contentArea'));
}
ensurePNCuentas();

// INICIALIZACIÓN
renderDashboard(document.getElementById('contentArea'));

/* ══════════════════════════════════════════
   REPORTE GENERAL UNIFICADO (EDICIÓN FINAL)
   ══════════════════════════════════════════ */
function generarReporte() {
  try {
    if (asientos.length === 0) {
      alert('El sistema está vacío. Cargá al menos un asiento para imprimir el reporte.');
      return;
    }
    
    const alumno = prompt('Ingresá tu Apellido y Nombre para el encabezado del reporte:', 'Apellido, Nombre');
    if (!alumno) return;

    let printArea = document.getElementById('print-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'print-area';
      document.body.appendChild(printArea);
    }

    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    
    // 1. LIBRO DIARIO
    renderDiario(tempDiv);
    tempDiv.querySelectorAll('.btn-edit-asiento, .btn-del-asiento, .diario-toolbar').forEach(el => el.remove());
    const diarioHTML = tempDiv.innerHTML;

    // 2. LIBROS MAYORES
    const cuentasMap = {};
    asientos.forEach(a => {
      if (!a) return;
      (a.debe || []).forEach(d => {
        const key = d.cuenta.toLowerCase();
        if (!cuentasMap[key]) cuentasMap[key] = { nombre: d.cuenta, movimientos: [] };
        cuentasMap[key].movimientos.push({ fecha: a.fecha, detalle: a.glosa || '—', debe: d.monto, haber: 0 });
      });
      (a.haber || []).forEach(h => {
        const key = h.cuenta.toLowerCase();
        if (!cuentasMap[key]) cuentasMap[key] = { nombre: h.cuenta, movimientos: [] };
        cuentasMap[key].movimientos.push({ fecha: a.fecha, detalle: a.glosa || '—', debe: 0, haber: h.monto });
      });
    });
    const cuentasList = Object.values(cuentasMap).map(c => {
      const plan = cuentas.find(p => p.nombre.toLowerCase() === c.nombre.toLowerCase());
      const tD = c.movimientos.reduce((s, m) => s + m.debe, 0);
      const tH = c.movimientos.reduce((s, m) => s + m.haber, 0);
      return { codigo: plan ? plan.codigo : '—', nombre: c.nombre, movimientos: c.movimientos, totalDebe: tD, totalHaber: tH, saldo: Math.abs(tD-tH), tipo: tD>=tH?'deudor':'acreedor' };
    });
    let mayoresHTML = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">';
    mayoresHTML += cuentasList.map(c => `
      <div class="mayor-card" style="opacity:1!important; break-inside:avoid; border:1px solid #ddd; padding:10px; font-size:11px;">
        <div style="font-weight:700; border-bottom:1px solid #eee; margin-bottom:5px;">${c.codigo} - ${c.nombre}</div>
        <table style="width:100%; border-collapse:collapse;">
          ${c.movimientos.map(m => `<tr><td>${formatDate(m.fecha)}</td><td style="text-align:right">${m.debe>0?formatMoney(m.debe):''}</td><td style="text-align:right">${m.haber>0?formatMoney(m.haber):''}</td></tr>`).join('')}
          <tr style="border-top:1px solid #ccc; font-weight:700"><td>Saldo ${c.tipo}</td><td colspan="2" style="text-align:right">${formatMoney(c.saldo)}</td></tr>
        </table>
      </div>`).join('');
    mayoresHTML += '</div>';

    // 3. AJUSTE POR INFLACIÓN (RECPAM)
    renderInflacion(tempDiv);
    tempDiv.querySelectorAll('.inflacion-toolbar, .cierre-config, .coef-panel, .rc-item').forEach(el => el.remove());
    const inflacionHTML = tempDiv.innerHTML;

    // 4. STOCK (PEPS)
    renderStock(tempDiv);
    tempDiv.querySelectorAll('.stock-toolbar').forEach(el => el.remove());
    const stockHTML = tempDiv.innerHTML;

    // 5. MEDICIÓN AL CIERRE
    renderCierre(tempDiv);
    tempDiv.querySelectorAll('.inflacion-toolbar, button, .btn-del-cierre').forEach(el => el.remove());
    tempDiv.querySelectorAll('input, select').forEach(el => {
        const span = document.createElement('span');
        span.textContent = el.value || el.options?.[el.selectedIndex]?.text || '—';
        el.parentNode.replaceChild(span, el);
    });
    const cierreHTML = tempDiv.innerHTML;

    // 6. ESTADOS CONTABLES
    const saldos = getSaldosPorCuenta();
    renderESP(tempDiv, saldos);
    const espHTML = tempDiv.innerHTML;
    renderER(tempDiv, saldos);
    const erHTML = tempDiv.innerHTML;

    document.body.removeChild(tempDiv);

    printArea.innerHTML = `
      <div class="report-header">
        <h1>REPORTE CONTABLE INTEGRAL</h1>
        <p><strong>Alumno:</strong> ${alumno} | <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR')}</p>
      </div>
      
      <section class="report-section"><h3>1. Libro Diario</h3>${diarioHTML}</section>
      <section class="report-section page-break"><h3>2. Libros Mayores</h3>${mayoresHTML}</section>
      <section class="report-section page-break"><h3>3. Ajuste por Inflación (RECPAM)</h3>${inflacionHTML}</section>
      <section class="report-section page-break"><h3>4. Fichas de Stock (PEPS)</h3>${stockHTML}</section>
      <section class="report-section page-break"><h3>5. Medición al Cierre</h3>${cierreHTML}</section>
      <section class="report-section page-break"><h3>6. Estado de Situación Patrimonial</h3>${espHTML}</section>
      <section class="report-section page-break"><h3>7. Estado de Resultados</h3>${erHTML}</section>
    `;
    
    setTimeout(() => {
      window.print();
      setTimeout(() => { printArea.innerHTML = ''; }, 1000);
    }, 500);

  } catch (error) {
    alert('Error en reporte: ' + error.message);
  }
}
/* ══════════════════════════════════════════
   GESTIÓN DE ARCHIVOS (BACKUP Y RESTAURACIÓN)
   ══════════════════════════════════════════ */

function exportarDatos() {
  try {
    if (asientos.length === 0 && cuentas.length === 0) {
      alert('El sistema está vacío. No hay datos para guardar.');
      return;
    }
    
    const data = {
      asientos: asientos,
      cuentas: cuentas,
      indices: indices,
      mesCierre: mesCierre,
      modoInflacion: modoInflacion,
      modelosData: modelosData,
      cierreData: cierreData
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const nombreArchivo = prompt("Ingresá el nombre para tu archivo (ej: Apellido_Consigna1):", "Trabajo_Contable");
    if (!nombreArchivo) return;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo + ".json";
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    
  } catch (error) {
    alert("Error al exportar: " + error.message);
  }
}

async function importarDatos(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if(!confirm('¿Estás seguro de cargar este archivo? Se borrarán los datos actuales de la pantalla.')) {
    event.target.value = ''; 
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      asientos = data.asientos || [];
      cuentas = data.cuentas || [];
      indices = data.indices || {};
      mesCierre = data.mesCierre || '';
      modoInflacion = data.modoInflacion || 'indices';
      modelosData = data.modelosData || {};
      cierreData = data.cierreData || [];
      ensurePNCuentas();
      
      await saveData();
      alert('¡Trabajo cargado con éxito!');
      navigate('home');
    } catch (err) {
      alert('Error: El archivo no es válido o está dañado. ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

async function limpiarSistema() {
  if(confirm('¿BORRAR TODO? Se perderán los asientos y el plan de cuentas. Asegurate de haber descargado tu JSON antes.')) {
    asientos = [];
    cuentas = [];
    indices = {};
    mesCierre = '';
    modoInflacion = 'indices';
    modelosData = {};
    cierreData = [];
    await saveData();
    alert('Sistema limpio.');
    navigate('home');
  }
}

function revaluarLineasStock() {
  // Buscamos todos los inputs de cuenta que estén abiertos en el modal
  const inputsCuentas = document.querySelectorAll('.line-cuenta');
  inputsCuentas.forEach(input => {
    toggleStockFields(input);
  });
}
