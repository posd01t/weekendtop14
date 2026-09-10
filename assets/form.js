/* weekendtop14 — formulaire */

(function () {
  var state = {
    scenarios: [],   // scénarios visibles renvoyés par le serveur
    config: null,
    accept: {},      // id -> 1..5 (la clé 'NEW' désigne le scénario proposé ici même)
    points: {},      // id -> entier
    mood: { sport: 0, chill: 0, party: 0, mix: 0, other: 0 },
    single_pick: '',
    six_nations: '',
    date_constraint: '',
    family: {},
    prior: null,     // réponse précédente du prénom sélectionné
    sending: false
  };

  var el = {};
  ['loading', 'poll', 'name', 'scenario-list', 'accept-list', 'points-list', 'points-left', 'points-board',
    'mood-list', 'mood-left', 'mood-board', 'mood-other-wrap', 'mood-other-text', 'single-pick', 'six-nations',
    'date-constraint', 'date-notes', 'family-list', 'comment', 'form-errors', 'submit-btn',
    'prop-label', 'prop-desc', 'prop-dims', 'prop-label-count', 'prop-desc-count', 'proposal-icon',
    'new-scenarios-banner', 'prefill-notice'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });

  // ------------------------------------------------------------ démarrage

  WT.boot(function (data) {
    state.scenarios = data.scenarios || [];
    state.config = data.config || {};
    el.loading.classList.add('hidden');
    el.poll.classList.remove('hidden');
    renderStatic();
    renderAll();
    var known = WT.get(WT.LS.name);
    if (known && WT.namesFrom(state.config).indexOf(known) !== -1) {
      el.name.value = known;
      loadPrior(known);
    }
  });

  // ----------------------------------------------------- rendu des blocs

  function proposal() {
    var label = el['prop-label'].value.trim();
    var desc = el['prop-desc'].value.trim();
    if (!label || !desc) return null;
    var dims = {};
    WT.DIMENSIONS.forEach(function (d) {
      var cb = document.getElementById('prop-dim-' + d.key);
      dims[d.key] = !!(cb && cb.checked);
    });
    return { id: 'NEW', label: label, description: desc, dims: dims, isNew: true };
  }

  /** Les scénarios du serveur, plus celui que le répondant est en train
   *  d'écrire : il le note et le pointe comme les autres. */
  function allScenarios() {
    var list = state.scenarios.slice();
    var p = proposal();
    if (p) list.push(p);
    return list;
  }

  function renderStatic() {
    // Prénoms
    var names = WT.namesFrom(state.config);
    el.name.innerHTML = '<option value="">— choisis —</option>' + names.map(function (n) {
      return '<option value="' + WT.esc(n) + '">' + WT.esc(n) + '</option>';
    }).join('');

    // Cases à cocher du scénario proposé
    el['prop-dims'].innerHTML = WT.DIMENSIONS.map(function (d) {
      return '<label class="choice"><input type="checkbox" id="prop-dim-' + d.key + '">' +
        '<span class="txt">' + WT.esc(d.label) + '</span></label>';
    }).join('');
    el['proposal-icon'].innerHTML = WT.ICONS.ball;

    // Ambiance
    var moods = WT.moodsFrom(state.config);
    el['mood-list'].innerHTML = WT.MOOD_KEYS.map(function (k) {
      return '<div class="pointer" data-mood="' + k + '">' +
        '<span class="pt-label"><strong>' + WT.esc(moods[k].label) + '</strong>' +
        (moods[k].note ? ' — ' + WT.esc(moods[k].note) : '') + '</span>' +
        stepperHTML('mood', k) + '</div>';
    }).join('');

    // Choix uniques hors scénarios
    el['six-nations'].innerHTML = radiosHTML('six_nations', WT.SIX_NATIONS_OPTIONS);
    el['date-constraint'].innerHTML = radiosHTML('date_constraint', WT.DATE_OPTIONS);

    // Friction domestique
    el['family-list'].innerHTML = WT.DIMENSIONS.map(function (d) {
      return '<div class="field"><div class="lab">' + WT.esc(d.short) + '</div>' +
        '<p class="small muted" style="margin:-2px 0 6px">' + WT.esc(d.label) + '</p>' +
        '<div class="choices">' + WT.FAMILY_OPTIONS.map(function (o) {
          return '<label class="choice"><input type="radio" name="family_' + d.key + '" value="' + o.value + '">' +
            '<span class="txt">' + WT.esc(o.label) + '</span></label>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function radiosHTML(name, options) {
    return options.map(function (o) {
      return '<label class="choice"><input type="radio" name="' + name + '" value="' + WT.esc(o.value) + '">' +
        '<span class="txt">' + WT.esc(o.label) + '</span></label>';
    }).join('');
  }

  function stepperHTML(kind, key) {
    return '<span class="stepper" data-kind="' + kind + '" data-key="' + WT.esc(key) + '">' +
      '<button type="button" data-delta="-1" aria-label="moins">−</button>' +
      '<span class="v">0</span>' +
      '<button type="button" data-delta="1" aria-label="plus">+</button>' +
      '</span>';
  }

  function scenarioHeadHTML(sc) {
    var tag = sc.isNew
      ? '<span class="tag new">ton format</span>'
      : (sc.proposed_by ? '<span class="tag">proposé par ' + WT.esc(sc.proposed_by) + '</span>' : '');
    return '<div class="head"><div class="icon">' + WT.iconFor(sc) + '</div><div>' +
      '<div class="title">' + WT.esc(sc.label) + '</div>' +
      '<div class="desc">' + WT.esc(sc.description) + '</div>' + tag +
      '</div></div>';
  }

  function renderAll() {
    renderScenarioList();
    renderAccept();
    renderPoints();   // appelle refreshSteppers(), qui remet aussi l'ambiance à jour
    renderSinglePick();
  }

  function renderScenarioList() {
    el['scenario-list'].innerHTML = state.scenarios.map(function (sc) {
      return '<div class="scenario">' + scenarioHeadHTML(sc) + '</div>';
    }).join('');
  }

  function renderAccept() {
    el['accept-list'].innerHTML = allScenarios().map(function (sc) {
      var v = state.accept[sc.id] || 0;
      var balls = [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="ball-btn" data-accept="' + sc.id + '" data-v="' + n + '"' +
          ' aria-pressed="' + (v === n) + '" title="' + WT.esc(WT.ANCHORS[n]) + '">' +
          WT.ballSVG() + '<span class="n">' + n + '</span></button>';
      }).join('');
      return '<div class="scenario' + (v === 1 ? ' vetoed' : '') + '">' +
        scenarioHeadHTML(sc) +
        '<div class="ball-scale">' + balls + '</div>' +
        '<div class="anchor-legend"><span>1 · sans moi</span><span>5 · super chaud</span></div>' +
        '<div class="anchor-live">' + (v ? WT.esc(v + ' — ' + WT.ANCHORS[v]) : '') + '</div>' +
        '</div>';
    }).join('');
  }

  function isOpen(sc) { return state.accept[sc.id] > 1; }
  function isVetoed(sc) { return state.accept[sc.id] === 1; }

  /** « Si un répondant ne laisse qu'un seul scénario ouvert, les 10 points
   *  y vont d'office. » */
  function soleOpen() {
    var all = allScenarios();
    var rated = all.filter(function (s) { return state.accept[s.id]; });
    if (rated.length !== all.length || !all.length) return null;
    var open = all.filter(isOpen);
    return open.length === 1 ? open[0] : null;
  }

  function renderPoints() {
    var all = allScenarios();
    var sole = soleOpen();
    if (sole) {
      state.points = {};
      state.points[sole.id] = 10;
    }
    el['points-list'].innerHTML = all.map(function (sc) {
      var vetoed = isVetoed(sc);
      var unrated = !state.accept[sc.id];
      var v = state.points[sc.id] || 0;
      var note = vetoed ? '<span class="tag" style="background:var(--veto)">vetoé, pas de points</span>'
        : (unrated ? '<span class="tag" style="background:#8a8371">note-le d\'abord</span>' : '');
      return '<div class="scenario' + (vetoed || unrated ? ' disabled' : '') + (vetoed ? ' vetoed' : '') + '">' +
        scenarioHeadHTML(sc) + note +
        '<div class="pointer">' +
        '<span class="pt-label">Points</span>' +
        '<span class="stepper" data-kind="points" data-key="' + WT.esc(sc.id) + '">' +
        '<button type="button" data-delta="-1" aria-label="moins">−</button>' +
        '<span class="v' + (v ? '' : ' zero') + '">' + v + '</span>' +
        '<button type="button" data-delta="1" aria-label="plus">+</button>' +
        '</span></div></div>';
    }).join('');
    if (sole) {
      var msg = document.createElement('p');
      msg.className = 'small muted';
      msg.textContent = 'Tu n\'as laissé qu\'un seul format ouvert : les 10 points y vont d\'office.';
      el['points-list'].appendChild(msg);
    }
    refreshSteppers();
  }

  function renderSinglePick() {
    var all = allScenarios();
    if (state.single_pick && !all.some(function (s) { return s.id === state.single_pick; })) {
      state.single_pick = '';
    }
    el['single-pick'].innerHTML = all.map(function (sc) {
      return '<label class="choice"><input type="radio" name="single_pick" value="' + WT.esc(sc.id) + '"' +
        (state.single_pick === sc.id ? ' checked' : '') + '>' +
        '<span class="txt"><strong>' + WT.esc(sc.label) + '</strong><br><span class="small muted">' +
        WT.esc(sc.description) + '</span></span></label>';
    }).join('');
  }

  // --------------------------------------------------------- compteurs

  function pointsTotal() {
    return Object.keys(state.points).reduce(function (a, k) { return a + (state.points[k] || 0); }, 0);
  }

  function moodTotal() {
    return WT.MOOD_KEYS.reduce(function (a, k) { return a + (state.mood[k] || 0); }, 0);
  }

  function refreshSteppers() {
    var pLeft = 10 - pointsTotal();
    var mLeft = 10 - moodTotal();
    board(el['points-board'], el['points-left'], pLeft);
    board(el['mood-board'], el['mood-left'], mLeft);

    // Un seul format ouvert : les 10 points y sont posés d'office, steppers figés.
    var sole = soleOpen();
    var known = {};
    allScenarios().forEach(function (s) { known[s.id] = true; });

    document.querySelectorAll('.stepper').forEach(function (st) {
      var kind = st.dataset.kind, key = st.dataset.key;
      var minus = st.querySelector('[data-delta="-1"]');
      var plus = st.querySelector('[data-delta="1"]');
      var val = st.querySelector('.v');
      var v = (kind === 'points') ? (state.points[key] || 0) : (state.mood[key] || 0);
      val.textContent = v;
      val.classList.toggle('zero', v === 0);
      if (kind === 'points') {
        var locked = !known[key] || !state.accept[key] || state.accept[key] === 1 || !!sole;
        plus.disabled = locked || pLeft <= 0;
        minus.disabled = locked || v <= 0;
      } else {
        plus.disabled = mLeft <= 0;
        minus.disabled = v <= 0;
      }
    });
    el['mood-other-wrap'].classList.toggle('hidden', !(state.mood.other > 0));
  }

  function board(boardEl, valEl, left) {
    valEl.textContent = left;
    boardEl.classList.toggle('over', left < 0);
    boardEl.classList.toggle('done', left === 0);
  }

  // ----------------------------------------------------------- écouteurs

  document.addEventListener('click', function (ev) {
    var ball = ev.target.closest('[data-accept]');
    if (ball) {
      var id = ball.dataset.accept, v = Number(ball.dataset.v);
      state.accept[id] = (state.accept[id] === v) ? 0 : v;
      if (!state.accept[id]) delete state.accept[id];
      if (state.accept[id] === 1) delete state.points[id];   // un veto ne garde pas ses points
      renderAccept();
      renderPoints();
      return;
    }
    var step = ev.target.closest('.stepper button');
    if (step) {
      var st = step.closest('.stepper');
      var kind = st.dataset.kind, key = st.dataset.key;
      var delta = Number(step.dataset.delta);
      if (kind === 'points') {
        var v = (state.points[key] || 0) + delta;
        if (v < 0) v = 0;
        if (10 - pointsTotal() - delta < 0 && delta > 0) return;
        state.points[key] = v;
        if (!v) delete state.points[key];
      } else {
        var m = (state.mood[key] || 0) + delta;
        if (m < 0) m = 0;
        if (10 - moodTotal() - delta < 0 && delta > 0) return;
        state.mood[key] = m;
      }
      refreshSteppers();
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'single_pick') state.single_pick = t.value;
    else if (t.name === 'six_nations') state.six_nations = t.value;
    else if (t.name === 'date_constraint') state.date_constraint = t.value;
    else if (t.name && t.name.indexOf('family_') === 0) state.family[t.name.substring(7)] = t.value;
    else if (t.id && t.id.indexOf('prop-dim-') === 0) { /* dims : lues à la volée */ }
  });

  el.name.addEventListener('change', function () {
    var n = el.name.value;
    el['prefill-notice'].classList.add('hidden');
    el['new-scenarios-banner'].classList.add('hidden');
    if (n) loadPrior(n);
  });

  ['prop-label', 'prop-desc'].forEach(function (id) {
    el[id].addEventListener('input', function () {
      el[id + '-count'].textContent = el[id].value.length;
      if (!proposal()) { delete state.accept.NEW; delete state.points.NEW; }
      renderAccept();
      renderPoints();
      renderSinglePick();
    });
  });

  el['prop-dims'].addEventListener('change', renderAccept);

  // ------------------------------------------------------ pré-remplissage

  function loadPrior(name) {
    WT.call('getResponses', { name: name }).then(function (data) {
      // La liste peut avoir bougé depuis le chargement de la page.
      state.scenarios = data.scenarios || state.scenarios;
      state.config = data.config || state.config;
      var prev = data.response;
      state.prior = prev;
      if (!prev) { renderAll(); refreshSteppers(); return; }

      state.accept = {};
      Object.keys(prev.accept || {}).forEach(function (k) { state.accept[k] = Number(prev.accept[k]); });
      state.points = {};
      Object.keys(prev.points || {}).forEach(function (k) {
        if (prev.points[k] > 0) state.points[k] = Number(prev.points[k]);
      });
      WT.MOOD_KEYS.forEach(function (k) { state.mood[k] = Number(prev.mood[k]) || 0; });
      el['mood-other-text'].value = prev.mood.other_text || '';
      state.single_pick = prev.single_pick || '';
      state.six_nations = prev.six_nations || '';
      state.date_constraint = prev.date_constraint || '';
      el['date-notes'].value = prev.date_notes || '';
      state.family = {};
      WT.DIMENSIONS.forEach(function (d) { state.family[d.key] = (prev.family || {})[d.key] || ''; });
      el.comment.value = prev.comment || '';

      checkRadio('six_nations', state.six_nations);
      checkRadio('date_constraint', state.date_constraint);
      WT.DIMENSIONS.forEach(function (d) { checkRadio('family_' + d.key, state.family[d.key]); });

      renderAll();
      refreshSteppers();

      el['prefill-notice'].innerHTML = 'Tu avais déjà répondu le ' + WT.esc(frDate(prev.updated_at)) +
        '. Tes réponses sont rechargées&nbsp;: modifie ce que tu veux, ta nouvelle version remplacera l\'ancienne.';
      el['prefill-notice'].classList.remove('hidden');

      // Scénarios apparus depuis son vote : il n'a pas d'avis dessus.
      var missing = state.scenarios.filter(function (s) { return !(s.id in (prev.accept || {})); });
      if (missing.length) {
        el['new-scenarios-banner'].innerHTML = '<strong>' + missing.length +
          (missing.length > 1 ? ' nouveaux scénarios ont été proposés' : ' nouveau scénario a été proposé') +
          ' depuis ton vote</strong>' +
          missing.map(function (s) {
            return (s.proposed_by ? WT.esc(s.proposed_by) + ' : ' : '') + WT.esc(s.label);
          }).join(' ; ') + '. Tu peux mettre ta réponse à jour.';
        el['new-scenarios-banner'].classList.remove('hidden');
      }
    }).catch(function (e) { showErrors([e.message]); });
  }

  function checkRadio(name, value) {
    if (!value) return;
    var input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) input.checked = true;
  }

  function frDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' à ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ------------------------------------------------------------ validation

  function validate() {
    var errs = [];
    var all = allScenarios();
    if (!el.name.value) errs.push('Choisis ton prénom (question 1).');

    var label = el['prop-label'].value.trim(), desc = el['prop-desc'].value.trim();
    if (label && !desc) errs.push('Ton format proposé a un nom mais pas de description (question 2).');
    if (desc && !label) errs.push('Ton format proposé a une description mais pas de nom (question 2).');

    var unrated = all.filter(function (s) { return !state.accept[s.id]; });
    if (unrated.length) {
      errs.push('Note tous les formats de 1 à 5 (question 3) — il en manque ' + unrated.length + '.');
    }
    var pt = pointsTotal();
    if (pt !== 10) errs.push('Les points de format doivent faire 10 (tu en as placé ' + pt + ') — question 4.');
    var badPoints = Object.keys(state.points).filter(function (k) { return state.accept[k] === 1; });
    if (badPoints.length) errs.push('Tu as mis des points sur un format que tu as vetoé (question 4).');

    var mt = moodTotal();
    if (mt !== 10) errs.push('Les points d\'ambiance doivent faire 10 (tu en as placé ' + mt + ') — question 5.');
    if (state.mood.other > 0 && !el['mood-other-text'].value.trim()) {
      errs.push('Précise ce que tu mets derrière « Autre » en ambiance (question 5).');
    }

    if (!state.single_pick) errs.push('Choisis un seul format (question 6).');
    if (!state.six_nations) errs.push('Réponds sur le 6 Nations (question 7).');
    if (!state.date_constraint) errs.push('Réponds sur la date (question 8).');
    var famMissing = WT.DIMENSIONS.filter(function (d) { return !state.family[d.key]; });
    if (famMissing.length) errs.push('Réponds sur les ' + WT.DIMENSIONS.length + ' lignes « à la maison » (question 9).');

    return errs;
  }

  function showErrors(errs) {
    if (!errs.length) { el['form-errors'].innerHTML = ''; return; }
    el['form-errors'].innerHTML = '<strong>Il manque encore un truc :</strong><ul>' +
      errs.map(function (e) { return '<li>' + WT.esc(e) + '</li>'; }).join('') + '</ul>';
    el['form-errors'].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------- envoi

  el.poll.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (state.sending) return;
    var errs = validate();
    if (errs.length) { showErrors(errs); return; }
    showErrors([]);

    var p = proposal();
    var payload = {
      name: el.name.value,
      accept: state.accept,
      points: state.points,
      mood: {
        sport: state.mood.sport, chill: state.mood.chill, party: state.mood.party,
        mix: state.mood.mix, other: state.mood.other,
        other_text: el['mood-other-text'].value.trim()
      },
      single_pick: state.single_pick,
      six_nations: state.six_nations,
      date_constraint: state.date_constraint,
      date_notes: el['date-notes'].value.trim(),
      family: state.family,
      comment: el.comment.value.trim()
    };
    if (p) payload.new_scenario = { label: p.label, description: p.description, dims: p.dims };

    state.sending = true;
    el['submit-btn'].disabled = true;
    el['submit-btn'].textContent = 'Envoi…';

    WT.call('submit', payload).then(function () {
      WT.set(WT.LS.name, payload.name);
      WT.set(WT.LS.voted, '1');
      location.href = 'results.html';
    }).catch(function (e) {
      state.sending = false;
      el['submit-btn'].disabled = false;
      el['submit-btn'].textContent = 'Envoyer ma réponse';
      showErrors([e.message]);
    });
  });
})();
