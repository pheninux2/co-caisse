# TODO : Interface UI Admin — Gestion des Variantes

## ❌ États actuels

L'implémentation a les éléments suivants :
- ✅ Routes API backend (`/api/variants/groups`, `/api/products/:id/variants`)
- ✅ Classe `VariantsManager` (frontend)
- ✅ Modal de sélection en caisse
- ✅ Intégration dans le panier
- ❌ **Interface admin pour créer/gérer les groupes** ← À FAIRE

---

## 🎯 À IMPLÉMENTER

### 1. Onglet "Variantes" dans la section Produits

**Fichier à modifier** : `client/src/renderer/index.html`

Ajouter après l'onglet "Stocks" :
```html
<button onclick="app.showProductsTab('variants')" id="ptab-variants"
    class="products-tab px-3 py-1.5 text-sm font-medium rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition">
    🎨 Variantes
</button>
```

Puis ajouter le panneau correspondant :
```html
<div id="ptab-panel-variants" class="hidden flex-1 flex flex-col min-h-0">
    <!-- Interface d'assignation des variantes au produit -->
    <!-- À implémenter -->
</div>
```

### 2. Section "Gestion > Variantes" (nouvelle section)

**Fichier à modifier** : `client/src/renderer/index.html`

Ajouter une nouvelle section complète pour la gestion des groupes de variantes :
```html
<!-- ============ VARIANTS MANAGEMENT SECTION ============ -->
<section id="variants-section" class="hidden h-full flex flex-col overflow-hidden bg-gray-50">
    <!-- Header avec titre et bouton "Nouveau groupe" -->
    <!-- Liste des groupes en tableau -->
    <!-- Modal de création/édition de groupe -->
    <!-- Modal de gestion des options -->
</section>
```

### 3. Fonctions JavaScript dans app.js

**Fichier à modifier** : `client/src/renderer/app.js`

À ajouter :

