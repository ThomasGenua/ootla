import { argon2id, hash, verify } from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
