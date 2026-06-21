'use strict';

const utils    = require('@iobroker/adapter-core');
const cfosApi  = require('./lib/cfos-api');

class CfosAdapter extends utils.Adapter {

    constructor(options = {}) {
        super({ ...options, name: 'cfos-wallbox' });
        this.pollTimers = {};   // Ein Timer pro Wallbox
        this.on('ready',        this.onReady.bind(this));
        this.on('stateChange',  this.onStateChange.bind(this));
        this.on('unload',       this.onUnload.bind(this));
    }

    // ----------------------------------------------------------------
    // Start
    // ----------------------------------------------------------------
    async onReady() {
        this.setState('info.connection', false, true);

        const wallboxes = this.config.wallboxes || [];
        if (wallboxes.length === 0) {
            this.log.warn('Keine Wallboxen konfiguriert – bitte in der Adapterkonfiguration eintragen.');
            return;
        }

        for (const wb of wallboxes) {
            if (!wb.enabled) continue;
            if (!wb.ip)      { this.log.warn(`Wallbox "${wb.name}": keine IP konfiguriert`); continue; }

            await this.createWallboxObjects(wb);
            await this.pollWallbox(wb);

            const intervalMs = (wb.interval || 30) * 1000;
            this.pollTimers[wb.devId] = this.setInterval(
                () => this.pollWallbox(wb),
                intervalMs
            );
            this.log.info(`Wallbox "${wb.name}" (${wb.ip}/${wb.devId}) aktiv, Intervall ${wb.interval}s`);
        }

        // Auf Steuerbefehle reagieren
        await this.subscribeStatesAsync('*.control.*');
        this.setState('info.connection', true, true);
    }

    // ----------------------------------------------------------------
    // Datenpunkte anlegen
    // ----------------------------------------------------------------
    async createWallboxObjects(wb) {
        const id = this.sanitizeId(wb.name);

        await this.setObjectNotExistsAsync(id, {
            type: 'device',
            common: { name: wb.name },
            native: { ip: wb.ip, devId: wb.devId },
        });

        // Status-Kanal
        await this.setObjectNotExistsAsync(`${id}.status`, { type: 'channel', common: { name: 'Status' }, native: {} });

        const statusStates = [
            { id: 'power_w',          name: 'Ladeleistung',       type: 'number',  role: 'value.power',   unit: 'W',   read: true, write: false },
            { id: 'current_l1',       name: 'Strom L1',           type: 'number',  role: 'value.current', unit: 'mA',  read: true, write: false },
            { id: 'current_l2',       name: 'Strom L2',           type: 'number',  role: 'value.current', unit: 'mA',  read: true, write: false },
            { id: 'current_l3',       name: 'Strom L3',           type: 'number',  role: 'value.current', unit: 'mA',  read: true, write: false },
            { id: 'phases',           name: 'Phasen Bitmaske',    type: 'number',  role: 'value',                      read: true, write: false },
            { id: 'used_phases',      name: 'Genutzte Phasen',    type: 'number',  role: 'value',                      read: true, write: false },
            { id: 'state',            name: 'Zustand (1=Standby, 2=EV, 3=Laden)', type: 'number', role: 'value', read: true, write: false },
            { id: 'lreason',          name: 'Ladegrund',          type: 'number',  role: 'value',                      read: true, write: false },
            { id: 'charging_enabled', name: 'Laden aktiv',        type: 'boolean', role: 'indicator',                  read: true, write: false },
            { id: 'total_energy_kwh', name: 'Gesamtenergie',      type: 'number',  role: 'value.energy',  unit: 'kWh', read: true, write: false },
        ];

        for (const s of statusStates) {
            await this.setObjectNotExistsAsync(`${id}.status.${s.id}`, {
                type: 'state',
                common: { name: s.name, type: s.type, role: s.role, unit: s.unit || '', read: s.read, write: s.write },
                native: {},
            });
        }

        // Steuer-Kanal
        await this.setObjectNotExistsAsync(`${id}.control`, { type: 'channel', common: { name: 'Steuerung' }, native: {} });

        await this.setObjectNotExistsAsync(`${id}.control.laderegeln_aktiv`, {
            type: 'state',
            common: { name: 'Laderegeln aktiv (true=PV-Überschuss, false=Sofortladen)', type: 'boolean', role: 'switch', read: true, write: true, def: true },
            native: {},
        });

        await this.setObjectNotExistsAsync(`${id}.control.phasen`, {
            type: 'state',
            common: { name: 'Phasen (1=einphasig, 3=dreiphasig)', type: 'number', role: 'value', read: true, write: true, def: 3, states: { 1: '1-phasig', 3: '3-phasig' } },
            native: {},
        });
    }