```javascript
// ===== GESTION VARIANTES (Admin) =====

/**
 * Affiche la section Variantes
 */
showVariantsManagement() {
  this.loadVariantGroups();
  this.showSection('variants');
}

/**
 * Charger et afficher tous les groupes de variantes
 */
async loadVariantGroups() {
  try {
    const groups = await this.variantsManager.loadAllVariantGroups();
    if (!groups) return;
    
    // Afficher dans le tableau
    this.renderVariantGroupsTable(groups);
  } catch (error) {
    console.error('Erreur chargement groupes:', error);
    this.toastError('Erreur lors du chargement des groupes');
  }
}

/**
 * Afficher le tableau des groupes
 */
renderVariantGroupsTable(groups) {
  const table = document.getElementById('variantsTable');
  if (!table) return;
  
  table.innerHTML = groups.map(group => `
    <tr>
      <td class="px-3 py-2">${this._escapeHtml(group.name)}</td>
      <td class="px-3 py-2 text-center">${group.type === 'single' ? 'Choix unique' : 'Choix multiple'}</td>
      <td class="px-3 py-2 text-center">${group.required ? '✓ Oui' : 'Non'}</td>
      <td class="px-3 py-2 text-center">${group.options?.length || 0}</td>
      <td class="px-3 py-2 text-center">
        <button onclick="app.editVariantGroup('${group.id}')" class="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded transition">✏️ Modifier</button>
        <button onclick="app.deleteVariantGroup('${group.id}')" class="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition ml-1">🗑️ Supprimer</button>
      </td>
    </tr>
  `).join('');
}

/**
 * Ouvrir formulaire de création de groupe
 */
openVariantGroupDialog() {
  // Réinitialiser le formulaire
  document.getElementById('variantGroupId').value = '';
  document.getElementById('variantGroupName').value = '';
  document.getElementById('variantGroupType').value = 'single';
  document.getElementById('variantGroupRequired').checked = false;
  document.getElementById('variantGroupOptions').innerHTML = `
    <div class="variant-option-row">
      <input type="text" placeholder="Nom de l'option" class="flex-1 px-2 py-1 border rounded text-sm">
      <input type="number" step="0.01" placeholder="+0.00" class="w-20 px-2 py-1 border rounded text-sm mx-1">
      <label><input type="checkbox" class="mr-1"> Par défaut</label>
      <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 ml-2">✕</button>
    </div>
  `;
  
  this.openModal('variantGroupModal');
}

/**
 * Modifier un groupe existant
 */
async editVariantGroup(groupId) {
  try {
    const groups = await this.variantsManager.loadAllVariantGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    document.getElementById('variantGroupId').value = group.id;
    document.getElementById('variantGroupName').value = group.name;
    document.getElementById('variantGroupType').value = group.type;
    document.getElementById('variantGroupRequired').checked = group.required;
    
    document.getElementById('variantGroupOptions').innerHTML = group.options.map(opt => `
      <div class="variant-option-row">
        <input type="text" value="${this._escapeHtml(opt.name)}" placeholder="Nom" class="flex-1 px-2 py-1 border rounded text-sm">
        <input type="number" step="0.01" value="${opt.price_modifier}" placeholder="+0.00" class="w-20 px-2 py-1 border rounded text-sm mx-1">
        <label><input type="checkbox" ${opt.is_default ? 'checked' : ''} class="mr-1"> Par défaut</label>
        <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 ml-2">✕</button>
      </div>
    `).join('');
    
    this.openModal('variantGroupModal');
  } catch (error) {
    this.toastError('Erreur lors du chargement du groupe');
  }
}

/**
 * Sauvegarder un groupe de variantes
 */
async saveVariantGroup() {
  const groupId = document.getElementById('variantGroupId').value;
  const name = document.getElementById('variantGroupName').value;
  const type = document.getElementById('variantGroupType').value;
  const required = document.getElementById('variantGroupRequired').checked;
  
  // Récupérer les options
  const optionRows = document.querySelectorAll('.variant-option-row');
  const options = Array.from(optionRows).map(row => ({
    name: row.querySelector('input[placeholder="Nom"]').value,
    price_modifier: parseFloat(row.querySelector('input[type="number"]').value || 0),
    is_default: row.querySelector('input[type="checkbox"]').checked
  })).filter(opt => opt.name);
  
  if (!name || !options.length) {
    this.toastWarning('Veuillez remplir le nom et au moins une option');
    return;
  }
  
  try {
    let result;
    if (groupId) {
      result = await this.variantsManager.updateVariantGroup(groupId, { name, type, required, options });
    } else {
      result = await this.variantsManager.createVariantGroup({ name, type, required, options });
    }
    
    if (result) {
      this.closeModal('variantGroupModal');
      this.loadVariantGroups();
    }
  } catch (error) {
    this.toastError('Erreur lors de la sauvegarde');
  }
}

/**
 * Supprimer un groupe de variantes
 */
async deleteVariantGroup(groupId) {
  const confirmed = await this.confirm('Supprimer ce groupe ?', {
    title: 'Supprimer',
    icon: '⚠️',
    type: 'warning'
  });
  
  if (!confirmed) return;
  
  try {
    const success = await this.variantsManager.deleteVariantGroup(groupId);
    if (success) {
      this.loadVariantGroups();
    }
  } catch (error) {
    this.toastError('Erreur lors de la suppression');
  }
}

/**
 * Afficher le panneau d'assignation des variantes à un produit
 */
async showProductVariantsTab(productId) {
  try {
    const groups = await this.variantsManager.loadAllVariantGroups();
    const assignedVariants = await this.variantsManager.loadProductVariants(productId);
    
    const panel = document.getElementById('ptab-panel-variants');
    if (!panel) return;
    
    // Afficher les groupes assignés
    const assignedIds = assignedVariants.map(v => v.id);
    const assignedList = document.getElementById('assignedVariantsList');
    assignedList.innerHTML = assignedVariants.map((group, idx) => `
      <div class="flex items-center gap-2 p-2 bg-indigo-50 rounded border border-indigo-200">
        <span class="flex-1">${this._escapeHtml(group.name)}</span>
        <span class="text-xs text-gray-500">${group.options.length} options</span>
        <input type="number" value="${idx}" class="w-10 text-center px-1 border rounded text-xs" placeholder="Ordre">
        <button onclick="app.removeProductVariant('${productId}', '${group.assignmentId}')" class="text-red-500 hover:text-red-700">✕</button>
      </div>
    `).join('');
    
    // Dropdown pour ajouter des groupes
    const dropdown = document.getElementById('availableVariantsDropdown');
    const available = groups.filter(g => !assignedIds.includes(g.id));
    dropdown.innerHTML = `
      <option value="">+ Ajouter un groupe</option>
      ${available.map(g => `<option value="${g.id}">${this._escapeHtml(g.name)}</option>`).join('')}
    `;
    
    dropdown.onchange = (e) => {
      if (e.target.value) {
        this.addProductVariant(productId, e.target.value);
        e.target.value = '';
      }
    };
  } catch (error) {
    this.toastError('Erreur chargement variantes');
  }
}

/**
 * Ajouter un groupe à un produit
 */
async addProductVariant(productId, groupId) {
  try {
    await this.variantsManager.assignVariantGroupsToProduct(productId, [groupId]);
    this.showProductVariantsTab(productId);
  } catch (error) {
    this.toastError('Erreur assignation');
  }
}

/**
 * Retirer un groupe d'un produit
 */
async removeProductVariant(productId, assignmentId) {
  try {
    await this.variantsManager.removeVariantGroupFromProduct(productId, assignmentId);
    this.showProductVariantsTab(productId);
  } catch (error) {
    this.toastError('Erreur suppression');
  }
}
```

