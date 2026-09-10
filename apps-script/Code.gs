/**
 * weekendtop14 - backend Apps Script
 *
 * Une seule couche serveur : cette web app, liee a la Google Sheet.
 * Trois actions : getScenarios, getResponses, submit.
 * Toutes protegees par un mot de passe unique stocke dans les proprietes
 * du script (POLL_PASSWORD), jamais dans le depot.
 *
 * Deploiement : voir README.md a la racine du depot.
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

// ------------------------------------------------------- installation one-shot

/**
 * A lancer une seule fois depuis l'editeur Apps Script : cree les quatre
 * onglets, les en-tetes, les cinq scenarios de depart et la config.
 * Relancable sans risque : ne touche pas a un onglet deja rempli.
 */
/** Les cinq sc\u00e9narios de d\u00e9part. Tous les textes accentu\u00e9s du fichier sont
 *  \u00e9crits en \u00e9chappements \uXXXX : le fichier reste en ASCII pur, donc aucun
 *  copier-coller ne peut ab\u00eemer les accents en route vers l'\u00e9diteur. */
function seedScenarios() {
  var now = new Date();
  return [
    ['S0', 'Statu quo', 'Les deux demi-finales en tribune, la f\u00eate autour, comme depuis 15 ans', '', 'visible', now, false, false, false, false, false],
    ['S1', 'Un match + activit\u00e9s', 'Un seul match en tribune \u00ab format classique \u00bb, le reste du weekend en activit\u00e9s entre potes', '', 'visible', now, false, false, false, true, false],
    ['S2', 'Z\u00e9ro match en live, maison lou\u00e9e', 'Aucun match au stade : on loue une maison et on regarde les matches ensemble \u00e0 la TV', '', 'visible', now, false, false, true, true, false],
    ['S3', 'Z\u00e9ro match en live, Ustaritz', 'Aucun match au stade : on regarde les matches \u00e0 la TV chez Pierrot au Pays Basque', '', 'visible', now, false, false, true, true, false],
    ['S4', '6 Nations \u00e0 l\'\u00e9tranger', 'Un weekend pour aller voir le XV de France en d\u00e9placement pendant le Tournoi', '', 'visible', now, true, true, false, false, true]
  ];
}

function seedConfig() {
  return [
    ['names', 'Pierrot, Seb, Tib, Ju, Dav, Max, Mart', 'Liste ferm\u00e9e des pr\u00e9noms, dans l\'ordre d\'affichage'],
    ['mood_sport', 'Sport', 'Activit\u00e9s sportives, type \u00ab weekend sport \u00bb'],
    ['mood_chill', 'Chill', 'Repos, bouffe, rien d\'organis\u00e9'],
    ['mood_party', 'Teuf', 'Sorties, soir\u00e9es'],
    ['mood_mix', 'Mix', 'Un peu de tout, sans dominante'],
    ['mood_other', 'Autre', '\u00c0 pr\u00e9ciser en texte libre']
  ];
}

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sc = ensureSheet(ss, SHEET_SCENARIOS, SCENARIO_HEADERS);
  if (sc.getLastRow() < 2) {
    seedScenarios().forEach(function (row) { sc.appendRow(row); });
  }

  ensureSheet(ss, SHEET_RESPONSES, RESPONSE_HEADERS);
  ensureSheet(ss, SHEET_LOG, LOG_HEADERS);

  var cfg = ensureSheet(ss, SHEET_CONFIG, CONFIG_HEADERS);
  if (cfg.getLastRow() < 2) {
    seedConfig().forEach(function (row) { cfg.appendRow(row); });
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Onglets pr\u00eats.', 'weekendtop14', 5);
}

/**
 * R\u00e9\u00e9crit les cinq sc\u00e9narios de d\u00e9part et la config, en laissant intacts les
 * sc\u00e9narios propos\u00e9s par le groupe (S5, S6\u2026) et toutes les r\u00e9ponses.
 * \u00c0 lancer si les libell\u00e9s ont \u00e9t\u00e9 ab\u00eem\u00e9s dans la Sheet.
 */
function reseedReferenceData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var seedIds = seedScenarios().map(function (r) { return r[0]; });
  var seedKeys = seedConfig().map(function (r) { return r[0]; });

  var removedScenarios = deleteRowsWhere(ss.getSheetByName(SHEET_SCENARIOS), 0, seedIds);
  var removedConfig = deleteRowsWhere(ss.getSheetByName(SHEET_CONFIG), 0, seedKeys);

  var sc = ensureSheet(ss, SHEET_SCENARIOS, SCENARIO_HEADERS);
  seedScenarios().forEach(function (row) { sc.appendRow(row); });
  var cfg = ensureSheet(ss, SHEET_CONFIG, CONFIG_HEADERS);
  seedConfig().forEach(function (row) { cfg.appendRow(row); });

  var msg = removedScenarios + ' sc\u00e9narios et ' + removedConfig + ' lignes de config r\u00e9\u00e9crits.';
  ss.toast(msg, 'weekendtop14', 6);
  Logger.log(msg);
}

