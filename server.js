const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { Resend } = require('resend');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_laleme_key'; // In prod, use .env
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Database Setup
const db = new sqlite3.Database('./poop.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // 1. Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user', -- 'admin' or 'user'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Create Default Admin if empty
        db.get("SELECT count(*) as count FROM users", [], (err, row) => {
            if (row && row.count === 0) {
                const hash = bcrypt.hashSync('admin123', 10);
                db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
                    ['admin@laleme.com', hash, 'admin']);
                console.log("Default Admin created: admin@laleme.com / admin123");
            }
        });
    });
    // Migration: Add Verification Columns
    addColumnIfNotExists('users', 'is_verified', 'BOOLEAN DEFAULT 0');
    addColumnIfNotExists('users', 'verification_token', 'TEXT');
    // Migration: Add Invite Code ID tracking
    addColumnIfNotExists('users', 'invite_code_id', 'INTEGER');
}

// 2. Invites Table
db.run(`CREATE TABLE IF NOT EXISTS invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        created_by INTEGER,
        is_used BOOLEAN DEFAULT 0,
        used_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

// 3. Personas Table (Updated)
db.run(`CREATE TABLE IF NOT EXISTS personas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, -- FK to users
        nickname TEXT,
        dob TEXT,
        gender TEXT,
        baby_feeding TEXT,
        baby_stage TEXT,
        adult_health TEXT,
        adult_meds TEXT,
        avatar_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
    // Migration: Add user_id if missing
    addColumnIfNotExists('personas', 'user_id', 'INTEGER', () => {
        // Link orphan personas to Admin (ID 1)
        db.run("UPDATE personas SET user_id = 1 WHERE user_id IS NULL");
    });
    // Migration: Add avatar_path if missing
    addColumnIfNotExists('personas', 'avatar_path', 'TEXT');
});

// 4. Records Table
db.run(`CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        persona_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        image_path TEXT,
        stool_type INTEGER,
        color TEXT,
        note TEXT,
        effort INTEGER,
        sensation TEXT,
        symptoms TEXT,
        triggers TEXT,
        location_context TEXT,
        ai_analysis TEXT,
        health_score TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
    // Migration: Add health_score if missing
    addColumnIfNotExists('records', 'health_score', 'TEXT');
});

// 5. Trend Reports Table (Optimization Cache)
db.run(`CREATE TABLE IF NOT EXISTS trend_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        persona_id INTEGER,
        start_date TEXT,
        end_date TEXT,
        analysis_json TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (persona_id) REFERENCES personas(id)
    )`);

// 6. Analytics Events Table
db.run(`CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_type TEXT, -- 'ai_complete', 'upload_error', 'conversion'
        meta TEXT, -- JSON string for details
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

function addColumnIfNotExists(table, column, type, callback) {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
        if (err) return;
        const exists = rows.some(r => r.name === column);
        if (!exists) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
                if (!err) console.log(`Added column ${column} to ${table}`);
                if (callback) callback();
            });
        } else if (callback) {
            callback();
        }
    });
}

// --- AUTH MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Access denied. Admin only." });
    }
}


const { analyzeImage } = require('./ai_service');

// Configure Multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)) // Append extension
    }
});
const upload = multer({ storage: storage });

// API Routes

