#!/usr/bin/env node

/**
 * Co-Caisse Setup & Startup Script
 * Lance l'application avec les vérifications initiales
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, total, message) {
  log(`\n[${step}/${total}] ${message}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function checkDirectory() {
  logStep(1, 5, 'Vérification du répertoire');

  const requiredDirs = [
    'client',
    'client/src/renderer',
    'server',
    'server/src/routes',
    'server/src/services',
  ];

  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      logWarning(`Le répertoire ${dir} n'existe pas`);
    }
  }

  logSuccess('Structure de répertoires vérifiée');
}

async function checkNodeModules() {
  logStep(2, 5, 'Vérification des dépendances');

  if (!fs.existsSync('node_modules')) {
    logWarning('node_modules n\'existe pas, installation nécessaire');

    log('Installation des dépendances en cours...', 'yellow');

    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        stdio: 'inherit',
        shell: true
      });

      npm.on('close', (code) => {
        if (code === 0) {
          logSuccess('Dépendances installées');
          resolve();
        } else {
          logError('Erreur lors de l\'installation des dépendances');
          reject(new Error('npm install failed'));
        }
      });
    });
  } else {
    logSuccess('Dépendances trouvées');
  }
}

async function checkDatabase() {
  logStep(3, 5, 'Vérification de la base de données');

  if (!fs.existsSync('data')) {
    log('Création du dossier data...', 'yellow');
    fs.mkdirSync('data', { recursive: true });
  }

  if (!fs.existsSync('data/cocaisse.db')) {
    logWarning('Base de données n\'existe pas, elle sera créée au démarrage');
  } else {
    const stats = fs.statSync('data/cocaisse.db');
    logSuccess(`Base de données trouvée (${(stats.size / 1024).toFixed(2)} KB)`);
  }
}

async function checkEnvironment() {
  logStep(4, 5, 'Vérification de l\'environnement');

  if (!fs.existsSync('.env')) {
    log('Création du fichier .env...', 'yellow');
    const envContent = `NODE_ENV=development
PORT=5000
REACT_APP_API_URL=http://localhost:5000/api
DB_PATH=./data/cocaisse.db
SERVER_HOST=localhost
SERVER_PORT=5000
ELECTRON_DEV=true
ENABLE_PRINTER=true
`;
    fs.writeFileSync('.env', envContent);
    logSuccess('Fichier .env créé');
  } else {
    logSuccess('Fichier .env trouvé');
  }
}

function displayBanner() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║           🎉 BIENVENUE DANS CO-CAISSE 🎉          ║
║                                                   ║
║          Application de Gestion de Caisse        ║
║              Version 1.0.0 - 2026                ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
}

function displayOptions() {
  logStep(5, 5, 'Sélection du mode');

  console.log(`
Choisissez comment démarrer l'application:

  1️⃣  Mode développement complet (renderer + Electron)
      └─ Commande: npm run dev

  2️⃣  Serveur Express uniquement (API port 5000)
      └─ Commande: npm start --prefix server

  3️⃣  Renderer uniquement (webpack dev server port 3000)
      └─ Commande: npm run renderer

  4️⃣  Build production renderer
      └─ Commande: npm run build-renderer

  5️⃣  Mode Electron standalone (après build)
      └─ Commande: npm start

`);
}

function displayQuickStart() {
  log('\n📚 GUIDE RAPIDE DÉMARRAGE:\n', 'bold');

  console.log(`
1. LANCER L'APPLICATION
   npm run dev

2. ACCÉDER À L'INTERFACE
   - Electron s'ouvre automatiquement
   - Ou web: http://localhost:3000

3. DONNÉES DE TEST
   npm run seed

   Utilisateurs:
   ├─ admin / admin123
   ├─ manager / manager123
   ├─ cashier1 / cashier123
   └─ cashier2 / cashier123

4. PREMIERS PAS
   ├─ ⚙️  Paramètres: configurer entreprise
   ├─ 🏷️  Catégories: créer catégories
   ├─ 📦 Produits: ajouter produits
   └─ 🛒 Caisse: encaisser!

5. DOCUMENTATION
   ├─ README.md          (Complète - 20 min)
   ├─ QUICKSTART.md      (Rapide - 5 min)
   ├─ ADMIN_GUIDE.md     (Administration - 30 min)
   ├─ API_DOCS.md        (API REST - 40 min)
   └─ TROUBLESHOOTING.md (Problèmes - au besoin)

6. DÉPANNAGE
   Si ça ne marche pas:
   → Consulter TROUBLESHOOTING.md
   → Vérifier les logs console (F12)
   → Vérifier que port 5000 est libre

✨ VOUS ÊTES PRÊT! Lancez: npm run dev
  `);
}

async function main() {
  console.clear();
  displayBanner();

  try {
    await checkDirectory();
    await checkNodeModules();
    await checkDatabase();
    await checkEnvironment();
    displayOptions();
    displayQuickStart();

    log('\n' + '='.repeat(55), 'green');
    log('✅ VÉRIFICATIONS COMPLÈTES - APPLICATION PRÊTE', 'green');
    log('='.repeat(55) + '\n', 'green');

    log('Lancez l\'application avec:\n', 'bold');
    log('  npm run dev', 'blue');
    log('\nPuis consultez QUICKSTART.md pour plus d\'infos.\n', 'blue');

  } catch (error) {
    log('\n' + '='.repeat(55), 'red');
    logError('UNE ERREUR S\'EST PRODUITE');
    log('='.repeat(55) + '\n', 'red');
    logError(error.message);
    log('\nConsultez TROUBLESHOOTING.md pour aide\n', 'yellow');
    process.exit(1);
  }
}

// Exécuter
main();

