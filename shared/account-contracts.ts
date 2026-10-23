import { z } from 'zod';
import type { AuthUser } from './contracts.js';

const cleanText = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use plain text without control characters.');
const optionalText = (max: number) => cleanText(max).nullable().transform(value => value || null);
const version = z.number().int().min(1).max(2_147_483_646);

export const accountProfileUpdateSchema = z.object({
  version,
  displayName: cleanText(200).min(1),
  phone: optionalText(40),
  jobTitle: optionalText(120),
}).strict();
export type AccountProfileUpdate = z.infer<typeof accountProfileUpdateSchema>;

export const accountPreferencesUpdateSchema = z.object({
  version,
  defaultPage: z.enum(['/admin', '/admin/leads', '/admin/tasks']),
  leadView: z.enum(['list', 'board']),
  motion: z.enum(['system', 'reduce']),
}).strict();
export type AccountPreferencesUpdate = z.infer<typeof accountPreferencesUpdateSchema>;
export const defaultAccountPreferences = {
  defaultPage: '/admin' as const,
  leadView: 'list' as const,
  motion: 'system' as const,
};

export const accountPasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12).max(128).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use a password without control characters.'),
  confirmPassword: z.string().max(128),
}).strict().refine(value => value.newPassword === value.confirmPassword, {
  path: ['confirmPassword'], message: 'The new passwords must match.',
}).refine(value => value.newPassword !== value.currentPassword, {
  path: ['newPassword'], message: 'Choose a different password.',
});
export type AccountPasswordUpdate = z.infer<typeof accountPasswordUpdateSchema>;

export interface AccountProfile {
  id: string;
  membershipId: string;
  displayName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  organization: AuthUser['organization'];
  version: number;
  updatedAt: string;
}
export interface AccountPreferences {
  defaultPage: '/admin' | '/admin/leads' | '/admin/tasks';
  leadView: 'list' | 'board';
  motion: 'system' | 'reduce';
  version: number;
  updatedAt: string | null;
}
export interface AccountSnapshot {
  profile: AccountProfile;
  preferences: AccountPreferences;
  access: {
    canChangePassword: boolean;
    passwordChangeNotice: string | null;
  };
}
