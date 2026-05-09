import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { Readable } from 'stream';

import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Global Middlewares ---
app.use(cors({
  origin: true, // Allow all origins for now in dev
  credentials: true
}));
app.use(cookieParser());
app.set("trust proxy", 1);
app.use(session({
  name: 'cloudsync.sid',
  secret: 'todo-app-secret-12345',
  resave: true,
  saveUninitialized: true,
  proxy: true,
  cookie: {
    secure: true, 
    sameSite: 'none',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 
  }
}));

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`[API-CHECK] ${req.method} ${req.path}`);
  }
  next();
});

// --- API Router / Routes ---

// Important: Define upload route BEFORE generic body-parsings
app.all("/api/upload", (req, res, next) => {
  console.log(`[Upload-DEBUG] ${req.method} request to /api/upload from ${req.ip}`);
  if (req.method === 'GET') {
    return res.json({ message: "Upload endpoint is active. Use POST to upload files." });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Hanya metode POST yang diizinkan untuk upload" });
  }

  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error("[Upload] Multer error:", err);
      return res.status(400).json({ error: "Gagal memproses file upload", details: err.message });
    }
    next();
  });
}, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let tokens;
  try {
    tokens = getTokensFromHeader(req);
  } catch (e: any) {
    return res.status(401).json({ error: "Otentikasi tidak valid." });
  }
  if (!tokens || !req.file) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    const drive = await getDriveClient(tokens);
    const folderId = await getOrCreatePhotosFolder(drive);
    const fileMetadata = {
      name: `todo_${Date.now()}_${req.file.originalname}`,
      parents: [folderId],
    };
    const media = {
      mimeType: req.file.mimetype,
      body: Readable.from(req.file.buffer),
    };
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id'
    });
    const fileId = file.data.id;
    const downloadUrl = `https://drive.google.com/uc?id=${fileId}`;
    try {
      await drive.permissions.create({
        fileId: fileId!,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    } catch (permErr: any) {}
    return res.json({ id: fileId, url: downloadUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.use(express.json());

// Export app for Vercel
export default app;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

const REDIRECT_URI = `${APP_URL}/auth/callback`;

if (!GOOGLE_CLIENT_ID) {
  console.warn("[AUTH] GOOGLE_CLIENT_ID is missing from environment variables.");
}

const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
};

const oauth2Client = getOAuth2Client();

// --- Google Drive/Sheets Helpers ---

async function getDriveClient(tokens: any) {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials(tokens);
  return google.drive({ version: 'v3', auth });
}

async function getSheetsClient(tokens: any) {
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials(tokens);
  return google.sheets({ version: 'v4', auth });
}

async function getOrCreatePhotosFolder(drive: any) {
  const response = await drive.files.list({
    q: "name = 'My 2Dolist Photos' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const fileMetadata = {
    name: 'My 2Dolist Photos',
    mimeType: 'application/vnd.google-apps.folder',
  };

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return folder.data.id;
}

async function getOrCreateSpreadsheet(sheets: any) {
  const drive = google.drive({ version: 'v3', auth: sheets.context._options.auth });
  const response = await drive.files.list({
    q: "name = 'CloudSync Todo List' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const resource = {
    properties: {
      title: 'CloudSync Todo List',
    },
  };
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: resource,
    fields: 'spreadsheetId',
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:I1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [['ID', 'Title', 'Priority', 'Deadline', 'Description', 'Status', 'Photo URL', 'History', 'Author Name']],
    },
  });

  return spreadsheetId;
}

app.get("/api/debug/routes", (req, res) => {
  const routes: any[] = [];
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json({ routes });
});

app.get("/api/debug/config", (req, res) => {
  res.json({
    hasClientId: !!GOOGLE_CLIENT_ID,
    hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    clientIdStart: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 10) + "..." : "MISSING",
    redirectUri: REDIRECT_URI,
    nodeEnv: process.env.NODE_ENV,
    appUrl: APP_URL
  });
});

app.get("/api/auth/url", (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Client ID atau Secret belum dikonfigurasi di Secrets panel." });
  }
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ],
    prompt: 'consent select_account'
  });
  res.json({ url, redirectUri: REDIRECT_URI });
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    console.error("OAuth Error from Google:", error);
    return res.status(403).send(`Authentication failed: ${error}`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    res.send(`
      <html>
        <body>
          <script>
            const tokens = ${JSON.stringify(tokens)};
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_TOKEN_RECEIVED', tokens: tokens }, '*');
              window.close();
            } else {
              localStorage.setItem('google_tokens', JSON.stringify(tokens));
              window.location.href = '/';
            }
          </script>
          <p>Autentikasi Berhasil! Jendela ini akan tertutup otomatis...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Auth Exception:", error);
    res.status(500).send("Gagal menukar kode autentikasi dengan token.");
  }
});

const getTokensFromHeader = (req: any) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const tokenStr = authHeader.substring(7);
      if (!tokenStr || tokenStr === 'undefined' || tokenStr === 'null') return null;
      return JSON.parse(tokenStr);
    }
  } catch (e) {
    console.error("Error parsing tokens from header:", e);
  }
  return req.session ? req.session.tokens : null;
};

app.get("/api/auth/me", async (req, res) => {
  const tokens = getTokensFromHeader(req);
  if (tokens) {
    try {
      const oauth2ClientInner = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      oauth2ClientInner.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2ClientInner });
      const userInfo = await oauth2.userinfo.get();
      res.json({ authenticated: true, user: userInfo.data });
    } catch (e) {
      res.json({ authenticated: false });
    }
  } else {
    res.json({ authenticated: false });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie('cloudsync.sid');
  if (req.session) {
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.get("/api/tasks", async (req, res) => {
  const tokens = getTokensFromHeader(req);
  const { spreadsheetId: customId } = req.query;

  if (!tokens && !customId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let sheets;
    let spreadsheetId: string;

    if (tokens) {
      sheets = await getSheetsClient(tokens);
      spreadsheetId = (customId as string) || await getOrCreateSpreadsheet(sheets);
    } else {
      // Jika hanya ada customId tanpa token, kita butuh cara untuk auth. 
      // Untuk kemudahan, kita asumsikan viewer tetap login (authenticatedFetch akan mengirim token viewer).
      // Jika viewer punya akses ke sheet tersebut, Google API akan mengizinkannya.
      return res.status(401).json({ error: "Silakan login untuk melihat daftar tugas ini." });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:I',
    });

    const rows = response.data.values || [];
    const tasks = rows.map((row: any) => ({
      id: row[0],
      title: row[1] || '',
      priority: row[2] || 'Medium',
      deadline: row[3] || '',
      description: row[4] || '',
      status: row[5] || 'Belum Dikerjakan',
      photoUrl: row[6] || '',
      history: row[7] ? JSON.parse(row[7]) : [],
      authorName: row[8] || '',
    }));

    res.json({ tasks, spreadsheetId });
  } catch (error: any) {
    console.error("Fetch tasks error:", error);
    res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  const tokens = getTokensFromHeader(req);
  if (!tokens) return res.status(401).json({ error: "Unauthorized" });

  const { title, priority, deadline, description, status, photoUrl, authorName } = req.body;
  const id = uuidv4();
  const history = [{
    timestamp: new Date().toISOString(),
    status: status || 'Belum Dikerjakan',
    photoUrl: photoUrl || '',
    note: 'Pekerjaan dibuat'
  }];

  try {
    const sheets = await getSheetsClient(tokens);
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          id, 
          title, 
          priority, 
          deadline, 
          description, 
          status || 'Belum Dikerjakan', 
          photoUrl || '', 
          JSON.stringify(history),
          authorName || ''
        ]],
      },
    });

    res.json({ id, title, priority, deadline, description, status: status || 'Belum Dikerjakan', photoUrl, history, authorName });
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  const tokens = getTokensFromHeader(req);
  if (!tokens) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { title, priority, deadline, description, status, photoUrl, updateNote, updaterName } = req.body;

  try {
    const sheets = await getSheetsClient(tokens);
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:I',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any) => row[0] === id);

    if (rowIndex === -1) return res.status(404).json({ error: "Task not found" });

    const existingRow = rows[rowIndex];
    const existingHistory = existingRow[7] ? JSON.parse(existingRow[7]) : [];
    const authorName = existingRow[8] || '';
    
    // Log history if status or photo changed OR if it's an explicit update
    let newHistory = existingHistory;
    if (status !== existingRow[5] || photoUrl !== existingRow[6] || updateNote) {
      newHistory.push({
        timestamp: new Date().toISOString(),
        status,
        photoUrl,
        note: updateNote || (status !== existingRow[5] ? `Status diubah ke: ${status}` : 'Foto baru diunggah'),
        updaterName: updaterName || ''
      });
    }

    const visualRowIndex = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${visualRowIndex}:I${visualRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          id, 
          title, 
          priority, 
          deadline, 
          description, 
          status, 
          photoUrl, 
          JSON.stringify(newHistory),
          authorName
        ]],
      },
    });

    res.json({ 
      id, 
      title, 
      priority, 
      deadline, 
      description, 
      status, 
      photoUrl, 
      history: newHistory,
      authorName
    });
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  const tokens = getTokensFromHeader(req);
  if (!tokens) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;

  try {
    const sheets = await getSheetsClient(tokens);
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    
    // Get spreadsheet info to find the sheetId for 'Sheet1'
    const spreadsheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const sheet = spreadsheetMetadata.data.sheets?.find(s => s.properties?.title === 'Sheet1');
    const sheetId = sheet?.properties?.sheetId || 0;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any) => row[0] === id);

    if (rowIndex === -1) return res.status(404).json({ error: "Task not found" });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// JSON Error Handlers for API
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((err: any, req: any, res: any, next: any) => {
  if (req.path.startsWith("/api/")) {
    console.error("API Error:", err);
    return res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  next(err);
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only listen if not running as a Vercel serverless function
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }
}

startServer();
