import type { RoleId } from '@street-smart/shared';

// Aturan akses space — pure, di-test tanpa DB.
// - Legacy (ownerId null, dibuat sebelum ownership): terlihat & bisa diedit
//   semua user aktif (perilaku lama dipertahankan, didokumentasikan).
// - Baru: PRIVATE = pemilik saja; ROLE = pemilik + role yang sama.
// - MANAGEMENT selalu bisa lihat & edit (kurasi lintas-domain + audit).

export interface SpaceRecord {
  id: string;
  ownerId: string | null;
  ownerRole: string;
  visibility: 'PRIVATE' | 'ROLE';
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface SpaceViewer {
  id: string;
  role: RoleId;
}

export function isLegacySpace(space: Pick<SpaceRecord, 'ownerId'>): boolean {
  return !space.ownerId;
}

export function canViewSpace(viewer: SpaceViewer | null | undefined, space: SpaceRecord): boolean {
  if (!viewer) return false;
  if (viewer.role === 'management') return true;
  if (isLegacySpace(space)) return true;
  if (space.ownerId === viewer.id) return true;
  if (space.visibility === 'ROLE' && space.ownerRole === viewer.role) return true;
  return false;
}

export function canEditSpace(viewer: SpaceViewer | null | undefined, space: SpaceRecord): boolean {
  if (!viewer) return false;
  if (viewer.role === 'management') return true;
  if (isLegacySpace(space)) return true;
  return space.ownerId === viewer.id;
}

/** Filter daftar space ke yang boleh dilihat viewer (management = semua). */
export function visibleSpaces<T extends SpaceRecord>(viewer: SpaceViewer | null | undefined, spaces: T[]): T[] {
  if (!viewer) return [];
  if (viewer.role === 'management') return spaces;
  return spaces.filter((s) => canViewSpace(viewer, s));
}
