'use strict';

const http = require('http');

/**
 * Führt einen HTTP-GET-Request zur cFos Wallbox aus.
 * @param {string} ip         IP-Adresse der Wallbox
 * @param {string} password   Admin-Kennwort (leer = kein Kennwort)
 * @param {string} path       Pfad inkl. Query-String, z.B. /cnf?cmd=get_dev_info
 * @param {number} [timeout]  Timeout in ms (default 5000)
 * @returns {Promise<any>}    Geparste JSON-Antwort oder String
 */
function cfosGet(ip, password, path, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: ip,
            port: 80,
            path: path,
            method: 'GET',
            auth: `admin:${password || ''}`,
            timeout: timeout,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (_) {
                    resolve(data.trim().replace(/^"|"$/g, ''));  // z.B. "ok" → ok
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout nach ${timeout}ms (${ip})`));
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Gerätestatus abrufen und das Gerät mit der angegebenen dev_id zurückgeben.
 */
async function getDevInfo(ip, password, devId) {
    const info = await cfosGet(ip, password, '/cnf?cmd=get_dev_info');
    if (!info || !Array.isArray(info.devices)) throw new Error('Ungültige Antwort von get_dev_info');
    const dev = info.devices.find(d => d.dev_id === devId);
    if (!dev) throw new Error(`Gerät ${devId} nicht gefunden`);
    return dev;
}

/**
 * Laderegeln aktivieren oder deaktivieren.
 * @param {boolean} aktiv  true = aktivieren (PV-Überschuss), false = deaktivieren (Sofortladen)
 */
async function setLaderegeln(ip, password, devId, aktiv) {
    const flag = aktiv ? 'e' : 'E';
    return cfosGet(ip, password, `/cnf?cmd=override_device&dev_id=${devId}&flags=${flag}`);
}

/**
 * Phasen umschalten.
 * @param {number} phasen  1 = einphasig, 3 = dreiphasig
 */
async function setPhasen(ip, password, phasen) {
    const value = phasen === 1 ? 1 : 0;  // Modbus 8087: 0=3-phasig, 1=1-phasig
    return cfosGet(ip, password, `/cnf?cmd=modbus&device=evse&write=8087&value=${value}`);
}

module.exports = { cfosGet, getDevInfo, setLaderegeln, setPhasen };
