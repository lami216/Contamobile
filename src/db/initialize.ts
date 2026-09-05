import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './database';
import { ensureAuthSchema } from '@/auth/service';

export async function initializeDatabase(db: SQLiteDatabase) {
  await migrateDatabase(db);
  await ensureAuthSchema(db);
}
