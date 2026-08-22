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
async function loadChinaShipments() {
  try {
    const data = await apiFetch('/api/inventory/china');
    const shipments = data.shipments || [];

    let totalUnits = 0;
    let totalLandedCop = 0;
    let totalProfitCop = 0;
    let totalM3 = 0;

    let html = '';
    if (shipments.length === 0) {
      html = '<tr><td colspan="12" class="empty-cell">No hay importaciones desde China registradas</td></tr>';
    } else {
      shipments.forEach(s => {
        const qty = s.quantity || s.active_transit_units || 0;
        const landedTotal = s.total_cost_cop || (s.unit_cost_cop * qty) || 0;
        const profitTotal = s.total_profit_cop || (s.income_cop * qty) || 0;
        const m3 = parseFloat(s.cubic_meter || 0);

        totalUnits += qty;
        totalLandedCop += landedTotal;
        totalProfitCop += profitTotal;
        totalM3 += m3;

        const delStatus = s.delivery_status || s.status || '';
        let statusBadge = '<span class="badge-primary">🚢 EN CAMINO</span>';
        if (delStatus.toUpperCase().includes('RETRASADO')) statusBadge = '<span class="badge-critical">⚠️ RETRASADO</span>';
        else if (delStatus.toUpperCase().includes('RECIBIDO') || delStatus === 'House') statusBadge = '<span class="badge-success">✅ RECIBIDO</span>';
        else if (delStatus.toUpperCase().includes('CHINA')) statusBadge = '<span class="badge-warning">⚙️ EN CHINA</span>';

        const margin = parseFloat(s.margin_percent || 0);
        const marginBadgeClass = margin >= 100 ? 'badge-success' : (margin >= 50 ? 'badge-warning' : 'badge-critical');

        html += `
          <tr>
            <td>
              <strong>${escapeHtml(s.product_name || s.supplier_name)}</strong><br>
              ${s.notion_link ? `<small><a href="${escapeHtml(s.notion_link)}" target="_blank" class="text-accent">📋 Notion</a></small>` : ''}
            </td>
            <td><strong>${qty.toLocaleString('es-CO')}</strong> unds</td>
            <td><span class="badge-secondary">${escapeHtml(s.agency || 'Agente')} (${escapeHtml(s.supply || 'Alibaba')})</span></td>
            <td>${m3 > 0 ? m3.toFixed(3) + ' m³' : 'N/A'}</td>
            <td>$${Math.round(s.unit_cost_cop || 0).toLocaleString('es-CO')} COP</td>
            <td>$${Math.round(s.price_ml_cop || 0).toLocaleString('es-CO')} COP</td>
            <td><strong>$${Math.round(s.income_cop || 0).toLocaleString('es-CO')} COP</strong></td>
            <td><span class="${marginBadgeClass}">${margin.toFixed(1)}%</span></td>
            <td><strong>$${Math.round(profitTotal).toLocaleString('es-CO')} COP</strong></td>
            <td><small>${escapeHtml(s.eta_date || 'Por definir')}</small></td>
            <td>${statusBadge}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="editChinaShipment(${s.id})">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteChinaShipment(${s.id})">🗑️</button>
            </td>
          </tr>
        `;
      });
    }

    document.getElementById('chinaShipmentsTable').innerHTML = html;
    document.getElementById('china-total-units').innerText = `${totalUnits.toLocaleString('es-CO')} unds`;
    document.getElementById('china-total-landed').innerText = `$${Math.round(totalLandedCop).toLocaleString('es-CO')} COP`;
    document.getElementById('china-total-profit').innerText = `$${Math.round(totalProfitCop).toLocaleString('es-CO')} COP`;
    document.getElementById('china-total-m3').innerText = `${totalM3.toFixed(2)} m³`;
  } catch (error) {
    showToast('Error cargando importaciones China: ' + error.message, 'error');
  }
}

