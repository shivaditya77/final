require("dotenv").config();

// Global Error Handlers for Vercel Debugging
process.on('uncaughtException', (err) => {
    console.error('🔥 CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRITICAL UNHANDLED REJECTION:', reason);
});

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

// Models
const Journal = require("./models/Journal");
const Question = require("./models/Question");
const Message = require("./models/Message");

const app = express();

// ========== VERCEL DEBUGGING & ENV VALIDATION ==========
const requiredEnvs = [
    'MONGODB_URI', 'SESSION_SECRET', 'PUSHER_APP_ID', 
    'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'
];

requiredEnvs.forEach(env => {
    if (!process.env[env]) {
        console.warn(`⚠️ WARNING: Environment variable ${env} is missing!`);
    }
});

// Health check endpoint for Vercel monitoring
app.get("/api/health", (req, res) => {
    const viewsPath = path.join(__dirname, "views");
    const publicPath = path.join(__dirname, "public");
    
    res.json({ 
        status: "alive", 
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        env: process.env.NODE_ENV || "development",
        filesystem: {
            viewsExists: fs.existsSync(viewsPath),
            publicExists: fs.existsSync(publicPath),
            dirname: __dirname,
            filesInDir: fs.readdirSync(__dirname).slice(0, 10)
        }
    });
});

// Pusher Configuration
const Pusher = require("pusher");
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Cloudinary Configuration
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========== MONGODB CONNECTION ==========
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/birthday_db";
mongoose.connect(MONGODB_URI)
    .then(() => console.log("🍃 Connected to MongoDB"))
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
    });

// ========== MIDDLEWARE ==========
const allowedOrigins = [
    process.env.FRONTEND_URL, 
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost:3000') || origin.includes('127.0.0.1:3000')) {
            return callback(null, true);
        } else {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin: ' + origin;
            return callback(new Error(msg), false);
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.set('trust proxy', 1);

let sessionStore;
try {
    sessionStore = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || "mongodb://localhost:27017/birthday_db",
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native'
    });
} catch (e) {
    console.error("❌ Failed to create MongoStore:", e);
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
        sameSite: 'none'
    },
    name: 'loveSessionId'
}));

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuth;
    res.locals.username = req.session.username || "Bhondu";
    next();
});

const memories = [
    { id: '01', icon: '💕', title: 'Chapter 1: The Beginning', img: '/assets/chapter1.jpeg', text: '“You know… this was the very first day after our confession...”' },
    { id: '02', icon: '✨', title: 'Chapter 2: Your First Accidental Masterpiece', img: '/assets/chapter2.jpeg', text: '“Do you remember this? 📸 The first photo of yours you sent me...”' },
    { id: '03', icon: '💖', title: 'Chapter 3: Falling for You', img: '/assets/chapter3.jpeg', text: '“Ahh… that Holi photo 🎨🌸 from our early days...”' },
    { id: '04', icon: '💑', title: 'Chapter 4: You opened up about your past so honestly', img: '/assets/chapter4.jpeg', text: '“This photo is from the day you opened up about your past so honestly. 🤍”' },
    { id: '05', icon: '😊', title: 'Chapter 5: Innocence', img: '/assets/chapter5.jpeg', text: '“In this photo, you look so innocent… 🥺”' },
    { id: '06', icon: '💪', title: 'Chapter 6: Endlessly obsessed with your photo.', img: '/assets/chapter6.jpeg', text: '“I don’t know why, but I’m so obsessed with this photo of yours… 😍”' },
    { id: '07', icon: '🎵', title: 'Chapter 7: Hot Bhondu', img: '/assets/chapter7.jpeg', text: '“In this photo, you look so hot and incredibly attractive… 😍”' },
    { id: '08', icon: '🌟', title: 'Chapter 8: Just one photo of us, yet it means everything to me.✨', img: '/assets/chapter8.jpeg', text: '“Even if this is the only photo we have together...”' },
    { id: '09', icon: '💘', title: 'Chapter 9: Maybe unnoticed… but never unmeant.', video: '/assets/chapter9.mp4', text: '“Yes, bhondu… I truly loved that you sent me a cake 🎂...”' }
];

const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

app.get("/", isAuth, (req, res) => res.render("home"));
app.get("/login", (req, res) => {
    if (req.session.isAuth) return res.redirect("/");
    res.render("login", { error: req.session.error });
    req.session.error = null;
});

app.get("/api/journal", isAuth, async (req, res) => {
    try {
        const entries = await Journal.find().sort({ createdAt: -1 });
        res.json({ entries, name: req.session.username || "Bhondu" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/memories", isAuth, (req, res) => res.render("memories", { memories, name: req.session.username || "Bhondu" }));

function isAuth(req, res, next) {
    if (req.session.isAuth) return next();
    if (req.xhr || req.path.startsWith('/api')) return res.status(401).json({ error: "Please login" });
    res.redirect("/login");
}

app.get("/promise", isAuth, (req, res) => res.render("promise", { name: req.session.username || "Bhondu" }));
app.get("/love-letter", isAuth, (req, res) => res.render("love-letter", { name: req.session.username || "Bhondu" }));
app.get("/questions", isAuth, (req, res) => res.render("questions", { name: req.session.username || "Bhondu" }));
app.get("/timeline", isAuth, (req, res) => res.render("timeline", { name: req.session.username || "Bhondu" }));
app.get("/reasons", isAuth, (req, res) => res.render("reasons", { name: req.session.username || "Bhondu" }));
app.get("/voice-memory", isAuth, (req, res) => res.render("voice-memory", { name: req.session.username || "Bhondu" }));
app.get("/outfit", isAuth, (req, res) => res.render("outfit", { name: req.session.username || "Bhondu" }));
app.get("/future-plans", isAuth, (req, res) => res.render("future-plans", { name: req.session.username || "Bhondu" }));
app.get("/final", isAuth, (req, res) => res.render("final", { name: req.session.username || "Bhondu" }));

app.use((err, req, res, next) => {
    console.error("💥 Server Error:", err);
    res.status(500).send("Something went wrong! 💔");
});

module.exports = app;