### 4. Ajouter un onglet "Variantes" dans la navigation principale

**Fichier à modifier** : `client/src/renderer/index.html`

Ajouter dans le menu principal (`mainNav`) :
```html
<button onclick="app.showVariantsManagement()" class="nav-tab" data-section="variants" data-role="admin,manager" data-module="gestion">
    <span class="text-lg">🎨</span>
    <span class="hidden xl:inline">Variantes</span>
</button>
```

---

## 📋 Modals requises

À ajouter dans `index.html` :

### Modal édition groupe

```html
<div id="variantGroupModal" class="modal hidden">
    <div class="modal-backdrop" onclick="app.closeModal('variantGroupModal')"></div>
    <div class="modal-content max-w-lg">
        <h2 class="text-xl font-bold text-gray-800 mb-4">🎨 Groupe de variantes</h2>
        <form onsubmit="event.preventDefault(); app.saveVariantGroup();" class="space-y-3">
            <input type="hidden" id="variantGroupId">
            
            <input type="text" id="variantGroupName" placeholder="Nom du groupe (ex: Taille, Sauce)" required class="modal-input">
            
            <select id="variantGroupType" required class="modal-input">
                <option value="single">Choix unique (radio)</option>
                <option value="multiple">Choix multiple (checkbox)</option>
            </select>
            
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="variantGroupRequired" class="w-4 h-4">
                <span class="text-sm font-medium text-gray-700">Obligatoire</span>
            </label>
            
            <div>
                <label class="text-xs font-semibold text-gray-600 mb-2 block">Options</label>
                <div id="variantGroupOptions" class="space-y-2 max-h-64 overflow-y-auto">
                    <!-- Rempli dynamiquement -->
                </div>
                <button type="button" onclick="document.getElementById('variantGroupOptions').innerHTML += `<div class='variant-option-row'><input type='text' placeholder='Nom' class='flex-1 px-2 py-1 border rounded text-sm'><input type='number' step='0.01' placeholder='+0.00' class='w-20 px-2 py-1 border rounded text-sm mx-1'><label><input type='checkbox' class='mr-1'> Par défaut</label><button type='button' onclick='this.parentElement.remove()' class='text-red-500 ml-2'>✕</button></div>`;"
                    class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded transition mt-2">
                    + Ajouter une option
                </button>
            </div>
            
            <div class="flex gap-2 pt-2">
                <button type="button" onclick="app.closeModal('variantGroupModal')" class="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition">Annuler</button>
                <button type="submit" class="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition">Sauvegarder</button>
            </div>
        </form>
    </div>
</div>
```

---

## 🎯 Résumé des fichiers à modifier

1. **client/src/renderer/index.html** :
   - Ajouter onglet "🎨 Variantes" dans la nav
   - Ajouter section `#variants-section`
   - Ajouter onglet dans `#ptab-variants`
   - Ajouter modals

2. **client/src/renderer/app.js** :
   - Ajouter toutes les fonctions d'admin listées ci-dessus

3. **Compiler** :
   - `npm run build` depuis `client/`

---

## ✅ Après implémentation

- L'admin pourra aller à **⚙️ Gestion > 🎨 Variantes**
- Créer/modifier/supprimer des groupes
- Voir le nombre de produits utilisant chaque groupe
- Aller dans un produit et assigner des variantes via un nouvel onglet

---

**Priorité** : HAUTE
**Complexité** : MOYENNE (copy-paste + adaptations)
**Temps estimé** : 1-2 heures

