# GPT-Version: reproduzierbare Browserprüfung

Die separate Vorschau liegt in `v2-gpt.html`. Die bestehende `v2.html` und die
öffentliche Startseite `index.html` werden durch diesen Änderungssatz nicht bearbeitet.

## Lokale Vorschau

Die HTML-Datei braucht HTTP, weil die Inhalte aus benachbarten JSON-Dateien geladen
werden. Direktes Öffnen als `file://` verhindert diese Abrufe im Browser.

```powershell
node tests/v2-gpt/preview.cjs
```

Die ausgegebene `http://127.0.0.1:…/v2-gpt.html`-Adresse im Browser öffnen.
Der Server bindet ausschließlich an den eigenen Rechner und liefert nur die öffentlichen
HTML-/Daten-/Fontdateien. `GPT_PREVIEW_PORT` kann einen festen Port vorgeben.
Beenden mit Strg+C. Die veröffentlichte Variante liegt unter
https://leander-hermann.github.io/aktien-atzen/v2-gpt.html.

`node tests/v2-gpt/preview-check.cjs <ausgegebene-URL>` prüft die Gegenprobe:
`file://` blockiert die JSON-Abrufe, dieselbe Datei über HTTP lädt Digest und Markt.
Die Prüfung verwendet die Chartdatei aus dem Hauptprüflauf oder `CHART_LIBRARY_FILE`
und schreibt `preview-report.json` in denselben Ausgabeordner.

## Ausführen

Voraussetzungen: Node.js ab 20, Playwright mit Clock-API (ab 1.45) im Modulpfad,
Chrome/Chromium. Keine Produkt-Abhängigkeit und kein Buildschritt.

```powershell
# Im Frontend-Repository, mit den lokalen Runtimepfaden in PATH/NODE_PATH:
node tests/v2-gpt/check.cjs
```

Unter Windows wird standardmäßig Chrome unter `C:/Program Files/Google/Chrome/Application/chrome.exe`
verwendet. `CHROME_PATH` kann ein anderes Chromium-Binary angeben. Andernfalls
verwendet Playwright unter anderen Betriebssystemen seinen installierten Chromium.
`GPT_TEST_OUTPUT` setzt den Ausgabeordner (Standard: Betriebssystem-Temp,
`aktien-atzen-v2-gpt-tests`). Dort entstehen `report.json` und Screenshots.

Die Suite lädt ausschließlich die bereits im Produkt verwendete Bibliothek
Lightweight Charts **4.1.3** von der im HTML angegebenen jsDelivr-Adresse.
Mit `CHART_LIBRARY_FILE` kann dieselbe lokal vorhandene Datei verwendet werden;
ein erfolgreicher Lauf legt sie im Ausgabeordner ab. Feeds werden mit
`fixtures.cjs` abgefangen; ein zusätzlicher Durchlauf liest die öffentlichen
`data/`-Dateien aus dem Checkout über einen lokalen HTTP-Server.

## Abdeckung und Grenzen

53 Prüfgruppen: Digest-Auswahl und Volltext, XSS/URLs/Bildfehler, Fokus einschließlich
Duplikatprüfung und spätem Nachladen, Videos, Quellenstände, Markt-/F&G-Grenzen,
Mover-Auswahl, echte Chartkerzen, ungültige OHLC-Reihen, Bibliotheks-/Proxyfehler,
Chartabbau, Theme/Resize sowie 320/375/1280 px in dark/light.
36 Kombinationen testen zwölf Feeds jeweils mit 404, ungültigem JSON und falscher
Struktur. Die unveränderten V1-Stockkerne, Bestandsfunktionen, Sicherheitshelfer
und CSP werden unmittelbar mit den Dateien des Checkouts verglichen.

Alle Browserkontexte werden frisch mit **künstlichen** Positionen oder leerem
Bestand angelegt und anschließend geschlossen. Es werden weder bestehende
Browserprofile noch echte Positionsdaten gelesen. Telemetrie ist im Test blockiert.
Proxyantworten sind künstlich leer; ein erreichbarer Yahoo-Proxy ist keine
Voraussetzung für den Test. Die Erreichbarkeit externer Anbieter wird damit
nicht zugesichert.

Ein erfolgreicher Lauf verlangt null JavaScript-Ausnahmen, null unerwartete
Konsolenfehler, null CSP-Verstöße und null Yahoo-/Proxy-Requests ohne Chartklick.
Die zwölf absichtlich ausgelösten HTTP-404-Ressourcenmeldungen werden separat
als `expectedTransportErrors` gezählt. Der Bericht enthält Laufzeit und SHA-256
der geprüften GPT-Datei. Screenshots erlauben ergänzende manuelle Sichtprüfung;
die visuelle Bewertung selbst ist keine deterministische Prüfung.

Der Reihenfolge-Nachtrag wird zusätzlich in zwölf Browserkontexten geprüft:
375/1280 px × dark/light × leer/Position mit Ereignis/Position ohne Ereignis.
Gemessen wird die DOM-Reihenfolge vor und nach Großfeeds; die Entscheidung hängt
ausschließlich vom Bestand beim Start ab. Quick-Add verschiebt die aktuelle Ansicht
nicht. Die Digestfläche ist ausdrücklich als „Allgemeine Marktlage“ überschrieben.
