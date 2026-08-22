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
