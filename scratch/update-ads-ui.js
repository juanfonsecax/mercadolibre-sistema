const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// Replace section-ads
const adsSectionStart = html.indexOf('<section class="content-section" id="section-ads">');
const adsSectionEnd = html.indexOf('</section>', adsSectionStart) + '</section>'.length;

if (adsSectionStart === -1 || adsSectionEnd === -1) {
  console.error('Could not find section-ads');
  process.exit(1);
}

const newAdsSection = `<section class="content-section" id="section-ads">
      <div class="section-header">
        <div>
          <h1>📢 Publicidad Inteligente Mercado Ads</h1>
          <p style="color: #94a3b8; font-size: 0.88rem; margin: 4px 0 0 0;">
            Gestión 100% independiente por cuenta. Tienda Carlos y Tienda Juan operan con presupuestos, cronogramas y métricas separadas que alimentan el Dashboard Financiero.
          </p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="loadAdGroups()">🔄 Recalcular / Actualizar</button>
          <button class="btn btn-primary" onclick="openAdBudgetHistoryModal()">📅 Cronograma Completo por Fechas</button>
        </div>
      </div>
      
      <!-- Selector Exclusivo de Cuentas para Publicidad (Aislamiento Total) -->
      <div class="card" style="margin-bottom: 20px; padding: 12px 18px; background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.2rem;">🏪</span>
            <div>
              <strong style="color: #cbd5e1; font-size: 0.92rem; display: block;">Gestionar Publicidad de la Tienda:</strong>
              <small style="color: #64748b;">Selecciona una tienda para ver o modificar su presupuesto diario y cronograma sin alterar la otra.</small>
            </div>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;" id="adsAccountSwitcherTabs">
            <button class="btn" id="btnAdsAccountCarlos" onclick="switchAdsAccount(2)" style="font-weight: 700; padding: 8px 18px; border-radius: 8px; border: 1px solid #38bdf8; background: #38bdf8; color: #0f172a; transition: all 0.2s;">
              🟢 Tienda Carlos <span id="badgeTabBudgetCarlos" style="font-weight: 600; opacity: 0.9; margin-left: 4px;">($9.524/día)</span>
            </button>
            <button class="btn" id="btnAdsAccountJuan" onclick="switchAdsAccount(1)" style="font-weight: 700; padding: 8px 18px; border-radius: 8px; border: 1px solid #475569; background: rgba(255,255,255,0.06); color: #cbd5e1; transition: all 0.2s;">
              🔵 Tienda Juan <span id="badgeTabBudgetJuan" style="font-weight: 600; opacity: 0.9; margin-left: 4px;">($20.000/día)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Card de Presupuesto Activo & Seguimiento en Vivo del Mes (Conectado con Dashboard) -->
      <div class="card" style="margin-bottom: 22px; padding: 20px 24px; border-left: 5px solid #38bdf8; background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px;">
          <div style="flex: 1; min-width: 320px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span style="font-size: 1.4rem;">🎯</span>
              <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #f8fafc;" id="adsAccountTitle">Presupuesto Mercado Ads — Tienda Carlos</h3>
              <span class="badge-success" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.3);">
                Cuenta Independiente
              </span>
              <span class="badge-primary" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 700; border: 1px solid rgba(56, 189, 248, 0.3);">
                ⚡ Conectado al Dashboard en Vivo
              </span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-top: 16px;">
              <div style="background: rgba(255,255,255,0.04); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Presupuesto Diario Vigente</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #38bdf8; margin-top: 2px;" id="adsDailyBudgetLabel">$9.524 COP / día</div>
                <small style="color: #64748b; font-size: 0.78rem;" id="adsActiveStartDate">Vigente en curso</small>
              </div>
              <div style="background: rgba(255,255,255,0.04); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Gasto Acumulado en el Mes</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #34d399; margin-top: 2px;" id="adsMonthElapsedSpend">$28.572 COP</div>
                <small style="color: #10b981; font-size: 0.78rem;" id="adsMonthElapsedDays">Días transcurridos</small>
              </div>
              <div style="background: rgba(255,255,255,0.04); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Proyección Fin de Mes</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #f59e0b; margin-top: 2px;" id="adsMonthlyBudgetLabel">$285.720 COP</div>
                <small style="color: #94a3b8; font-size: 0.78rem;">Estimado a 30 días</small>
              </div>
            </div>

            <p style="margin: 14px 0 0 0; font-size: 0.83rem; color: #94a3b8; line-height: 1.4;">
              💡 <em>El Dashboard Financiero descuenta automáticamente el <strong>Gasto Acumulado Real</strong> de acuerdo a los días transcurridos para que la Utilidad Neta refleje tu ganancia real en el bolsillo.</em>
            </p>
          </div>

          <!-- Quick Budget Adjustment Form -->
          <div style="background: rgba(15, 23, 42, 0.8); padding: 16px 20px; border-radius: 10px; border: 1px solid #334155; min-width: 290px; width: 320px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <label style="font-size: 0.84rem; color: #cbd5e1; font-weight: 700;">Cambiar Presupuesto Diario:</label>
              <span style="font-size: 0.72rem; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px;">Desde Hoy</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="background: rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 6px 0 0 6px; font-weight:700; color:#94a3b8; border: 1px solid var(--border-color); border-right:none;">$</span>
              <input type="number" id="inputCustomAdBudget" class="form-input" style="width: 100%; padding: 8px 12px; font-weight: 800; font-size: 1rem; border-radius: 0 6px 6px 0;" placeholder="9524">
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary btn-sm" id="btnSaveAdBudget" onclick="saveAdBudget()" style="flex: 1; justify-content: center; font-weight: 700; height: 36px;">💾 Actualizar Presupuesto</button>
              <button class="btn btn-secondary btn-sm" onclick="openAdBudgetHistoryModal()" title="Programar o ver historial por fechas" style="height: 36px;">📅 Fechas</button>
            </div>
            <small style="color: #64748b; font-size: 0.74rem; display: block; margin-top: 6px; text-align: center;">Cierra el periodo anterior y comienza hoy.</small>
          </div>
        </div>
      </div>

      <!-- Estrategia de 3 Grupos (Mercado Ads 7-9-14) -->
      <div style="margin-bottom: 24px;">
        <h3 style="color: #f8fafc; font-size: 1.1rem; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
          <span>📊</span> Estrategia de Distribución 7-9-14 (Catálogo de Esta Cuenta)
        </h3>
        <div class="ads-grid" id="adsGroupsContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;">
          <!-- Filled by JS -->
        </div>
      </div>

      <!-- Tabla de Cronograma e Historial de Presupuestos para Esta Cuenta -->
      <div class="card" style="padding: 22px; background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 12px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0; color: #f8fafc; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
              <span>📅</span> Cronograma de Presupuestos — <span id="adsTableAccountName" style="color: #38bdf8;">Tienda Carlos</span>
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 0.83rem; color: #94a3b8;">
              Tus presupuestos históricos y vigentes. Cada día del mes se calcula con el presupuesto diario exacto de ese rango de fechas.
            </p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openAdBudgetHistoryModal()">➕ Registrar Nuevo Periodo</button>
        </div>
        <div class="table-container" style="overflow-x: auto;">
          <table class="data-table" style="font-size: 0.85rem; width: 100%;">
            <thead>
              <tr>
                <th>Desde (Inicio)</th>
                <th>Hasta (Fin)</th>
                <th>Presupuesto Diario</th>
                <th>Días en Mes Actual</th>
                <th>Gasto Acumulado en el Mes</th>
                <th>Estado</th>
                <th>Notas / Observación</th>
                <th style="text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="adsPageHistoryTableBody">
              <tr><td colspan="8" class="empty-cell">Cargando cronograma de presupuestos...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>`;