/** Supprime les lignes (hors en-t\u00eate) dont la colonne `col` est dans `values`. */
function deleteRowsWhere(sh, col, values) {
  if (!sh) return 0;
  var data = sh.getDataRange().getValues();
  var removed = 0;
  for (var r = data.length - 1; r >= 1; r--) {
    if (values.indexOf(String(data[r][col]).trim()) !== -1) { sh.deleteRow(r + 1); removed++; }
  }
  return removed;
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

/** Enregistre le mot de passe du groupe. Edite la valeur, lance la fonction,
 *  puis remets la ligne a '' pour ne pas laisser trainer le mot de passe. */
function setPassword() {
  var pw = ''; // <- mets le mot de passe ici, lance, puis efface-le
  if (!pw) throw new Error('Renseigne pw dans setPassword() avant de lancer.');
  PropertiesService.getScriptProperties().setProperty('POLL_PASSWORD', pw);
}


// ---------------------------------------------------------------- entrees HTTP

function doGet(e) {
  // Utile pour tester a la main avec curl. Le front passe toujours par doPost.
  return handle(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var payload = {};
  try {
    // Le front envoie du JSON en text/plain pour eviter le preflight CORS.
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
  if (!expected) throw new Error('POLL_PASSWORD absent des propri\u00e9t\u00e9s du script.');
  if (typeof given !== 'string') return false;
  // Comparaison a temps constant : gratuit a ecrire, autant le faire.
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
    // Pre-remplissage du formulaire : on ne renvoie que la reponse demandee,
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

// ------------------------------------------------------------------- ecriture

function submitResponse(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var config = readConfig();
    var name = String(p.name || '').trim();
    if (!name) return { ok: false, error: 'validation', message: 'Pr\u00e9nom manquant.' };
    if (config.names.length && config.names.indexOf(name) === -1) {
      return { ok: false, error: 'validation', message: 'Pr\u00e9nom inconnu : ' + name };
    }

    appendLog(name, p);

    // 1. Scenario propose : on lui donne un identifiant avant de valider le reste.
    var newId = null;
    if (p.new_scenario && String(p.new_scenario.label || '').trim()) {
      newId = createScenario(p.new_scenario, name);
    }

    var accept = remapNew(p.accept, newId);
    var points = remapNew(p.points, newId);

    var scenarios = readScenarios(true);
    var validIds = scenarios.map(function (s) { return s.id; });

    // 2. Validation serveur (le front valide deja, mais on ne lui fait pas confiance).
    var err = validate(accept, points, p, validIds);
    if (err) return { ok: false, error: 'validation', message: err };

    // 3. Ecriture (remplacement en place si le prenom a deja une ligne).
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
      // Doublons eventuels (edition manuelle de la Sheet) : on nettoie.
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

/** Le front ne connait pas encore l'id du scenario qu'il propose : il envoie
 *  la cle "NEW", qu'on remplace ici par l'identifiant reellement attribue. */
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
  // Acceptabilite : une note 1-5 pour chaque scenario visible.
  for (var i = 0; i < validIds.length; i++) {
    var id = validIds[i];
    var a = accept[id];
    if (!(a >= 1 && a <= 5)) return 'Note manquante ou invalide pour ' + id + '.';
  }
  // Points de format : total 10, rien sur un scenario note 1.
  var total = 0;
  var keys = Object.keys(points);
  for (var k = 0; k < keys.length; k++) {
    var pid = keys[k];
    if (validIds.indexOf(pid) === -1) return 'Points sur un sc\u00e9nario inconnu : ' + pid + '.';
    var v = points[pid];
    if (v < 0) return 'Points n\u00e9gatifs sur ' + pid + '.';
    if (v > 0 && accept[pid] === 1) return 'Points sur un sc\u00e9nario veto\u00e9 (' + pid + ').';
    total += v;
  }
  if (total !== 10) return 'Le total des points de format doit faire 10 (actuellement ' + total + ').';

  // Ambiance : total 10, texte obligatoire si " Autre " a des points.
  var mood = p.mood || {};
  var moodTotal = 0;
  MOODS.forEach(function (m) { moodTotal += num(mood[m]); });
  if (moodTotal !== 10) return 'Le total des points d\'ambiance doit faire 10 (actuellement ' + moodTotal + ').';
  if (num(mood.other) > 0 && !String(mood.other_text || '').trim()) {
    return 'Pr\u00e9cise ce que tu mets derri\u00e8re \u00ab Autre \u00bb en ambiance.';
  }

  // Choix uniques.
  if (validIds.indexOf(String(p.single_pick || '')) === -1) return 'Choix du format unique manquant.';
  if (SIX_NATIONS_VALUES.indexOf(String(p.six_nations || '')) === -1) return 'R\u00e9ponse 6 Nations manquante.';
  if (DATE_CONSTRAINT_VALUES.indexOf(String(p.date_constraint || '')) === -1) return 'R\u00e9ponse sur la date manquante.';

  // Friction domestique : les cinq lignes sont obligatoires.
  var family = p.family || {};
  for (var d = 0; d < DIMENSIONS.length; d++) {
    if (FAMILY_VALUES.indexOf(String(family[DIMENSIONS[d]] || '')) === -1) {
      return 'R\u00e9ponse famille manquante : ' + DIMENSIONS[d] + '.';
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
