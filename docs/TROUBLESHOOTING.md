# 🆘 Guide de Troubleshooting Co-Caisse

Solutions aux problèmes courants rencontrés lors de l'installation et l'utilisation.

## 🚀 Installation & Démarrage

### Erreur: "npm command not found"

**Cause:** Node.js n'est pas installé

**Solution:**
1. Télécharger Node.js depuis https://nodejs.org (version LTS recommandée)
2. Installer avec les paramètres par défaut
3. Redémarrer le terminal/PowerShell
4. Vérifier: `node -v && npm -v`

### Erreur: "npm ERR! ERESOLVE unable to resolve dependency tree"

**Cause:** Incompatibilité de dépendances

**Solution:**
```bash
# Option 1: Forcer l'installation
npm install --legacy-peer-deps

# Option 2: Supprimer et réinstaller
rm -r node_modules package-lock.json
npm install
```

### Erreur: "Cannot find module"

**Cause:** Dépendances manquantes

**Solution:**
```bash
# Réinstaller toutes les dépendances
npm install

# Vérifier que le dossier node_modules existe
# Supprimer cache npm
npm cache clean --force
npm install
```

### Erreur Port 5000/3000 déjà utilisé

**Cause:** Un autre processus utilise le port

**Windows:**
```powershell
# Trouver le processus
netstat -ano | findstr :5000

# Arrêter le processus (remplacer PID par le numéro)
taskkill /PID <PID> /F

# Ou changer le port dans package.json
```

**Mac/Linux:**
```bash
# Trouver et arrêter
lsof -i :5000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Ou
kill -9 $(lsof -t -i:5000)
```

---

## 💾 Base de Données

### Erreur: "SQLITE_CANTOPEN: unable to open database file"

**Cause:** Le dossier `data/` n'existe pas ou pas d'accès

**Solution:**
```bash
# Créer le dossier manuellement
mkdir data

# Ou supprimer et relancer (recréé automatiquement)
rm -r data/
npm run dev
```

### La base de données ne se crée pas

**Cause:** Permissions insuffisantes

**Solution:**
```bash
# Vérifier les permissions
ls -la data/

# Changer les permissions
chmod 755 data/

# Ou exécuter comme admin
sudo npm run server  # (Mac/Linux)
# Ou lancer PowerShell en admin (Windows)
```

### "Locked database" error

**Cause:** Deux instances accèdent à la BD simultanément

**Solution:**
```bash
# Arrêter tous les processus Node
pkill -f node
# ou Windows:
taskkill /F /IM node.exe

# Supprimer le fichier lock (optionnel)
rm data/cocaisse.db-wal
rm data/cocaisse.db-shm

# Redémarrer
npm run dev
```

### Réinitialiser la base de données

```bash
# Supprimer complètement
rm data/cocaisse.db

# Redémarrer (BD recréée)
npm run dev

# Ou remplir avec données d'exemple
npm run seed
```

### Erreur lors de l'export JSON

**Cause:** Espace disque insuffisant ou permissions

**Solution:**
1. Vérifier l'espace disque disponible
2. Changer le dossier d'export
3. Vérifier les permissions d'écriture
4. Exécuter en tant qu'administrateur

---

## 🌐 API & Serveur

### Erreur: "EADDRINUSE: address already in use"

**Cause:** Port 5000 déjà utilisé

**Solution:**
```bash
# Changer le port (dans package.json)
PORT=6000 npm run server

# Ou trouver et arrêter le processus existant
# (voir section Port ci-dessus)
```

### API ne répond pas (timeout)

**Cause:** Serveur Express pas lancé

**Solution:**
```bash
# Vérifier que le serveur tourne
curl http://localhost:5000/api/health

# Sinon relancer
npm run server

# En développement, utiliser:
npm run dev
```

### CORS error en frontend

**Cause:** API URL incorrecte ou server down

**Solution:**
```javascript
// Vérifier dans src/ui/app.js
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
console.log('API URL:', API_URL);

// Tester la connexion
fetch('http://localhost:5000/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

### Erreur 404 sur endpoint API

**Cause:** Route non existante ou mal orthographiée

**Solution:**
- Consulter `API_DOCS.md` pour les endpoints corrects
- Vérifier la méthode HTTP (GET, POST, PUT, DELETE)
- Vérifier les paramètres requis
- Consulter les logs du serveur

---

## 🖥️ Electron

### Electron ne démarre pas

**Cause:** Problème de compilation

**Solution:**
```bash
# Nettoyer et redémarrer
rm -r dist/ node_modules/
npm install
npm start
```

### Fenêtre blanche (white screen)

**Cause:** Page ne charge pas correctement

**Solution:**
```bash
# Ouvrir dev tools
F12 ou Ctrl+Shift+I

