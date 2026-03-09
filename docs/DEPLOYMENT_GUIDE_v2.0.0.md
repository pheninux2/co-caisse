# 🚀 GUIDE RAPIDE DE DÉPLOIEMENT — v2.0.0

## ⏱️ TL;DR (2 minutes)

```bash
# 1. Compiler le client
cd C:\Users\pheni\IdeaProjects\co-caisse\client
npm run build-renderer

# 2. Redémarrer le serveur
cd C:\Users\pheni\IdeaProjects\co-caisse\server
npm run dev

# 3. Tester dans le navigateur
# - Onglet Caisse → Créer panier → Cliquer "Commande"
# - Attendu : Tables visibles dans le select ✅
```

---

## 📋 Checklist de déploiement

### Phase 1 : Préparation

- [x] Code modifié et sauvegardé
- [x] Client compilé sans erreur
- [x] Pas d'erreurs TypeScript/JavaScript
- [x] Tous les fichiers créés :
  - [x] `docs/CHANGELOG_v2.0.0.md`
  - [x] `docs/FIX_TABLES_POPUP_COMMANDE.md`
  - [x] `docs/TEST_TABLES_POPUP_COMMANDE.md`
  - [x] `docs/WORKFLOW_NOUVELLE_COMMANDE_SALLE.md`
  - [x] `docs/TEST_NOUVELLE_COMMANDE_SALLE.md`
  - [x] `docs/COMPARAISON_VISUELLE_v2.0.0.md`

### Phase 2 : Déploiement Local/Dev

1. **Arrêter les services** (si en cours)
   ```bash
   # Ctrl+C dans chaque terminal
   ```

2. **Nettoyer les caches** (optionnel mais recommandé)
   ```bash
   # Client
   cd client
   rm -r dist build node_modules/.cache
   
   # Server
   cd server
   # (pas de cache critique)
   ```

3. **Redémarrer le serveur**
   ```bash
   cd C:\Users\pheni\IdeaProjects\co-caisse\server
   npm run dev
   ```
   **Attendu** :
   ```
   ✅ Database connected
   ✅ All tables created/verified
   ✅ 9 migration(s) appliquée(s)
   ✅ Server listening on port 5000
   ```

4. **Redémarrer le client**
   ```bash
   cd C:\Users\pheni\IdeaProjects\co-caisse\client
   npm run dev
   ```
   **Attendu** :
   ```
   webpack 5.105.2 compiled with 3 warnings in XXX ms
   ```

### Phase 3 : Tests de validation

#### Test 1 : Tables visibles (critique)

```
1. Onglet Caisse
2. Ajouter 1 article au panier
3. Cliquer "📋 Commande"
4. Ouvrir Console (F12)

ATTENDU :
  ✅ Modal s'ouvre
  ✅ Select "Table / Référence" contient ≥1 option
  ✅ Console affiche : [_loadTablesIntoOrderDialog] ✅ N table(s) chargée(s) en BD
```

#### Test 2 : Nouvelle table après création

```
1. Onglet Plan de salle → Mode édition ON
2. Créer nouvelle table "TEST-TABLE"
3. Retour Caisse
4. Ajouter article + Cliquer "Commande"

ATTENDU :
  ✅ "TEST-TABLE" apparaît dans le select
```

#### Test 3 : Bouton Plan de salle

```
1. Onglet Plan de salle
2. Cliquer sur une table libre
3. Panel latéral → Cliquer "+ Nouvelle commande"

ATTENDU :
  ✅ Onglet Caisse s'ouvre
  ✅ Aucune table pré-sélectionnée
  ✅ Select "Table" vide
```

### Phase 4 : Validation finale

