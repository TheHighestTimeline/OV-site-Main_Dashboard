// Shared Google Drive client. Mirrors the pattern in _gmail.js so the COO
// evidence layer reuses the existing multi-account OAuth flow rather than
// introducing a second one.
//
// Scope note: `drive.metadata.readonly` is ALREADY in REQUESTED_SCOPES in
// _google.js and is sufficient for files.list and permissions.list. No scope
// change and no re-consent is required for the permission detector.
import { google } from 'googleapis';
import { getActiveGoogleClient } from './_google.js';

export async function getDrive(userId) {
  const { oauth2Client } = await getActiveGoogleClient(userId);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * List every permission on a Drive file or folder.
 * Returns [{ id, type, role, emailAddress, displayName, pendingOwner }]
 *
 * Shared drives need supportsAllDrives. Harmless on My Drive, so always on.
 */
export async function listPermissions(drive, fileId) {
  const out = [];
  let pageToken;
  do {
    const { data } = await drive.permissions.list({
      fileId,
      fields: 'nextPageToken, permissions(id,type,role,emailAddress,displayName,deleted)',
      pageSize: 100,
      supportsAllDrives: true,
      pageToken,
    });
    for (const p of data.permissions || []) {
      if (p.deleted) continue;
      out.push({
        id:           p.id,
        type:         p.type,                                    // user | group | domain | anyone
        role:         p.role,                                    // owner | writer | commenter | reader
        emailAddress: (p.emailAddress || '').toLowerCase(),
        displayName:  p.displayName || '',
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

/** Metadata for one file or folder. Null when missing or inaccessible. */
export async function getFileMeta(drive, fileId) {
  try {
    const { data } = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,webViewLink,modifiedTime,parents',
      supportsAllDrives: true,
    });
    return data;
  } catch (e) {
    console.error('[_drive] getFileMeta failed for', fileId, e?.message || String(e));
    return null;
  }
}

/** Files inside a folder, newest first. */
export async function listFolderFiles(drive, folderId, { since } = {}) {
  const clauses = [`'${folderId}' in parents`, 'trashed = false'];
  if (since) clauses.push(`modifiedTime > '${new Date(since).toISOString()}'`);

  const out = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: clauses.join(' and '),
      fields: 'nextPageToken, files(id,name,mimeType,webViewLink,modifiedTime,createdTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    out.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}
