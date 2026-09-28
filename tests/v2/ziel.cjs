/* Die EINE Stelle, an der die Pruefwerkzeuge ihre Zieldateien finden (V2-7 Teil E.1).

   Vor dem Cutover ist V2 die Datei v2.html und die V1 die Einstiegsseite index.html.
   Mit dem Cutover (Teil F) wird V2 zu index.html und die V1 zu v1.html — dann steht hier
   ZIEL = 'index.html', und kein Werkzeug muss sonst angefasst werden.

   Fuer die Rueckwechsel-Probe laesst sich die Konstante ohne Dateiaenderung ueberschreiben:
     V2_ZIEL=index.html node tests/v2/check.cjs
   Die V1 folgt daraus: ist V2 die Einstiegsseite, liegt die V1 unter v1.html. */
const path = require('path');

const ZIEL = 'v2.html';

const v2 = process.env.V2_ZIEL || ZIEL;
const v1 = v2 === 'index.html' ? 'v1.html' : 'index.html';
const wurzel = path.join(__dirname, '..', '..');

module.exports = { v2, v1, wurzel, pfad: (name) => path.join(wurzel, name) };