    // ----------------------------------------------------------------
    // Status abrufen
    // ----------------------------------------------------------------
    async pollWallbox(wb) {
        const id = this.sanitizeId(wb.name);
        try {
            const dev = await cfosApi.getDevInfo(wb.ip, wb.password, wb.devId);

            await this.setStateAsync(`${id}.status.power_w`,          { val: dev.power_w          ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.current_l1`,       { val: dev.current_l1       ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.current_l2`,       { val: dev.current_l2       ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.current_l3`,       { val: dev.current_l3       ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.phases`,           { val: dev.phases           ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.used_phases`,      { val: dev.used_phases      ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.state`,            { val: dev.state            ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.lreason`,          { val: dev.lreason          ?? 0,     ack: true });
            await this.setStateAsync(`${id}.status.charging_enabled`, { val: dev.charging_enabled ?? false, ack: true });
            await this.setStateAsync(`${id}.status.total_energy_kwh`, { val: (dev.total_energy ?? 0) / 1000, ack: true });

            this.setState('info.connection', true, true);
            this.log.debug(`${wb.name}: ${dev.power_w}W, state=${dev.state}, phases=${dev.phases}`);
        } catch (e) {
            this.log.error(`${wb.name}: Fehler beim Statusabruf: ${e.message}`);
            this.setState('info.connection', false, true);
        }
    }

    // ----------------------------------------------------------------
    // Auf Steuerbefehle reagieren
    // ----------------------------------------------------------------
    async onStateChange(id, state) {
        if (!state || state.ack) return;  // Nur nicht-ack States (= vom User gesetzt)

        // Wallbox anhand der State-ID ermitteln
        const wallboxes = this.config.wallboxes || [];
        const wb = wallboxes.find(w => id.startsWith(`${this.namespace}.${this.sanitizeId(w.name)}.`));
        if (!wb) return;

        if (id.endsWith('.control.laderegeln_aktiv')) {
            const aktiv = !!state.val;
            this.log.info(`${wb.name}: Laderegeln ${aktiv ? 'aktivieren (PV)' : 'deaktivieren (Sofort)'}`);
            try {
                await cfosApi.setLaderegeln(wb.ip, wb.password, wb.devId, aktiv);
                await this.setStateAsync(id, { val: aktiv, ack: true });
                await this.pollWallbox(wb);
            } catch (e) {
                this.log.error(`${wb.name}: Fehler Laderegeln: ${e.message}`);
            }
        }

        if (id.endsWith('.control.phasen')) {
            const phasen = parseInt(state.val);
            if (phasen !== 1 && phasen !== 3) {
                this.log.warn(`${wb.name}: Ungültiger Phasenwert ${phasen} (1 oder 3 erlaubt)`);
                return;
            }
            this.log.info(`${wb.name}: Phasen auf ${phasen} umschalten`);
            try {
                await cfosApi.setPhasen(wb.ip, wb.password, phasen);
                await this.setStateAsync(id, { val: phasen, ack: true });
                // Kurz warten, dann Status aktualisieren (Wallbox braucht ~30s für Umschaltung)
                this.setTimeout(() => this.pollWallbox(wb), 5000);
            } catch (e) {
                this.log.error(`${wb.name}: Fehler Phasenumschaltung: ${e.message}`);
            }
        }
    }

    // ----------------------------------------------------------------
    // Stopp
    // ----------------------------------------------------------------
    onUnload(callback) {
        try {
            for (const timer of Object.values(this.pollTimers)) {
                this.clearInterval(timer);
            }
        } catch (_) {}
        callback();
    }

    // ----------------------------------------------------------------
    // Hilfsfunktion: Name zu gültigem ioBroker-ID sanitizen
    // ----------------------------------------------------------------
    sanitizeId(name) {
        return (name || 'wallbox').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    }
}

if (require.main !== module) {
    module.exports = (options) => new CfosAdapter(options);
} else {
    new CfosAdapter();
}
