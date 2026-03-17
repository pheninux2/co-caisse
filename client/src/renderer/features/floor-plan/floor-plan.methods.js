import { TableService } from '../../services/table.service.js';

export const FloorPlanMethods = {

  /** Charge le layout + statuts + drawing et rend le canvas. */
  async loadFloorPlan() {
    try {
      const [layout, statuses, bgData, drawElements] = await Promise.all([
        TableService.getLayout(),
        TableService.getStatus(),
        TableService.getBackground(),
        TableService.getDrawing(),
      ]);

      this.floorPlan        = layout.floor_plan;
      this.floorPlanTables  = layout.tables || [];
      this._drawElements    = drawElements;
      this._selectedTableId = null;

      // Fusionner statuts
      const statusMap = {};
      (statuses || []).forEach(s => { statusMap[s.id] = s; });
      this.floorPlanTables = this.floorPlanTables.map(t => ({ ...t, ...(statusMap[t.id] || {}) }));

      this._renderFloorPlan();
      this._renderDrawElements();
      this._applyFloorBackground(bgData.image || null, bgData.filename || null);
      this._showFloorEditToolbar();
      this.startFloorPlanPolling();
    } catch (e) {
      console.error('[FloorPlan] Erreur chargement:', e.message);
    }
  },

  /** Rend toutes les tables dans le canvas. */
  _renderFloorPlan() {
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas || !this.floorPlan) return;

    canvas.style.width           = (this.floorPlan.width  || 1100) + 'px';
    canvas.style.height          = (this.floorPlan.height || 650)  + 'px';
    canvas.style.backgroundColor = this.floorPlan.background_color || '#f3f4f6';

    canvas.querySelectorAll('.floor-table').forEach(el => el.remove());
    const empty = document.getElementById('floorPlanEmpty');
    if (empty) empty.style.display = this.floorPlanTables.length === 0 ? '' : 'none';

    this.floorPlanTables.forEach(table => {
      const el = this._createTableEl(table);
      canvas.appendChild(el);
      if (this.floorPlanEditMode) this._attachDragListeners(el, table.id);
      this._attachHoverListeners(el, table.id);
    });
  },

  /** Crée l'élément DOM d'une table. */
  _createTableEl(table) {
    const statusColors = {
      free:       'bg-green-400  border-green-500  text-green-900',
      draft:      'bg-yellow-300 border-yellow-400 text-yellow-900',
      in_kitchen: 'bg-red-400    border-red-500    text-red-900',
      ready:      'bg-orange-400 border-orange-500 text-orange-900',
      served:     'bg-blue-400   border-blue-500   text-blue-900',
    };
    const statusIcons = { free:'', draft:'📋', in_kitchen:'🍳', ready:'🔔', served:'🍽️' };
    const status   = table.computed_status || 'free';
    const colors   = statusColors[status] || statusColors.free;
    const isCircle = table.shape === 'circle';

    const el = document.createElement('div');
    el.className = `floor-table absolute border-2 flex flex-col items-center justify-center cursor-pointer transition-shadow hover:shadow-lg ${colors} ${isCircle ? 'rounded-full' : 'rounded-xl'}`;
    el.id        = `floor-table-${table.id}`;
    el.dataset.tableId = table.id;
    el.style.cssText = `left:${table.x}px;top:${table.y}px;width:${table.width}px;height:${table.height}px;z-index:3;`;

    const elapsed = table.elapsed_minutes != null ? `<span class="text-xs opacity-70">${table.elapsed_minutes}min</span>` : '';
    const icon    = statusIcons[status] || '';

    el.innerHTML = `
      <span class="font-bold text-sm leading-tight text-center px-1">${this._esc(table.label)}</span>
      <span class="text-xs opacity-60">👥${table.capacity}</span>
      ${icon ? `<span class="text-xs">${icon}</span>` : ''}
      ${elapsed}
      ${table.order_number ? `<span class="text-xs font-mono opacity-70">${table.order_number.slice(-4)}</span>` : ''}
    `;

    el.addEventListener('click', () => {
      if (this.floorPlanEditMode) return;
      this.handleTableClick(table.id);
    });

    return el;
  },

  // ── POPOVER AU SURVOL ────────────────────────────────────────────────────────

  _attachHoverListeners(el, tableId) {
    let hideTimer = null;
    const popover = document.getElementById('floorTablePopover');
    if (!popover) return;

    el.addEventListener('mouseenter', (e) => {
      clearTimeout(hideTimer);
      const table = this.floorPlanTables.find(t => t.id === tableId);
      if (!table) return;
      this._showTablePopover(table, e.clientX, e.clientY);
    });

    el.addEventListener('mousemove', (e) => {
      this._positionPopover(e.clientX, e.clientY);
    });

    el.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => {
        if (popover) { popover.classList.add('hidden'); popover.style.opacity = '0'; }
      }, 300);
    });

    // Maintenir le popover si la souris y entre
    popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popover.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => {
        popover.classList.add('hidden');
      }, 200);
    });
  },

  _showTablePopover(table, clientX, clientY) {
    const popover = document.getElementById('floorTablePopover');
    if (!popover) return;

    const statusLabels = {
      free:       '🟢 Libre',
      draft:      '🟡 En attente',
      in_kitchen: '🔴 En cuisine',
      ready:      '🟠 Prête à servir',
      served:     '🔵 Servie',
    };
    const statusLabel = statusLabels[table.computed_status] || '🟢 Libre';

    const WARN_MINUTES = 60; // seuil d'alerte
    const isLate = table.elapsed_minutes != null && table.elapsed_minutes >= WARN_MINUTES;

    if (!table.order_id || table.computed_status === 'free') {
      popover.innerHTML = `
        <div class="p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-gray-800">🪑 Table ${this._esc(table.label)}</span>
            <span class="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Libre</span>
          </div>
          <p class="text-xs text-gray-500">👥 Capacité : <strong>${table.capacity} place${table.capacity > 1 ? 's' : ''}</strong></p>
          <p class="text-xs text-gray-400 mt-1">${table.shape === 'circle' ? '⭕ Table ronde' : '⬛ Table rectangulaire'}</p>
        </div>`;
    } else {
      const openedAt = table.opened_at ? new Date(table.opened_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
      const elapsed  = table.elapsed_minutes != null ? `${table.elapsed_minutes} min ${isLate ? '⚠️' : ''}` : '—';
      const total    = table.total_amount    != null ? table.total_amount.toFixed(2) + ' €' : '—';
      popover.innerHTML = `
        <div class="overflow-hidden rounded-xl">
          <div class="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span class="font-bold text-gray-800">🪑 Table ${this._esc(table.label)}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full ${
              table.computed_status === 'in_kitchen' ? 'bg-red-100 text-red-700' :
              table.computed_status === 'ready'      ? 'bg-orange-100 text-orange-700' :
              table.computed_status === 'served'     ? 'bg-blue-100 text-blue-700' :
                                                       'bg-yellow-100 text-yellow-700'
            }">${statusLabel}</span>
          </div>
          <div class="p-3 space-y-1.5 text-xs">
            ${table.waiter_name ? `<div class="flex justify-between"><span class="text-gray-500">👤 Serveur</span><strong>${this._esc(table.waiter_name)}</strong></div>` : ''}
            <div class="flex justify-between"><span class="text-gray-500">🕐 Ouverture</span><strong>${openedAt}</strong></div>
            <div class="flex justify-between"><span class="text-gray-500">⏱ Durée</span><strong class="${isLate ? 'text-red-600' : ''}">${elapsed}</strong></div>
            ${table.item_count ? `<div class="flex justify-between"><span class="text-gray-500">🍽️ Articles</span><strong>${table.item_count} plat${table.item_count > 1 ? 's' : ''}</strong></div>` : ''}
            <div class="flex justify-between"><span class="text-gray-500">💶 Total</span><strong>${total}</strong></div>
            ${table.order_number ? `<div class="flex justify-between"><span class="text-gray-500">📋 Commande</span><strong class="font-mono">#${table.order_number.slice(-5)}</strong></div>` : ''}
          </div>
        </div>`;
    }

    popover.classList.remove('hidden');
    popover.style.opacity = '1';
    this._positionPopover(clientX, clientY);
  },

  _positionPopover(clientX, clientY) {
    const popover = document.getElementById('floorTablePopover');
    if (!popover || popover.classList.contains('hidden')) return;
    const pw = popover.offsetWidth  || 256;
    const ph = popover.offsetHeight || 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = clientX + 14;
    let top  = clientY - 20;
    if (left + pw > vw - 8) left = clientX - pw - 14;
    if (top  + ph > vh - 8) top  = vh - ph - 8;
    if (top < 4) top = 4;

    popover.style.left = left + 'px';
    popover.style.top  = top  + 'px';
  },

  // ── GESTION BACKGROUND IMAGE ─────────────────────────────────────────────────

  _applyFloorBackground(dataUrl, filename) {
    const imgEl   = document.getElementById('floorBgImage');
    const rmBtn   = document.getElementById('btnRemoveBg');
    if (!imgEl) return;
    if (dataUrl) {
      imgEl.src = dataUrl;
      imgEl.classList.remove('hidden');
      if (rmBtn) rmBtn.classList.remove('hidden');
    } else {
      imgEl.src = '';
      imgEl.classList.add('hidden');
      if (rmBtn) rmBtn.classList.add('hidden');
    }
  },

  async uploadFloorBackground(input) {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const data   = await TableService.uploadBackground(file);
      const bgData = await TableService.getBackground();
      this._applyFloorBackground(bgData.image, bgData.filename);
      this.toastSuccess(`📐 Plan chargé : ${data.filename}`);
    } catch (e) {
      this.toastError('Erreur upload : ' + e.message);
    }
    input.value = ''; // reset input
  },

  async removeFloorBackground() {
    if (!confirm('Supprimer l\'image de fond ?')) return;
    try {
      await TableService.removeBackground();
      this._applyFloorBackground(null);
      this.toastSuccess('Image de fond supprimée');
    } catch (e) {
      this.toastError(e.message);
    }
  },

  // ── OUTILS DE DESSIN ─────────────────────────────────────────────────────────

  /** Change l'outil actif et met à jour le style des boutons. */
  setDrawTool(tool) {
    this._currentDrawTool = tool;
    document.querySelectorAll('.draw-tool-btn').forEach(b => {
      b.classList.toggle('active-tool', b.id === `tool-${tool}`);
      b.classList.toggle('bg-indigo-100', b.id === `tool-${tool}`);
      b.classList.toggle('border-indigo-400', b.id === `tool-${tool}`);
    });

    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas) return;
    const cursors = { select: 'default', table: 'crosshair', wall: 'crosshair', door: 'crosshair', window: 'crosshair', zone: 'crosshair' };
    canvas.style.cursor = cursors[tool] || 'default';
  },

  /** Attache les listeners de dessin sur le canvas (appelé en mode édition). */
  _attachDrawListeners() {
    const canvas = document.getElementById('floorPlanCanvas');
    if (!canvas || canvas._drawListenersAttached) return;
    canvas._drawListenersAttached = true;

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.floorPlanEditMode) return;
      if (this._currentDrawTool === 'select') {
        // Clic sur le canvas vide → désélectionner la table
        if (!e.target.classList.contains('floor-table')) {
          this._deselectFloorTable();
        }
        return;
      }
      if (e.target.classList.contains('floor-table')) return; // clic sur table → drag

      const rect = canvas.getBoundingClientRect();
      const x    = Math.round(e.clientX - rect.left);
      const y    = Math.round(e.clientY - rect.top);

      if (this._currentDrawTool === 'table') {
        // Clic simple → ouvrir le form de table avec position pré-remplie
        this._pendingTablePos = { x: x - 45, y: y - 35 };
        this.openTableForm();
        return;
      }

      this._drawing  = true;
      this._drawStart = { x, y };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this._drawing || !this._drawStart) return;
      const rect    = canvas.getBoundingClientRect();
      const x       = Math.round(e.clientX - rect.left);
      const y       = Math.round(e.clientY - rect.top);
      this._renderDrawPreview(this._drawStart.x, this._drawStart.y, x, y);
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this._drawing || !this._drawStart) return;
      this._drawing = false;
      const rect = canvas.getBoundingClientRect();
      const ex   = Math.round(e.clientX - rect.left);
      const ey   = Math.round(e.clientY - rect.top);
      const { x, y } = this._drawStart;
      this._drawStart = null;

      // Ignorer les tracés trop courts
      if (Math.abs(ex - x) < 5 && Math.abs(ey - y) < 5) {
        document.getElementById('floorDrawPreview').innerHTML = '';
        return;
      }

      const color  = document.getElementById('drawZoneColor')?.value || '#e0f2fe';
      const label  = document.getElementById('drawZoneLabel')?.value?.trim() || '';
      const id     = 'draw-' + Date.now();

      const element = { id, type: this._currentDrawTool, x1: x, y1: y, x2: ex, y2: ey, color, label };
      this._drawElements.push(element);
      document.getElementById('floorDrawPreview').innerHTML = '';
      this._renderDrawElements();
    });
  },

  /** Rendu live du tracé en cours dans le SVG preview. */
  _renderDrawPreview(x1, y1, x2, y2) {
    const svg   = document.getElementById('floorDrawPreview');
    if (!svg) return;
    const color = document.getElementById('drawZoneColor')?.value || '#e0f2fe';
    svg.innerHTML = this._svgElementMarkup({ id:'preview', type:this._currentDrawTool, x1, y1, x2, y2, color, label:'' }, true);
  },

  /** Génère le markup SVG d'un élément de dessin. */
  _svgElementMarkup(el, preview = false) {
    const sel = !preview && this._selectedDrawEl === el.id;
    const clickAttr = !preview ? `onclick="app._selectDrawElement('${el.id}')" style="cursor:pointer;pointer-events:all;"` : '';
    const selStyle  = sel ? 'filter:drop-shadow(0 0 4px #6366f1);' : '';

    switch (el.type) {
      case 'wall':
        return `<line ${clickAttr} x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"
                  stroke="#374151" stroke-width="${preview ? 4 : 5}" stroke-linecap="round"
                  style="${selStyle}" opacity="${preview ? 0.5 : 1}"/>`;
      case 'door': {
        const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
        const r  = Math.sqrt(dx * dx + dy * dy);
        return `<g ${clickAttr} style="${selStyle}opacity:${preview ? 0.5 : 1}">
                  <line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="#92400e" stroke-width="4" stroke-linecap="round"/>
                  <path d="M${el.x1},${el.y1} A${r},${r} 0 0,1 ${el.x2},${el.y2}"
                        fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="4,2"/>
                </g>`;
      }
      case 'window':
        return `<line ${clickAttr} x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"
                  stroke="#0284c7" stroke-width="4" stroke-linecap="round" stroke-dasharray="8,4"
                  style="${selStyle}" opacity="${preview ? 0.5 : 1}"/>`;
      case 'zone': {
        const x  = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
        const w  = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
        return `<g ${clickAttr} style="${selStyle}opacity:${preview ? 0.4 : 1}">
                  <rect x="${x}" y="${y}" width="${w}" height="${h}"
                        fill="${el.color}" fill-opacity="0.35" stroke="${el.color}" stroke-width="2" rx="6"/>
                  ${el.label ? `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle"
                        font-size="13" font-weight="600" fill="#374151" font-family="sans-serif">${this._esc(el.label)}</text>` : ''}
                </g>`;
      }
      default:
        return '';
    }
  },

  /** Rend tous les éléments de dessin dans le SVG principal. */
  _renderDrawElements() {
    const svg = document.getElementById('floorDrawSvg');
    if (!svg) return;
    svg.style.pointerEvents = this.floorPlanEditMode ? 'all' : 'none';
    svg.innerHTML = this._drawElements.map(el => this._svgElementMarkup(el)).join('\n');
  },

  _selectDrawElement(id) {
    this._selectedDrawEl = id;
    // Passer automatiquement en mode sélection
    this.setDrawTool('select');
    this._renderDrawElements();
    // Mettre à jour le bouton supprimer pour le rendre plus visible
    const btnDel = document.querySelector('[onclick="app.deleteSelectedDrawElement()"]');
    if (btnDel) {
      btnDel.classList.add('ring-2', 'ring-red-400');
      setTimeout(() => btnDel.classList.remove('ring-2', 'ring-red-400'), 1500);
    }
  },

  deleteSelectedDrawElement() {
    // Priorité : supprimer une table sélectionnée en mode édition
    if (this._selectedTableId) {
      const table = this.floorPlanTables.find(t => t.id === this._selectedTableId);
      // Bloquer si table occupée
      if (table && table.computed_status && table.computed_status !== 'free') {
        const statusLabels = { draft:'En attente', in_kitchen:'En cuisine', ready:'Prête', served:'Servie' };
        this.toastError(`La table "${table.label}" est occupée (${statusLabels[table.computed_status] || table.computed_status}) — suppression impossible.`);
        return;
      }
      this.deleteTable(this._selectedTableId);
      return;
    }
    if (!this._selectedDrawEl) { this.toastError('Aucun élément sélectionné'); return; }
    this._drawElements = this._drawElements.filter(e => e.id !== this._selectedDrawEl);
    this._selectedDrawEl = null;
    this._renderDrawElements();
    this.toastSuccess('Élément supprimé');
  },

  /** Sélectionne une table en mode édition (surbrillance + mémorisation). */
  _selectFloorTable(tableId) {
    // Désélectionner la précédente
    if (this._selectedTableId) {
      const prevEl = document.getElementById(`floor-table-${this._selectedTableId}`);
      if (prevEl) prevEl.classList.remove('ring-2', 'ring-red-500', 'ring-offset-1');
    }
    this._selectedTableId = tableId;
    // Désélectionner les éléments de dessin
    this._selectedDrawEl = null;
    // Mettre en surbrillance la table sélectionnée
    const el = document.getElementById(`floor-table-${tableId}`);
    if (el) el.classList.add('ring-2', 'ring-red-500', 'ring-offset-1');
  },

  /** Désélectionne la table courante (clic sur le canvas vide). */
  _deselectFloorTable() {
    if (this._selectedTableId) {
      const el = document.getElementById(`floor-table-${this._selectedTableId}`);
      if (el) el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-1');
      this._selectedTableId = null;
    }
  },

  clearAllDrawElements() {
    if (!confirm('Effacer tous les éléments de dessin ?')) return;
    this._drawElements = [];
    this._selectedDrawEl = null;
    this._renderDrawElements();
    this.toastSuccess('Canvas effacé');
  },

  async saveDrawing() {
    try {
      const data = await TableService.saveDrawing(this._drawElements);
      this.toastSuccess(`💾 Plan sauvegardé (${data.count} élément${data.count !== 1 ? 's' : ''})`);
    } catch (e) {
      this.toastError('Erreur sauvegarde : ' + e.message);
    }
  },

  // ── MODE ÉDITION ─────────────────────────────────────────────────────────────

  /** Gère le clic sur une table en mode opérationnel. */
  handleTableClick(tableId) {
    const table = this.floorPlanTables.find(t => t.id === tableId);
    if (!table) return;

    const detailEl  = document.getElementById('floorTableDetail');
    const titleEl   = document.getElementById('floorDetailTitle');
    const contentEl = document.getElementById('floorDetailContent');
    if (!detailEl || !contentEl) return;

    // Masquer le popover
    document.getElementById('floorTablePopover')?.classList.add('hidden');

    titleEl.textContent = `Table ${table.label} — ${table.capacity} pers.`;

    // Boutons admin (modifier + supprimer) — visibles dans les deux cas
    const isOccupied = table.computed_status && table.computed_status !== 'free' || !!table.order_id;
    const occupiedReason = isOccupied ? 'Table occupée — libérez la table avant de modifier ou supprimer' : '';

    let adminButtons = '';
    if (this.currentUser?.role === 'admin') {
      if (isOccupied) {
        // Boutons grisés avec tooltip
        adminButtons = `
          <div class="pt-2 border-t border-gray-100 space-y-2">
            <div class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2 text-xs text-amber-700">
              <span class="text-base">🔒</span>
              <span>Table occupée — libérez-la pour modifier ou supprimer</span>
            </div>
            <button disabled title="${occupiedReason}"
              class="w-full py-2 bg-gray-100 text-gray-400 font-medium rounded-xl text-sm cursor-not-allowed opacity-60 flex items-center justify-center gap-2">
              ✏️ Modifier la table
            </button>
            <button disabled title="${occupiedReason}"
              class="w-full py-2 bg-gray-100 text-gray-400 font-medium rounded-xl text-sm cursor-not-allowed opacity-60 flex items-center justify-center gap-2">
              🗑️ Supprimer la table
            </button>
          </div>`;
      } else {
        // Boutons actifs — table libre
        adminButtons = `
          <div class="pt-2 border-t border-gray-100 space-y-2">
            <button onclick="app.openTableForm('${table.id}')"
              class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm transition flex items-center justify-center gap-2">
              ✏️ Modifier la table
            </button>
            <button onclick="app.deleteTable('${table.id}')"
              class="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-xl text-sm transition flex items-center justify-center gap-2">
              🗑️ Supprimer la table
            </button>
          </div>`;
      }
    }

    if (table.computed_status === 'free' || !table.order_id) {
      contentEl.innerHTML = `
        <div class="space-y-3">
          <div class="text-center py-2">
            <span class="text-4xl">🟢</span>
            <p class="font-semibold text-gray-700 mt-2">Table libre</p>
            <p class="text-sm text-gray-400">Capacité : ${table.capacity} personnes</p>
          </div>
          <button onclick="app.openNewOrderForTable('${this._esc(table.label)}')"
            class="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl text-sm transition">
            + Nouvelle commande
          </button>
          ${adminButtons}
        </div>`;
    } else {
      const statusLabels = { draft:'📋 En attente', in_kitchen:'🍳 En cuisine', ready:'🔔 Prête', served:'🍽️ Servie' };
      const statusLabel  = statusLabels[table.computed_status] || table.order_status;
      const elapsed      = table.elapsed_minutes != null ? `${table.elapsed_minutes} min` : '—';
      const openedAt     = table.opened_at ? new Date(table.opened_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '—';
      contentEl.innerHTML = `
        <div class="space-y-3">
          <div class="p-3 bg-gray-50 rounded-xl space-y-1.5 text-sm">
            <p><span class="text-gray-500">Commande :</span> <strong>${table.order_number || '—'}</strong></p>
            <p><span class="text-gray-500">Statut :</span> <strong>${statusLabel}</strong></p>
            ${table.waiter_name ? `<p><span class="text-gray-500">Serveur :</span> <strong>${this._esc(table.waiter_name)}</strong></p>` : ''}
            <p><span class="text-gray-500">Ouverture :</span> <strong>${openedAt}</strong></p>
            <p><span class="text-gray-500">Durée :</span> <strong>${elapsed}</strong></p>
            ${table.item_count ? `<p><span class="text-gray-500">Articles :</span> <strong>${table.item_count}</strong></p>` : ''}
            <p><span class="text-gray-500">Total :</span> <strong>${table.order_total ? table.order_total.toFixed(2) + ' €' : '—'}</strong></p>
          </div>
          <button onclick="app.viewOrderDetail('${table.order_id}')"
            class="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl text-sm transition">
            📋 Ouvrir la commande
          </button>
          ${adminButtons}
        </div>`;
    }

    detailEl.classList.remove('hidden');
  },

  closeFloorTableDetail() {
    document.getElementById('floorTableDetail')?.classList.add('hidden');
  },

  openNewOrderForTable(tableLabel) {
    this.closeFloorTableDetail();
    this.showSection('orders');
    setTimeout(async () => {
      // Charger le select puis sélectionner la table
      await this.refreshTableSelect();
      const tableSelect = document.getElementById('orderTableNumber');
      if (tableSelect) tableSelect.value = tableLabel;
    }, 150);
  },

  _showFloorEditToolbar() {
    const toolbar = document.getElementById('floorEditToolbar');
    if (!toolbar) return;
    if (this.currentUser?.role === 'admin') {
      toolbar.classList.remove('hidden');
      toolbar.classList.add('flex');
    } else {
      toolbar.classList.add('hidden');
    }
  },

  toggleFloorPlanEditMode() {
    this.floorPlanEditMode = document.getElementById('floorEditModeToggle')?.checked || false;
    const drawToolbar = document.getElementById('floorDrawingToolbar');
    if (drawToolbar) drawToolbar.classList.toggle('hidden', !this.floorPlanEditMode);
    if (drawToolbar) drawToolbar.classList.toggle('flex', this.floorPlanEditMode);

    this._renderFloorPlan();
    this._renderDrawElements();

    if (this.floorPlanEditMode) {
      this._attachDrawListeners();
      this.setDrawTool('select');
    }

    const canvas = document.getElementById('floorPlanCanvas');
    if (canvas) canvas.style.cursor = this.floorPlanEditMode ? 'default' : '';
  },

  _attachDragListeners(el, tableId) {
    el.style.cursor = 'grab';

    el.addEventListener('pointerdown', (e) => {
      if (this._currentDrawTool !== 'select' && this.floorPlanEditMode) return;
      e.preventDefault();
      e.stopPropagation();

      // Mémoriser la table sélectionnée (pour le bouton Suppr.)
      this._selectFloorTable(tableId);

      const canvas  = document.getElementById('floorPlanCanvas');
      const rect    = canvas.getBoundingClientRect();
      const elRect  = el.getBoundingClientRect();
      this._dragState = {
        tableId, el,
        offsetX: e.clientX - elRect.left,
        offsetY: e.clientY - elRect.top,
        canvasRect: rect,
      };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      el.style.zIndex = '10';
    });

    el.addEventListener('pointermove', (e) => {
      if (!this._dragState || this._dragState.tableId !== tableId) return;
      const { offsetX, offsetY, canvasRect } = this._dragState;
      const canvasW = this.floorPlan?.width  || 1100;
      const canvasH = this.floorPlan?.height || 650;
      let newX = e.clientX - canvasRect.left - offsetX;
      let newY = e.clientY - canvasRect.top  - offsetY;
      newX = Math.max(0, Math.min(newX, canvasW - el.offsetWidth));
      newY = Math.max(0, Math.min(newY, canvasH - el.offsetHeight));
      el.style.left = newX + 'px';
      el.style.top  = newY + 'px';
    });

    el.addEventListener('pointerup', async () => {
      if (!this._dragState || this._dragState.tableId !== tableId) return;
      el.style.cursor = 'grab';
      el.style.zIndex = '3';
      const newX = parseInt(el.style.left);
      const newY = parseInt(el.style.top);
      this._dragState = null;

      try {
        await TableService.update(tableId, { x: newX, y: newY });
        const t = this.floorPlanTables.find(t => t.id === tableId);
        if (t) { t.x = newX; t.y = newY; }
      } catch (err) {
        this.toastError('Erreur sauvegarde position');
      }
    });
  },

  startFloorPlanPolling() {
    this.stopFloorPlanPolling();
    this.floorPlanPollingInterval = setInterval(() => this._refreshTableStatuses(), 15000);
  },

  stopFloorPlanPolling() {
    if (this.floorPlanPollingInterval) {
      clearInterval(this.floorPlanPollingInterval);
      this.floorPlanPollingInterval = null;
    }
  },

  async _refreshTableStatuses() {
    if (this.currentSection !== 'floorplan') return;
    try {
      const statuses = await TableService.getStatus();
      const statusMap = {};
      statuses.forEach(s => { statusMap[s.id] = s; });

      this.floorPlanTables.forEach(table => {
        const updated = statusMap[table.id];
        if (!updated) return;
        const prev = table.computed_status;
        Object.assign(table, updated);
        if (prev !== updated.computed_status) {
          const oldEl = document.getElementById(`floor-table-${table.id}`);
          if (oldEl) {
            const newEl = this._createTableEl(table);
            if (this.floorPlanEditMode) this._attachDragListeners(newEl, table.id);
            this._attachHoverListeners(newEl, table.id);
            oldEl.replaceWith(newEl);
          }
        } else {
          const el = document.getElementById(`floor-table-${table.id}`);
          if (el && table.elapsed_minutes != null) {
            el.querySelectorAll('span').forEach(s => {
              if (s.textContent.endsWith('min')) s.textContent = `${table.elapsed_minutes}min`;
            });
          }
        }
      });
    } catch (_) {}
  },

  // ── FORMULAIRE TABLE ─────────────────────────────────────────────────────────

  openTableForm(tableId = null) {
    const titleEl = document.getElementById('tableFormTitle');
    const idEl    = document.getElementById('tableFormId');
    const labelEl = document.getElementById('tableFormLabel');
    const shapeEl = document.getElementById('tableFormShape');
    const capEl   = document.getElementById('tableFormCapacity');
    const errEl   = document.getElementById('tableFormError');
    if (errEl) errEl.classList.add('hidden');

    if (tableId) {
      const table = this.floorPlanTables.find(t => t.id === tableId);
      if (!table) return;

      // Bloquer la modification si la table est occupée
      if (table.computed_status && table.computed_status !== 'free') {
        const statusLabels = { draft:'En attente', in_kitchen:'En cuisine', ready:'Prête', served:'Servie' };
        const label = statusLabels[table.computed_status] || table.computed_status;
        this.toastError(`La table "${table.label}" est occupée (${label}) — modification impossible.`);
        return;
      }
      if (table.order_id) {
        this.toastError(`La table "${table.label}" est liée à une commande active — modification impossible.`);
        return;
      }

      if (titleEl) titleEl.textContent = `Modifier — Table ${table.label}`;
      if (idEl)    idEl.value    = table.id;
      if (labelEl) labelEl.value = table.label;
      if (shapeEl) shapeEl.value = table.shape;
      if (capEl)   capEl.value   = table.capacity;
    } else {
      if (titleEl) titleEl.textContent = 'Nouvelle table';
      if (idEl)    idEl.value    = '';
      if (labelEl) labelEl.value = '';
      if (shapeEl) shapeEl.value = 'rect';
      if (capEl)   capEl.value   = 4;
    }
    this.openModal('tableFormModal');
  },

  async saveTable() {
    const id       = document.getElementById('tableFormId')?.value;
    const label    = document.getElementById('tableFormLabel')?.value?.trim();
    const shape    = document.getElementById('tableFormShape')?.value || 'rect';
    const capacity = parseInt(document.getElementById('tableFormCapacity')?.value) || 4;
    const errEl    = document.getElementById('tableFormError');
    if (errEl) errEl.classList.add('hidden');
    if (!label) {
      if (errEl) { errEl.textContent = 'Le label est obligatoire.'; errEl.classList.remove('hidden'); }
      return;
    }

    try {
      const canvas = document.getElementById('floorPlanCanvas');
      const body   = { label, shape, capacity };
      if (!id) {
        // Utiliser position issue du clic outil "table" ou centre canvas
        const pos   = this._pendingTablePos || { x: Math.floor((canvas?.offsetWidth  || 1100) / 2 - 45), y: Math.floor((canvas?.offsetHeight || 650) / 2 - 35) };
        body.x      = pos.x;
        body.y      = pos.y;
        body.width  = shape === 'circle' ? 80 : 90;
        body.height = shape === 'circle' ? 80 : 70;
        this._pendingTablePos = null;
      }

      if (id) await TableService.update(id, body);
      else    await TableService.create(body);

      this.closeModal('tableFormModal');
      this.toastSuccess(id ? `Table "${label}" modifiée` : `Table "${label}" créée`);
      await this.loadFloorPlan();
      // Mettre à jour le combobox de la popup commande
      this.refreshTableSelect();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
    }
  },

  async deleteTable(tableId) {
    const table = this.floorPlanTables.find(t => t.id === tableId);
    if (!table) return;

    const confirmed = await this.showConfirm(
      `Supprimer la table "${table.label}" ? Cette action est irréversible.`,
      { title: 'Supprimer la table', icon: '🗑️', okLabel: 'Supprimer' }
    );
    if (!confirmed) return;

    try {
      const data = await TableService.remove(tableId);
      this.toastSuccess(data.message || 'Table supprimée');
      this._selectedTableId = null;
      this.closeFloorTableDetail();
      await this.loadFloorPlan();
      this.refreshTableSelect();
    } catch (e) {
      this.toastError(e.message);
    }
  },

  // ── COMBOBOX TABLE (popup commande) ──────────────────────────────────────────

  /** Recharge le <select> "Table" dans le formulaire commande. */
  async refreshTableSelect() {
    try {
      const tables = await TableService.getStatus();

      // Chercher tous les selects de numéro de table dans l'app
      const selects = ['orderTableNumber', 'newOrderTable', 'order-table'];
      selects.forEach(selectId => {
        const sel = document.getElementById(selectId);
        if (!sel || sel.tagName !== 'SELECT') return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        // Option vide
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— Sélectionner une table —';
        sel.appendChild(emptyOpt);

        if (!tables.length) {
          const disabledOpt = document.createElement('option');
          disabledOpt.disabled = true;
          disabledOpt.textContent = 'Aucune table configurée';
          sel.appendChild(disabledOpt);
        } else {
          tables.forEach(t => {
            const opt = document.createElement('option');
            opt.value       = t.label;
            opt.textContent = `${t.label} (${t.capacity} place${t.capacity > 1 ? 's' : ''})`;
            sel.appendChild(opt);
          });
        }
        // Restaurer la valeur sélectionnée si toujours disponible
        if (currentVal) sel.value = currentVal;
      });
    } catch (_) {}
  },

};
