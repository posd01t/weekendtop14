/* weekendtop14 — socle partagé : mot de passe, appels à la web app, petits SVG.
   Chargé par index.html et results.html. */

var WT = (function () {
  var LS = { pw: 'wt14_pw', name: 'wt14_name', voted: 'wt14_voted' };

  var DIMENSIONS = [
    { key: 'frequency', label: 'Passer à deux weekends par an (Top 14 + 6 Nations)', short: 'Fréquence' },
    { key: 'date', label: 'Décaler le weekend à une autre date que les demi-finales', short: 'Date' },
    { key: 'stadium', label: 'Un weekend rugby sans aller au stade (matches à la TV)', short: 'Stade' },
    { key: 'activities', label: 'Un weekend avec des activités organisées (sport, sorties) plutôt que juste les matches', short: 'Activités' },
    { key: 'abroad', label: 'Un weekend à l\'étranger', short: 'Étranger' }
  ];

  var ANCHORS = {
    1: 'Non, je ne viens pas',
    2: 'Bof, sans moi si possible',
    3: 'Pourquoi pas',
    4: 'Chaud',
    5: 'Super chaud'
  };

  var FAMILY_OPTIONS = [
    { value: 'easy', label: 'Ça passe sans discussion' },
    { value: 'negotiate', label: 'Ça passe en négociant' },
    { value: 'hard', label: 'C\'est compliqué' }
  ];

  var SIX_NATIONS_OPTIONS = [
    { value: 'instead', label: 'À la place du weekend Top 14' },
    { value: 'addon', label: 'En plus du weekend Top 14' },
    { value: 'none', label: 'Ni l\'un ni l\'autre, je ne suis pas chaud pour le 6 Nations' }
  ];

  var DATE_OPTIONS = [
    { value: 'fixed', label: 'C\'est la date, on ne change pas' },
    { value: 'prefer', label: 'Je préfère cette date mais je suis ouvert' },
    { value: 'flexible', label: 'Peu importe la date, c\'est le weekend qui compte' }
  ];

  var MOOD_KEYS = ['sport', 'chill', 'party', 'mix', 'other'];

  var MOOD_FALLBACK = {
    sport: { label: 'Sport', note: 'Activités sportives, type « weekend sport »' },
    chill: { label: 'Chill', note: 'Repos, bouffe, rien d\'organisé' },
    party: { label: 'Teuf', note: 'Sorties, soirées' },
    mix: { label: 'Mix', note: 'Un peu de tout, sans dominante' },
    other: { label: 'Autre', note: 'À préciser' }
  };

  var NAMES_FALLBACK = ['Pierrot', 'Seb', 'Tib', 'Ju', 'Dav', 'Max', 'Mart'];

  // ------------------------------------------------------------- stockage

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* mode privé */ } }
  function del(key) { try { localStorage.removeItem(key); } catch (e) { } }

  // --------------------------------------------------------------- appels

  function call(action, params) {
    var url = (window.WT14_CONFIG || {}).WEB_APP_URL;
    if (!url || url.indexOf('http') !== 0) {
      return Promise.reject(new Error('URL de la web app absente : renseigne WEB_APP_URL dans assets/config.js.'));
    }
    var body = { action: action, password: get(LS.pw) || '' };
    Object.keys(params || {}).forEach(function (k) { body[k] = params[k]; });

    return fetch(url, {
      method: 'POST',
      // text/plain = requête « simple » : pas de préflight CORS, que les web apps
      // Apps Script ne savent pas traiter. Le corps reste du JSON.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) {
          throw new Error('Réponse illisible du serveur. Vérifie que la web app est déployée en accès « tout le monde ».');
        }
        if (!data.ok) {
          var err = new Error(data.message || data.error || 'Erreur inconnue.');
          err.code = data.error;
          throw err;
        }
        return data;
      });
    });
  }

  // ------------------------------------------------- écran de mot de passe

  /** Affiche l'écran d'accueil tant que le mot de passe n'est pas validé,
   *  puis appelle onAuthed() avec la réponse de getScenarios. */
  function boot(onAuthed) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    var form = document.getElementById('gate-form');
    var input = document.getElementById('gate-pw');
    var err = document.getElementById('gate-error');
    var btn = document.getElementById('gate-submit');

    function tryAuth(showError) {
      btn.disabled = true;
      btn.textContent = 'Vérification…';
      // On ne rattrape que l'échec de l'appel : une erreur survenue dans
      // onAuthed doit remonter telle quelle, pas se déguiser en mot de passe
      // refusé.
      return call('getScenarios', {}).then(function (data) {
        gate.classList.add('hidden');
        app.classList.remove('hidden');
        onAuthed(data);
      }, function (e) {
        del(LS.pw);
        gate.classList.remove('hidden');
        app.classList.add('hidden');
        if (showError) { err.textContent = e.message; err.classList.remove('hidden'); }
        btn.disabled = false;
        btn.textContent = 'Entrer';
        input.value = '';
        input.focus();
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.classList.add('hidden');
      set(LS.pw, input.value.trim());
      tryAuth(true);
    });

    if (get(LS.pw)) {
      tryAuth(false);
    } else {
      gate.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------- utils

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function moodsFrom(config) {
    var out = {};
    MOOD_KEYS.forEach(function (k) {
      var c = config && config.moods && config.moods[k];
      out[k] = (c && c.label) ? c : MOOD_FALLBACK[k];
    });
    return out;
  }

  function namesFrom(config) {
    return (config && config.names && config.names.length) ? config.names : NAMES_FALLBACK;
  }

  function ballSVG() {
    return '<svg viewBox="0 0 34 22" aria-hidden="true">' +
      '<ellipse class="ball-fill" cx="17" cy="11" rx="15.5" ry="9.2"/>' +
      '<ellipse cx="17" cy="11" rx="15.5" ry="9.2" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="1.4"/>' +
      '<path class="ball-seam" d="M7 11h20M12.5 8v6M17 7v8M21.5 8v6"/>' +
      '</svg>';
  }

  var ICONS = {
    stand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M4 20v-4l6-4 4 2 6-5v11"/><circle cx="8" cy="7" r="1.4"/><circle cx="13" cy="6" r="1.4"/><circle cx="18" cy="5" r="1.4"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M7 10h10" opacity=".5"/></svg>',
    house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13.5 21 4l-5.5 16-3.2-6.3z"/><path d="M12.3 13.7 8.6 19v-4"/></svg>',
    ball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6.5" transform="rotate(-30 12 12)"/><path d="M8.5 15.5 15.5 8.5M10 11.5l1.5 1.5M12.5 9l1.5 1.5"/></svg>'
  };

  function iconFor(sc) {
    if (sc.id === 'S0' || sc.id === 'S1') return ICONS.stand;
    if (sc.id === 'S2') return ICONS.tv;
    if (sc.id === 'S3') return ICONS.house;
    if (sc.id === 'S4') return ICONS.plane;
    var d = sc.dims || {};
    if (d.abroad) return ICONS.plane;
    if (d.stadium) return ICONS.tv;
    if (d.activities) return ICONS.ball;
    return ICONS.stand;
  }

  return {
    LS: LS, get: get, set: set, del: del,
    call: call, boot: boot, esc: esc,
    DIMENSIONS: DIMENSIONS, ANCHORS: ANCHORS, MOOD_KEYS: MOOD_KEYS,
    FAMILY_OPTIONS: FAMILY_OPTIONS, SIX_NATIONS_OPTIONS: SIX_NATIONS_OPTIONS, DATE_OPTIONS: DATE_OPTIONS,
    moodsFrom: moodsFrom, namesFrom: namesFrom,
    ballSVG: ballSVG, iconFor: iconFor, ICONS: ICONS
  };
})();