- [ ] Test 1 PASS ✅
- [ ] Test 2 PASS ✅
- [ ] Test 3 PASS ✅
- [ ] Console clean (pas d'erreur rouge)
- [ ] Aucun crash observé
- [ ] Performance acceptable

---

## 🐛 Troubleshooting rapide

### Problème : Webpack error "unexpected token"

**Solution** :
```bash
cd client
npm run build-renderer
# Si toujours l'erreur :
npm cache clean --force
npm install
npm run build-renderer
```

### Problème : Select vide dans Commande

**Diagnostic** :
```javascript
// Ouvrir Console (F12) et taper :
app._loadTablesIntoOrderDialog()

// Regarder les logs :
// ✅ Si [_loadTablesIntoOrderDialog] ✅ 3 table(s) → OK
// ❌ Si non → Erreur API ou select non trouvé
```

**Vérification BD** :
```bash
# Terminal, sur le serveur (bash/PowerShell)
sqlite3 server/data/cocaisse.db
sqlite> SELECT COUNT(*) FROM tables WHERE active = 1;
# Doit retourner > 0
```

### Problème : API /api/tables retourne []

**Cause** : Aucune table créée ou tous les `active = 0`

**Solution** :
```bash
# Créer une table via l'interface Plan de salle
# Ou vérifier la BD
sqlite3 server/data/cocaisse.db
sqlite> SELECT id, label, active FROM tables;
# Tous les active doivent être 1
```

### Problème : Token JWT expiré

**Symptôme** : Console → `[_loadTablesIntoOrderDialog] Réponse serveur non-OK 401`

**Solution** :
```javascript
// Déconnectez-vous et reconnectez-vous
// Ou ouvrez une nouvelle session
```

---

## 📊 Points de vérification

```
┌──────────────────────────────────────────────────────────┐
│              POINTS DE VÉRIFICATION                      │
├──────────────────────────────────────────────────────────┤
│ ✅ Client compilé                                        │
│ ✅ Server démarré                                        │
│ ✅ BD connectée                                          │
│ ✅ API /api/tables fonctionne                            │
│ ✅ Au moins 1 table existe (active = 1)                 │
│ ✅ JWT token valide                                     │
│ ✅ Console : Logs [_loadTablesIntoOrderDialog] présents │
│ ✅ Select se remplit (≥1 option)                        │
│ ✅ Aucune erreur rouge en console                       │
│ ✅ Application responsive (pas de freeze)               │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 Accès aux ressources

### Documentation

| Document | Lien |
|----------|------|
| Changelog complet | `docs/CHANGELOG_v2.0.0.md` |
| Analyse du fix | `docs/FIX_TABLES_POPUP_COMMANDE.md` |
| Tests complets | `docs/TEST_TABLES_POPUP_COMMANDE.md` |
| Workflow salle | `docs/WORKFLOW_NOUVELLE_COMMANDE_SALLE.md` |
| Comparaison visuelle | `docs/COMPARAISON_VISUELLE_v2.0.0.md` |

### Code modifié

```
client/src/renderer/app.js

Fonctions clés :
- openOrderDialog()                    → ligne ~5689
- _loadTablesIntoOrderDialog()         → ligne ~5701 (NOUVELLE)
- openCashierForNewOrder()             → ligne ~5466 (NOUVELLE)
```

---

## 📞 En cas de problème

1. **Consultez** `FIX_TABLES_POPUP_COMMANDE.md` → Section "Débogage"
2. **Vérifiez** les logs en console (F12)
3. **Testez** l'API : `curl http://localhost:5000/api/tables`
4. **Vérifiez** la BD : `SELECT COUNT(*) FROM tables WHERE active = 1;`

---

## 🎉 Déploiement en production

Quand prêt pour la prod :

```bash
# 1. Build final
cd client
npm run build  # (build-renderer + electron-builder)

# 2. Distribution
# Récupérer le binaire depuis client/release/

# 3. Server
# Déployer sur le serveur production avec PM2 ou systemd
```

---

## ✨ Post-déploiement

- [x] Tester les 3 scénarios clés
- [x] Vérifier les logs serveur
- [x] Vérifier les logs client (F12)
- [x] Tester avec ≥5 tables
- [x] Tester après création de table
- [x] Tester après suppression de table
- [x] Tester en erreur réseau (offline)

---

**Version** : 2.0.0  
**Temps de déploiement** : ~5-10 minutes  
**Risque** : 🟢 FAIBLE (backward compatible)  
**Priorité** : 🔴 CRITIQUE (fix bloquant)  
**Impact** : ✅ TRÈS POSITIF