function openChinaShipmentModal(shipment = null) {
  document.getElementById('chinaShipmentId').value = shipment ? shipment.id : '';
  document.getElementById('chinaSupplierName').value = shipment ? shipment.supplier_name : '';
  document.getElementById('chinaTrackingNumber').value = shipment ? shipment.tracking_number : '';
  document.getElementById('chinaShipmentType').value = shipment ? shipment.shipment_type : 'maritimo';
  document.getElementById('chinaStatus').value = shipment ? shipment.status : 'produccion';
  document.getElementById('chinaEtdDate').value = shipment ? shipment.etd_date : '';
  document.getElementById('chinaEtaDate').value = shipment ? shipment.eta_date : '';
  document.getElementById('chinaTrmCop').value = shipment ? shipment.trm_cop : 4050;
  document.getElementById('chinaTotalCostUsd').value = shipment ? shipment.total_cost_usd : '';
  document.getElementById('chinaTotalUnits').value = shipment ? shipment.total_units : '';
  document.getElementById('chinaNotes').value = shipment ? shipment.notes : '';

  document.getElementById('chinaModalTitle').innerText = shipment ? 'Editar Embarque China' : 'Registrar Nuevo Embarque desde China';
  document.getElementById('chinaShipmentModal').style.display = 'flex';
}

function closeChinaShipmentModal() {
  document.getElementById('chinaShipmentModal').style.display = 'none';
}