html = html.slice(0, adsSectionStart) + newAdsSection + html.slice(adsSectionEnd);

// Also add account buttons to modalAdBudgetHistory if not present
const modalTarget = '<div class="modal-body" style="padding: 20px;">';
if (html.includes(modalTarget) && !html.includes('id="modalBtnCarlos"')) {
  const modalAccountTabs = `<div class="modal-body" style="padding: 20px;">
        <!-- Selector de Cuenta dentro del Modal -->
        <div style="display: flex; gap: 10px; margin-bottom: 16px; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; align-items: center;">
          <span style="font-size: 0.82rem; color: #94a3b8; font-weight: 600;">Tienda a gestionar:</span>
          <button class="btn btn-sm" id="modalBtnCarlos" onclick="selectModalBudgetAccount(2)" style="font-weight: 700; padding: 4px 12px; border-radius: 6px; background: #38bdf8; color: #0f172a;">🟢 Tienda Carlos</button>
          <button class="btn btn-sm" id="modalBtnJuan" onclick="selectModalBudgetAccount(1)" style="font-weight: 700; padding: 4px 12px; border-radius: 6px; background: rgba(255,255,255,0.08); color: #cbd5e1;">🔵 Tienda Juan</button>
        </div>`;
  html = html.replace(modalTarget, modalAccountTabs);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully updated public/index.html with independent Ads layout and modal tabs!');
