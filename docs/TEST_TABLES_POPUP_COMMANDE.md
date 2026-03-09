# ✅ TEST COMPLET — Affichage des tables dans popup commande

## 🎯 Objectif du test

Vérifier que les tables créées s'affichent correctement dans le select `Table / Référence` de la popup commande, sans rechargement de page.

---

## 🔧 Prérequis

- ✅ Client compilé avec la correction (npm run build-renderer)
- ✅ Server backend en cours d'exécution (`npm run dev`)
- ✅ Au moins 1 table créée dans le plan de salle
- ✅ Navigateur avec console accessible (F12)
- ✅ Connecté en tant qu'admin

---

## 📋 SCÉNARIOS DE TEST

### SCÉNARIO 1 : Tables existantes visibles au démarrage

**Étapes** :
1. Arrêtez complètement l'application (serveur + client)
2. Redémarrez le serveur : `npm run dev` (depuis `server/`)
3. Redémarrez le client : `npm run dev` (depuis `client/`)
4. Allez à l'onglet 🛒 Caisse
5. Ajoutez au moins 1 article au panier
6. Cliquez sur "📋 Commande"
7. Ouvrez la console (F12 → Console)

**Résultat attendu** :
```
✅ Modal "Commande" s'ouvre
✅ Select "Table / Référence" contient les options :
   - "— Sélectionner une table —"
   - "Table 1 (4 places)"
   - "Table 2 (6 places)"
   - etc.
✅ Console affiche (si ≥ 1 table) :
   [_loadTablesIntoOrderDialog] ✅ 2 table(s) chargée(s) en BD
✅ Aucune erreur dans la console
```

**Fichier/Ligne** : `client/src/renderer/app.js:5695` (appel `_loadTablesIntoOrderDialog()`)

---

### SCÉNARIO 2 : Nouvelle table créée = visible immédiatement

**Étapes** :
1. Vous êtes en caisse avec le panier plein
2. **NE CLIQUEZ PAS** sur "Commande" (laissez le formulaire fermé)
3. Allez à l'onglet 🪑 Plan de salle
4. Cliquez toggle "Édition" pour activer le mode édition
5. Cliquez "+ Table"
6. Remplissez : Label = "Table 42", Capacité = 8
7. Cliquez "💾 Enregistrer"
8. Message toast : "Table "Table 42" créée"
9. Retournez à la Caisse 🛒
10. Cliquez "📋 Commande"
11. Ouvrez la console

**Résultat attendu** :
```
✅ La nouvelle "Table 42" apparaît dans le select !
✅ Console affiche :
   [_loadTablesIntoOrderDialog] ✅ 3 table(s) chargée(s) en BD
✅ Le select contient "Table 42 (8 places)"
✅ Vous pouvez la sélectionner
```

**Clé du test** : La table créée n'existait pas avant, elle doit apparaître après création.

---

### SCÉNARIO 3 : Table supprimée = disparaît du select

**Étapes** :
1. Vous avez ≥ 2 tables
2. Allez au Plan de salle 🪑
3. Cliquez sur une table libre
4. Panel latéral → Cliquez "🗑️ Supprimer la table"
5. Confirmez la suppression
6. Message toast : "Table supprimée"
7. Retournez à la Caisse 🛒
8. Créez un panier
9. Cliquez "📋 Commande"
10. Ouvrez la console

**Résultat attendu** :
```
✅ La table supprimée N'apparaît PAS dans le select
✅ Console affiche :
   [_loadTablesIntoOrderDialog] ✅ N-1 table(s) chargée(s) en BD
✅ Le nombre de tables a diminué de 1
```

---

### SCÉNARIO 4 : Cas d'erreur réseau gracieux

