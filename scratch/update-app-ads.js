const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let js = fs.readFileSync(filePath, 'utf8');

// 1. Update loadFinancialSummary ad spend & subtext
const oldAdSpendBlock = `    if (elAdSpend) elAdSpend.textContent = formatCop(fin.ad_spend_cop);
    const elAdSubtext = document.getElementById('fin-ad-subtext');
    if (elAdSubtext) {
      if (fin.ad_breakdown && fin.ad_breakdown.length > 0) {
        if (fin.ad_breakdown.length === 1 && fin.ad_breakdown[0].daily_budget) {
          elAdSubtext.innerHTML = \`📅 \${Math.round(fin.ad_breakdown[0].daily_budget).toLocaleString('es-CO')}/día · \${fin.ad_breakdown[0].days} días\`;
        } else if (fin.ad_breakdown.length > 1) {
          elAdSubtext.innerHTML = \`📅 \${fin.ad_breakdown.length} periodos de gasto · Clic para ver\`;
        } else {
          elAdSubtext.innerHTML = '📅 Presupuestos por fecha ⚙️';
        }
      } else {
        elAdSubtext.innerHTML = 'Campañas Mercado Clics ⚙️';
      }
    }`;

const newAdSpendBlock = `    if (elAdSpend) elAdSpend.textContent = formatCop(fin.ad_spend_cop);
    const elAdSubtext = document.getElementById('fin-ad-subtext');
    if (elAdSubtext) {
      if (fin.is_current_month) {
        if (!activeAccountId || activeAccountId === 'all') {
          const juanBreak = (fin.ad_breakdown || []).filter(b => b.account_id === 1);
          const carlosBreak = (fin.ad_breakdown || []).filter(b => b.account_id === 2);
          const juanElapsed = juanBreak.reduce((s, b) => s + (b.subtotal_elapsed != null ? b.subtotal_elapsed : b.subtotal), 0);
          const carlosElapsed = carlosBreak.reduce((s, b) => s + (b.subtotal_elapsed != null ? b.subtotal_elapsed : b.subtotal), 0);
          elAdSubtext.innerHTML = \`🏪 Juan: $\${Math.round(juanElapsed).toLocaleString('es-CO')} · 🏪 Carlos: $\${Math.round(carlosElapsed).toLocaleString('es-CO')} (Día \${fin.days_elapsed}/\${fin.days_in_month})\`;
        } else {
          elAdSubtext.innerHTML = \`📅 Gasto día 1 al \${fin.days_elapsed} · Proy. mes: \${formatCop(fin.ad_spend_projected_cop)}\`;
        }
      } else {
        elAdSubtext.innerHTML = \`📅 Mes cerrado · Gasto total: \${formatCop(fin.ad_spend_cop)}\`;
      }
    }`;

if (js.includes(oldAdSpendBlock)) {
  js = js.replace(oldAdSpendBlock, newAdSpendBlock);
  console.log('Replaced loadFinancialSummary ad spend block');
} else {
  console.warn('Could not find oldAdSpendBlock, will inspect...');
}

// 2. Replace Ads & Budget History implementation
const oldAdsSectionStart = js.indexOf('// ── Publicidad Inteligente (Ads) ──');
if (oldAdsSectionStart === -1) {
  console.error('Could not find start of Ads section');
  process.exit(1);
}

