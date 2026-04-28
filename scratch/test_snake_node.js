const fetch = global.fetch || require('node-fetch');
const { URLSearchParams } = require('url');

async function login(username, password) {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const res = await fetch('http://localhost:3001/login', {
        method: 'POST',
        body: params,
        redirect: 'manual'
    });
    const cookies = res.headers.raw()['set-cookie'] || [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    return cookieHeader;
}

async function getPage(cookie, path) {
    const res = await fetch('http://localhost:3001' + path, {
        headers: { Cookie: cookie }
    });
    return { status: res.status, text: await res.text().catch(() => '') };
}

async function postRoll(cookie, payload) {
    const res = await fetch('http://localhost:3001/api/games/snake/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload)
    });
    try { return await res.json(); } catch (e) { return { status: res.status } }
}

(async () => {
    try {
        console.log('Logging in A (bhondu)');
        const cookieA = await login('bhondu', '21feb');
        console.log('Cookie A:', cookieA ? cookieA.split(';')[0] : 'none');

        console.log('Logging in B (vishu)');
        const cookieB = await login('vishu', '21feb');
        console.log('Cookie B:', cookieB ? cookieB.split(';')[0] : 'none');

        const pageA = await getPage(cookieA, '/games/snake');
        console.log('Page A status:', pageA.status);
        const pageB = await getPage(cookieB, '/games/snake');
        console.log('Page B status:', pageB.status);

        const payload = { dice: 4, path: [2, 3, 4, 5], finalPos: 5, seq: 1, to: 'vishu' };
        const rollResp = await postRoll(cookieA, payload);
        console.log('Roll response:', rollResp);
    } catch (e) { console.error('Test failed:', e); process.exit(1); }
})();