**Étapes** (simulation d'erreur) :
1. Ouvrez les DevTools (F12 → Network)
2. Cliquez "Offline" ou "Throttle" pour simuler un problème réseau
3. Allez à la Caisse, créez un panier
4. Cliquez "📋 Commande"
5. Attendez 2-3 secondes
6. Console : Observez les logs

**Résultat attendu** :
```
✅ Le modal s'ouvre QUAND MÊME (ne pas bloquer sur erreur)
✅ Select reste vide (pas d'options)
✅ Console affiche (parmi les logs) :
   [_loadTablesIntoOrderDialog] Erreur: TypeError: Failed to fetch
✅ Aucun crash de l'application
✅ Vous pouvez quand même fermer le modal
```

**Tolérance** : L'erreur est gracieuse, l'app continue

---

### SCÉNARIO 5 : Ouvrir/fermer le modal plusieurs fois

**Étapes** :
1. Allez à la Caisse, créez un panier
2. Cliquez "📋 Commande" → observez le select
3. Fermez le modal (X ou Annuler)
4. Cliquez "📋 Commande" à nouveau
5. Observez le select
6. Répétez 3-5 fois

**Résultat attendu** :
```
✅ À chaque ouverture, le select est rempli correctement
✅ Pas de duplication d'options
✅ Pas de ralentissement progressif
✅ Console affiche (à chaque fois) :
   [_loadTablesIntoOrderDialog] ✅ N table(s) chargée(s) en BD
```

**Vérification** : Performance + stabilité

---

### SCÉNARIO 6 : Multi-admin simultané (bonus)

**Étapes** (si possible) :
1. 2 onglets du navigateur, tous les deux connectés en admin
2. Onglet 1 : Caisse, créez un panier, laissez le formulaire commande fermé
3. Onglet 2 : Plan de salle, créez une nouvelle table "Sync Test"
4. Onglet 1 : Cliquez "📋 Commande"
5. Observez le select

**Résultat attendu** :
```
✅ "Sync Test" apparaît dans l'onglet 1
✅ API call récent (pas de cache stale)
✅ Console : ✅ N table(s) chargée(s)
```

**Cas limité** : Dépend de la vitesse réseau

---

## 🐛 Débogage en cas de problème

### Problème : Select vide alors qu'il y a des tables

**Checklist** :
1. Ouvrez la console (F12)
2. Cherchez les logs `[_loadTablesIntoOrderDialog]`
3. Si vous voyez :
   ```
   ❌ [_loadTablesIntoOrderDialog] Select #orderTableNumber non trouvé
   ```
   → Le select n'existe pas dans le DOM
   → Vérifiez que le HTML contient `<select id="orderTableNumber">`

4. Si vous voyez :
   ```
   ❌ [_loadTablesIntoOrderDialog] Réponse invalide (pas un tableau)
   ```
   → L'API retourne du mal-formé JSON
   → Vérifiez : `curl http://localhost:5000/api/tables` (avec JWT)

5. Si vous voyez :
   ```
   ❌ [_loadTablesIntoOrderDialog] Réponse serveur non-OK 401
   ```
   → JWT expiré ou invalide
   → Réconnectez-vous

---

### Problème : Console vide (aucun log)

**Checklist** :
1. Vérifiez que la fonction est bien appelée (breakpoint sur l'appel)
2. Vérifiez que le client a été recompilé : `npm run build-renderer`
3. Rafraîchissez la page (Ctrl+F5)
4. Vérifiez que vous utilisez la bonne version du fichier

---

### Problème : Appel API très lent

**Checklist** :
1. Vérifiez la vitesse du serveur : `curl -w "@curl-format.txt" http://localhost:5000/api/tables`
2. Vérifiez la BD : `SELECT COUNT(*) FROM tables WHERE active = 1;`
3. Si > 100 tables : À optimiser (index, pagination)

---

## 📊 Tableau récapitulatif

| Scénario | Test | Statut | Logs attendus |
|----------|------|--------|---------------|
| Tables visibles au démarrage | 1 | ✅ | `✅ N table(s) chargée(s)` |
| Nouvelle table créée | 2 | ✅ | `✅ N+1 table(s) chargée(s)` |
| Table supprimée | 3 | ✅ | `✅ N-1 table(s) chargée(s)` |
| Erreur réseau | 4 | ✅ | `Erreur: ...` (gracieux) |
| Multiple fois | 5 | ✅ | `✅ N table(s)` (répété) |
| Multi-admin | 6 | ⚠️ | `✅ N table(s)` (sync) |

---

## 🎯 Validation finale

Cochez les cases pour confirmer que le fix fonctionne :

- [ ] Scénario 1 : ✅ PASS
- [ ] Scénario 2 : ✅ PASS
- [ ] Scénario 3 : ✅ PASS
- [ ] Scénario 4 : ✅ PASS
- [ ] Scénario 5 : ✅ PASS
- [ ] Scénario 6 : ✅ PASS (ou ⚠️ SKIP)

**Si tous les scénarios passent** → 🚀 **FIX VALIDÉ** → Prêt pour production

---

## 📝 Notes de test

```
Date du test : _______________
Testeur : _______________
Environnement : Dev / Staging / Prod
Nombre de tables testées : ___
Navigateur : _______________
```

---

**Version du fix** : 2.0.0  
**Fonction clé** : `_loadTablesIntoOrderDialog()`  
**Fichier modifié** : `client/src/renderer/app.js`

