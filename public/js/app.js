/* ══════════════════════════════════════════
   ML Bot Dashboard — Multi-Account & Messaging Logic
   ══════════════════════════════════════════ */

// ── State ──
let currentSection = 'overview';
let activeAccountId = ''; // '' = all accounts
let currentClaimId = null;
let currentMessageId = null;
let editingKnowledgeId = null;
let refreshInterval = null;

// ══════════════════════════════════════════
// Navigation & Account Switching
// ══════════════════════════════════════════

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    navigateTo(section);
  });
});

function navigateTo(section) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');

  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const sectionEl = document.getElementById(`section-${section}`);
  if (sectionEl) sectionEl.classList.add('active');

  currentSection = section;

  switch (section) {
    case 'overview': refreshOverview(); break;
    case 'questions': loadQuestions(); break;
    case 'messages': loadMessages(); break;
    case 'claims': loadClaims(); break;
    case 'inventory': loadInventoryData(); break;
    case 'promotions': loadPromotions(); break;
    case 'knowledge': loadKnowledge(); break;
    case 'stats': loadStats(); break;
    case 'settings': loadSettings(); break;
  }
}

async function loadAccountSelector() {
  try {
    const data = await apiFetch('/api/accounts');
    const select = document.getElementById('activeAccountSelect');
    if (!select) return;

    const accounts = data.accounts || [];
    let html = '<option value="">Todas las cuentas</option>';
    accounts.forEach(acc => {
      const statusIcon = acc.connected ? '🟢' : '🔴';
      html += `<option value="${acc.id}" ${activeAccountId == acc.id ? 'selected' : ''}>${statusIcon} ${escapeHtml(acc.name)}</option>`;
    });
    select.innerHTML = html;
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
}

function onAccountChange() {
  const select = document.getElementById('activeAccountSelect');
  activeAccountId = select ? select.value : '';
  navigateTo(currentSection);
}

// Mobile sidebar toggle
const sidebarToggle = document.getElementById('sidebarToggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('expanded');
  });
}

// ══════════════════════════════════════════
// Toast Notifications
// ══════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ══════════════════════════════════════════
// API Helpers
// ══════════════════════════════════════════

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (error) {
    console.error(`API Error [${url}]:`, error);
    throw error;
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return d.toLocaleDateString('es-CO');
}

function getActivityIcon(type) {
  const icons = {
    auth: '🔐', webhook: '📡', auto_answer: '🤖', question_queued: '📋',
    question_approved: '✅', question_rejected: '❌', claim_queued: '📋',
    claim_approved: '✅', message_queued: '💬', message_approved: '✅',
    import: '📥', settings: '⚙️', account: '🏪', process_error: '⚠️',
    auto_claim_response: '🤖', auto_message: '🤖', webhook_error: '❌',
  };
  return icons[type] || '📌';
}

// ══════════════════════════════════════════
// Overview
// ══════════════════════════════════════════

async function refreshOverview() {
  try {
    await loadAccountSelector();
    const query = activeAccountId ? `?accountId=${activeAccountId}` : '';
    const data = await apiFetch(`/api/overview${query}`);

    // Financials
    const rev = data.financials?.totalRevenue || 0;
    const prof = data.financials?.estimatedProfit || 0;
    document.getElementById('metric-revenue').textContent = `$${rev.toLocaleString('es-CO')} COP`;
    document.getElementById('metric-profit').textContent = `$${prof.toLocaleString('es-CO')} COP`;

    // Metrics
    document.getElementById('metric-pending-questions').textContent = data.questions?.pending || 0;
    document.getElementById('metric-pending-messages').textContent = data.messages?.pending || 0;
    document.getElementById('metric-active-claims').textContent = data.claims?.active || 0;
    document.getElementById('metric-mode').textContent = data.mode === 'automatic' ? 'Automático' : 'Supervisado';

    // Badges
    updateBadge('badge-questions', data.questions?.pending || 0);
    updateBadge('badge-messages', data.messages?.pending || 0);
    updateBadge('badge-claims', data.claims?.active || 0);

    // Connection indicator
    updateConnectionIndicator(data.connection);

    // Activity list
    renderActivityList(data.recentActivity || []);

    // Chart
    renderActivityChart(data.weeklyStats || []);
  } catch (error) {
    showToast('Error cargando overview: ' + error.message, 'error');
  }
}

function updateBadge(id, count) {
  const badge = document.getElementById(id);
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
}

function updateConnectionIndicator(conn) {
  const indicator = document.getElementById('connectionIndicator');
  let isConnected = false;
  let label = 'Desconectado';

  if (Array.isArray(conn)) {
    const connectedCount = conn.filter(c => c.connected).length;
    if (connectedCount > 0) {
      isConnected = true;
      label = `${connectedCount} cuenta(s) conectada(s)`;
    } else {
      label = 'Cuentas desconectadas';
    }
  } else if (conn) {
    isConnected = conn.connected;
    label = conn.connected ? `Conectado (${conn.account_name || ''})` : 'Desconectado';
  }

  const html = `
    <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
    <span class="status-text">${escapeHtml(label)}</span>
  `;

  if (indicator) indicator.innerHTML = html;
}

function renderActivityList(activities) {
  const container = document.getElementById('activityList');
  if (!activities.length) {
    container.innerHTML = '<p class="empty-state" style="padding:20px">No hay actividad reciente</p>';
    return;
  }

  container.innerHTML = activities.map(a => `
    <div class="activity-item">
      <span class="activity-type">${getActivityIcon(a.type)}</span>
      <span class="activity-text">${escapeHtml(a.description)}</span>
      <span class="activity-time">${formatTime(a.created_at)}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════
// Canvas Chart
// ══════════════════════════════════════════

function renderActivityChart(stats) {
  const canvas = document.getElementById('activityChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || 600;
  canvas.height = 250;

  const w = canvas.width;
  const h = canvas.height;
  const padding = { top: 30, right: 20, bottom: 50, left: 50 };

  ctx.clearRect(0, 0, w, h);

  if (!stats.length) {
    ctx.fillStyle = '#606080';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos aún — los datos aparecerán cuando el bot procese eventos', w / 2, h / 2);
    return;
  }

  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const questionsData = stats.map(s => s.questions_received || 0);
  const messagesData = stats.map(s => s.messages_received || 0);
  const claimsData = stats.map(s => s.claims_received || 0);
  const maxVal = Math.max(...questionsData, ...messagesData, ...claimsData, 1);

  const barGroupW = chartW / stats.length;
  const barW = Math.min(barGroupW * 0.25, 20);
  const barGap = 4;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#606080';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
  }

  stats.forEach((s, i) => {
    const x = padding.left + barGroupW * i + barGroupW / 2;

    const qH = (questionsData[i] / maxVal) * chartH;
    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    roundRect(ctx, x - barW - barGap, padding.top + chartH - qH, barW, qH, 3);
    ctx.fill();

    const mH = (messagesData[i] / maxVal) * chartH;
    ctx.fillStyle = '#845ef7';
    ctx.beginPath();
    roundRect(ctx, x, padding.top + chartH - mH, barW, mH, 3);
    ctx.fill();

    const cH = (claimsData[i] / maxVal) * chartH;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    roundRect(ctx, x + barW + barGap, padding.top + chartH - cH, barW, cH, 3);
    ctx.fill();

    ctx.fillStyle = '#606080';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.date ? s.date.slice(5) : '', x, h - padding.bottom + 20);
  });

  const legendY = h - 10;
  const legends = [
    { color: '#FFE600', label: 'Preguntas' },
    { color: '#845ef7', label: 'Mensajes' },
    { color: '#ff6b6b', label: 'Reclamos' },
  ];
  let legendX = padding.left;
  ctx.font = '11px Inter, sans-serif';
  legends.forEach(l => {
    ctx.fillStyle = l.color;
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = '#9090b0';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, legendX + 14, legendY);
    legendX += ctx.measureText(l.label).width + 30;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, 0);
  ctx.arcTo(x, y + h, x, y, 0);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ══════════════════════════════════════════
// Questions
// ══════════════════════════════════════════

async function loadQuestions() {
  try {
    const status = document.getElementById('questionFilter')?.value || '';
    let query = `status=${status}`;
    if (activeAccountId) query += `&accountId=${activeAccountId}`;

    const data = await apiFetch(`/api/questions?${query}`);
    renderQuestions(data.questions || []);
  } catch (error) {
    showToast('Error cargando preguntas: ' + error.message, 'error');
  }
}

function renderQuestions(questions) {
  const container = document.getElementById('questionsList');

  if (!questions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❓</span>
        <p>No hay preguntas para mostrar</p>
        <button class="btn btn-primary" onclick="pollQuestions()">📡 Buscar nuevas en ML</button>
      </div>`;
    return;
  }

  container.innerHTML = questions.map(q => {
    const isPending = q.status === 'pending';
    return `
    <div class="question-card status-${q.status}">
      <div class="question-meta">
        <span class="item-title">${escapeHtml(q.item_title || q.ml_item_id || 'Producto')}</span>
        ${q.account_name ? `<span class="account-tag">🏪 ${escapeHtml(q.account_name)}</span>` : ''}
        <span class="buyer">👤 ${escapeHtml(q.buyer_nickname || 'Comprador')}</span>
        <span class="status-badge ${q.status}">${q.status}</span>
        <span class="time">${formatTime(q.created_at)}</span>
      </div>
      
      <div class="question-text">${escapeHtml(q.question_text)}</div>
      
      <div class="answer-section">
        <label>🤖 Respuesta ${q.status === 'answered' ? 'enviada' : 'sugerida por IA'}:</label>
        ${isPending ? `
          <textarea class="answer-edit-area" id="answer-${q.id}" rows="2">${escapeHtml(q.generated_answer || 'Sin respuesta generada')}</textarea>
        ` : `
          <div class="answer-text">${escapeHtml(q.final_answer || q.generated_answer || 'Sin respuesta')}</div>
        `}
      </div>
      
      ${isPending ? `
        <div class="question-actions">
          <button class="btn btn-danger btn-sm" onclick="rejectQuestion(${q.id})">❌ Rechazar</button>
          <button class="btn btn-success btn-sm" onclick="approveQuestion(${q.id})">✅ Aprobar y enviar</button>
        </div>
      ` : ''}
    </div>`;
  }).join('');
}