async function saveChinaShipmentFromModal() {
  const id = document.getElementById('chinaShipmentId').value;
  const supplier_name = document.getElementById('chinaSupplierName').value.trim();
  if (!supplier_name) return showToast('El proveedor es requerido', 'error');

  const payload = {
    id: id || null,
    supplier_name,
    tracking_number: document.getElementById('chinaTrackingNumber').value.trim(),
    shipment_type: document.getElementById('chinaShipmentType').value,
    status: document.getElementById('chinaStatus').value,
    etd_date: document.getElementById('chinaEtdDate').value,
    eta_date: document.getElementById('chinaEtaDate').value,
    trm_cop: parseFloat(document.getElementById('chinaTrmCop').value || 4000),
    total_cost_usd: parseFloat(document.getElementById('chinaTotalCostUsd').value || 0),
    total_units: parseInt(document.getElementById('chinaTotalUnits').value || 0),
    notes: document.getElementById('chinaNotes').value.trim(),
  };

  try {
    await apiFetch('/api/inventory/china', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Embarque desde China guardado con éxito', 'success');
    closeChinaShipmentModal();
    loadChinaShipments();
  } catch (error) {
    showToast('Error guardando embarque: ' + error.message, 'error');
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

// --- Subtab 2: Local Stock Casa/Bodega ---
async function loadLocalInventory() {
  try {
    const data = await apiFetch(`/api/inventory/local?accountId=${activeAccountId}`);
    const items = data.inventory || [];

    let html = '';
    if (items.length === 0) {
      html = '<tr><td colspan="10" class="empty-cell">No hay productos registrados en Bodega Casa</td></tr>';
    } else {
      items.forEach(i => {
        const totalValueCop = (i.units_house * i.unit_cost_cop).toLocaleString('es-CO');
        const isLowStock = i.units_house <= i.min_stock_alert;
        const stockClass = isLowStock ? (i.units_house === 0 ? 'badge-critical' : 'badge-warning') : 'badge-success';

        html += `
          <tr>
            <td><code>${escapeHtml(i.sku)}</code></td>
            <td><strong>${escapeHtml(i.title)}</strong></td>
            <td>${escapeHtml(i.category || 'General')}</td>
            <td><span class="badge-secondary">${escapeHtml(i.account_name || 'Ambas')}</span></td>
            <td><span class="${stockClass}">${i.units_house} unds</span></td>
            <td>${i.min_stock_alert} unds</td>
            <td>$${(i.unit_cost_cop || 0).toLocaleString('es-CO')} COP</td>
            <td><strong>$${totalValueCop} COP</strong></td>
            <td><small class="text-muted">${escapeHtml(i.location || 'Bodega Principal')}</small></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openTransferFullModal('${escapeAttr(i.sku)}')">📦 Transferir a Full</button>
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
  document.getElementById('localAccountSelect').value = item ? item.account_id || '' : '';
  document.getElementById('localSku').value = item ? item.sku : '';
  document.getElementById('localCategory').value = item ? item.category : 'Suplementos';
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
  const sku = document.getElementById('localSku').value.trim();
  const title = document.getElementById('localTitle').value.trim();
  if (!sku || !title) return showToast('SKU y Título son requeridos', 'error');

  const payload = {
    id: id || null,
    account_id: document.getElementById('localAccountSelect').value || null,
    sku,
    title,
    category: document.getElementById('localCategory').value.trim(),
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

// --- Subtab 3: Stock Full Mercado Libre ---
async function loadMlFullInventory() {
  try {
    const data = await apiFetch(`/api/inventory/full?accountId=${activeAccountId}`);
    const items = data.fullInventory || [];

    let html = '';
    if (items.length === 0) {
      html = '<tr><td colspan="9" class="empty-cell">No hay items sincronizados en Mercado Libre Full</td></tr>';
    } else {
      items.forEach(f => {
        const cov = parseFloat(f.coverage_days || 0);
        let covStatus = '<span class="badge-success">🟢 Cobertura Óptima</span>';
        if (cov < 5) covStatus = '<span class="badge-critical">🔴 Reabastecer Urgente</span>';
        else if (cov < 10) covStatus = '<span class="badge-warning">🟠 Alerta Stock Bajo</span>';

        html += `
          <tr>
            <td>
              <code>${escapeHtml(f.ml_item_id)}</code><br>
              <small class="text-muted">SKU: ${escapeHtml(f.sku || 'N/A')}</small>
            </td>
            <td><strong>${escapeHtml(f.title)}</strong></td>
            <td><span class="badge-secondary">${escapeHtml(f.account_name || 'Tienda')}</span></td>
            <td><strong>${f.units_full}</strong> unds</td>
            <td>${f.stock_casa !== undefined ? f.stock_casa : 'N/A'} unds</td>
            <td>${f.sales_last_30d || 0} unds</td>
            <td><strong>${cov.toFixed(1)} días</strong></td>
            <td>${covStatus}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="openTransferFullModal('${escapeAttr(f.sku || f.ml_item_id)}')">📦 Transferir desde Casa</button>
            </td>
          </tr>
        `;
      });
    }

    document.getElementById('mlFullInventoryTable').innerHTML = html;
  } catch (error) {
    showToast('Error cargando stock Full Mercado Libre: ' + error.message, 'error');
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

// --- Subtab 4: Alertas & Reorden ---
async function loadReorderAlerts() {
  try {
    const data = await apiFetch(`/api/inventory/alerts?accountId=${activeAccountId}`);
    const alerts = data.alerts || [];

    let html = '';
    if (alerts.length === 0) {
      html = '<div class="empty-state">🎉 ¡Excelente! No hay alertas de reabastecimiento ni quiebre de stock en este momento.</div>';
    } else {
      alerts.forEach(a => {
        const isCrit = a.severity === 'critical';
        html += `
          <div class="alert-card ${isCrit ? 'critical' : ''}">
            <div>
              <strong>${isCrit ? '🚨 CRÍTICO' : '⚠️ ALERTA'}: ${escapeHtml(a.title)}</strong> (SKU: <code>${escapeHtml(a.sku)}</code>)<br>
              <span class="text-secondary">${escapeHtml(a.message)}</span>
            </div>
            <div>
              <button class="btn btn-sm ${isCrit ? 'btn-primary' : 'btn-secondary'}" onclick="handleAlertAction('${a.type}', '${escapeAttr(a.sku)}')">
                ${a.type === 'reorder_china' ? '🚢 Pedir a China' : '📦 Transferir a Full'}
              </button>
            </div>
          </div>
        `;
      });
    }

    document.getElementById('reorderAlertsGrid').innerHTML = html;
  } catch (error) {
    showToast('Error cargando alertas: ' + error.message, 'error');
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