const newAdsLogic = `// ── Publicidad Inteligente (Ads) — Gestión Independiente por Cuenta ──
// ══════════════════════════════════════════

let adsSelectedAccountId = 2; // Default to Tienda Carlos

function switchAdsAccount(accId) {
  adsSelectedAccountId = parseInt(accId);
  updateAdsAccountTabsUI();
  loadAdGroups();
}

function updateAdsAccountTabsUI() {
  const btnCarlos = document.getElementById('btnAdsAccountCarlos');
  const btnJuan = document.getElementById('btnAdsAccountJuan');
  if (btnCarlos && btnJuan) {
    if (adsSelectedAccountId === 2) {
      btnCarlos.style.background = '#38bdf8';
      btnCarlos.style.color = '#0f172a';
      btnCarlos.style.borderColor = '#38bdf8';
      btnJuan.style.background = 'rgba(255,255,255,0.06)';
      btnJuan.style.color = '#cbd5e1';
      btnJuan.style.borderColor = '#475569';
    } else {
      btnJuan.style.background = '#38bdf8';
      btnJuan.style.color = '#0f172a';
      btnJuan.style.borderColor = '#38bdf8';
      btnCarlos.style.background = 'rgba(255,255,255,0.06)';
      btnCarlos.style.color = '#cbd5e1';
      btnCarlos.style.borderColor = '#475569';
    }
  }
}

async function loadAdGroups() {
  const container = document.getElementById('adsGroupsContainer');
  if (!container) return;

  // Sync with main navigation account if specific account selected
  if (activeAccountId && (activeAccountId === '1' || activeAccountId === '2')) {
    adsSelectedAccountId = parseInt(activeAccountId);
  }
  updateAdsAccountTabsUI();

  const accountId = adsSelectedAccountId || 2;
  container.innerHTML = '<div style="color:#94a3b8;">Calculando estrategia y agrupando productos...</div>';

  try {
    const [data, calc] = await Promise.all([
      apiFetch(\`/api/ads/groups?accountId=\${accountId}\`),
      apiFetch(\`/api/ads/monthly-calculation?accountId=\${accountId}\`)
    ]);

    if (!data.groups) throw new Error('No se pudo cargar la información de grupos.');

    // Update banner with current account name and budget
    const elTitle = document.getElementById('adsAccountTitle');
    const elTableTitle = document.getElementById('adsTableAccountName');
    const elDaily = document.getElementById('adsDailyBudgetLabel');
    const elMonthly = document.getElementById('adsMonthlyBudgetLabel');
    const elElapsedSpend = document.getElementById('adsMonthElapsedSpend');
    const elElapsedDays = document.getElementById('adsMonthElapsedDays');
    const elInput = document.getElementById('inputCustomAdBudget');
    const badgeCarlos = document.getElementById('badgeTabBudgetCarlos');
    const badgeJuan = document.getElementById('badgeTabBudgetJuan');

    const accName = data.accountName || (accountId === 2 ? 'Tienda Carlos' : 'Tienda Juan');
    if (elTitle) elTitle.textContent = \`Presupuesto Mercado Ads — \${accName}\`;
    if (elTableTitle) elTableTitle.textContent = accName;
    if (elDaily) elDaily.textContent = \`$\${(data.total_budget || 0).toLocaleString('es-CO')} COP / día\`;

    if (calc) {
      if (elMonthly) elMonthly.textContent = \`$\${(calc.total_spend_month || 0).toLocaleString('es-CO')} COP\`;
      if (elElapsedSpend) elElapsedSpend.textContent = \`$\${(calc.spend_up_to_today || 0).toLocaleString('es-CO')} COP\`;
      if (elElapsedDays) elElapsedDays.textContent = \`Día \${calc.days_elapsed} de \${calc.days_in_month} transcurridos\`;
    }

    if (accountId === 2 && badgeCarlos) {
      badgeCarlos.textContent = \`($\${(data.total_budget || 0).toLocaleString('es-CO')}/día)\`;
    } else if (accountId === 1 && badgeJuan) {
      badgeJuan.textContent = \`($\${(data.total_budget || 0).toLocaleString('es-CO')}/día)\`;
    }

    if (elInput) {
      elInput.value = data.total_budget || '';
      elInput.dataset.accountId = String(accountId);
    }

    let html = '';
    data.groups.forEach(g => {
      // Build top 5 items preview
      const topItems = g.items.slice(0, 5).map(i => \`
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:4px 0;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%; font-size:0.8rem; color:#cbd5e1;">\${escapeHtml(i.title)}</span>
          <span style="font-size:0.8rem; color:#38bdf8; font-weight:bold;">\${i.sales_last_30d} ventas</span>
        </div>
      \`).join('');

      html += \`
        <div class="card" style="border-top: 4px solid #38bdf8;">
          <h3 style="margin-top:0; color:#f8fafc;">\${escapeHtml(g.name)}</h3>
          <p style="font-size:0.85rem; color:#94a3b8;">\${escapeHtml(g.description)}</p>
          <div style="background: rgba(56, 189, 248, 0.1); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <div style="font-size: 0.75rem; color: #38bdf8; text-transform: uppercase;">Presupuesto Diario Sugerido</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: #f8fafc;">$\${g.budget_allocated.toLocaleString('es-CO')} COP</div>
          </div>
          <div>
            <strong style="color:#cbd5e1; font-size:0.85rem;">Total Productos: \${g.items.length}</strong>
            <div style="margin-top: 10px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; min-height: 100px;">
              \${topItems || '<div style="font-size:0.8rem; color:#64748b; font-style:italic;">No hay productos en este grupo</div>'}
              \${g.items.length > 5 ? \`<div style="font-size:0.75rem; color:#64748b; text-align:center; margin-top:8px;">+ \${g.items.length - 5} productos más...</div>\` : ''}
            </div>
          </div>
        </div>
      \`;
    });

    container.innerHTML = html;

    // Also populate on-page history table
    loadPageAdHistoryTable(accountId, calc);

  } catch (error) {
    container.innerHTML = \`<div style="color:#ef4444;">Error: \${error.message}</div>\`;
  }
}

async function loadPageAdHistoryTable(accountId, calc = null) {
  const tbody = document.getElementById('adsPageHistoryTableBody');
  if (!tbody) return;

  try {
    const history = await apiFetch(\`/api/ads/budget-history?accountId=\${accountId}\`);
    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No hay periodos registrados aún. Ingresa uno arriba.</td></tr>';
      return;
    }

    let html = '';
    history.forEach(item => {
      const isCurrentActive = !item.end_date;
      const statusBadge = isCurrentActive
        ? '<span class="badge-success" style="padding: 3px 8px; font-size: 0.75rem; background:#10b981; color:#022c22; border-radius:4px; font-weight:700;">🟢 Vigente / En curso</span>'
        : '<span class="badge-secondary" style="padding: 3px 8px; font-size: 0.75rem; background:rgba(255,255,255,0.1); color:#94a3b8; border-radius:4px;">⚪ Finalizado</span>';

      let daysInMonthText = '—';
      let spentInMonthText = '—';
      if (calc && calc.breakdown) {
        const matching = calc.breakdown.find(b => b.daily_budget === item.daily_budget_cop);
        if (matching) {
          daysInMonthText = \`\${matching.days_elapsed} de \${matching.days} días\`;
          spentInMonthText = \`$\${Math.round(matching.subtotal_elapsed != null ? matching.subtotal_elapsed : matching.subtotal).toLocaleString('es-CO')} COP\`;
        }
      }

      html += \`
        <tr style="\${isCurrentActive ? 'background: rgba(16, 185, 129, 0.08); font-weight: 500;' : ''}">
          <td><strong>\${item.start_date}</strong></td>
          <td>\${item.end_date ? item.end_date : '<em style="color: #10b981;">Actualmente en curso</em>'}</td>
          <td style="color: #38bdf8; font-weight: 700;">$\${Math.round(item.daily_budget_cop).toLocaleString('es-CO')} COP / día</td>
          <td style="color: #cbd5e1;">\${daysInMonthText}</td>
          <td style="color: #34d399; font-weight: 700;">\${spentInMonthText}</td>
          <td>\${statusBadge}</td>
          <td style="color: #94a3b8; font-size: 0.8rem;">\${escapeHtml(item.notes || '—')}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="promptEditBudgetPeriod(\${item.id}, \${item.daily_budget_cop}, '\${item.start_date}', '\${item.end_date || ''}', '\${escapeHtml(item.notes || '')}')" title="Editar periodo" style="padding: 4px 8px; font-size: 0.75rem;">✏️</button>
            \${!isCurrentActive ? \`<button class="btn btn-sm btn-danger" onclick="deleteBudgetPeriod(\${item.id})" title="Eliminar periodo" style="padding: 4px 8px; font-size: 0.75rem; margin-left: 4px; background:#ef4444; color:#fff; border:none; border-radius:4px;">🗑️</button>\` : ''}
          </td>
        </tr>
      \`;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = \`<tr><td colspan="8" class="empty-cell" style="color:#ef4444;">Error cargando cronograma: \${err.message}</td></tr>\`;
  }
}

async function saveAdBudget() {
  const accountId = adsSelectedAccountId || 2;
  const input = document.getElementById('inputCustomAdBudget');
  const budget = parseFloat(input?.value || 0);

  if (!budget || budget <= 0) {
    showToast('Ingresa un presupuesto diario válido mayor a 0', 'error');
    return;
  }

  const btn = document.getElementById('btnSaveAdBudget');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Guardando...';
  }

  try {
    const res = await apiFetch('/api/ads/budget', {
      method: 'POST',
      body: JSON.stringify({ accountId, dailyBudget: budget, startDate: new Date().toISOString().split('T')[0], notes: 'Ajuste rápido desde sección de Ads' })
    });

    if (res && res.success) {
      showToast(\`Presupuesto diario actualizado a $\${budget.toLocaleString('es-CO')} COP/día para esta cuenta\`, 'success');
      await loadAdGroups();
      if (typeof loadFinancialSummary === 'function') {
        loadFinancialSummary();
      }
    } else {
      showToast('Error guardando presupuesto: ' + (res?.error || 'Falló actualización'), 'error');
    }
  } catch (err) {
    showToast('Error guardando presupuesto: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Actualizar Presupuesto';
    }
  }
}

// ── Modal de Gestión de Presupuestos de Publicidad por Fecha ──

function openAdBudgetHistoryModal(targetAccId = null) {
  const modal = document.getElementById('modalAdBudgetHistory');
  if (!modal) return;

  if (targetAccId) {
    adsSelectedAccountId = parseInt(targetAccId);
  } else if (activeAccountId && (activeAccountId === '1' || activeAccountId === '2')) {
    adsSelectedAccountId = parseInt(activeAccountId);
  } else if (!adsSelectedAccountId) {
    adsSelectedAccountId = 2; // Default to Carlos
  }

  const inputDate = document.getElementById('inputNewPeriodStartDate');
  if (inputDate) {
    inputDate.value = new Date().toISOString().split('T')[0];
  }

  modal.style.display = 'flex';
  selectModalBudgetAccount(adsSelectedAccountId);
}

function closeAdBudgetHistoryModal() {
  const modal = document.getElementById('modalAdBudgetHistory');
  if (modal) modal.style.display = 'none';
}

function selectModalBudgetAccount(accId) {
  adsSelectedAccountId = parseInt(accId);
  const btnCarlos = document.getElementById('modalBtnCarlos');
  const btnJuan = document.getElementById('modalBtnJuan');
  if (btnCarlos && btnJuan) {
    if (adsSelectedAccountId === 2) {
      btnCarlos.style.background = '#38bdf8';
      btnCarlos.style.color = '#0f172a';
      btnJuan.style.background = 'rgba(255,255,255,0.08)';
      btnJuan.style.color = '#cbd5e1';
    } else {
      btnJuan.style.background = '#38bdf8';
      btnJuan.style.color = '#0f172a';
      btnCarlos.style.background = 'rgba(255,255,255,0.08)';
      btnCarlos.style.color = '#cbd5e1';
    }
  }
  loadAdBudgetHistory(adsSelectedAccountId);
}

async function loadAdBudgetHistory(targetAccId = null) {
  const accountId = targetAccId || adsSelectedAccountId || 2;
  const tbody = document.getElementById('budgetHistoryTableBody');
  const modalTitle = document.getElementById('budgetModalAccountName');
  const activeBadge = document.getElementById('budgetHistoryActiveBadge');
  const inputBudget = document.getElementById('inputNewPeriodBudget');

  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Cargando periodos...</td></tr>';

  try {
    const history = await apiFetch(\`/api/ads/budget-history?accountId=\${accountId}\`);
    const accName = (accountId === 2 ? 'Tienda Carlos' : 'Tienda Juan');

    if (modalTitle) modalTitle.textContent = accName;

    if (!history || history.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No hay periodos registrados aún. Ingresa uno arriba.</td></tr>';
      return;
    }

    let activeBudget = null;
    let html = '';

    history.forEach(item => {
      const isCurrentActive = !item.end_date;
      if (isCurrentActive && !activeBudget) {
        activeBudget = item.daily_budget_cop;
      }

      const statusBadge = isCurrentActive
        ? '<span class="badge-success" style="padding: 3px 8px; font-size: 0.75rem; background:#10b981; color:#022c22; border-radius:4px; font-weight:700;">🟢 Activo / Vigente</span>'
        : '<span class="badge-secondary" style="padding: 3px 8px; font-size: 0.75rem; background:rgba(255,255,255,0.1); color:#94a3b8; border-radius:4px;">Finalizado</span>';

      html += \`
        <tr style="\${isCurrentActive ? 'background: rgba(16, 185, 129, 0.08); font-weight: 500;' : ''}">
          <td><strong>\${item.start_date}</strong></td>
          <td>\${item.end_date ? item.end_date : '<em style="color: #10b981;">Actualmente en curso</em>'}</td>
          <td style="color: #38bdf8; font-weight: 700;">$\${Math.round(item.daily_budget_cop).toLocaleString('es-CO')} COP / día</td>
          <td>\${statusBadge}</td>
          <td style="color: #94a3b8; font-size: 0.8rem;">\${escapeHtml(item.notes || '—')}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="promptEditBudgetPeriod(\${item.id}, \${item.daily_budget_cop}, '\${item.start_date}', '\${item.end_date || ''}', '\${escapeHtml(item.notes || '')}')" title="Editar periodo" style="padding: 3px 8px; font-size: 0.75rem;">✏️</button>
            \${!isCurrentActive ? \`<button class="btn btn-sm btn-danger" onclick="deleteBudgetPeriod(\${item.id})" title="Eliminar periodo" style="padding: 3px 8px; font-size: 0.75rem; margin-left: 4px; background:#ef4444; color:#fff; border:none; border-radius:4px;">🗑️</button>\` : ''}
          </td>
        </tr>
      \`;
    });

    if (tbody) tbody.innerHTML = html;

    if (activeBadge) {
      if (activeBudget) {
        activeBadge.textContent = \`Presupuesto Vigente: $\${Math.round(activeBudget).toLocaleString('es-CO')} COP/día\`;
      } else {
        activeBadge.textContent = 'Sin periodo abierto';
      }
    }

    if (inputBudget && activeBudget && !inputBudget.value) {
      inputBudget.value = activeBudget;
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = \`<tr><td colspan="6" class="empty-cell" style="color:#ef4444;">Error: \${err.message}</td></tr>\`;
  }
}

async function saveNewBudgetPeriod(e) {
  if (e) e.preventDefault();
  const accountId = adsSelectedAccountId || 2;
  const budget = parseFloat(document.getElementById('inputNewPeriodBudget')?.value || 0);
  const startDate = document.getElementById('inputNewPeriodStartDate')?.value;
  const notes = document.getElementById('inputNewPeriodNotes')?.value || '';

  if (!budget || budget <= 0) {
    showToast('Ingresa un presupuesto diario válido mayor a 0', 'error');
    return;
  }
  if (!startDate) {
    showToast('Selecciona una fecha de inicio', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/ads/budget-history', {
      method: 'POST',
      body: JSON.stringify({ accountId, dailyBudget: budget, startDate, notes })
    });

    if (res && res.success) {
      showToast(\`Nuevo presupuesto de $\${budget.toLocaleString('es-CO')} COP/día activado desde \${startDate}\`, 'success');
      const notesEl = document.getElementById('inputNewPeriodNotes');
      if (notesEl) notesEl.value = '';

      await loadAdBudgetHistory(accountId);
      await loadAdGroups();
      if (typeof loadFinancialSummary === 'function') {
        loadFinancialSummary();
      }
    } else {
      showToast('Error guardando periodo: ' + (res?.error || 'Falló operación'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteBudgetPeriod(id) {
  if (!confirm('¿Estás seguro de eliminar este registro histórico de presupuesto?')) return;

  try {
    const res = await apiFetch(\`/api/ads/budget-history/\${id}\`, { method: 'DELETE' });
    if (res && res.success) {
      showToast('Periodo eliminado', 'success');
      await loadAdBudgetHistory(adsSelectedAccountId);
      await loadAdGroups();
      if (typeof loadFinancialSummary === 'function') {
        loadFinancialSummary();
      }
    } else {
      showToast('Error eliminando: ' + (res?.error || 'Falló'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function promptEditBudgetPeriod(id, currentBudget, currentStart, currentEnd, currentNotes) {
  const newBudgetStr = prompt('Nuevo presupuesto diario (COP):', currentBudget);
  if (newBudgetStr === null) return;
  const newBudget = parseFloat(newBudgetStr);
  if (isNaN(newBudget) || newBudget <= 0) {
    showToast('Presupuesto inválido', 'error');
    return;
  }

  const newStart = prompt('Fecha de inicio (YYYY-MM-DD):', currentStart);
  if (newStart === null || !newStart) return;

  const newEnd = prompt('Fecha de fin (YYYY-MM-DD o deja vacío si sigue vigente):', currentEnd || '');
  if (newEnd === null) return;

  const newNotes = prompt('Notas / Observación:', currentNotes || '');
  if (newNotes === null) return;

  try {
    const res = await apiFetch(\`/api/ads/budget-history/\${id}\`, {
      method: 'PUT',
      body: JSON.stringify({
        dailyBudget: newBudget,
        startDate: newStart,
        endDate: newEnd.trim() || null,
        notes: newNotes.trim()
      })
    });

    if (res && res.success) {
      showToast('Periodo actualizado con éxito', 'success');
      await loadAdBudgetHistory(adsSelectedAccountId);
      await loadAdGroups();
      if (typeof loadFinancialSummary === 'function') {
        loadFinancialSummary();
      }
    } else {
      showToast('Error al actualizar: ' + (res?.error || 'Falló'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}
`;

// Find where triggerSystemSyncAll starts
const syncStart = js.indexOf('async function triggerSystemSyncAll()');
if (syncStart === -1) {
  console.error('Could not find triggerSystemSyncAll');
  process.exit(1);
}

// Find where openAdBudgetHistoryModal started in the file
const historyModalStart = js.indexOf('// ── Modal de Gestión de Presupuestos de Publicidad por Fecha ──');
if (historyModalStart === -1) {
  console.error('Could not find historyModalStart');
  process.exit(1);
}

// Replace in two steps:
// 1. Cut the section between oldAdsSectionStart and syncStart
// 2. Cut from historyModalStart to the end, and put the new unified ads logic
const part1 = js.slice(0, oldAdsSectionStart);
const part2 = js.slice(syncStart, historyModalStart);
const finalJs = part1 + part2 + newAdsLogic;

fs.writeFileSync(filePath, finalJs, 'utf8');
console.log('Successfully updated public/js/app.js with independent multi-account ads logic!');