// 1. AUTH & ADMIN
app.post('/api/auth/register', async (req, res) => {
    const { email, password, inviteCode } = req.body;

    // 1. Check Invite Code (Must be valid and unused)
    db.get("SELECT * FROM invites WHERE code = ? AND is_used = 0", [inviteCode], async (err, invite) => {
        if (err) return res.status(500).json({ error: "DB Error" });
        if (!invite) return res.status(400).json({ error: "Invalid or expired invite code" });

        const passwordHash = await bcrypt.hash(password, 10);
        const verificationToken = uuidv4();
        const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify?token=${verificationToken}`;

        // 2. Check if user exists
        db.get("SELECT * FROM users WHERE email = ?", [email], (err, existingUser) => {
            if (err) return res.status(500).json({ error: "DB Error" });

            const sendVerificationEmail = () => {
                resend.emails.send({
                    from: 'onboarding@send.laleme.04010123.xyz',
                    to: email,
                    subject: 'Verify your Laleme Account',
                    html: `<p>Welcome to Laleme! <a href="${verifyUrl}">Click here to verify your email</a></p>`
                }).then(() => {
                    res.json({ message: "Verification email sent. Please check your inbox." });
                }).catch(e => {
                    console.error("Email failed", e);
                    res.json({ message: "Account setup, but email failed. Contact admin." });
                });
            };

            if (existingUser) {
                // Scenario A: User exists but NOT verified -> Resend / Update
                if (existingUser.is_verified === 0) {
                    db.run("UPDATE users SET password_hash = ?, verification_token = ?, invite_code_id = ? WHERE id = ?",
                        [passwordHash, verificationToken, invite.id, existingUser.id],
                        (err) => {
                            if (err) return res.status(500).json({ error: "Update failed" });
                            sendVerificationEmail();
                        });
                } else {
                    // Scenario B: User exists and Verified -> Error
                    return res.status(400).json({ error: "Email already registered" });
                }
            } else {
                // Scenario C: New User -> Create
                db.run("INSERT INTO users (email, password_hash, is_verified, verification_token, invite_code_id) VALUES (?, ?, 0, ?, ?)",
                    [email, passwordHash, verificationToken, invite.id], function (err) {
                        if (err) return res.status(400).json({ error: "Registration failed" });
                        sendVerificationEmail();
                    });
            }
        });
    });
});

app.get('/api/auth/verify', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Missing token");

    db.get("SELECT * FROM users WHERE verification_token = ?", [token], (err, user) => {
        if (err || !user) return res.status(400).send("Invalid or expired token");

        // Check if the invite code is STILL valid (race condition check)
        // If user has no invite_code_id (old users), skip this check
        const checkInvite = (cb) => {
            if (!user.invite_code_id) return cb(true);
            db.get("SELECT is_used FROM invites WHERE id = ?", [user.invite_code_id], (err, row) => {
                if (err || !row || row.is_used === 1) return cb(false);
                cb(true);
            });
        };

        checkInvite((isValid) => {
            if (!isValid) return res.status(400).send("Sorry, the invite code associated with this account has already been claimed.");

            // 1. Mark User Verified
            db.run("UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?", [user.id], (err) => {
                if (err) return res.status(500).send("DB Error during verification");

                // 2. Mark Invite Used (if applicable)
                if (user.invite_code_id) {
                    db.run("UPDATE invites SET is_used = 1, used_by = ? WHERE id = ?", [user.id, user.invite_code_id]);
                }

                res.redirect('/login.html?verified=true');
            });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: "User not found" });

        // Check Verification (Skip for admin if needed, but safer to enforce except manual overrides)
        // Admin user created in init script has is_verified=1 (implied default via logic updates or manual fix)
        // Actually, init script inserts (..., role) without is_verified.
        // Wait, schema default is 0.
        // I should insure ADMIN is verified.
        // But for regular users:
        if (user.is_verified === 0 && user.role !== 'admin') {
            return res.status(403).json({ error: "Please verify your email first." });
        }

        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
            res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
        } else {
            res.status(403).json({ error: "Invalid password" });
        }
    });
});

app.post('/api/events', authenticateToken, (req, res) => {
    const { event_type, meta } = req.body;
    db.run("INSERT INTO analytics_events (user_id, event_type, meta) VALUES (?, ?, ?)",
        [req.user.id, event_type, JSON.stringify(meta || {})],
        (err) => {
            if (err) return res.status(500).json({ error: "Log failed" });
            res.json({ message: "Logged" });
        });
});

app.post('/api/admin/invites', authenticateToken, isAdmin, (req, res) => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    db.run("INSERT INTO invites (code, created_by) VALUES (?, ?)", [code, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ code });
    });
});

app.get('/api/admin/invites', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT * FROM invites ORDER BY created_at DESC", [], (err, rows) => {
        res.json({ data: rows });
    });
});

app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    const getCount = (sql) => new Promise((resolve) => {
        db.get(sql, [], (err, row) => resolve(row ? row.count : 0));
    });
    const getVal = (sql) => new Promise((resolve) => {
        db.get(sql, [], (err, row) => resolve(row ? row.val : 0));
    });

    try {
        const [users, records, personas, invites, active_users, conversion, avg_ai_time, upload_errors] = await Promise.all([
            getCount("SELECT count(*) as count FROM users"),
            getCount("SELECT count(*) as count FROM records"),
            getCount("SELECT count(*) as count FROM personas"),
            getCount("SELECT count(*) as count FROM invites"),
            getCount("SELECT count(distinct user_id) as count FROM (SELECT p.user_id FROM records r JOIN personas p ON r.persona_id = p.id WHERE r.created_at > datetime('now', '-7 days'))"),
            // Conversion: Users who recorded within 24h
            getCount("SELECT count(distinct u.id) as count FROM users u JOIN personas p ON p.user_id = u.id JOIN records r ON r.persona_id = p.id WHERE r.created_at <= datetime(u.created_at, '+1 day')"),
            // Avg AI Time
            getVal("SELECT avg(json_extract(meta, '$.duration')) as val FROM analytics_events WHERE event_type = 'ai_complete'"),
            // Upload Errors
            getCount("SELECT count(*) as count FROM analytics_events WHERE event_type = 'upload_error'")
        ]);

        res.json({
            data: {
                users,
                records,
                personas,
                invites,
                active_users,
                conversion_rate: users > 0 ? Math.round((conversion / users) * 100) + '%' : '0%',
                avg_ai_time: avg_ai_time ? Math.round(avg_ai_time) + 'ms' : '-',
                upload_errors
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Stats failed" });
    }
});


// 2. PERSONAS (Protected & User-Isolated)
// Get All Personas
app.get('/api/personas', authenticateToken, (req, res) => {
    // Only return personas owned by this user
    db.all("SELECT * FROM personas WHERE user_id = ? ORDER BY created_at ASC", [req.user.id], (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });

        // Parse JSON fields
        const personas = rows.map(p => ({
            ...p,
            adult_health: p.adult_health ? JSON.parse(p.adult_health) : [],
            adult_meds: p.adult_meds ? JSON.parse(p.adult_meds) : []
        }));
        res.json({ data: personas });
    });
});

// Multer for Avatar
const uploadAvatar = multer({
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// 2. Create Persona
app.post('/api/personas', authenticateToken, uploadAvatar.single('avatar'), (req, res) => {
    const { nickname, dob, gender, baby_feeding, baby_stage, adult_health, adult_meds } = req.body;
    let avatarPath = null;

    if (!nickname || !dob) {
        // If file was uploaded, delete it since persona creation failed
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting uploaded file:", err);
            });
        }
        return res.status(400).json({ error: 'Nickname and Date of Birth are required' });
    }

    const finalizeCreation = (finalAvatarPath) => {
        const sql = `INSERT INTO personas (user_id, nickname, dob, gender, baby_feeding, baby_stage, adult_health, adult_meds, avatar_path) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.run(sql, [
            req.user.id,
            nickname,
            dob,
            gender || 'unknown',
            baby_feeding || null,
            baby_stage || null,
            JSON.stringify(adult_health || []),
            JSON.stringify(adult_meds || []),
            finalAvatarPath
        ], function (err) {
            if (err) {
                // If DB error, and avatar was uploaded, delete it
                if (finalAvatarPath) {
                    fs.unlink(path.resolve(__dirname, finalAvatarPath), (unlinkErr) => {
                        if (unlinkErr) console.error("Error deleting avatar on DB error:", unlinkErr);
                    });
                }
                return res.status(400).json({ error: err.message });
            }
            res.json({ message: 'Persona created', id: this.lastID, avatar_path: finalAvatarPath });
        });
    };

    if (req.file) {
        const fullPath = path.resolve(__dirname, req.file.path);
        const desiredPath = fullPath + '.jpg';
        const relativePath = 'uploads/' + path.basename(desiredPath);

        sharp(fullPath)
            .resize(256, 256, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toFile(desiredPath)
            .then(() => {
                fs.unlink(fullPath, () => { }); // Clean temp
                finalizeCreation(relativePath);
            })
            .catch(err => {
                console.error("Avatar compression failed", err);
                res.status(500).json({ error: "Avatar processing failed" });
            });
    } else {
        finalizeCreation(null);
    }
});

// 2.1 Update Persona (PUT)
app.put('/api/personas/:id', authenticateToken, uploadAvatar.single('avatar'), (req, res) => {
    const id = req.params.id;
    const { nickname, dob, gender, baby_feeding, baby_stage, adult_health, adult_meds } = req.body;

    db.get('SELECT * FROM personas WHERE id = ? AND user_id = ?', [id, req.user.id], (err, row) => {
        if (err || !row) {
            // If file was uploaded, delete it since persona not found or access denied
            if (req.file) {
                fs.unlink(req.file.path, (unlinkErr) => {
                    if (unlinkErr) console.error("Error deleting uploaded file:", unlinkErr);
                });
            }
            return res.status(403).json({ error: "Access denied or not found" });
        }

        const finalizeUpdate = (finalAvatarPath) => {
            const sql = `UPDATE personas SET nickname = ?, dob = ?, gender = ?, baby_feeding = ?, baby_stage = ?, 
                         adult_health = ?, adult_meds = ?, avatar_path = ? WHERE id = ?`;

            db.run(sql, [
                nickname || row.nickname,
                dob || row.dob,
                gender || row.gender,
                baby_feeding || row.baby_feeding,
                baby_stage || row.baby_stage,
                JSON.stringify(adult_health || JSON.parse(row.adult_health || '[]')),
                JSON.stringify(adult_meds || JSON.parse(row.adult_meds || '[]')),
                finalAvatarPath,
                id
            ], (err) => {
                if (err) {
                    // If DB error, and new avatar was uploaded, delete it
                    if (req.file && finalAvatarPath) {
                        fs.unlink(path.resolve(__dirname, finalAvatarPath), (unlinkErr) => {
                            if (unlinkErr) console.error("Error deleting new avatar on DB error:", unlinkErr);
                        });
                    }
                    return res.status(400).json({ error: err.message });
                }
                res.json({ message: 'Persona updated', avatar_path: finalAvatarPath });
            });
        };

        if (req.file) {
            // Delete old avatar if it exists
            if (row.avatar_path) {
                const oldAvatarFullPath = path.resolve(__dirname, row.avatar_path);
                fs.unlink(oldAvatarFullPath, (unlinkErr) => {
                    if (unlinkErr) console.warn("Could not delete old avatar:", unlinkErr);
                });
            }

            const fullPath = path.resolve(__dirname, req.file.path);
            const desiredPath = fullPath + '.jpg';
            const relativePath = 'uploads/' + path.basename(desiredPath);

            sharp(fullPath)
                .resize(256, 256, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toFile(desiredPath)
                .then(() => {
                    fs.unlink(fullPath, () => { });
                    finalizeUpdate(relativePath);
                })
                .catch(e => {
                    console.error("Avatar error", e);
                    res.status(500).json({ error: "Avatar processing failed" });
                });
        } else {
            finalizeUpdate(row.avatar_path);
        }
    });
});


// Delete Persona (Cascade)
app.delete('/api/personas/:id', authenticateToken, (req, res) => {
    const personaId = req.params.id;

    // Verify Ownership
    db.get("SELECT id FROM personas WHERE id = ? AND user_id = ?", [personaId, req.user.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied or persona not found" });

        // 1. Delete all records for this persona
        db.run("DELETE FROM records WHERE persona_id = ?", [personaId], function (err) {
            if (err) console.error("Error cleaning up records for persona", personaId);

            // 2. Delete the persona
            db.run("DELETE FROM personas WHERE id = ?", [personaId], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Persona and all associated records deleted' });
            });
        });
    });
});


// 3. RECORDS (Protected via Persona Ownership)
// Helper to verify user owns the persona
function verifyPersonaOwnership(userId, personaId, callback) {
    db.get("SELECT id FROM personas WHERE id = ? AND user_id = ?", [personaId, userId], (err, row) => {
        if (row) callback(true);
        else callback(false);
    });
}

// 1. Upload Record (Initial Step)
app.post('/api/records', authenticateToken, upload.single('photo'), (req, res) => {
    // Initial creation only needs image and basics
    const image_path = req.file ? req.file.path : null;
    const { stool_type, color, note, persona_id, local_timestamp } = req.body; // Added local_timestamp

    if (!image_path) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    // Use local_timestamp if provided, else let DB default
    let sql, params;
    if (local_timestamp) {
        sql = `INSERT INTO records (stool_type, color, note, image_path, persona_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
        params = [stool_type || 4, color || 'unknown', note || '', image_path, persona_id || null, local_timestamp];
    } else {
        sql = `INSERT INTO records (stool_type, color, note, image_path, persona_id) VALUES (?, ?, ?, ?, ?)`;
        params = [stool_type || 4, color || 'unknown', note || '', image_path, persona_id || null];
    }

    // COMPRESSION LOGIC
    if (image_path) {
        const fullPath = path.resolve(__dirname, image_path);
        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);
        const name = path.basename(fullPath, ext);
        const origPath = path.join(dir, `${name}_orig${ext}`);

        // Rename original to _orig
        fs.rename(fullPath, origPath, (err) => {
            if (err) {
                console.error("Failed to rename original file:", err);
                // If rename fails, we just keep using the original as is (no compression)
            } else {
                // Compress _orig -> original path
                sharp(origPath)
                    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }) // Max 1280px
                    .jpeg({ quality: 80, mozjpeg: true }) // Convert to JPEG/Compress
                    .toFile(fullPath)
                    .then(() => {
                        console.log(`Compressed ${image_path}`);
                    })
                    .catch(err => {
                        console.error("Compression failed:", err);
                        // Restore original if compression fails
                        fs.rename(origPath, fullPath, () => { });
                    });
            }
        });
    }

    db.run(sql, params, function (err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'Record created',
            data: { id: this.lastID, image_path }
        });
    });
});

// 2. Update Record details (Second Step)
app.put('/api/records/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { effort, sensation, symptoms, triggers, location_context } = req.body;

    // Verify ownership: Record -> Persona -> User
    const verifySql = `
        SELECT r.id 
        FROM records r 
        JOIN personas p ON r.persona_id = p.id 
        WHERE r.id = ? AND p.user_id = ?
    `;

    db.get(verifySql, [id, req.user.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied or record not found" });

        const sql = `UPDATE records SET 
            effort = ?, 
            sensation = ?, 
            symptoms = ?, 
            triggers = ?, 
            location_context = ?
            WHERE id = ?`;

        const params = [
            effort,
            sensation,
            JSON.stringify(symptoms || []),
            JSON.stringify(triggers || []),
            location_context,
            id
        ];

        db.run(sql, params, function (err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({
                message: 'Record updated',
                changes: this.changes
            });
        });
    });
});

// 2.5 Delete Record
app.delete('/api/records/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    // Verify ownership
    const verifySql = `
        SELECT r.id, r.image_path
        FROM records r 
        JOIN personas p ON r.persona_id = p.id 
        WHERE r.id = ? AND p.user_id = ?
    `;

    db.get(verifySql, [id, req.user.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied or record not found" });

        // Delete from DB
        db.run("DELETE FROM records WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: "DB Delete Failed" });

            // Try to delete file (Ignore access errors if already gone)
            try {
                if (row.image_path) {
                    const fullPath = path.resolve(__dirname, row.image_path);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
            } catch (fsErr) {
                console.warn("Failed to delete file:", fsErr.message);
            }

            res.json({ message: "Record deleted" });
        });
    });
});

// 3. Get History
app.get('/api/records', authenticateToken, (req, res) => {
    const { persona_id } = req.query;

    let sql = `
        SELECT r.* 
        FROM records r 
        JOIN personas p ON r.persona_id = p.id 
        WHERE p.user_id = ?
    `;
    const params = [req.user.id];

    if (persona_id) {
        sql += " AND r.persona_id = ?";
        params.push(persona_id);
    }

    sql += " ORDER BY r.created_at DESC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });

        const records = rows.map(r => ({
            ...r,
            symptoms: r.symptoms ? JSON.parse(r.symptoms) : [],
            triggers: r.triggers ? JSON.parse(r.triggers) : []
        }));

        res.json({
            message: 'Success',
            data: records
        });
    });
});

// 4. Analyze Image (AI)
app.post('/api/analyze', authenticateToken, async (req, res) => {
    const { image_path, context, lang } = req.body;
    if (!image_path) return res.status(400).json({ error: 'Image path required' });

    // Verify ownership via path
    const verifySql = `
        SELECT r.id 
        FROM records r 
        JOIN personas p ON r.persona_id = p.id 
        WHERE r.image_path = ? AND p.user_id = ?
    `;

    db.get(verifySql, [image_path, req.user.id], async (err, row) => {
        // We allow loose check for now for legacy records, but stricter is better
        // For now, if record exists, it must belong to user. 
        // Note: New uploads will have persona_id, so this join works. 
        // Orphans might fail this check, but migration fixes orphans.
        if (err) return res.status(500).json({ error: "DB Error" });
        if (!row) return res.status(403).json({ error: "Access denied to this record" });

        const fullPath = path.resolve(__dirname, image_path);

        // Check for _orig file for better analysis quality
        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);
        const name = path.basename(fullPath, ext);
        const origPath = path.join(dir, `${name}_orig${ext}`);

        // Use original if exists, otherwise fallback to compressed
        const analyzePath = fs.existsSync(origPath) ? origPath : fullPath;
        console.log(`Analyzing image: ${analyzePath} (Original available: ${analyzePath === origPath})`);

        const startTime = Date.now();

        try {
            const analysis = await analyzeImage(analyzePath, context, lang);
            const duration = Date.now() - startTime;

            // Log Analytics
            db.run("INSERT INTO analytics_events (user_id, event_type, meta) VALUES (?, ?, ?)",
                [req.user.id, 'ai_complete', JSON.stringify({ duration, success: true })]);

            // Extract Score & Bristol
            let healthScore = null;
            let bristolVal = null;
            try {
                const json = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
                healthScore = json.health_score || null;
                if (json.bristol && json.bristol.scale) bristolVal = json.bristol.scale;
            } catch (e) { console.warn("Failed to parse analysis for score", e); }

            // Dynamic Update Query
            let updateSql = `UPDATE records SET ai_analysis = ?, health_score = ?`;
            const updateParams = [typeof analysis === 'string' ? analysis : JSON.stringify(analysis), healthScore];

            if (bristolVal) {
                updateSql += `, stool_type = ?`;
                updateParams.push(bristolVal);
            }
            updateSql += ` WHERE image_path = ?`;
            updateParams.push(image_path);

            db.run(updateSql, updateParams, function (err) {
                if (err) console.error("Failed to update record with analysis", err);

                // Cleanup Original if successful
                if (!err && analyzePath === origPath) {
                    fs.unlink(origPath, (uErr) => {
                        if (uErr) console.warn("Failed to delete original file", uErr);
                        else console.log("Deleted original file after analysis");
                    });
                }
            });
            res.json({ analysis });
        } catch (err) {
            res.status(500).json({ error: "Analysis failed" });
        }
    });
});

// 5. Analyze Trends (Text-based with Caching)
app.post('/api/analyze/trends', authenticateToken, (req, res) => {
    const { startDate, endDate, persona_id, lang } = req.body;

    // Validate Dates
    if (!startDate || !endDate) return res.status(400).json({ error: "Date range required" });

    // 1. Verify Ownership of Persona
    db.get("SELECT id FROM personas WHERE id = ? AND user_id = ?", [persona_id, req.user.id], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied to this profile" });

        // Check Cache if period is fully in the past
        const todayStr = new Date().toISOString().split('T')[0];
        const isPast = endDate < todayStr;

        if (isPast) {
            db.get(`SELECT analysis_json FROM trend_reports WHERE persona_id=? AND start_date=? AND end_date=?`,
                [persona_id, startDate, endDate],
                (err, cacheRow) => {
                    if (cacheRow) {
                        try {
                            // Fetch logs to support Heatmap even for cached reports
                            fetchLogsAndProcess((logs, stats) => {
                                res.json({ logs, stats, analysis: JSON.parse(cacheRow.analysis_json), cached: true });
                            });
                        } catch (e) {
                            generateAndCache();
                        }
                    } else {
                        generateAndCache(); // Cache Miss
                    }
                }
            );
        } else {
            // Real-time (Active Period)
            // SKIP AI analysis for current/unfinished periods per user request
            fetchLogsAndProcess((logs, stats) => {
                res.json({
                    logs,
                    stats,
                    analysis: null,
                    reason: 'current_period',
                    message: "Analysis available after period ends"
                });
            });
        }

        function fetchLogsAndProcess(callback) {
            const sql = `
                SELECT created_at, stool_type, effort, symptoms, triggers, health_score, sensation, location_context, ai_analysis 
            FROM records 
                WHERE persona_id = ?
                AND created_at BETWEEN ? AND ?
                    ORDER BY created_at ASC
            `;

            // Add one day to endDate to include it fully
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            const endStr = end.toISOString().split('T')[0];

            db.all(sql, [persona_id, startDate, endStr], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });

                // Aggregate Data
                const logs = rows.map(r => {
                    let aiDetails = {};
                    try {
                        const json = r.ai_analysis ? (typeof r.ai_analysis === 'string' ? JSON.parse(r.ai_analysis) : r.ai_analysis) : {};
                        aiDetails = {
                            color: json.color?.primary,
                            texture: {
                                has_blood: json.texture?.has_blood,
                                has_mucus: json.texture?.has_mucus,
                                is_greasy: json.texture?.is_greasy
                            }
                        };
                    } catch (e) { }

                    return {
                        date: r.created_at.split('T')[0],
                        bristol: r.stool_type,
                        health_score: r.health_score,
                        effort: r.effort,
                        sensation: r.sensation, // New
                        context: r.location_context, // New
                        features: aiDetails, // New AI extraction
                        tags: [
                            ...(r.symptoms ? JSON.parse(r.symptoms) : []),
                            ...(r.triggers ? JSON.parse(r.triggers) : [])
                        ]
                    };
                });

                const total = logs.length;
                const avgBristol = total > 0 ? (logs.reduce((sum, r) => sum + (r.bristol || 0), 0) / total).toFixed(1) : 0;

                callback(logs, { total, avgBristol });
            });
        }

        function generateAndCache() {
            fetchLogsAndProcess(async (logs, stats) => {
                if (logs.length < 3) {
                    return res.json({
                        logs,
                        stats,
                        analysis: null,
                        reason: 'insufficient_data',
                        message: "Not enough data (min 3 logs)"
                    });
                }

                const payload = {
                    period: `${startDate} to ${endDate} `,
                    stats,
                    daily_logs: logs
                };

                // AI Call
                const { analyzeTrends } = require('./ai_service');
                try {
                    const result = await analyzeTrends(payload, lang);
                    const resultStr = JSON.stringify(result);

                    // Cache if Past
                    if (isPast) {
                        db.run(`INSERT INTO trend_reports(persona_id, start_date, end_date, analysis_json) VALUES(?, ?, ?, ?)`,
                            [persona_id, startDate, endDate, resultStr]);
                    }

                    res.json({ logs, stats, analysis: result, cached: false });
                } catch (aiErr) {
                    res.status(500).json({ error: "AI Analysis Failed" });
                }
            });
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
