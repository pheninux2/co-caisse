/**
 * Co-Caisse Admin — Service Licence (HMAC-SHA256)
 * Génère et valide les clés format CCZ-XXXX-XXXX-XXXX
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SECRET = process.env.LICENCE_SECRET || 'c0c41ss3_L1c3nc3_S3cr3t_K3y_2026';

export const AVAILABLE_MODULES = ['caisse', 'cuisine', 'commandes', 'historique', 'statistiques', 'gestion'];

// Génère CCZ-XXXX-XXXX-XXXX signé HMAC
export function generateLicenceKey(clientName, modules, type) {
  const payload = `${clientName.toLowerCase().replace(/\s+/g, '_')}:${[...modules].sort().join(',')}:${type}:${Date.now()}`;
  const hmac    = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const seg1    = hmac.slice(0,  4).toUpperCase();
  const seg2    = hmac.slice(4,  8).toUpperCase();
  const seg3    = hmac.slice(8, 12).toUpperCase();
  return `CCZ-${seg1}-${seg2}-${seg3}`;
}

// Vérifie qu'une licence n'est pas expirée
export function isExpired(licence) {
  if (licence.status === 'suspended') return false; // suspendu ≠ expiré
  const expiry = licence.expires_at || licence.trial_end;
  if (!expiry) return false; // perpétuel
  return new Date(expiry) < new Date();
}

