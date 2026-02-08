# Co-Caisse v2.0 - Interface Ergonomique

## 🎨 Nouvelle Interface

L'application a été entièrement redessinée pour offrir une expérience utilisateur optimale :

### ✨ Caractéristiques principales

- **Interface centralisée** : Toutes les actions sur une seule page sans scroll
- **Design responsive** : S'adapte parfaitement du mobile au grand écran
- **Navigation par onglets** : Accès rapide à toutes les sections
- **Ergonomie tactile** : Boutons et zones cliquables optimisés
- **Mode plein écran** : Idéal pour les caisses enregistreuses

### 📱 Sections

1. **Caisse (POS)** - Interface principale de vente
   - Grille de produits responsive
   - Panier avec gestion des quantités
   - Calcul automatique TVA et rendu
   - Paiement espèces/carte
   
2. **Tableau de bord** - Vue synthétique des ventes
3. **Produits** - Gestion des produits et catégories
4. **Historique** - Consultation et export des transactions
5. **Paramètres** - Configuration et utilisateurs

## 🚀 Commandes

```bash
# Installation
npm install

# Développement
npm run dev          # Serveur API + Interface
npm run server       # Serveur API seul
npm run react-start  # Interface seule

# Build
npm run build-ui     # Compiler l'interface
npm run build        # Build complet

# Distribution Electron
npm run dist         # Créer installateur + portable
npm run dist:win     # Windows seulement
npm run dist:portable # Version portable seulement
```

## 📦 Packages générés

Les packages sont créés dans le dossier `release/` :
- `Co-Caisse-1.0.0-x64.exe` - Installateur Windows
- `Co-Caisse-Portable-1.0.0.exe` - Version portable

---

# Co-Caisse - Application de Gestion de Caisse

Application desktop complète et configurable pour la gestion de caisse enregistreuse, développée avec Electron, Express.js, Tailwind CSS et SQLite.

## 🎯 Fonctionnalités Principales

### 1. **Interface de Caisse Intuitive**
- 🛒 Panier intelligent avec gestion des quantités
- 📦 Affichage des produits par catégories
- 🔍 Recherche rapide par nom ou code-barres
- 🖼️ Support des images de produits
- 💡 Interface tactile optimisée

### 2. **Gestion Complète des Ventes**
- 💰 Calcul automatique de la TVA (configurable)
- 🏷️ Remises fixes ou en pourcentage
- 💳 Multiples moyens de paiement (Espèces, Carte, Chèque, Virement)
- 🔄 Gestion du rendu de monnaie
- 📋 Historique complet des transactions
- 🖨️ Impression de tickets de caisse

### 3. **Gestion des Produits**
- ➕ Création facile de nouveaux produits
- ✏️ Modification et suppression
- 📂 Organisation par catégories avec couleurs
- 🔢 Gestion du stock
- 💵 Gestion des prix avec TVA
- 📸 Support des images produits

### 4. **Gestion des Catégories**
- 🎨 Catégories personnalisables avec couleur
- 📝 Descriptions et images
- 🔀 Ordre d'affichage configurable
- ✅ Activation/Désactivation

### 5. **Système d'Utilisateurs & Sécurité**
- 👥 Gestion multi-profils (Admin, Manager, Caissier)
- 🔐 Contrôle d'accès basé sur les rôles
- 👤 Profils utilisateurs
- ✅ Activation/Désactivation des comptes

### 6. **Outils Intégrés**
- 🧮 Calculatrice intégrée
- 📊 Rapports et analytics
- 📈 Statistiques de ventes
- 📅 Filtrage par dates

### 7. **Rapports & Analyses**
- 📊 Rapport des ventes journalières
- 🔝 Top produits les plus vendus
- 💳 Répartition par moyen de paiement
- 📈 Analyser les tendances de vente

### 8. **Paramètres Configurables**
- 🏢 Informations entreprise
- 💬 En-tête et pied de page des tickets
- 🖨️ Configuration de l'imprimante
- 💱 Devise et TVA par défaut
- 🔧 Paramètres avancés

### 9. **Export/Import de Données**
- 📥 Export en JSON complet
- 📤 Import de données
- 💾 Sauvegarde portable
- 🔄 Synchronisation facile

### 10. **Base de Données Portable**
- 🗄️ SQLite pour stockage local
- 💻 Aucun serveur requis
- 🔓 Accès direct aux données
- 📱 Parfait pour le mode déconnecté

## 🛠️ Stack Technique

```
Frontend:
  - HTML5 + Vanilla JavaScript
  - Tailwind CSS (styling utilitaire)
  - Responsive design
  - Interface intuitive

Backend:
  - Express.js (API REST)
  - Node.js runtime
  - Middleware personnalisé
  
Database:
  - SQLite3 (portable)
  - Schemas complètes
  - Transactions ACID

Desktop:
  - Electron (application desktop)
  - Integration Electron-Express
  - Native printing
  
Utilities:
  - UUID pour IDs uniques
  - CORS enabled
  - Body-parser pour JSON/form data
```

## 📁 Structure du Projet

```
co-caisse/
├── main.js                           # Point d'entrée Electron
├── preload.js                        # Bridge Electron-App
├── package.json                      # Dépendances
├── webpack.config.js                 # Config Webpack
├── tailwind.config.js                # Config Tailwind
├── postcss.config.js                 # Config PostCSS
│
├── src/
│   ├── server/
│   │   ├── index.js                  # Server Express principal
│   │   ├── database/
│   │   │   └── index.js              # Gestion SQLite
│   │   ├── middleware/
│   │   │   └── auth.js               # Authentification
│   │   └── routes/
│   │       ├── products.js           # API Produits
│   │       ├── categories.js         # API Catégories
│   │       ├── transactions.js       # API Ventes
│   │       ├── users.js              # API Utilisateurs
│   │       └── reports.js            # API Rapports
│   │
│   └── ui/
│       ├── index.html                # Interface HTML
│       ├── app.js                    # Application JavaScript
│       └── styles/
│           └── main.css              # Styles CSS
│
└── data/
    └── cocaisse.db                   # Base de données SQLite
```

## 🚀 Installation & Démarrage

### Prérequis
- Node.js 16+ 
- npm ou yarn

### Installation

```bash
# Cloner le projet
git clone https://github.com/votre-repo/co-caisse.git
cd co-caisse

# Installer les dépendances
npm install

# Mode développement (serveur + interface)
npm run dev

# Build pour desktop
npm run build
```

### Variables d'Environnement

Créer un fichier `.env`:

```
REACT_APP_API_URL=http://localhost:5000/api
NODE_ENV=production
PORT=5000
```

## 📝 Guide d'Utilisation

### Démarrage Rapide

1. **Lancer l'application**
   ```bash
   npm start
   ```

2. **Configurer l'entreprise** (⚙️ Paramètres)
   - Remplir les informations
   - Configurer la TVA par défaut

3. **Créer les catégories** (🏷️)
   - Ajouter vos catégories de produits
   - Optionnel: ajouter images et couleurs

4. **Ajouter les produits** (📦)
   - Créer les produits de chaque catégorie
   - Définir les prix et stocks

5. **Commencer à encaisser** (🛒)
   - Cliquer sur les produits
   - Ajouter remise si nécessaire
   - Sélectionner moyen de paiement
   - Imprimer le ticket

### Gestion des Utilisateurs

- **Admin**: Accès total à l'application
- **Manager**: Gestion produits/catégories + rapports
- **Caissier**: Encaissement uniquement

## 🔐 Sécurité

- ✅ Validation des entrées
- ✅ Contrôle d'accès par rôle
- ✅ Contexte isolé Electron
- ✅ Pas d'accès direct au système

## 📊 Exemples de Rapports

- **Ventes du jour**: Montant total, nombre de transactions, TVA collectée
- **Par moyen de paiement**: Répartition Espèces/Carte/Chèque
- **Top produits**: Produits les plus vendus par chiffre d'affaires
- **Évolution**: Graphique des ventes sur la période

## 🔌 API Endpoints

### Produits
- `GET /api/products` - Tous les produits
- `POST /api/products` - Créer produit
- `PUT /api/products/:id` - Modifier
- `DELETE /api/products/:id` - Supprimer

### Catégories
- `GET /api/categories` - Toutes les catégories
- `POST /api/categories` - Créer catégorie
- `PUT /api/categories/:id` - Modifier
- `DELETE /api/categories/:id` - Supprimer

### Transactions (Ventes)
- `GET /api/transactions` - Historique
- `POST /api/transactions` - Nouvelle transaction
- `GET /api/transactions/summary/daily` - Résumé du jour

### Utilisateurs
- `GET /api/users` - Tous les utilisateurs
- `POST /api/users` - Créer utilisateur
- `PUT /api/users/:id` - Modifier
- `DELETE /api/users/:id` - Supprimer

### Rapports
- `GET /api/reports/sales/daily` - Ventes journalières
- `GET /api/reports/payments` - Répartition paiements
- `GET /api/reports/products` - Ventes produits

## 💾 Export/Import

### Exporter les données

1. Aller dans la section Paramètres
2. Cliquer sur **⬇️ Exporter**
3. Choisir le dossier de destination
4. Fichier JSON créé avec horodatage

### Importer les données

1. Aller dans la section Paramètres
2. Cliquer sur **⬆️ Importer**
3. Sélectionner un fichier JSON valide
4. Les données sont fusionnées

## 🎨 Personnalisation

### Modifier les couleurs

Éditer `src/ui/styles/main.css`:

```css
:root {
  --primary: #2563eb;      /* Couleur principale */
  --primary-dark: #1e40af; /* Couleur foncée */
  --success: #16a34a;      /* Succès */
  --danger: #dc2626;       /* Danger */
}
```

### Modifier le layout

Le design utilise Tailwind CSS, éditable directement dans `index.html`.

## 🐛 Dépannage

**L'application ne démarre pas?**
- Vérifier que Node.js est installé: `node -v`
- Réinstaller les dépendances: `npm install`
- Supprimer `node_modules` et `.npm-cache`

**La base de données ne se crée pas?**
- Vérifier que le dossier `data/` existe
- Vérifier les permissions de fichier
- Supprimer `cocaisse.db` et relancer

**Les transactions ne s'enregistrent pas?**
- Vérifier que l'API tourne: `npm run server`
- Vérifier la connexion à la BD
- Consulter les logs de la console

## 📈 Améliorations Futures

- [ ] Authentification JWT robuste
- [ ] Support du lecteur code-barres
- [ ] Synchronisation cloud
- [ ] Application mobile React Native
- [ ] Intégration comptabilité
- [ ] Graphiques avancés (Chart.js)
- [ ] Multi-devises
- [ ] Fidélité clients
- [ ] Gestion promotion/coupon
- [ ] Configuration caisse enregistreuse

## 📄 Licence

MIT - Libre d'utilisation et modification

## 👨‍💼 Support

Pour les questions ou bugs:
- 📧 Email: support@cocaisse.fr
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

## 📚 Ressources

- [Electron Docs](https://www.electronjs.org/docs)
- [Express.js Guide](https://expressjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

---

**Version**: 1.0.0  
**Dernière mise à jour**: Février 2026  
**Développé avec ❤️ pour les commerçants**

