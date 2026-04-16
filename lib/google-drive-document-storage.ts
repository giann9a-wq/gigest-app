const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleDriveFileResponse = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variabile ambiente ${name} mancante`);
  }
  return value;
}

function escapeDriveQueryValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function sanitizeDriveName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "Senza nome";
}

export async function getGoogleDriveAccessToken() {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
      refresh_token: requireEnv("GOOGLE_DRIVE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Access token Google Drive non ottenuto");
  }

  return data.access_token;
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function findFolder(accessToken: string, name: string, parentId?: string) {
  const queryParts = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${escapeDriveQueryValue(name)}'`,
  ];

  if (parentId) {
    queryParts.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
  }

  const url = new URL(`${GOOGLE_DRIVE_API_URL}/files`);
  url.searchParams.set("q", queryParts.join(" and "));
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "1");

  const response = await driveFetch(accessToken, url.toString());
  const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };

  if (!response.ok) {
    throw new Error("Ricerca cartella Google Drive fallita");
  }

  return data.files?.[0]?.id ?? null;
}

async function createFolder(accessToken: string, name: string, parentId?: string) {
  const response = await driveFetch(accessToken, `${GOOGLE_DRIVE_API_URL}/files?fields=id,name`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  const data = (await response.json()) as { id?: string; name?: string };

  if (!response.ok || !data.id) {
    throw new Error("Creazione cartella Google Drive fallita");
  }

  return data.id;
}

async function ensureFolder(accessToken: string, name: string, parentId?: string) {
  return (await findFolder(accessToken, name, parentId)) ?? createFolder(accessToken, name, parentId);
}

export async function ensureDeliveryNoteFolder(input: {
  jobOrderName: string;
  supplier: string;
  usageDate: Date;
}) {
  const accessToken = await getGoogleDriveAccessToken();
  const configuredRootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";
  const rootId =
    configuredRootId ||
    (await ensureFolder(accessToken, sanitizeDriveName(process.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME || "GiGEST Documentale")));
  const documentTypeId = await ensureFolder(accessToken, "Bolle di Cantiere", rootId);
  const jobOrderId = await ensureFolder(accessToken, sanitizeDriveName(input.jobOrderName), documentTypeId);
  const year = String(input.usageDate.getUTCFullYear());
  const yearId = await ensureFolder(accessToken, year, jobOrderId);

  return ensureFolder(accessToken, sanitizeDriveName(input.supplier), yearId);
}

export async function uploadDeliveryNoteDocumentToDrive(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  folderId: string;
}) {
  const accessToken = await getGoogleDriveAccessToken();
  const boundary = `gigest_${crypto.randomUUID()}`;
  const metadata = {
    name: sanitizeDriveName(input.fileName),
    parents: [input.folderId],
  };
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const multipartBody = Buffer.concat([
    Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n${delimiter}Content-Type: ${input.mimeType}\r\n\r\n`
    ),
    input.buffer,
    Buffer.from(closeDelimiter),
  ]);

  const response = await driveFetch(
    accessToken,
    `${GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,size`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  const data = (await response.json()) as GoogleDriveFileResponse;

  if (!response.ok || !data.id) {
    throw new Error("Upload documento su Google Drive fallito");
  }

  return {
    driveFileId: data.id,
    fileName: data.name ?? input.fileName,
    mimeType: data.mimeType ?? input.mimeType,
    sizeBytes: data.size ? Number(data.size) : input.buffer.length,
  };
}

export async function downloadDriveFile(driveFileId: string) {
  const accessToken = await getGoogleDriveAccessToken();
  const response = await driveFetch(
    accessToken,
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(driveFileId)}?alt=media`
  );

  if (!response.ok) {
    throw new Error("Download documento da Google Drive fallito");
  }

  return Buffer.from(await response.arrayBuffer());
}