# Vérifier les erreurs en console
# Vérifier que webpack compile (npm run react-start)
# Redémarrer Electron
npm start
```

### Impression ne fonctionne pas

**Cause:** Imprimante non configurée

**Solution:**
1. Aller dans ⚙️ **Paramètres**
2. Configurer le nom de l'imprimante
3. Tester l'impression
4. Vérifier que l'imprimante est connectée

### Export/Import échoue

**Cause:** Fichier JSON invalide

**Solution:**
```bash
# Vérifier le format du fichier JSON
npm install -g jq
jq . cocaisse-export.json

# Ou en Python
python -m json.tool cocaisse-export.json

# Créer un nouveau backup
# Dans l'app: cliquer ⬇️ Exporter
```

---

## 🎨 Interface Utilisateur

### Interface lente/laggy

**Cause:** Trop de produits à afficher

**Solution:**
1. Limiter le nombre de produits affichés
2. Utiliser la recherche pour filtrer
3. Augmenter la limite dans les paramètres
4. Fermer les onglets inutilisés

### Panier ne se met pas à jour

**Cause:** Bug JavaScript ou cache

**Solution:**
```javascript
// Dans console (F12):
app.updateCartDisplay();
app.updateTotals();

// Ou rafraîchir complètement:
location.reload();
```

### Boutons non fonctionnels

**Cause:** Événements non attachés

**Solution:**
```javascript
// Dans console:
app.setupEventListeners();

// Ou redémarrer l'app
// Ctrl+R ou Cmd+R
```

### Recherche produit ne fonctionne pas

**Cause:** Produits pas chargés

**Solution:**
```javascript
// Vérifier dans console:
console.log(app.products);

// Recharger les produits:
app.loadProducts();

// Vérifier l'API:
fetch('http://localhost:5000/api/products')
  .then(r => r.json())
  .then(console.log);
```

---

## 👥 Utilisateurs & Authentification

### Impossible de se connecter

**Cause:** Pas d'utilisateurs créés

**Solution:**
```bash
# Créer des données de test
npm run seed

# Utilisateurs créés:
# - admin / admin123
# - manager / manager123
# - cashier1 / cashier123
```

### Accès refusé (403)

**Cause:** Rôle insuffisant pour l'action

**Solution:**
- Vérifier le rôle de l'utilisateur
- Utiliser un compte admin pour les actions sensibles
- Consulter les droits d'accès dans ADMIN_GUIDE.md

---

## 📊 Rapports & Données

### Rapports vides

**Cause:** Pas de transactions

**Solution:**
1. Créer quelques transactions de test
2. Attendre le jour suivant (rapports journaliers)
3. Vérifier les filtres de date

### Statistiques incorrectes

**Cause:** Données manquantes ou incohérentes

**Solution:**
```bash
# Vérifier les données
npm run dev

# Aller dans 📊 Tableau de bord
# Consulter l'historique des transactions

# Réinitialiser si nécessaire
rm data/cocaisse.db
npm run seed
```

---

## 🔧 Dépannage Avancé

### Activer les logs détaillés

```bash
# Variable d'environnement
LOG_LEVEL=debug npm run server

# Dans app.js:
console.log('DEBUG:', variable);
```

### Vérifier les versions

```bash
node -v      # v16+
npm -v       # v8+
npm list     # Toutes les dépendances
```

### Réinitialisation complète

```bash
# Supprimer tout ce qui est généré
rm -r node_modules dist data .cache
rm package-lock.json

# Réinstaller
npm install

# Remplir avec données test
npm run seed

# Redémarrer
npm run dev
```

---

## 📞 Besoin d'aide?

1. **Consulter les docs** (README.md, ADMIN_GUIDE.md, API_DOCS.md)
2. **Chercher une issue** sur GitHub (peut-être déjà résolue)
3. **Signaler un bug** avec:
   - Description du problème
   - Étapes pour reproduire
   - Logs/screenshots
   - Versions (Node, npm, OS)
4. **Contacter le support** (email, discussions)

### Commandes utiles pour les logs

```bash
# Sauvegarder les logs dans un fichier
npm run server > server.log 2>&1

# Afficher le dernier N lignes
tail -100 server.log

# Chercher une erreur spécifique
grep "ERROR" server.log

# Tout exporter
npm run dev 2>&1 | tee app.log
```

---

**Dernière mise à jour:** Février 2026  
**Version:** 1.0.0

Si votre problème n'est pas listé, n'hésitez pas à ouvrir une issue! 🐛

