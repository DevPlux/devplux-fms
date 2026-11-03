import fs from 'fs';
import path from 'path';

export interface StoredProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  updated_at: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

export function getLocalProfiles(): Record<string, StoredProfile> {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
      return JSON.parse(raw) || {};
    }
  } catch {}
  return {};
}

export function getLocalProfileByIdOrEmail(id?: string, email?: string): StoredProfile | null {
  try {
    const profiles = getLocalProfiles();
    if (email && profiles[email.toLowerCase().trim()]) {
      return profiles[email.toLowerCase().trim()];
    }
    if (id && profiles[id]) {
      return profiles[id];
    }
  } catch {}
  return null;
}

export function saveLocalProfile(profile: StoredProfile): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = getLocalProfiles();
    const emailKey = (profile.email || '').toLowerCase().trim();
    if (emailKey) {
      current[emailKey] = profile;
    }
    if (profile.id) {
      current[profile.id] = profile;
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice saving local profile:', err);
  }
}

