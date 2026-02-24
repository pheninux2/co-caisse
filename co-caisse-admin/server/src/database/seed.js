/**
 * Co-Caisse Admin — Seed DB (licences de démonstration)
 * Usage : node src/database/seed.js
 */

import dotenv  from 'dotenv';
import { v4 as uuid }  from 'uuid';
import AdminDatabase   from './index.js';
import { generateLicenceKey } from '../services/licence.service.js';

dotenv.config();

async function seed() {
  console.log('\n🌱 Seed co-caisse-admin (cocaisse_admin)…\n');
  const db = new AdminDatabase();
  await db.initialize();

  const conn = await db.pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('DELETE FROM licence_events');
    await conn.query('DELETE FROM licences');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🗑️  Données supprimées\n');

    // ── Licences de démo ───────────────────────────────────────────────────
    const DEMO = [
      {
        clientName:  'Boulangerie Martin',
        clientEmail: 'contact@boulangerie-martin.fr',
        modules:     ['caisse', 'commandes', 'historique'],
        type:        'perpetual',
        expiresAt:   null,
        notes:       'Client de démo',
      },
      {
        clientName:  'Café Le Progres',
        clientEmail: 'leprogres@cafe.fr',
        modules:     ['caisse', 'cuisine', 'commandes', 'historique', 'statistiques'],
        type:        'subscription',
        expiresAt:   new Date(Date.now() + 365 * 86400000), // 1 an
        notes:       null,
      },
      {
        clientName:  'Snack Express',
        clientEmail: 'contact@snackexpress.fr',
        modules:     ['caisse'],
        type:        'trial',
        expiresAt:   new Date(Date.now() + 15 * 86400000),  // 15 jours restants
        notes:       'Essai en cours',
      },
    ];

    for (const d of DEMO) {
      const id  = uuid();
      const key = generateLicenceKey(d.clientName, d.modules, d.type);
      const mods = [...new Set(['caisse', ...d.modules])].sort();
      await conn.execute(
        `INSERT INTO licences (id, client_name, client_email, licence_key, type, status, modules, expires_at, notes)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, d.clientName, d.clientEmail, key, d.type, JSON.stringify(mods), d.expiresAt, d.notes]
      );
      await conn.execute(
        'INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
        [uuid(), id, 'generated', JSON.stringify({ modules: mods, type: d.type })]
      );
      console.log(`   ✅ ${d.clientName.padEnd(25)} → ${key}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✨  Seed terminé ! 3 licences de démo insérées.');
    console.log('═══════════════════════════════════════════════════\n');
  } finally {
    conn.release();
    await db.pool.end();
  }
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });

