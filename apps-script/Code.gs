/**
 * weekendtop14 — backend Apps Script
 *
 * Une seule couche serveur : cette web app, liée à la Google Sheet.
 * Trois actions : getScenarios, getResponses, submit.
 * Toutes protégées par un mot de passe unique stocké dans les propriétés
 * du script (POLL_PASSWORD), jamais dans le dépôt.
 *
 * Déploiement : voir README.md à la racine du dépôt.
 */

var SHEET_SCENARIOS = 'scenarios';
var SHEET_RESPONSES = 'responses';
var SHEET_CONFIG = 'config';
var SHEET_LOG = 'responses_log';

var SCENARIO_HEADERS = [
  'id', 'label', 'description', 'proposed_by', 'status', 'created_at',
  'dim_frequency', 'dim_date', 'dim_stadium', 'dim_activities', 'dim_abroad'
];

var RESPONSE_HEADERS = [
  'updated_at', 'name', 'accept_json', 'points_json',
  'mood_sport', 'mood_chill', 'mood_party', 'mood_mix', 'mood_other', 'mood_other_text',
  'single_pick', 'six_nations', 'date_constraint', 'date_notes',
  'family_frequency', 'family_date', 'family_stadium', 'family_activities', 'family_abroad',
  'comment'
];

var LOG_HEADERS = ['logged_at', 'name', 'payload_json'];
var CONFIG_HEADERS = ['key', 'value', 'note'];

var DIMENSIONS = ['frequency', 'date', 'stadium', 'activities', 'abroad'];
var MOODS = ['sport', 'chill', 'party', 'mix', 'other'];
var FAMILY_VALUES = ['easy', 'negotiate', 'hard'];
var SIX_NATIONS_VALUES = ['instead', 'addon', 'none'];
var DATE_CONSTRAINT_VALUES = ['fixed', 'prefer', 'flexible'];

// ---------------------------------------------------------------- entrées HTTP

function doGet(e) {
  // Utile pour tester à la main avec curl. Le front passe toujours par doPost.
  return handle(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var payload = {};
  try {
    // Le front envoie du JSON en text/plain pour éviter le préflight CORS.
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request', message: 'Corps JSON illisible.' });
  }
  return handle(payload);
}

function handle(p) {
  try {
    if (!checkPassword(p.password)) {
      return json({ ok: false, error: 'unauthorized', message: 'Mot de passe incorrect.' });
    }
    switch (p.action) {
      case 'getScenarios':
        return json({ ok: true, scenarios: readScenarios(true), config: readConfig() });
      case 'getResponses':
        return json(getResponsesPayload(p.name));
      case 'submit':
        return json(submitResponse(p));
      default:
        return json({ ok: false, error: 'bad_request', message: 'Action inconnue : ' + p.action });
    }
  } catch (err) {
    return json({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPassword(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('POLL_PASSWORD');
  if (!expected) throw new Error('POLL_PASSWORD absent des propriétés du script.');
  if (typeof given !== 'string') return false;
  // Comparaison à temps constant : gratuit à écrire, autant le faire.
  if (given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ------------------------------------------------------------------- lectures

function sheet(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Onglet manquant : ' + name + '. Lance setupSheet() une fois.');
  return sh;
}

function readRows(name, headers) {
  var values = sheet(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var idx = head.indexOf(headers[c]);
      obj[headers[c]] = idx === -1 ? '' : row[idx];
    }
    obj.__row = r + 1;
    rows.push(obj);
  }
  return rows;
}

function truthy(v) {
  if (v === true) return true;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'vrai' || s === 'oui' || s === 'yes' || s === 'x' || s === '1';
}

function readScenarios(visibleOnly) {
  return readRows(SHEET_SCENARIOS, SCENARIO_HEADERS)
    .filter(function (s) {
      if (!s.id) return false;
      return visibleOnly ? String(s.status).trim().toLowerCase() !== 'hidden' : true;
    })
    .map(function (s) {
      var dims = {};
      DIMENSIONS.forEach(function (d) { dims[d] = truthy(s['dim_' + d]); });
      return {
        id: String(s.id).trim(),
        label: String(s.label).trim(),
        description: String(s.description).trim(),
        proposed_by: String(s.proposed_by || '').trim(),
        status: String(s.status || 'visible').trim().toLowerCase(),
        created_at: s.created_at ? new Date(s.created_at).toISOString() : '',
        dims: dims
      };
    })
    .sort(function (a, b) { return scenarioRank(a.id) - scenarioRank(b.id); });
}

function scenarioRank(id) {
  var m = String(id).match(/^S(\d+)$/);
  return m ? parseInt(m[1], 10) : 9999;
}

function readConfig() {
  var rows = readRows(SHEET_CONFIG, CONFIG_HEADERS);
  var names = [];
  var moods = {};
  rows.forEach(function (row) {
    var key = String(row.key || '').trim();
    var value = String(row.value || '').trim();
    var note = String(row.note || '').trim();
    if (key === 'names') {
      names = value.split(',').map(function (n) { return n.trim(); }).filter(String);
    } else if (key.indexOf('mood_') === 0) {
      moods[key.substring(5)] = { label: value, note: note };
    }
  });
  return { names: names, moods: moods };
}

function parseJsonCell(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)) || {}; } catch (e) { return {}; }
}

function rowToResponse(row) {
  var mood = {};
  MOODS.forEach(function (m) { mood[m] = Number(row['mood_' + m]) || 0; });
  mood.other_text = String(row.mood_other_text || '');
  var family = {};
  DIMENSIONS.forEach(function (d) { family[d] = String(row['family_' + d] || ''); });
  return {
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    name: String(row.name || '').trim(),
    accept: parseJsonCell(row.accept_json),
    points: parseJsonCell(row.points_json),
    mood: mood,
    single_pick: String(row.single_pick || ''),
    six_nations: String(row.six_nations || ''),
    date_constraint: String(row.date_constraint || ''),
    date_notes: String(row.date_notes || ''),
    family: family,
    comment: String(row.comment || '')
  };
}

function getResponsesPayload(nameFilter) {
  var rows = readRows(SHEET_RESPONSES, RESPONSE_HEADERS).filter(function (r) { return String(r.name).trim(); });
  var responses = rows.map(rowToResponse);
  if (nameFilter) {
    // Pré-remplissage du formulaire : on ne renvoie que la réponse demandée,
    // pas celles des autres.
    var wanted = String(nameFilter).trim().toLowerCase();
    var mine = responses.filter(function (r) { return r.name.toLowerCase() === wanted; });
    return {
      ok: true,
      scenarios: readScenarios(true),
      config: readConfig(),
      response: mine.length ? mine[0] : null
    };
  }
  return {
    ok: true,
    scenarios: readScenarios(true),
    config: readConfig(),
    responses: responses
  };
}

// ------------------------------------------------------------------- écriture

function submitResponse(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var config = readConfig();
    var name = String(p.name || '').trim();
    if (!name) return { ok: false, error: 'validation', message: 'Prénom manquant.' };
    if (config.names.length && config.names.indexOf(name) === -1) {
      return { ok: false, error: 'validation', message: 'Prénom inconnu : ' + name };
    }

    appendLog(name, p);

    // 1. Scénario proposé : on lui donne un identifiant avant de valider le reste.
    var newId = null;
    if (p.new_scenario && String(p.new_scenario.label || '').trim()) {
      newId = createScenario(p.new_scenario, name);
    }

    var accept = remapNew(p.accept, newId);
    var points = remapNew(p.points, newId);

    var scenarios = readScenarios(true);
    var validIds = scenarios.map(function (s) { return s.id; });

    // 2. Validation serveur (le front valide déjà, mais on ne lui fait pas confiance).
    var err = validate(accept, points, p, validIds);
    if (err) return { ok: false, error: 'validation', message: err };

    // 3. Écriture (remplacement en place si le prénom a déjà une ligne).
    var sh = sheet(SHEET_RESPONSES);
    var mood = p.mood || {};
    var family = p.family || {};
    var record = {
      updated_at: new Date(),
      name: name,
      accept_json: JSON.stringify(accept),
      points_json: JSON.stringify(points),
      mood_sport: num(mood.sport),
      mood_chill: num(mood.chill),
      mood_party: num(mood.party),
      mood_mix: num(mood.mix),
      mood_other: num(mood.other),
      mood_other_text: String(mood.other_text || '').trim(),
      single_pick: String(p.single_pick || '').trim(),
      six_nations: String(p.six_nations || '').trim(),
      date_constraint: String(p.date_constraint || '').trim(),
      date_notes: String(p.date_notes || '').trim(),
      family_frequency: String(family.frequency || ''),
      family_date: String(family.date || ''),
      family_stadium: String(family.stadium || ''),
      family_activities: String(family.activities || ''),
      family_abroad: String(family.abroad || ''),
      comment: String(p.comment || '').trim()
    };
    var line = RESPONSE_HEADERS.map(function (h) { return record[h]; });

    var existing = readRows(SHEET_RESPONSES, RESPONSE_HEADERS).filter(function (r) {
      return String(r.name).trim().toLowerCase() === name.toLowerCase();
    });
    var replaced = false;
    if (existing.length) {
      sh.getRange(existing[0].__row, 1, 1, line.length).setValues([line]);
      replaced = true;
      // Doublons éventuels (édition manuelle de la Sheet) : on nettoie.
      for (var i = existing.length - 1; i >= 1; i--) sh.deleteRow(existing[i].__row);
    } else {
      sh.appendRow(line);
    }

    return {
      ok: true,
      replaced: replaced,
      new_scenario_id: newId,
      scenarios: scenarios
    };
  } finally {
    lock.releaseLock();
  }
}

function num(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : Math.round(n);
}

/** Le front ne connaît pas encore l'id du scénario qu'il propose : il envoie
 *  la clé "NEW", qu'on remplace ici par l'identifiant réellement attribué. */
function remapNew(map, newId) {
  var out = {};
  Object.keys(map || {}).forEach(function (k) {
    var key = (k === 'NEW') ? newId : k;
    if (key) out[key] = num(map[k]);
  });
  return out;
}

function createScenario(proposal, author) {
  var sh = sheet(SHEET_SCENARIOS);
  var all = readScenarios(false);
  var max = 0;
  all.forEach(function (s) {
    var r = scenarioRank(s.id);
    if (r < 9999 && r > max) max = r;
  });
  var id = 'S' + (max + 1);
  var dims = proposal.dims || {};
  var record = {
    id: id,
    label: String(proposal.label || '').trim().substring(0, 40),
    description: String(proposal.description || '').trim().substring(0, 140),
    proposed_by: author,
    status: 'visible',
    created_at: new Date(),
    dim_frequency: !!dims.frequency,
    dim_date: !!dims.date,
    dim_stadium: !!dims.stadium,
    dim_activities: !!dims.activities,
    dim_abroad: !!dims.abroad
  };
  sh.appendRow(SCENARIO_HEADERS.map(function (h) { return record[h]; }));
  return id;
}

function validate(accept, points, p, validIds) {
  // Acceptabilité : une note 1-5 pour chaque scénario visible.
  for (var i = 0; i < validIds.length; i++) {
    var id = validIds[i];
    var a = accept[id];
    if (!(a >= 1 && a <= 5)) return 'Note manquante ou invalide pour ' + id + '.';
  }
  // Points de format : total 10, rien sur un scénario noté 1.
  var total = 0;
  var keys = Object.keys(points);
  for (var k = 0; k < keys.length; k++) {
    var pid = keys[k];
    if (validIds.indexOf(pid) === -1) return 'Points sur un scénario inconnu : ' + pid + '.';
    var v = points[pid];
    if (v < 0) return 'Points négatifs sur ' + pid + '.';
    if (v > 0 && accept[pid] === 1) return 'Points sur un scénario vetoé (' + pid + ').';
    total += v;
  }
  if (total !== 10) return 'Le total des points de format doit faire 10 (actuellement ' + total + ').';

  // Ambiance : total 10, texte obligatoire si « Autre » a des points.
  var mood = p.mood || {};
  var moodTotal = 0;
  MOODS.forEach(function (m) { moodTotal += num(mood[m]); });
  if (moodTotal !== 10) return 'Le total des points d\'ambiance doit faire 10 (actuellement ' + moodTotal + ').';
  if (num(mood.other) > 0 && !String(mood.other_text || '').trim()) {
    return 'Précise ce que tu mets derrière « Autre » en ambiance.';
  }

  // Choix uniques.
  if (validIds.indexOf(String(p.single_pick || '')) === -1) return 'Choix du format unique manquant.';
  if (SIX_NATIONS_VALUES.indexOf(String(p.six_nations || '')) === -1) return 'Réponse 6 Nations manquante.';
  if (DATE_CONSTRAINT_VALUES.indexOf(String(p.date_constraint || '')) === -1) return 'Réponse sur la date manquante.';

  // Friction domestique : les cinq lignes sont obligatoires.
  var family = p.family || {};
  for (var d = 0; d < DIMENSIONS.length; d++) {
    if (FAMILY_VALUES.indexOf(String(family[DIMENSIONS[d]] || '')) === -1) {
      return 'Réponse famille manquante : ' + DIMENSIONS[d] + '.';
    }
  }
  return null;
}

function appendLog(name, payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) return; // onglet optionnel
  var copy = {};
  Object.keys(payload).forEach(function (k) { if (k !== 'password') copy[k] = payload[k]; });
  sh.appendRow([new Date(), name, JSON.stringify(copy)]);
}

// ------------------------------------------------------- installation one-shot

/**
 * À lancer une seule fois depuis l'éditeur Apps Script : crée les quatre
 * onglets, les en-têtes, les cinq scénarios de départ et la config.
 * Relançable sans risque : ne touche pas à un onglet déjà rempli.
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sc = ensureSheet(ss, SHEET_SCENARIOS, SCENARIO_HEADERS);
  if (sc.getLastRow() < 2) {
    var now = new Date();
    [
      ['S0', 'Statu quo', 'Les deux demi-finales en tribune, la fête autour, comme depuis 15 ans', '', 'visible', now, false, false, false, false, false],
      ['S1', 'Un match + activités', 'Un seul match en tribune « format classique », le reste du weekend en activités entre potes', '', 'visible', now, false, false, false, true, false],
      ['S2', 'Zéro match en live, maison louée', 'Aucun match au stade : on loue une maison et on regarde les matches ensemble à la TV', '', 'visible', now, false, false, true, true, false],
      ['S3', 'Zéro match en live, Ustaritz', 'Aucun match au stade : on regarde les matches à la TV chez Pierrot au Pays Basque', '', 'visible', now, false, false, true, true, false],
      ['S4', '6 Nations à l\'étranger', 'Un weekend pour aller voir le XV de France en déplacement pendant le Tournoi', '', 'visible', now, true, true, false, false, true]
    ].forEach(function (row) { sc.appendRow(row); });
  }

  ensureSheet(ss, SHEET_RESPONSES, RESPONSE_HEADERS);
  ensureSheet(ss, SHEET_LOG, LOG_HEADERS);

  var cfg = ensureSheet(ss, SHEET_CONFIG, CONFIG_HEADERS);
  if (cfg.getLastRow() < 2) {
    [
      ['names', 'Pierrot, Seb, Tib, Ju, Dav, Max, Mart', 'Liste fermée des prénoms, dans l\'ordre d\'affichage'],
      ['mood_sport', 'Sport', 'Activités sportives, type « weekend sport »'],
      ['mood_chill', 'Chill', 'Repos, bouffe, rien d\'organisé'],
      ['mood_party', 'Teuf', 'Sorties, soirées'],
      ['mood_mix', 'Mix', 'Un peu de tout, sans dominante'],
      ['mood_other', 'Autre', 'À préciser en texte libre']
    ].forEach(function (row) { cfg.appendRow(row); });
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Onglets prêts.', 'weekendtop14', 5);
}

function ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var first = sh.getRange(1, 1, 1, headers.length).getValues()[0].join('');
  if (!first) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Enregistre le mot de passe du groupe. Édite la valeur, lance la fonction,
 *  puis remets la ligne à '' pour ne pas laisser traîner le mot de passe. */
function setPassword() {
  var pw = ''; // <— mets le mot de passe ici, lance, puis efface-le
  if (!pw) throw new Error('Renseigne pw dans setPassword() avant de lancer.');
  PropertiesService.getScriptProperties().setProperty('POLL_PASSWORD', pw);
}
