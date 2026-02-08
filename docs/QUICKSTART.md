# 🚀 Démarrage Rapide Co-Caisse

## 5 minutes pour commencer!

### Étape 1: Installation

```bash
# 1. Ouvrir PowerShell ou Terminal
# 2. Naviguer vers le dossier du projet
cd C:\Users\votre_utilisateur\IdeaProjects\co-caisse

# 3. Installer les dépendances
npm install
```

**Temps estimé:** 2-3 minutes (selon connexion)

### Étape 2: Démarrage

#### Option A: Mode développement (Recommandé au départ)

```bash
# Lance le serveur ET l'interface (dans la même console)
npm run dev
```

Cela lance:
- 🖥️ Electron (interface desktop)
- 🔧 Express.js (serveur API sur port 5000)
- 📦 Webpack (compilation assets)

#### Option B: Deux fenêtres séparées

Fenêtre 1:
```bash
npm run server
```

Fenêtre 2:
```bash
npm run react-start
```

### Étape 3: Accéder à l'application

L'application se lance automatiquement dans Electron.

Ou manuellement:
- 🌐 **Web**: http://localhost:3000
- 🖥️ **Desktop**: Electron app

## ✅ Checklist Démarrage

- [ ] Node.js installé? (`node -v`)
- [ ] npm accessible? (`npm -v`)
- [ ] Dépendances installées? (`node_modules` existe)
- [ ] Aucun port 5000/3000 en utilisation?
- [ ] Dossier `data/` créé automatiquement

## 🎯 Premiers Pas (Après Démarrage)

### 1️⃣ Configurer l'Entreprise (2 min)

1. Aller dans ⚙️ **Paramètres** (en bas du menu)
2. Remplir:
   - Nom de l'entreprise
   - Adresse
   - Téléphone
   - Email
3. Cliquer **💾 Enregistrer**

### 2️⃣ Créer les Catégories (3 min)

1. Aller dans 🏷️ **Catégories**
2. Cliquer **➕ Nouvelle catégorie**
3. Créer 3-4 catégories de base:
   - ☕ Boissons
   - 🥐 Viennoiseries
   - 🥪 Sandwiches
   - 🍰 Pâtisseries

### 3️⃣ Ajouter des Produits (5 min)

1. Aller dans 📦 **Produits**
2. Cliquer **➕ Nouveau produit**
3. Ajouter au moins 10 produits:

**Exemple:**
```
Croissant
- Catégorie: Viennoiseries
- Prix: 1.50 €
- Stock: 25

Café
- Catégorie: Boissons
- Prix: 2.00 €
- Stock: 50
```

### 4️⃣ Tester la Caisse (2 min)

1. Aller dans 🛒 **Caisse**
2. Cliquer sur quelques produits
3. Voir le panier se remplir
4. Sélectionner moyen de paiement (Espèces)
5. Cliquer **Encaisser**
6. Voir le ticket généré! ✅

## 📊 Résultat attendu

Après ces étapes, vous devriez voir:

```
✅ Interface responsive et colorée
✅ Menu avec 8 sections
✅ Produits affichés en grille
✅ Panier avec calcul TVA
✅ Moyen de paiement sélectionnable
✅ Ticket généré automatiquement
✅ Historique des transactions
✅ Dashboard avec statistiques
```

## 🔧 Dépannage Rapide

### Le port 5000 est déjà utilisé

```bash
# Trouver ce qui utilise le port
Get-Process | Where-Object {$_.ProcessName -match "node"} | Stop-Process

# Ou changer le port dans le code
```

### "command not found: npm"

Node.js n'est pas installé:
1. Télécharger depuis https://nodejs.org
2. Installer (version LTS recommandée)
3. Redémarrer le terminal
4. Relancer: `npm install`

### La BD n'est pas créée

```bash
# Redémarrer l'app
# La BD se crée automatiquement

# Ou supprimer l'ancienne
rm data/cocaisse.db
```

### "Cannot find module"

```bash
# Réinstaller les dépendances
rm -r node_modules
npm install
```

## 📱 Utilisation de Base

### Ajouter un produit au panier
Cliquer simplement sur le produit → Panier +1

### Augmenter la quantité
Cliquer plusieurs fois OU modifier dans le panier

### Appliquer une remise
Bouton 🏷️ → Montant ou % → Appliquer

### Encaisser
1. Sélectionner moyen de paiement
2. Si espèces: entrer montant reçu
3. Cliquer **Encaisser**
4. Imprimer ticket (optionnel)

## 🎓 Prochaines Étapes

Maintenant que tout fonctionne:

1. **Lire la documentation complète**: README.md
2. **Guide admin**: ADMIN_GUIDE.md
3. **API endpoints**: API_DOCS.md
4. **Customiser** l'interface (couleurs, logo)
5. **Créer utilisateurs** pour votre équipe
6. **Faire première sauvegarde** des données

## 🔗 Ressources

| Ressource | URL |
|-----------|-----|
| Documentation | [README.md](README.md) |
| Guide Admin | [ADMIN_GUIDE.md](ADMIN_GUIDE.md) |
| API Docs | [API_DOCS.md](API_DOCS.md) |
| Issues | GitHub Issues |
| Discussions | GitHub Discussions |

## ✨ Tips Pro

✅ **Brancher un lecteur code-barres**: Fonctionnerait directement sur la recherche
✅ **Imprimer des tickets**: Configure l'imprimante dans ⚙️
✅ **Mode multi-caisse**: Plusieurs instances possible
✅ **Sync données**: Export/Import en JSON
✅ **Ajouter logo**: Image dans ⚙️ Paramètres

## 🚨 En Cas de Problème

Avant de signaler un bug, vérifier:

1. ✅ Node.js v16+ installé (`node -v`)
2. ✅ Tous les ports libres (5000, 3000)
3. ✅ Dépendances correctes (`npm install`)
4. ✅ Aucune erreur console (Outils développeur)
5. ✅ Dossier `data/` existe et accessible

**Signaler un bug:**
- Joindre logs console (F12)
- Décrire les étapes pour reproduire
- Spécifier version Node/npm

## ☕ Besoin d'aide?

- **Questions rapides**: GitHub Discussions
- **Bugs**: GitHub Issues
- **Email**: support@cocaisse.fr

---

**Bienvenue dans Co-Caisse! 🎉**

Vous êtes maintenant prêt à encaisser! 

Rendez-vous dans l'onglet 🛒 **Caisse** pour commencer.

Bon encaissement! 💰

---

*Dernière mise à jour: Février 2026*
*Version: 1.0.0*

