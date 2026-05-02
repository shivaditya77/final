const express = require('express');
const router = express.Router();
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const User = require('../models/User');

const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:3001';

// In-memory store for challenges (should ideally be in session or redis)
const challenges = new Map();

const isAuth = (req, res, next) => {
    if (req.session.isAuth) return next();
    res.status(401).json({ error: "Please login" });
};

// ========== REGISTRATION (Enable Biometrics) ==========
router.get('/register-options', isAuth, async (req, res) => {
    const user = await User.findOne({ username: req.session.username.toLowerCase() });
    
    const options = await generateRegistrationOptions({
        rpName: 'Soul Connect',
        rpID: RP_ID,
        userID: user._id.toString(),
        userName: user.username,
        attestationType: 'none',
        excludeCredentials: user.passkeys.map(pk => ({
            id: pk.credentialID,
            type: 'public-key',
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform', // Forces FaceID/Fingerprint
        },
    });

    challenges.set(req.session.username.toLowerCase(), options.challenge);
    res.json(options);
});

router.post('/register-verify', isAuth, async (req, res) => {
    const { body } = req;
    const username = req.session.username.toLowerCase();
    const expectedChallenge = challenges.get(username);

    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found' });

    try {
        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const user = await User.findOne({ username });
            
            user.passkeys.push({
                credentialID: registrationInfo.credentialID,
                publicKey: registrationInfo.credentialPublicKey,
                counter: registrationInfo.counter,
                transports: body.response.transports,
            });
            
            await user.save();
            challenges.delete(username);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ========== AUTHENTICATION (Login with Biometrics) ==========
router.post('/login-options', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || user.passkeys.length === 0) {
        return res.status(404).json({ error: 'No biometrics registered for this user' });
    }

    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: user.passkeys.map(pk => ({
            id: pk.credentialID,
            type: 'public-key',
        })),
        userVerification: 'preferred',
    });

    challenges.set(username.toLowerCase(), options.challenge);
    res.json(options);
});

router.post('/login-verify', async (req, res) => {
    const { body, username } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    const expectedChallenge = challenges.get(username.toLowerCase());

    if (!user || !expectedChallenge) return res.status(400).json({ error: 'Invalid request' });

    const passkey = user.passkeys.find(pk => pk.credentialID.toString('base64url') === body.id);
    if (!passkey) return res.status(400).json({ error: 'Credential not found' });

    try {
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            authenticator: {
                credentialID: passkey.credentialID,
                credentialPublicKey: passkey.publicKey,
                counter: passkey.counter,
            },
        });

        if (verification.verified) {
            // Update counter
            passkey.counter = verification.authenticationInfo.newCounter;
            await user.save();
            
            // Log user in
            req.session.isAuth = true;
            req.session.username = user.username;
            req.session.loginTime = new Date().toISOString();
            
            challenges.delete(username.toLowerCase());
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
