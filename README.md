# ioBroker cFos Adapter

Adapter für die cFos Power Brain Wallbox.

## Installation

```bash
# Im ioBroker-Verzeichnis:
cd /opt/iobroker
npm install /pfad/zu/iobroker-cfos
iobroker add cfos
```

Oder manuell:
```bash
cp -r iobroker-cfos /opt/iobroker/node_modules/iobroker.cfos
cd /opt/iobroker
iobroker upload cfos
iobroker add cfos
```

## Konfiguration

In der ioBroker Admin-Oberfläche unter **Adapter → cFos → Konfiguration**:

| Feld              | Beschreibung                          | Beispiel        |
|-------------------|---------------------------------------|-----------------|
| Name              | Anzeigename der Wallbox               | Wallbox         |
| IP-Adresse        | Lokale IP der Wallbox                 | 192.168.17.3    |
| Kennwort          | Admin-Kennwort (leer lassen wenn keins)| (leer)         |
| Geräte-ID         | Device-ID aus get_dev_info            | E1              |
| Abfrageintervall  | Status-Abfrage in Sekunden            | 30              |
| Aktiv             | Wallbox aktivieren/deaktivieren       | ✓               |

## Datenpunkte

### Status (read-only)
| Datenpunkt                        | Beschreibung                        |
|-----------------------------------|-------------------------------------|
| `cfos.0.<name>.status.power_w`          | Aktuelle Ladeleistung in Watt       |
| `cfos.0.<name>.status.current_l1`       | Strom L1 in mA                      |
| `cfos.0.<name>.status.current_l2`       | Strom L2 in mA                      |
| `cfos.0.<name>.status.current_l3`       | Strom L3 in mA                      |
| `cfos.0.<name>.status.phases`           | Phasen-Bitmaske (7 = L1+L2+L3)     |
| `cfos.0.<name>.status.state`            | Zustand (1=Standby, 3=Laden)        |
| `cfos.0.<name>.status.charging_enabled` | Laden aktiv                         |
| `cfos.0.<name>.status.total_energy_kwh` | Gesamtenergie in kWh                |

### Steuerung (read/write)
| Datenpunkt                              | Beschreibung                                     |
|-----------------------------------------|--------------------------------------------------|
| `cfos.0.<name>.control.laderegeln_aktiv`| `true` = PV-Überschuss, `false` = Sofortladen   |
| `cfos.0.<name>.control.phasen`          | `1` = einphasig, `3` = dreiphasig                |

## Lizenz

MIT