async function approveQuestion(id) {
  try {
    const editedAnswer = document.getElementById(`answer-${id}`)?.value;
    await apiFetch(`/api/questions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ editedAnswer }),
    });
    showToast('¡Respuesta enviada exitosamente!', 'success');
    loadQuestions();
    refreshOverview();
  } catch (error) {
    showToast('Error al enviar: ' + error.message, 'error');
  }
}

async function rejectQuestion(id) {
  try {
    await apiFetch(`/api/questions/${id}/reject`, { method: 'POST' });
    showToast('Pregunta rechazada', 'info');
    loadQuestions();
    refreshOverview();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function pollQuestions() {
  const btn = document.getElementById('btnPollQuestions');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const data = await apiFetch('/api/questions/poll', {
      method: 'POST',
      body: JSON.stringify({ accountId: activeAccountId || null }),
    });
    if (data.processed > 0) {
      showToast(`${data.processed} preguntas nuevas procesadas`, 'success');
    } else {
      showToast('No hay preguntas nuevas', 'info');
    }
    loadQuestions();
    refreshOverview();
  } catch (error) {
    showToast('Error buscando preguntas: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

// ══════════════════════════════════════════
// Messages (Direct Post-Purchase)
// ══════════════════════════════════════════

async function loadMessages() {
  try {
    const status = document.getElementById('messageFilter')?.value || '';
    let query = `status=${status}`;
    if (activeAccountId) query += `&accountId=${activeAccountId}`;

    const data = await apiFetch(`/api/messages?${query}`);
    renderMessages(data.messages || []);
  } catch (error) {
    showToast('Error cargando mensajes: ' + error.message, 'error');
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messagesList');

  if (!messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💬</span>
        <p>No hay mensajes post-compra con este filtro</p>
        <button class="btn btn-primary" onclick="pollMessages()">📡 Buscar mensajes en ML</button>
      </div>`;
    return;
  }

  container.innerHTML = messages.map(m => `
    <div class="message-card status-${m.status}" onclick="openMessageModal(${m.id})">
      <div class="message-meta">
        <span class="item-title">📦 ${escapeHtml(m.item_title || 'Producto')}</span>
        ${m.account_name ? `<span class="account-tag">🏪 ${escapeHtml(m.account_name)}</span>` : ''}
        <span class="buyer">👤 ${escapeHtml(m.buyer_nickname || 'Comprador')}</span>
        <span class="status-badge ${m.status}">${m.status}</span>
        <span class="time">${formatTime(m.created_at)}</span>
      </div>
      <div class="message-text">💬 "${escapeHtml(m.last_message)}"</div>
    </div>
  `).join('');
}

async function openMessageModal(messageId) {
  currentMessageId = messageId;
  try {
    const data = await apiFetch(`/api/messages/${messageId}/history`);
    const history = data.history || [];

    document.getElementById('messageModalTitle').textContent = `Conversación Post-Compra`;

    const chatContainer = document.getElementById('directChatMessages');
    if (!history.length) {
      chatContainer.innerHTML = '<p class="empty-state" style="padding:20px">No hay mensajes guardados</p>';
    } else {
      chatContainer.innerHTML = history.map(m => {
        let msgClass = 'buyer';
        let senderLabel = 'Comprador';
        if (m.sender === 'seller') {
          msgClass = 'seller';
          senderLabel = 'Tú (Vendedor)';
        } else if (m.sender === 'ai_suggestion') {
          msgClass = 'ai';
          senderLabel = '🤖 Sugerencia IA';
        }
        return `
          <div class="chat-message ${msgClass}">
            <div class="msg-sender">${senderLabel}</div>
            <div>${escapeHtml(m.message_text)}</div>
          </div>`;
      }).join('');

      const aiMsg = history.find(m => m.sender === 'ai_suggestion');
      if (aiMsg) {
        document.getElementById('directResponseInput').value = aiMsg.message_text;
      }
    }

    document.getElementById('messageModal').style.display = 'flex';
  } catch (error) {
    showToast('Error cargando mensajes: ' + error.message, 'error');
  }
}

function closeMessageModal() {
  document.getElementById('messageModal').style.display = 'none';
  currentMessageId = null;
}

async function approveDirectMessageResponse() {
  if (!currentMessageId) return;
  const editedAnswer = document.getElementById('directResponseInput')?.value;
  if (!editedAnswer) return showToast('Escribe una respuesta', 'warning');

  try {
    await apiFetch(`/api/messages/${currentMessageId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ editedAnswer }),
    });
    showToast('¡Mensaje enviado al comprador!', 'success');
    closeMessageModal();
    loadMessages();
    refreshOverview();
  } catch (error) {
    showToast('Error al enviar: ' + error.message, 'error');
  }
}

async function pollMessages() {
  const btn = document.getElementById('btnPollMessages');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const data = await apiFetch('/api/messages/poll', {
      method: 'POST',
      body: JSON.stringify({ accountId: activeAccountId || null }),
    });
    if (data.processed > 0) {
      showToast(`${data.processed} mensajes nuevos procesados`, 'success');
    } else {
      showToast('No hay mensajes nuevos', 'info');
    }
    loadMessages();
    refreshOverview();
  } catch (error) {
    showToast('Error buscando mensajes: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

// ══════════════════════════════════════════
// Claims
// ══════════════════════════════════════════

async function loadClaims() {
  try {
    const status = document.getElementById('claimFilter')?.value || '';
    let query = `status=${status}`;
    if (activeAccountId) query += `&accountId=${activeAccountId}`;

    const data = await apiFetch(`/api/claims?${query}`);
    renderClaims(data.claims || []);
  } catch (error) {
    showToast('Error cargando reclamos: ' + error.message, 'error');
  }
}

function renderClaims(claims) {
  const container = document.getElementById('claimsList');

  if (!claims.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>No hay reclamos con este filtro</p>
        <button class="btn btn-primary" onclick="pollClaims()">📡 Buscar nuevos en ML</button>
      </div>`;
    return;
  }

  container.innerHTML = claims.map(c => `
    <div class="claim-card status-${c.status}" onclick="openClaimModal(${c.id})">
      <div class="claim-header">
        <span class="claim-type">📋 ${escapeHtml(c.claim_type || 'Reclamo')}</span>
        ${c.account_name ? `<span class="account-tag">🏪 ${escapeHtml(c.account_name)}</span>` : ''}
        <span class="status-badge ${c.status}">${c.status}</span>
        <span class="time" style="margin-left:auto">${formatTime(c.created_at)}</span>
      </div>
      <div class="claim-info">
        <span>📦 ${escapeHtml(c.item_title || 'Producto')}</span>
        <span>👤 ${escapeHtml(c.buyer_nickname || 'Comprador')}</span>
        <span>💬 Razón: ${escapeHtml(c.claim_reason || 'No especificada')}</span>
      </div>
    </div>
  `).join('');
}

async function openClaimModal(claimId) {
  currentClaimId = claimId;
  try {
    const data = await apiFetch(`/api/claims/${claimId}/messages`);
    const messages = data.messages || [];

    document.getElementById('claimModalTitle').textContent = `Reclamo #${claimId}`;

    const chatContainer = document.getElementById('claimChatMessages');
    if (!messages.length) {
      chatContainer.innerHTML = '<p class="empty-state" style="padding:20px">No hay mensajes en este reclamo</p>';
    } else {
      chatContainer.innerHTML = messages.map(m => {
        let msgClass = 'buyer';
        let senderLabel = 'Comprador';
        if (m.sender === 'defendant' || m.sender === 'seller') {
          msgClass = 'seller';
          senderLabel = 'Tú (Vendedor)';
        } else if (m.sender === 'ai_suggestion') {
          msgClass = 'ai';
          senderLabel = '🤖 Sugerencia IA';
        }
        return `
          <div class="chat-message ${msgClass}">
            <div class="msg-sender">${senderLabel}</div>
            <div>${escapeHtml(m.message_text)}</div>
          </div>`;
      }).join('');

      const aiMsg = messages.find(m => m.sender === 'ai_suggestion');
      if (aiMsg) {
        document.getElementById('claimResponseInput').value = aiMsg.message_text;
      }
    }

    document.getElementById('claimModal').style.display = 'flex';
  } catch (error) {
    showToast('Error cargando mensajes: ' + error.message, 'error');
  }
}

function closeClaimModal() {
  document.getElementById('claimModal').style.display = 'none';
  currentClaimId = null;
}

async function approveClaimResponse() {
  if (!currentClaimId) return;
  const responseText = document.getElementById('claimResponseInput')?.value;
  if (!responseText) return showToast('Escribe una respuesta', 'warning');

  try {
    await apiFetch(`/api/claims/${currentClaimId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ editedResponse: responseText }),
    });
    showToast('¡Respuesta de reclamo enviada!', 'success');
    closeClaimModal();
    loadClaims();
    refreshOverview();
  } catch (error) {
    showToast('Error al enviar: ' + error.message, 'error');
  }
}

async function pollClaims() {
  const btn = document.getElementById('btnPollClaims');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const data = await apiFetch('/api/claims/poll', {
      method: 'POST',
      body: JSON.stringify({ accountId: activeAccountId || null }),
    });
    if (data.processed > 0) {
      showToast(`${data.processed} reclamos nuevos procesados`, 'success');
    } else {
      showToast('No hay reclamos nuevos', 'info');
    }
    loadClaims();
    refreshOverview();
  } catch (error) {
    showToast('Error buscando reclamos: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

// ══════════════════════════════════════════
// Knowledge Base
// ══════════════════════════════════════════

async function loadKnowledge() {
  try {
    const category = document.getElementById('knowledgeFilter')?.value || '';
    const data = await apiFetch(`/api/knowledge?category=${category}`);
    renderKnowledge(data.knowledge || []);
  } catch (error) {
    showToast('Error cargando conocimiento: ' + error.message, 'error');
  }
}

function renderKnowledge(items) {
  const container = document.getElementById('knowledgeList');

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📚</span>
        <p>No hay contenido en la base de conocimiento</p>
        <button class="btn btn-primary" onclick="showAddKnowledge()">➕ Agregar contenido</button>
      </div>`;
    return;
  }

  container.innerHTML = items.map(k => `
    <div class="knowledge-card">
      <div class="knowledge-card-header">
        <span class="kb-title">${escapeHtml(k.title)}</span>
        <span class="kb-category ${k.category}">${k.category}</span>
      </div>
      <div class="kb-content">${escapeHtml(k.content).substring(0, 200)}${k.content.length > 200 ? '...' : ''}</div>
      <div class="kb-actions">
        <button class="btn btn-secondary btn-sm" onclick="editKnowledge(${k.id}, '${escapeAttr(k.title)}', '${escapeAttr(k.content)}', '${k.category}', '${k.ml_item_id || ''}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteKnowledge(${k.id})">🗑️ Eliminar</button>
      </div>
    </div>
  `).join('');
}

function showAddKnowledge() {
  editingKnowledgeId = null;
  document.getElementById('knowledgeModalTitle').textContent = 'Agregar conocimiento';
  document.getElementById('kbCategory').value = 'product';
  document.getElementById('kbTitle').value = '';
  document.getElementById('kbContent').value = '';
  document.getElementById('kbItemId').value = '';
  document.getElementById('knowledgeModal').style.display = 'flex';
}

function editKnowledge(id, title, content, category, mlItemId) {
  editingKnowledgeId = id;
  document.getElementById('knowledgeModalTitle').textContent = 'Editar conocimiento';
  document.getElementById('kbCategory').value = category;
  document.getElementById('kbTitle').value = title;
  document.getElementById('kbContent').value = content;
  document.getElementById('kbItemId').value = mlItemId || '';
  document.getElementById('knowledgeModal').style.display = 'flex';
}

function closeKnowledgeModal() {
  document.getElementById('knowledgeModal').style.display = 'none';
  editingKnowledgeId = null;
}

async function saveKnowledge() {
  const category = document.getElementById('kbCategory').value;
  const title = document.getElementById('kbTitle').value.trim();
  const content = document.getElementById('kbContent').value.trim();
  const mlItemId = document.getElementById('kbItemId').value.trim();

  if (!title || !content) return showToast('Título y contenido son requeridos', 'warning');

  try {
    if (editingKnowledgeId) {
      await apiFetch(`/api/knowledge/${editingKnowledgeId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content, ml_item_id: mlItemId }),
      });
      showToast('Conocimiento actualizado', 'success');
    } else {
      await apiFetch('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify({ category, title, content, ml_item_id: mlItemId }),
      });
      showToast('Conocimiento agregado', 'success');
    }
    closeKnowledgeModal();
    loadKnowledge();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deleteKnowledge(id) {
  if (!confirm('¿Seguro que quieres eliminar este contenido?')) return;
  try {
    await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    showToast('Contenido eliminado', 'info');
    loadKnowledge();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function importFromML() {
  const btn = document.getElementById('btnImportML');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const data = await apiFetch('/api/knowledge/import-from-ml', {
      method: 'POST',
      body: JSON.stringify({ accountId: activeAccountId || null }),
    });
    showToast(`${data.imported} productos importados desde ML`, 'success');
    loadKnowledge();
  } catch (error) {
    showToast('Error importando: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

// ══════════════════════════════════════════
// Statistics
// ══════════════════════════════════════════

async function loadStats() {
  try {
    const days = document.getElementById('statsPeriod')?.value || 7;
    let query = `days=${days}`;
    if (activeAccountId) query += `&accountId=${activeAccountId}`;

    const data = await apiFetch(`/api/stats?${query}`);
    const stats = data.stats || [];

    let totalQ = 0, totalA = 0, totalC = 0, totalM = 0;
    stats.forEach(s => {
      totalQ += s.questions_received || 0;
      totalA += s.questions_answered || 0;
      totalC += s.claims_received || 0;
      totalM += s.messages_received || 0;
    });

    document.getElementById('stat-total-questions').textContent = totalQ;
    document.getElementById('stat-total-answered').textContent = totalA;
    document.getElementById('stat-total-claims').textContent = totalC;
    document.getElementById('stat-total-messages').textContent = totalM;

    const canvas = document.getElementById('statsChart');
    if (canvas) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 800;
      canvas.height = 300;
      renderActivityChartOnCanvas(canvas, stats);
    }
  } catch (error) {
    showToast('Error cargando estadísticas: ' + error.message, 'error');
  }
}

function renderActivityChartOnCanvas(canvas, stats) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const padding = { top: 30, right: 20, bottom: 50, left: 50 };

  ctx.clearRect(0, 0, w, h);

  if (!stats.length) {
    ctx.fillStyle = '#606080';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos para el período seleccionado', w / 2, h / 2);
    return;
  }

  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const questionsData = stats.map(s => s.questions_received || 0);
  const messagesData = stats.map(s => s.messages_received || 0);
  const claimsData = stats.map(s => s.claims_received || 0);
  const maxVal = Math.max(...questionsData, ...messagesData, ...claimsData, 1);

  const barGroupW = chartW / stats.length;
  const barW = Math.min(barGroupW * 0.25, 20);
  const barGap = 4;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#606080';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
  }

  stats.forEach((s, i) => {
    const x = padding.left + barGroupW * i + barGroupW / 2;

    const qH = (questionsData[i] / maxVal) * chartH;
    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    roundRect(ctx, x - barW - barGap, padding.top + chartH - qH, barW, qH, 3);
    ctx.fill();

    const mH = (messagesData[i] / maxVal) * chartH;
    ctx.fillStyle = '#845ef7';
    ctx.beginPath();
    roundRect(ctx, x, padding.top + chartH - mH, barW, mH, 3);
    ctx.fill();

    const cH = (claimsData[i] / maxVal) * chartH;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    roundRect(ctx, x + barW + barGap, padding.top + chartH - cH, barW, cH, 3);
    ctx.fill();

    ctx.fillStyle = '#606080';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.date ? s.date.slice(5) : '', x, h - padding.bottom + 20);
  });

  const legendY = h - 10;
  const legends = [
    { color: '#FFE600', label: 'Preguntas' },
    { color: '#845ef7', label: 'Mensajes' },
    { color: '#ff6b6b', label: 'Reclamos' },
  ];
  let legendX = padding.left;
  ctx.font = '11px Inter, sans-serif';
  legends.forEach(l => {
    ctx.fillStyle = l.color;
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = '#9090b0';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, legendX + 14, legendY);
    legendX += ctx.measureText(l.label).width + 30;
  });
}

// ══════════════════════════════════════════
// Settings & Accounts Management
// ══════════════════════════════════════════

async function loadSettings() {
  try {
    const data = await apiFetch('/api/settings');
    const accData = await apiFetch('/api/accounts');

    if (data.mode === 'automatic') {
      document.getElementById('modeAutomatico').checked = true;
    } else {
      document.getElementById('modeSupervisado').checked = true;
    }

    renderSettingsAccountsList(accData.accounts || []);

    const aiStatus = document.getElementById('aiStatus');
    if (data.gemini_configured) {
      aiStatus.innerHTML = `<span class="status-dot connected"></span><span>Configurado ✅</span>`;
    } else {
      aiStatus.innerHTML = `<span class="status-dot disconnected"></span><span>Clave Gemini requerida en .env</span>`;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function renderSettingsAccountsList(accounts) {
  const container = document.getElementById('settingsAccountsList');
  if (!accounts.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px">
        <p>No hay cuentas agregadas aún.</p>
        <button class="btn btn-primary" onclick="showAddAccountModal()">➕ Agregar tu primera cuenta</button>
      </div>`;
    return;
  }

  container.innerHTML = accounts.map(acc => `
    <div class="account-card-item">
      <div class="account-card-info">
        <strong>🏪 ${escapeHtml(acc.name)} ${acc.connected ? '🟢 Conectada' : '🔴 Desconectada'}</strong>
        <span>App ID: <code>${escapeHtml(acc.app_id)}</code></span>
        <span>Seller ID: <code>${escapeHtml(acc.seller_id || 'No vinculado')}</code></span>
      </div>
      <div class="account-card-actions">
        <a href="/auth/login/${acc.id}" class="btn btn-primary btn-sm">🔗 ${acc.connected ? 'Reconectar' : 'Conectar ML'}</a>
        <button class="btn btn-secondary btn-sm" onclick="editAccount(${acc.id}, '${escapeAttr(acc.name)}', '${escapeAttr(acc.app_id)}', '${escapeAttr(acc.secret_key)}', '${escapeAttr(acc.redirect_uri)}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAccount(${acc.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

function showAddAccountModal() {
  document.getElementById('accountModalTitle').textContent = 'Agregar Cuenta de Mercado Libre';
  document.getElementById('accId').value = '';
  document.getElementById('accName').value = '';
  document.getElementById('accAppId').value = '';
  document.getElementById('accSecretKey').value = '';
  document.getElementById('accRedirectUri').value = 'http://localhost:3000/auth/callback';
  document.getElementById('accountModal').style.display = 'flex';
}

function editAccount(id, name, appId, secretKey, redirectUri) {
  document.getElementById('accountModalTitle').textContent = 'Editar Cuenta';
  document.getElementById('accId').value = id;
  document.getElementById('accName').value = name;
  document.getElementById('accAppId').value = appId;
  document.getElementById('accSecretKey').value = secretKey;
  document.getElementById('accRedirectUri').value = redirectUri || 'http://localhost:3000/auth/callback';
  document.getElementById('accountModal').style.display = 'flex';
}

function closeAccountModal() {
  document.getElementById('accountModal').style.display = 'none';
}

async function saveAccountFromModal() {
  const id = document.getElementById('accId').value;
  const name = document.getElementById('accName').value.trim();
  const app_id = document.getElementById('accAppId').value.trim();
  const secret_key = document.getElementById('accSecretKey').value.trim();
  const redirect_uri = document.getElementById('accRedirectUri').value.trim();

  if (!name || !app_id || !secret_key) {
    return showToast('Por favor completa todos los campos requeridos', 'warning');
  }

  try {
    await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ id, name, app_id, secret_key, redirect_uri }),
    });
    showToast('Cuenta guardada exitosamente', 'success');
    closeAccountModal();
    loadSettings();
    loadAccountSelector();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm('¿Seguro que quieres eliminar esta cuenta?')) return;
  try {
    await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
    showToast('Cuenta eliminada', 'info');
    loadSettings();
    loadAccountSelector();
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function saveMode() {
  const mode = document.querySelector('input[name="replyMode"]:checked')?.value;
  if (!mode) return;

  try {
    await apiFetch('/api/settings/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    showToast(`Modo cambiado a: ${mode === 'automatic' ? 'Automático ⚡' : 'Supervisado 👀'}`, 'success');
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

async function testAI() {
  const btn = document.getElementById('btnTestAI');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const data = await apiFetch('/api/test-ai', { method: 'POST' });
    const aiStatus = document.getElementById('aiStatus');
    if (data.ok) {
      showToast('✅ Conexión con Gemini exitosa', 'success');
      aiStatus.innerHTML = `<span class="status-dot connected"></span><span>Conectado ✅</span>`;
    } else {
      showToast('Error: ' + (data.error || 'No se pudo conectar'), 'error');
      aiStatus.innerHTML = `<span class="status-dot disconnected"></span><span>Error</span>`;
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

// ══════════════════════════════════════════
// Utilities & Boot
// ══════════════════════════════════════════

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// OAuth Callback handling
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'success') {
  showToast('✅ ¡Cuenta de Mercado Libre conectada exitosamente!', 'success');
  window.history.replaceState({}, '', '/');
} else if (urlParams.get('auth') === 'error') {
  showToast('❌ Error de autenticación: ' + (urlParams.get('message') || 'desconocido'), 'error');
  window.history.replaceState({}, '', '/');
}

// Initial load
refreshOverview();

// Auto refresh every 30s
refreshInterval = setInterval(() => {
  if (currentSection === 'overview') refreshOverview();
}, 30000);

// ══════════════════════════════════════════
// ── Inventario en 3 Fases Logic ──
// ══════════════════════════════════════════

let currentInventorySubtab = 'china';

function switchInventoryTab(tabName) {
  currentInventorySubtab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`tab-btn-${tabName}`);
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.inventory-subcontent').forEach(sub => sub.classList.remove('active'));
  const sub = document.getElementById(`subtab-${tabName}`);
  if (sub) sub.classList.add('active');

  switch (tabName) {
    case 'china': loadChinaShipments(); break;
    case 'local': loadLocalInventory(); break;
    case 'full': loadMlFullInventory(); break;
    case 'alerts': loadReorderAlerts(); break;
  }
}

async function loadInventoryData() {
  switchInventoryTab(currentInventorySubtab);
}

// --- Subtab 1: China Shipments ---
let currentChinaFilter = 'all';
let cachedChinaShipments = [];

function filterChinaTable(filterType, btnElem = null) {
  currentChinaFilter = filterType;

  if (btnElem) {
    document.querySelectorAll('.china-filter-btn').forEach(b => {
      b.classList.remove('btn-primary', 'active');
      b.classList.add('btn-secondary');
    });
    btnElem.classList.remove('btn-secondary');
    btnElem.classList.add('btn-primary', 'active');
  }

  renderChinaShipments();
}

function parseDateToTimestamp(dateStr) {
  if (!dateStr) return 0;
  
  const str = String(dateStr).trim();
  
  // Check DD/MM/YYYY or YYYY-MM-DD first to prevent MM/DD/YYYY JS misinterpretation (e.g. 02/05/2026 => Feb 5 instead of May 2)
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }
    if (year && !isNaN(month) && day) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();

  return 0;
}

function formatDateToInput(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  
  const ts = parseDateToTimestamp(dateStr);
  if (ts > 0) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return new Date().toISOString().split('T')[0];
}

function isShipmentDelayed(s) {
  const delStatus = (s.delivery_status || s.status || '').toUpperCase();
  if (delStatus.includes('RECIBIDO') || s.status === 'House' || delStatus.includes('CHINA') || s.status === 'In China') {
    return false;
  }

  // Strictly check if > 90 days have elapsed since Chinese Winery purchase date
  if (s.chinese_winery_date) {
    const buyTs = parseDateToTimestamp(s.chinese_winery_date);
    if (buyTs > 0) {
      const today = new Date();
      const diffMs = today.getTime() - buyTs;
      const daysPassed = diffMs / (1000 * 60 * 60 * 24);
      return daysPassed > 90;
    }
  }

  return false;
}

function renderChinaShipments() {
  const shipments = cachedChinaShipments || [];
  
  let totalUnits = 0;
  let totalLandedCop = 0;
  let totalProfitCop = 0;
  let totalM3 = 0;

  let countAll = shipments.length;
  let countTransit = 0;
  let countChina = 0;
  let countHouse = 0;

  const activeShipments = [];
  const receivedShipments = [];

  shipments.forEach(s => {
    const delStatus = (s.delivery_status || s.status || '').toUpperCase();
    const isReceived = delStatus.includes('RECIBIDO') || s.status === 'House';

    if (isReceived) {
      countHouse++;
      receivedShipments.push(s);
    } else {
      if (delStatus.includes('CHINA') || s.status === 'In China') countChina++;
      else countTransit++;
      activeShipments.push(s);

      const qty = s.quantity || s.active_transit_units || 0;
      totalUnits += qty;
      totalLandedCop += s.total_cost_cop || (s.unit_cost_cop * qty) || 0;
      totalProfitCop += s.total_profit_cop || (s.income_cop * qty) || 0;
      totalM3 += parseFloat(s.cubic_meter || 0);
    }
  });

  // Sort active shipments chronologically by purchase date / ETA (oldest purchase date first)
  activeShipments.sort((a, b) => {
    const tsA = parseDateToTimestamp(a.chinese_winery_date) || parseDateToTimestamp(a.eta_date);
    const tsB = parseDateToTimestamp(b.chinese_winery_date) || parseDateToTimestamp(b.eta_date);
    return tsA - tsB;
  });

  // Sort received shipments chronologically (most recently received first)
  receivedShipments.sort((a, b) => {
    const tsA = parseDateToTimestamp(a.chinese_winery_date) || parseDateToTimestamp(a.eta_date);
    const tsB = parseDateToTimestamp(b.chinese_winery_date) || parseDateToTimestamp(b.eta_date);
    return tsB - tsA;
  });

  const filterAllBtn = document.getElementById('filter-china-all');
  const filterTransitBtn = document.getElementById('filter-china-transit');
  const filterChinaBtn = document.getElementById('filter-china-china');
  const filterHouseBtn = document.getElementById('filter-china-house');

  if (filterAllBtn) filterAllBtn.innerText = `Todas (${countAll})`;
  if (filterTransitBtn) filterTransitBtn.innerText = `🚢 En Tránsito / Camino (${countTransit})`;
  if (filterChinaBtn) filterChinaBtn.innerText = `⚙️ En China (${countChina})`;
  if (filterHouseBtn) filterHouseBtn.innerText = `✅ Recibidas en Casa (${countHouse})`;

  const activeBadge = document.getElementById('active-transit-count-badge');
  const receivedBadge = document.getElementById('received-house-count-badge');
  if (activeBadge) activeBadge.innerText = `${activeShipments.length} órdenes en tránsito/china`;
  if (receivedBadge) receivedBadge.innerText = `${receivedShipments.length} recibidas en bodega`;

  function buildRowHtml(s) {
    const qty = s.quantity || s.active_transit_units || 0;
    const profitTotal = s.total_profit_cop || (s.income_cop * qty) || 0;
    const m3 = parseFloat(s.cubic_meter || 0);

    const delStatus = s.delivery_status || s.status || 'EN CAMINO';
    let statusBadge = `<span class="badge-primary" style="cursor:pointer;" onclick="toggleChinaDeliveryStatus(${s.id}, '${escapeHtml(delStatus)}')">🚢 EN CAMINO</span>`;
    if (delStatus.toUpperCase().includes('RECIBIDO') || delStatus === 'House') {
      statusBadge = `<span class="badge-success" style="cursor:pointer;" onclick="toggleChinaDeliveryStatus(${s.id}, '${escapeHtml(delStatus)}')">✅ RECIBIDO</span>`;
    } else if (delStatus.toUpperCase().includes('CHINA')) {
      statusBadge = `<span class="badge-warning" style="cursor:pointer;" onclick="toggleChinaDeliveryStatus(${s.id}, '${escapeHtml(delStatus)}')">⚙️ EN CHINA</span>`;
    } else if (isShipmentDelayed(s)) {
      statusBadge = `<span class="badge-critical" style="cursor:pointer;" onclick="toggleChinaDeliveryStatus(${s.id}, '${escapeHtml(delStatus)}')">⚠️ RETRASADO (+90d)</span>`;
    }

    const margin = parseFloat(s.margin_percent || 0);
    const marginBadgeClass = margin >= 100 ? 'badge-success' : (margin >= 50 ? 'badge-warning' : 'badge-critical');

    return `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(s.product_name || s.supplier_name)}</td>
        <td><strong>${qty.toLocaleString('es-CO')}</strong></td>
        <td>${escapeHtml(s.agency || 'Agente')}</td>
        <td>${m3 > 0 ? m3.toFixed(3) : '0'}</td>
        <td>$${Math.round(s.unit_cost_cop || 0).toLocaleString('es-CO')}</td>
        <td>$${Math.round(s.price_ml_cop || 0).toLocaleString('es-CO')}</td>
        <td><strong>$${Math.round(s.income_cop || 0).toLocaleString('es-CO')}</strong></td>
        <td><span class="${marginBadgeClass}">${margin.toFixed(0)}%</span></td>
        <td><strong>$${Math.round(profitTotal).toLocaleString('es-CO')}</strong></td>
        <td><small>${escapeHtml(s.eta_date || 'N/A')}</small></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editChinaShipment(${s.id})" title="Editar importación">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteChinaShipment(${s.id})" title="Eliminar">🗑️</button>
        </td>
      </tr>
    `;
  }

  const filteredActive = activeShipments.filter(s => {
    const delStatus = (s.delivery_status || s.status || '').toUpperCase();
    if (currentChinaFilter === 'transit') return delStatus.includes('CAMINO') || delStatus.includes('RETRASADO') || s.status === 'In progress';
    if (currentChinaFilter === 'china') return delStatus.includes('CHINA') || s.status === 'In China';
    if (currentChinaFilter === 'house') return false;
    return true;
  });

  const filteredReceived = receivedShipments.filter(s => {
    if (currentChinaFilter === 'transit' || currentChinaFilter === 'china') return false;
    return true;
  });

  let activeHtml = filteredActive.length === 0 
    ? '<tr><td colspan="12" class="empty-cell">No hay embarques pendientes en tránsito ni en China</td></tr>'
    : filteredActive.map(buildRowHtml).join('');

  let receivedHtml = filteredReceived.length === 0 
    ? '<tr><td colspan="12" class="empty-cell">No hay historial de importaciones recibidas en este filtro</td></tr>'
    : filteredReceived.map(buildRowHtml).join('');

  document.getElementById('chinaShipmentsTable').innerHTML = activeHtml;
  document.getElementById('chinaReceivedTable').innerHTML = receivedHtml;

  document.getElementById('china-total-units').innerText = `${totalUnits.toLocaleString('es-CO')} unds`;
  document.getElementById('china-total-landed').innerText = `$${Math.round(totalLandedCop).toLocaleString('es-CO')} COP`;
  document.getElementById('china-total-profit').innerText = `$${Math.round(totalProfitCop).toLocaleString('es-CO')} COP`;
  document.getElementById('china-total-m3').innerText = `${totalM3.toFixed(2)} m³`;
}

async function loadChinaShipments() {
  try {
    const data = await apiFetch('/api/inventory/china');
    cachedChinaShipments = data.shipments || [];
    renderChinaShipments();
  } catch (error) {
    showToast('Error cargando importaciones China: ' + error.message, 'error');
  }
}

function updateChinaLiveCalc() {
  const qty = parseInt(document.getElementById('chinaQuantity').value || 0) || 0;
  const boxes = parseInt(document.getElementById('chinaBoxes').value || 0) || 0;
  const lengthM = parseFloat(document.getElementById('chinaLengthM').value || 0) || 0;
  const heightM = parseFloat(document.getElementById('chinaHeightM').value || 0) || 0;
  const widthM = parseFloat(document.getElementById('chinaWidthM').value || 0) || 0;

  // 1. Auto National Freight = Boxes * 30000 COP
  const nationalFreightCop = boxes * 30000;
  document.getElementById('chinaNationalFreightCop').value = nationalFreightCop;

  // 2. Auto Costo Full = Quantity * 500 COP
  const fullCostCop = qty * 500;
  document.getElementById('chinaFullCostCop').value = fullCostCop;

  // 3. Auto ETA Date = Chinese Winery Date + 90 Days
  const buyDateStr = document.getElementById('chinaChineseWineryDate').value;
  if (buyDateStr) {
    const buyDate = new Date(buyDateStr);
    if (!isNaN(buyDate.getTime())) {
      const etaDate = new Date(buyDate.getTime() + (90 * 24 * 60 * 60 * 1000));
      const etaFormatted = etaDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      document.getElementById('chinaEtaDate').value = etaFormatted;

      const today = new Date();
      const diffMs = etaDate.getTime() - today.getTime();
      const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      document.getElementById('chinaDaysToArrive').value = daysLeft;
    }
  }

  // 4. Container m3 cost (preset vs custom)
  const containerSelectVal = document.getElementById('chinaContainerM3Select').value;
  let containerM3Cost = 2500000;
  if (containerSelectVal === 'custom') {
    document.getElementById('chinaContainerM3Cost').style.display = 'block';
    containerM3Cost = parseFloat(document.getElementById('chinaContainerM3Cost').value || 0) || 0;
  } else {
    document.getElementById('chinaContainerM3Cost').style.display = 'none';
    containerM3Cost = parseFloat(containerSelectVal) || 2500000;
    document.getElementById('chinaContainerM3Cost').value = containerM3Cost;
  }

  // 5. Volume & Import Freight
  const cubicMeter = boxes * lengthM * heightM * widthM;
  const importCostCop = cubicMeter * containerM3Cost;

  // 6. Total Landed Cost
  const totalPriceCop = parseFloat(document.getElementById('chinaTotalPriceCop').value || 0) || 0;
  const extraExpensesCop = parseFloat(document.getElementById('chinaExtraExpensesCop').value || 0) || 0;

  const totalLandedCop = totalPriceCop + importCostCop + nationalFreightCop + fullCostCop + extraExpensesCop;
  const unitCostCop = qty > 0 ? (totalLandedCop / qty) : 0;

  // 7. Margins & Net Income
  const priceMlCop = parseFloat(document.getElementById('chinaPriceMlCop').value || 0) || 0;
  const commissionMlCop = parseFloat(document.getElementById('chinaCommissionMlCop').value || 0) || 0;
  const incomeCop = priceMlCop - commissionMlCop - unitCostCop;
  const marginPercent = unitCostCop > 0 ? (incomeCop / unitCostCop * 100) : 0;
  const totalProfitCop = incomeCop * qty;

  document.getElementById('calcLiveM3').innerText = `${cubicMeter.toFixed(3)} m³`;
  document.getElementById('calcLiveImportCop').innerText = `$${Math.round(importCostCop).toLocaleString('es-CO')} COP`;
  document.getElementById('calcLiveUnitCostCop').innerText = `$${Math.round(unitCostCop).toLocaleString('es-CO')} COP`;
  document.getElementById('calcLiveIncomeCop').innerText = `$${Math.round(incomeCop).toLocaleString('es-CO')} COP`;
  document.getElementById('calcLiveMargin').innerText = `${marginPercent.toFixed(1)}%`;
  document.getElementById('calcLiveMargin').className = marginPercent >= 100 ? 'badge-success' : (marginPercent >= 50 ? 'badge-warning' : 'badge-critical');
  document.getElementById('calcLiveTotalProfit').innerText = `$${Math.round(totalProfitCop).toLocaleString('es-CO')} COP`;
}

function openChinaShipmentModal(shipment = null) {
  document.getElementById('chinaShipmentId').value = shipment ? shipment.id : '';
  
  let prodName = shipment ? (shipment.product_name || '') : '';
  if (['William', 'David', 'Carlos', 'Juan'].includes(prodName)) prodName = '';
  document.getElementById('chinaProductName').value = prodName;

  document.getElementById('chinaNotionLink').value = shipment ? (shipment.notion_link || '') : '';
  document.getElementById('chinaAgency').value = shipment ? (shipment.agency || 'William') : 'William';
  document.getElementById('chinaSupply').value = shipment ? (shipment.supply || '1688') : '1688';
  document.getElementById('chinaDeliveryStatus').value = shipment ? (shipment.delivery_status || 'EN CAMINO') : 'EN CAMINO';

  const defaultDate = new Date().toISOString().split('T')[0];
  document.getElementById('chinaChineseWineryDate').value = shipment ? formatDateToInput(shipment.chinese_winery_date) : defaultDate;
  document.getElementById('chinaEtaDate').value = shipment ? (shipment.eta_date || '') : '';
  document.getElementById('chinaDaysToArrive').value = shipment ? (shipment.days_to_arrive || 90) : 90;
  document.getElementById('chinaPaymentCard').value = shipment ? (shipment.payment_card || '') : '';

  document.getElementById('chinaQuantity').value = shipment && shipment.quantity !== undefined ? shipment.quantity : 100;
  document.getElementById('chinaBoxes').value = shipment && shipment.boxes !== undefined ? shipment.boxes : 1;
  document.getElementById('chinaLengthM').value = shipment && shipment.length_m !== undefined ? shipment.length_m : 0.41;
  document.getElementById('chinaHeightM').value = shipment && shipment.height_m !== undefined ? shipment.height_m : 0.215;
  document.getElementById('chinaWidthM').value = shipment && shipment.width_m !== undefined ? shipment.width_m : 0.275;

  document.getElementById('chinaTotalPriceCop').value = shipment && shipment.total_price_cop !== undefined ? shipment.total_price_cop : 1500000;
  
  const costM3 = shipment ? (shipment.container_m3_cost || 3000000) : 3000000;
  const selectElem = document.getElementById('chinaContainerM3Select');
  if ([2500000, 2700000, 2900000, 3000000, 3300000, 3500000, 4000000].includes(costM3)) {
    selectElem.value = costM3.toString();
  } else {
    selectElem.value = 'custom';
  }
  document.getElementById('chinaContainerM3Cost').value = costM3;

  document.getElementById('chinaPriceMlCop').value = shipment && shipment.price_ml_cop !== undefined ? shipment.price_ml_cop : 49700;
  document.getElementById('chinaCommissionMlCop').value = shipment && shipment.commission_ml_cop !== undefined ? shipment.commission_ml_cop : 10549;

  document.getElementById('chinaModalTitle').innerText = shipment ? `🧮 Editar Importación: ${prodName || 'Producto'}` : '🧮 Simular & Registrar Importación China';
  document.getElementById('chinaShipmentModal').style.display = 'flex';
  updateChinaLiveCalc();
}

function editChinaShipment(id) {
  apiFetch('/api/inventory/china').then(data => {
    const shipment = (data.shipments || []).find(s => s.id == id);
    if (shipment) openChinaShipmentModal(shipment);
    else showToast('No se encontró la importación seleccionada', 'error');
  });
}

function closeChinaShipmentModal() {
  document.getElementById('chinaShipmentModal').style.display = 'none';
}

async function saveChinaShipmentFromModal() {
  const id = document.getElementById('chinaShipmentId').value;
  const product_name = document.getElementById('chinaProductName').value.trim();
  if (!product_name) return showToast('El nombre del producto es requerido', 'error');

  const containerSelectVal = document.getElementById('chinaContainerM3Select').value;
  const containerM3Cost = containerSelectVal === 'custom' 
    ? parseFloat(document.getElementById('chinaContainerM3Cost').value || 0) 
    : parseFloat(containerSelectVal || 2500000);

  const payload = {
    id: id || null,
    product_name,
    notion_link: document.getElementById('chinaNotionLink').value.trim(),
    agency: document.getElementById('chinaAgency').value,
    supply: document.getElementById('chinaSupply').value,
    delivery_status: document.getElementById('chinaDeliveryStatus').value,
    chinese_winery_date: document.getElementById('chinaChineseWineryDate').value,
    eta_date: document.getElementById('chinaEtaDate').value.trim(),
    days_to_arrive: parseInt(document.getElementById('chinaDaysToArrive').value || 0),
    payment_card: document.getElementById('chinaPaymentCard').value.trim(),
    quantity: parseInt(document.getElementById('chinaQuantity').value || 0),
    boxes: parseInt(document.getElementById('chinaBoxes').value || 0),
    length_m: parseFloat(document.getElementById('chinaLengthM').value || 0),
    height_m: parseFloat(document.getElementById('chinaHeightM').value || 0),
    width_m: parseFloat(document.getElementById('chinaWidthM').value || 0),
    total_price_cop: parseFloat(document.getElementById('chinaTotalPriceCop').value || 0),
    container_m3_cost: containerM3Cost,
    national_freight_cop: parseFloat(document.getElementById('chinaNationalFreightCop').value || 0),
    full_cost_cop: parseFloat(document.getElementById('chinaFullCostCop').value || 0),
    extra_expenses_cop: parseFloat(document.getElementById('chinaExtraExpensesCop').value || 0),
    price_ml_cop: parseFloat(document.getElementById('chinaPriceMlCop').value || 0),
    commission_ml_cop: parseFloat(document.getElementById('chinaCommissionMlCop').value || 0),
  };

  try {
    await apiFetch('/api/inventory/china', { method: 'POST', body: JSON.stringify(payload) });
    showToast('¡Importación y fórmulas guardadas con éxito!', 'success');
    closeChinaShipmentModal();
    loadChinaShipments();
  } catch (error) {
    showToast('Error guardando importación: ' + error.message, 'error');
  }
}

async function deleteChinaShipment(id) {
  if (!confirm('¿Eliminar este registro de embarque de China?')) return;
  try {
    await apiFetch(`/api/inventory/china/${id}`, { method: 'DELETE' });
    showToast('Embarque eliminado', 'info');
    loadChinaShipments();
  } catch (error) {
    showToast('Error eliminando embarque: ' + error.message, 'error');
  }
}

async function toggleChinaDeliveryStatus(id, currentStatus) {
  const isRecibido = currentStatus.toUpperCase().includes('RECIBIDO') || currentStatus === 'House';
  const newStatus = isRecibido ? 'EN CAMINO' : 'RECIBIDO';
  try {
    const data = await apiFetch('/api/inventory/china');
    const shipment = (data.shipments || []).find(s => s.id === id);
    if (shipment) {
      shipment.delivery_status = newStatus;
      shipment.status = newStatus === 'RECIBIDO' ? 'House' : 'In progress';
      await apiFetch('/api/inventory/china', { method: 'POST', body: JSON.stringify(shipment) });
      showToast(`Estado cambiado a: ${newStatus === 'RECIBIDO' ? '✅ RECIBIDO EN CASA' : '🚢 EN CAMINO'}`, 'success');
      loadChinaShipments();
    }
  } catch (error) {
    showToast('Error cambiando estado: ' + error.message, 'error');
  }
}

// --- Subtab 2: Local Stock Casa/Bodega ---
async function loadLocalInventory() {
  try {
    const data = await apiFetch(`/api/inventory/local?accountId=${activeAccountId}`);
    const items = data.inventory || [];

    let html = '';
    if (items.length === 0) {
      html = '<tr><td colspan="8" class="empty-cell">No hay productos registrados en Bodega Casa</td></tr>';
    } else {
      items.forEach(i => {
        const isLowStock = i.units_house <= i.min_stock_alert;
        const stockClass = isLowStock ? (i.units_house === 0 ? 'badge-critical' : 'badge-warning') : 'badge-success';

        const linkedBadge = i.linked_ml_count > 0 
          ? `<span class="badge-primary" style="font-weight:600;">🛍️ ${i.linked_ml_count} vinculada(s)</span>`
          : `<span class="badge-secondary" style="font-style:italic;">Sin vincular</span>`;

        html += `
          <tr>
            <td><strong>📦 ${escapeHtml(i.title)}</strong></td>
            <td><span class="${stockClass}">${i.units_house} unds</span></td>
            <td><strong>${i.total_full_stock || 0} unds</strong></td>
            <td>${linkedBadge}</td>
            <td>${i.min_stock_alert} unds</td>
            <td>$${(i.unit_cost_cop || 0).toLocaleString('es-CO')} COP</td>
            <td><small class="text-muted">${escapeHtml(i.location || 'Bodega Principal')}</small></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openTransferFullModal('${escapeAttr(i.sku)}', '${escapeAttr(i.title)}')">📦 Transferir a Full</button>
              <button class="btn btn-sm btn-secondary" onclick="editLocalItem(${i.id})">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteLocalItem(${i.id})">🗑️</button>
            </td>
          </tr>
        `;
      });
    }

    document.getElementById('localInventoryTable').innerHTML = html;
  } catch (error) {
    showToast('Error cargando stock local: ' + error.message, 'error');
  }
}

async function populateAccountSelects() {
  try {
    const data = await apiFetch('/api/accounts');
    const accounts = data.accounts || [];
    let options = '<option value="">Todas / Compartido</option>';
    accounts.forEach(a => {
      options += `<option value="${a.id}">${escapeHtml(a.name)}</option>`;
    });
    const localSel = document.getElementById('localAccountSelect');
    const promoSel = document.getElementById('promoAccountSelect');
    if (localSel) localSel.innerHTML = options;
    if (promoSel) promoSel.innerHTML = options;
  } catch (e) {}
}

async function openLocalItemModal(item = null) {
  await populateAccountSelects();
  document.getElementById('localItemId').value = item ? item.id : '';
  const localAccElem = document.getElementById('localAccountSelect');
  if (localAccElem) localAccElem.value = item ? item.account_id || '' : '';
  const localSkuElem = document.getElementById('localSku');
  if (localSkuElem) localSkuElem.value = item ? item.sku : '';
  const localCatElem = document.getElementById('localCategory');
  if (localCatElem) localCatElem.value = item ? item.category : 'General';
  document.getElementById('localTitle').value = item ? item.title : '';
  document.getElementById('localUnitsHouse').value = item ? item.units_house : 50;
  document.getElementById('localUnitCostCop').value = item ? item.unit_cost_cop : 25000;
  document.getElementById('localMinStock').value = item ? item.min_stock_alert : 15;
  document.getElementById('localLocation').value = item ? item.location : 'Bodega Principal';

  document.getElementById('localItemModalTitle').innerText = item ? 'Editar Producto en Bodega' : 'Agregar Producto a Bodega Casa';
  document.getElementById('localItemModal').style.display = 'flex';
}

function closeLocalItemModal() {
  document.getElementById('localItemModal').style.display = 'none';
}

async function saveLocalItemFromModal() {
  const id = document.getElementById('localItemId').value;
  const localSkuElem = document.getElementById('localSku');
  let sku = localSkuElem ? localSkuElem.value.trim() : '';
  const title = document.getElementById('localTitle').value.trim();
  if (!title) return showToast('El nombre del producto es requerido', 'error');
  if (!sku) {
    sku = title.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40) || ('PROD-' + Date.now());
  }

  const payload = {
    id: id || null,
    account_id: document.getElementById('localAccountSelect')?.value || null,
    sku,
    title,
    category: document.getElementById('localCategory')?.value?.trim() || 'General',
    units_house: parseInt(document.getElementById('localUnitsHouse').value || 0),
    unit_cost_cop: parseFloat(document.getElementById('localUnitCostCop').value || 0),
    min_stock_alert: parseInt(document.getElementById('localMinStock').value || 10),
    location: document.getElementById('localLocation').value.trim()
  };

  try {
    await apiFetch('/api/inventory/local', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Producto en Bodega guardado', 'success');
    closeLocalItemModal();
    loadLocalInventory();
  } catch (error) {
    showToast('Error guardando producto: ' + error.message, 'error');
  }
}

async function deleteLocalItem(id) {
  if (!confirm('¿Eliminar este producto de la Bodega Casa?')) return;
  try {
    await apiFetch(`/api/inventory/local/${id}`, { method: 'DELETE' });
    showToast('Producto eliminado de Bodega', 'info');
    loadLocalInventory();
  } catch (error) {
    showToast('Error eliminando producto: ' + error.message, 'error');
  }
}

async function openLinkProductModal(mlItemId, title, currentMasterTitle = '') {
  document.getElementById('linkMlItemId').value = mlItemId;
  document.getElementById('linkMlTitle').value = title;
  document.getElementById('linkMasterCustom').value = '';

  const selectElem = document.getElementById('linkMasterSelect');
  selectElem.innerHTML = '<option value="">-- Cargando productos de bodega... --</option>';

  try {
    // Query all house inventory items across accounts so user can link any bodega product
    const data = await apiFetch('/api/inventory/local');
    const localItems = data.inventory || [];
    let options = '<option value="">-- Seleccionar de Bodega Casa --</option>';
    localItems.forEach(i => {
      const selected = i.title === currentMasterTitle ? 'selected' : '';
      options += `<option value="${escapeAttr(i.title)}" ${selected}>📦 ${escapeHtml(i.title)} (${i.units_house} unds en casa)</option>`;
    });
    selectElem.innerHTML = options;
  } catch (e) {
    selectElem.innerHTML = '<option value="">-- Error cargando bodega --</option>';
  }

  document.getElementById('linkProductModal').style.display = 'flex';
}

function closeLinkProductModal() {
  document.getElementById('linkProductModal').style.display = 'none';
}

async function saveLinkProductFromModal() {
  const ml_item_id = document.getElementById('linkMlItemId').value;
  const selectVal = document.getElementById('linkMasterSelect').value;
  const customVal = document.getElementById('linkMasterCustom').value.trim();

  const master_product_title = customVal || selectVal;
  if (!master_product_title) {
    return showToast('Selecciona un producto de la bodega o escribe el nombre del producto físico', 'warning');
  }

  try {
    await apiFetch('/api/inventory/mappings', {
      method: 'POST',
      body: JSON.stringify({ ml_item_id, master_product_title })
    });

    // If custom typed title does not exist in local inventory, create it in Bodega Casa
    if (customVal) {
      try {
        const dataLocal = await apiFetch('/api/inventory/local');
        const exists = (dataLocal.inventory || []).some(i => i.title.toLowerCase() === customVal.toLowerCase());
        if (!exists) {
          await apiFetch('/api/inventory/local', {
            method: 'POST',
            body: JSON.stringify({
              title: customVal,
              units_house: 50,
              unit_cost_cop: 25000,
              min_stock_alert: 10,
              location: 'Bodega Principal'
            })
          });
        }
      } catch (e) {}
    }

    showToast(`¡Publicación vinculada a "${master_product_title}" permanentemente! 🔗`, 'success');
    closeLinkProductModal();
    if (typeof loadInventoryData === 'function') {
      loadInventoryData();
    } else {
      loadMlFullInventory();
    }
  } catch (error) {
    showToast('Error vinculando producto: ' + error.message, 'error');
  }
}

async function unlinkProductFromModal() {
  const ml_item_id = document.getElementById('linkMlItemId').value;
  if (!confirm('¿Desvincular esta publicación del producto físico?')) return;

  try {
    await apiFetch(`/api/inventory/mappings/${ml_item_id}`, { method: 'DELETE' });
    showToast('Vinculación removida', 'info');
    closeLinkProductModal();
    if (typeof loadInventoryData === 'function') {
      loadInventoryData();
    } else {
      loadMlFullInventory();
    }
  } catch (error) {
    showToast('Error desvinculando: ' + error.message, 'error');
  }
}

function toggleInactiveTable() {
  const wrapper = document.getElementById('inactiveTableWrapper');
  const icon = document.getElementById('inactiveToggleIcon');
  if (!wrapper) return;
  if (wrapper.style.display === 'none') {
    wrapper.style.display = 'block';
    if (icon) icon.textContent = '▼ Ocultar';
  } else {
    wrapper.style.display = 'none';
    if (icon) icon.textContent = '▶ Mostrar';
  }
}

// --- Subtab 3: Stock Full Mercado Libre ---
async function loadMlFullInventory() {
  try {
    const data = await apiFetch(`/api/inventory/full?accountId=${activeAccountId}`);
    const allItems = data.fullInventory || [];

    // Separate active/relevant items from inactive 0-sales items
    const activeOrSalesItems = [];
    const inactiveZeroSalesItems = [];

    allItems.forEach(f => {
      const sales30d = parseInt(f.sales_last_30d || 0, 10);
      const unitsFull = parseInt(f.units_full || 0, 10);
      const houseStockVal = f.master_stock_casa !== null && f.master_stock_casa !== undefined
        ? parseInt(f.master_stock_casa, 10)
        : (f.stock_casa !== undefined && f.stock_casa !== null ? parseInt(f.stock_casa, 10) : 0);

      // Main table: has sales > 0 OR has Full stock > 0 OR has House stock > 0
      if (sales30d > 0 || unitsFull > 0 || houseStockVal > 0) {
        activeOrSalesItems.push(f);
      } else {
        inactiveZeroSalesItems.push(f);
      }
    });

    // 1. Render Main Table
    let htmlActive = '';
    if (activeOrSalesItems.length === 0) {
      htmlActive = '<tr><td colspan="9" class="empty-cell">No hay publicaciones activas o con ventas en los últimos 30 días</td></tr>';
    } else {
      activeOrSalesItems.forEach(f => {
        const cov = parseFloat(f.coverage_days || 0);
        let covStatus = '<span class="badge-success">🟢 Cobertura Óptima</span>';
        if (cov < 5) covStatus = '<span class="badge-critical">🔴 Reabastecer Urgente</span>';
        else if (cov < 10) covStatus = '<span class="badge-warning">🟠 Alerta Stock Bajo</span>';

        const masterTitle = f.master_product_title || '';
        const masterCell = masterTitle 
          ? `<span class="badge-primary" style="font-weight:600;">📦 ${escapeHtml(masterTitle)}</span>`
          : `<span class="badge-secondary" style="font-style:italic;">Sin vincular</span>`;

        const houseStock = f.master_stock_casa !== null && f.master_stock_casa !== undefined
          ? f.master_stock_casa
          : (f.stock_casa !== undefined && f.stock_casa !== null ? f.stock_casa : 'N/A');

        htmlActive += `
          <tr>
            <td><code>${escapeHtml(f.ml_item_id)}</code></td>
            <td><strong>${escapeHtml(f.title)}</strong></td>
            <td>${masterCell}</td>
            <td><strong>${f.units_full}</strong> unds</td>
            <td><strong>${houseStock}</strong> unds</td>
            <td>
              <strong>${f.sales_last_30d || 0}</strong> unds 
              <button class="btn btn-sm" onclick="promptEditSales30d('${f.ml_item_id}', ${f.sales_last_30d || 0})" style="padding:2px 4px; font-size:0.75rem; margin-left:4px;" title="Editar ventas 30d manual">✏️</button>
            </td>
            <td><strong>${cov.toFixed(1)} días</strong></td>
            <td>${covStatus}</td>
            <td style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="btn btn-sm btn-secondary" onclick="openLinkProductModal('${f.ml_item_id}', '${escapeAttr(f.title)}', '${escapeAttr(masterTitle)}')" title="Vincular a producto físico de bodega">🔗 Vincular Físico</button>
              <button class="btn btn-sm btn-primary" onclick="openTransferFullModal('${escapeAttr(f.sku || f.ml_item_id)}', '${escapeAttr(f.title)}')">📦 Transferir</button>
            </td>
          </tr>
        `;
      });
    }

    const activeTableEl = document.getElementById('mlFullInventoryTable');
    if (activeTableEl) activeTableEl.innerHTML = htmlActive;

    const activeBadgeEl = document.getElementById('activeListingsCount');
    if (activeBadgeEl) activeBadgeEl.textContent = `${activeOrSalesItems.length} publicaciones principales`;

    // 2. Render Secondary Table (Inactive / Zero Sales)
    let htmlInactive = '';
    if (inactiveZeroSalesItems.length === 0) {
      htmlInactive = '<tr><td colspan="7" class="empty-cell">No hay publicaciones inactivas sin ventas</td></tr>';
    } else {
      inactiveZeroSalesItems.forEach(f => {
        const masterTitle = f.master_product_title || '';
        const masterCell = masterTitle 
          ? `<span class="badge-primary">📦 ${escapeHtml(masterTitle)}</span>`
          : `<span class="badge-secondary">Sin vincular</span>`;

        htmlInactive += `
          <tr style="opacity: 0.7;">
            <td><code>${escapeHtml(f.ml_item_id)}</code></td>
            <td>${escapeHtml(f.title)}</td>
            <td>${masterCell}</td>
            <td>0 unds</td>
            <td>N/A</td>
            <td>0 unds</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="openLinkProductModal('${f.ml_item_id}', '${escapeAttr(f.title)}', '${escapeAttr(masterTitle)}')">🔗 Vincular</button>
            </td>
          </tr>
        `;
      });
    }

    const inactiveTableEl = document.getElementById('mlInactiveInventoryTable');
    if (inactiveTableEl) inactiveTableEl.innerHTML = htmlInactive;

    const inactiveBadgeEl = document.getElementById('inactiveCountBadge');
    if (inactiveBadgeEl) inactiveBadgeEl.textContent = `${inactiveZeroSalesItems.length}`;

  } catch (error) {
    showToast('Error cargando stock Full Mercado Libre: ' + error.message, 'error');
  }
}


async function promptEditSales30d(mlItemId, currentSales) {
  const newVal = prompt(`Modificar ventas de los últimos 30 días para la publicación ${mlItemId}:`, currentSales);
  if (newVal === null) return;
  const parsed = parseInt(newVal);
  if (isNaN(parsed) || parsed < 0) {
    showToast('Ingresa un número de ventas válido (>= 0)', 'error');
    return;
  }

  try {
    await apiFetch('/api/inventory/full/sales30d', {
      method: 'POST',
      body: JSON.stringify({ ml_item_id: mlItemId, sales_last_30d: parsed })
    });
    showToast(`✅ Ventas 30d actualizadas a ${parsed} unds`, 'success');
    if (typeof loadInventoryData === 'function') {
      loadInventoryData();
    } else {
      loadMlFullInventory();
    }
  } catch (err) {
    showToast('Error actualizando ventas 30d: ' + err.message, 'error');
  }
}

async function syncMlFullInventory() {
  try {
    showToast('📡 Sincronizando inventarios de Mercado Libre...', 'info');
    const data = await apiFetch('/api/inventory/full/sync', { method: 'POST', body: JSON.stringify({ accountId: activeAccountId }) });
    if (data.success) {
      showToast(`✅ ${data.syncedCount || 0} publicaciones sincronizadas exitosamente`, 'success');
      loadMlFullInventory();
    } else {
      showToast('Error sincronizando Full: ' + (data.error || 'Desconocido'), 'error');
    }
  } catch (error) {
    showToast('Error de sincronización: ' + error.message, 'error');
  }
}

// Transfer Casa -> Full Modal
function openTransferFullModal(sku) {
  document.getElementById('transferSku').value = sku;
  document.getElementById('transferUnits').value = 20;
  document.getElementById('transferNotes').value = `Transferencia hacia Mercado Libre Full — ${sku}`;
  document.getElementById('transferFullModal').style.display = 'flex';
}

function closeTransferFullModal() {
  document.getElementById('transferFullModal').style.display = 'none';
}

async function submitTransferToFull() {
  const sku = document.getElementById('transferSku').value;
  const units = parseInt(document.getElementById('transferUnits').value || 0);
  const notes = document.getElementById('transferNotes').value;

  if (!units || units <= 0) return showToast('Ingresa unidades válidas', 'error');

  try {
    await apiFetch('/api/inventory/movement', {
      method: 'POST',
      body: JSON.stringify({
        account_id: activeAccountId || null,
        sku,
        movement_type: 'transferencia_full',
        units,
        description: notes
      })
    });

    showToast(`✅ ${units} unidades transferidas de Casa a ML Full (${sku})`, 'success');
    closeTransferFullModal();
    loadInventoryData();
  } catch (error) {
    showToast('Error registrando transferencia: ' + error.message, 'error');
  }
}

// --- Subtab 4: Alertas & Planificación de Compras China ---
async function loadReorderAlerts() {
  try {
    const data = await apiFetch(`/api/inventory/planning?accountId=${activeAccountId}`);
    const items = data.planning || [];

    let criticalCount = 0;
    let warningCount = 0;

    let html = '';
    if (items.length === 0) {
      html = '<tr><td colspan="8" class="empty-cell">No hay datos suficientes para calcular la planificación de compras</td></tr>';
    } else {
      items.forEach(p => {
        if (p.status === 'CRITICAL_ORDER_NOW') criticalCount++;
        if (p.status === 'WARNING_ORDER_SOON') warningCount++;

        const linkedBadge = p.linked_listings_count > 0 
          ? `<br><small class="text-muted">🛍️ ${p.linked_listings_count} publicación(es) ML vinculada(s)</small>`
          : `<br><small class="text-muted" style="font-style:italic;">Producto físico único</small>`;

        const orderQtyDisplay = p.suggested_po_quantity > 0 
          ? `<strong class="text-critical" style="font-size:1.1rem;">${p.suggested_po_quantity.toLocaleString('es-CO')} unds</strong>` 
          : `<span class="text-muted">0 unds</span>`;

        html += `
          <tr>
            <td>
              <strong>📦 ${escapeHtml(p.master_title)}</strong>
              ${linkedBadge}
            </td>
            <td>
              <strong>${p.total_current_stock}</strong> unds<br>
              <small class="text-muted">(Casa: ${p.house_stock} | Full: ${p.full_stock})</small>
            </td>
            <td>
              <strong>${p.transit_stock}</strong> unds<br>
              <small class="text-muted">${p.transit_stock > 0 ? '🚢 Viniendo de China' : 'Sin pedidos en camino'}</small>
            </td>
            <td>
              <strong>${p.adjusted_velocity_daily}</strong> /día<br>
              <small class="text-muted">${p.sales_30d} unds en 30d (Ajustado)</small>
            </td>
            <td>
              <strong>${p.days_coverage_remaining} días</strong>
            </td>
            <td>
              <strong>${p.reorder_point_units} unds</strong><br>
              <small class="text-muted">(Garantiza 105d tránsito)</small>
            </td>
            <td>
              ${orderQtyDisplay}
            </td>
            <td>
              <span class="${p.badge_class}" style="font-size:0.85rem; padding:4px 8px; display:inline-block; margin-bottom:4px;">${p.status_label}</span><br>
              <button class="btn btn-sm btn-primary" onclick="openChinaShipmentModal({ product_name: '${escapeAttr(p.master_title)}', quantity: ${p.suggested_po_quantity || 100} })">🚢 Crear Pedido a China</button>
            </td>
          </tr>
        `;
      });
    }

    document.getElementById('reorderAlertsGrid').innerHTML = html;
    document.getElementById('planningCriticalCount').textContent = criticalCount;
    document.getElementById('planningWarningCount').textContent = warningCount;
    document.getElementById('planningTotalProducts').textContent = items.length;
  } catch (error) {
    showToast('Error cargando planificación de compras: ' + error.message, 'error');
  }
}

function handleAlertAction(type, sku) {
  if (type === 'reorder_china') {
    openChinaShipmentModal({ supplier_name: 'Proveedor China', notes: `Reorden urgente para SKU: ${sku}` });
  } else {
    openTransferFullModal(sku);
  }
}

// ══════════════════════════════════════════
// ── Modulo de Ofertas & Márgenes Logic ──
// ══════════════════════════════════════════

function calculateLiveMargin() {
  const original = parseFloat(document.getElementById('calcOriginalPrice').value || 0);
  const promo = parseFloat(document.getElementById('calcPromoPrice').value || 0);
  const commissionPercent = parseFloat(document.getElementById('calcCommissionPercent').value || 13);
  const shipping = parseFloat(document.getElementById('calcShippingCost').value || 0);
  const productCost = parseFloat(document.getElementById('calcProductCost').value || 0);

  const discountPercent = original > 0 ? ((original - promo) / original) * 100 : 0;
  const commissionCop = promo * (commissionPercent / 100);
  const netCop = promo - commissionCop - shipping - productCost;
  const netPercent = promo > 0 ? (netCop / promo) * 100 : 0;

  document.getElementById('calcResDiscount').innerText = `${discountPercent.toFixed(1)}%`;
  document.getElementById('calcResCommission').innerText = `$${Math.round(commissionCop).toLocaleString('es-CO')} COP`;
  document.getElementById('calcResShipping').innerText = `$${Math.round(shipping).toLocaleString('es-CO')} COP`;
  document.getElementById('calcResCost').innerText = `$${Math.round(productCost).toLocaleString('es-CO')} COP`;

  const netCopEl = document.getElementById('calcResNetCop');
  const netPctEl = document.getElementById('calcResNetPercent');

  netCopEl.innerText = `$${Math.round(netCop).toLocaleString('es-CO')} COP`;
  netPctEl.innerText = `${netPercent.toFixed(1)}%`;

  if (netPercent >= 20) {
    netPctEl.className = 'badge-success';
  } else if (netPercent >= 10) {
    netPctEl.className = 'badge-warning';
  } else {
    netPctEl.className = 'badge-critical';
  }
}

async function runAiMarginEvaluation() {
  const box = document.getElementById('aiMarginEvaluation');
  box.innerHTML = '<p class="text-muted">🤖 Analizando rentabilidad con Gemini 3.6 Flash...</p>';

  const original = parseFloat(document.getElementById('calcOriginalPrice').value || 0);
  const promo = parseFloat(document.getElementById('calcPromoPrice').value || 0);
  const commissionPercent = parseFloat(document.getElementById('calcCommissionPercent').value || 13);
  const shipping = parseFloat(document.getElementById('calcShippingCost').value || 0);
  const productCost = parseFloat(document.getElementById('calcProductCost').value || 0);

  const discountPercent = original > 0 ? ((original - promo) / original) * 100 : 0;
  const commissionCop = promo * (commissionPercent / 100);
  const netCop = promo - commissionCop - shipping - productCost;
  const netPercent = promo > 0 ? (netCop / promo) * 100 : 0;

  const productData = {
    title: 'Producto de prueba Mercado Libre',
    original_price: original,
    promo_price: promo,
    discount_percent: discountPercent,
    ml_commission_percent: commissionPercent,
    shipping_cost_cop: shipping,
    product_cost_cop: productCost,
    net_margin_cop: netCop,
    net_margin_percent: netPercent
  };

  try {
    const res = await apiFetch('/api/promotions/ai-evaluate', {
      method: 'POST',
      body: JSON.stringify({ productData, targetMarginPercent: 20 })
    });

    box.innerHTML = `
      <div class="card p-3 accent-purple">
        <strong>🤖 Evaluación de Gemini IA:</strong>
        <p class="mt-1" style="font-size:0.85rem">${escapeHtml(res.evaluation)}</p>
        <button class="btn btn-sm btn-secondary mt-2" onclick="runAiMarginEvaluation()">🔄 Re-evaluar</button>
      </div>
    `;
  } catch (error) {
    box.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
  }
}

async function loadPromotions() {
  calculateLiveMargin();
  try {
    const data = await apiFetch(`/api/promotions?accountId=${activeAccountId}`);
    const promos = data.promotions || [];

    let html = '';
    if (promos.length === 0) {
      html = '<tr><td colspan="9" class="empty-cell">No hay ofertas registradas</td></tr>';
    } else {
      promos.forEach(p => {
        const marginClass = p.net_margin_percent >= 20 ? 'badge-success' : (p.net_margin_percent >= 10 ? 'badge-warning' : 'badge-critical');

        html += `
          <tr>
            <td><span class="badge-secondary">${escapeHtml(p.account_name || 'Tienda')}</span></td>
            <td>
              <code>${escapeHtml(p.ml_item_id)}</code><br>
              <strong>${escapeHtml(p.title)}</strong>
            </td>
            <td>$${(p.original_price || 0).toLocaleString('es-CO')}</td>
            <td><strong>$${(p.promo_price || 0).toLocaleString('es-CO')}</strong></td>
            <td><span class="badge-primary">-${(p.discount_percent || 0).toFixed(0)}%</span></td>
            <td>
              <span class="${marginClass}">${(p.net_margin_percent || 0).toFixed(1)}%</span><br>
              <small class="text-muted">($${Math.round(p.net_margin_cop || 0).toLocaleString('es-CO')} COP)</small>
            </td>
            <td><span class="badge-success">${p.status || 'activa'}</span></td>
            <td><small class="text-muted">${escapeHtml((p.ai_evaluation || '').substring(0, 70))}...</small></td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="deletePromotion(${p.id})">🗑️</button>
            </td>
          </tr>
        `;
      });
    }

    document.getElementById('promotionsTable').innerHTML = html;
  } catch (error) {
    showToast('Error cargando promociones: ' + error.message, 'error');
  }
}

async function openPromotionModal() {
  await populateAccountSelects();
  document.getElementById('promoModalTitle').innerText = 'Crear Nueva Oferta';
  document.getElementById('promoId').value = '';
  document.getElementById('promotionModal').style.display = 'flex';
}

function closePromotionModal() {
  document.getElementById('promotionModal').style.display = 'none';
}

async function savePromotionFromModal() {
  const account_id = document.getElementById('promoAccountSelect').value;
  const ml_item_id = document.getElementById('promoMlItemId').value.trim();
  const title = document.getElementById('promoTitle').value.trim();
  const promo_price = parseFloat(document.getElementById('promoPromoPrice').value || 0);

  if (!account_id || !ml_item_id || !title || !promo_price) {
    return showToast('Cuenta, Item ID, Título y Precio Oferta son requeridos', 'error');
  }

  const payload = {
    account_id,
    ml_item_id,
    title,
    original_price: parseFloat(document.getElementById('promoOriginalPrice').value || promo_price),
    promo_price,
    ml_commission_percent: parseFloat(document.getElementById('promoMlCommission').value || 13),
    shipping_cost_cop: parseFloat(document.getElementById('promoShippingCost').value || 0),
    product_cost_cop: parseFloat(document.getElementById('promoProductCost').value || 0),
    status: 'activa'
  };

  try {
    await apiFetch('/api/promotions', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Oferta registrada con éxito', 'success');
    closePromotionModal();
    loadPromotions();
  } catch (error) {
    showToast('Error guardando oferta: ' + error.message, 'error');
  }
}

async function deletePromotion(id) {
  if (!confirm('¿Eliminar esta oferta del registro?')) return;
  try {
    await apiFetch(`/api/promotions/${id}`, { method: 'DELETE' });
    showToast('Oferta eliminada', 'info');
    loadPromotions();
  } catch (error) {
    showToast('Error eliminando oferta: ' + error.message, 'error');
  }
}

async function triggerImportCsv() {
  try {
    showToast('📥 Importando catálogo de productos desde CSV...', 'info');
    const data = await apiFetch('/api/inventory/import-csv', { method: 'POST' });
    if (data.success) {
      showToast('✅ Catálogo de stock importado exitosamente desde CSV', 'success');
      loadInventoryData();
    } else {
      showToast('Error en importación: ' + (data.error || 'Desconocido'), 'error');
    }
  } catch (error) {
    showToast('Error importando CSV: ' + error.message, 'error');
  }
}


