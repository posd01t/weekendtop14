/* weekendtop14 — page de résultats */

(function () {
  var el = {
    app: document.getElementById('app'),
    gate: document.getElementById('gate'),
    notVoted: document.getElementById('not-voted'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    results: document.getElementById('results'),
    refresh: document.getElementById('refresh')
  };

  // Barrière de politesse : pas de résultats tant qu'on n'a pas voté depuis
  // ce navigateur. Ce n'est pas une sécurité, et c'est assumé.
  if (!WT.get(WT.LS.voted)) {
    el.gate.classList.add('hidden');
    el.app.classList.remove('hidden');
    el.notVoted.classList.remove('hidden');
    el.loading.classList.add('hidden');
    el.refresh.classList.add('hidden');
    return;
  }

  WT.boot(function () { load(); });
  el.refresh.addEventListener('click', load);

  function load() {
    el.loading.classList.remove('hidden');
    el.error.classList.add('hidden');
    WT.call('getResponses', {}).then(function (data) {
      el.loading.classList.add('hidden');
      render(data);
      el.results.classList.remove('hidden');
    }).catch(function (e) {
      el.loading.classList.add('hidden');
      el.error.textContent = e.message;
      el.error.classList.remove('hidden');
    });
  }

  // ------------------------------------------------------------- calculs

  function isRated(r, id) {
    var v = Number((r.accept || {})[id]);
    return v >= 1 && v <= 5;
  }

  function ptsOf(r, id) { return Number((r.points || {})[id]) || 0; }

  /** Poids de la personne : (scénarios laissés ouverts / scénarios évalués).
   *  Corrige le biais de concentration décrit au 4.4 du PRD. */
  function weightOf(r, scenarios) {
    var evald = 0, open = 0;
    scenarios.forEach(function (s) {
      if (!isRated(r, s.id)) return;
      evald++;
      if (r.accept[s.id] > 1) open++;
    });
    return evald ? open / evald : 0;
  }

  function bordaIndex(responses, scenarios) {
    var sums = {}, counts = {};
    scenarios.forEach(function (s) { sums[s.id] = 0; counts[s.id] = 0; });

    responses.forEach(function (r) {
      var evald = scenarios.filter(function (s) { return isRated(r, s.id); });
      var n = evald.length;
      if (!n) return;
      var items = evald.map(function (s) {
        return { id: s.id, key: (r.accept[s.id] === 1) ? -1 : ptsOf(r, s.id) };
      });
      items.sort(function (a, b) { return b.key - a.key; });

      var i = 0;
      while (i < items.length) {
        var j = i;
        while (j + 1 < items.length && items[j + 1].key === items[i].key) j++;
        var avgPos = (i + j) / 2 + 1;                       // rang moyen, ex æquo partagés
        var score = (n > 1) ? (n - avgPos) / (n - 1) : (items[i].key < 0 ? 0 : 1);
        for (var k = i; k <= j; k++) { sums[items[k].id] += score; counts[items[k].id]++; }
        i = j + 1;
      }
    });

    var out = {};
    scenarios.forEach(function (s) {
      out[s.id] = counts[s.id] ? (sums[s.id] / counts[s.id]) * 100 : null;
    });
    return out;
  }

  /** Les dimensions qu'un scénario active pour une personne donnée.
   *  Seule nuance : passer à deux weekends ne concerne que ceux qui voient
   *  le 6 Nations « en plus » du Top 14. */
  function activeDims(sc, r) {
    return WT.DIMENSIONS.filter(function (d) {
      if (!sc.dims || !sc.dims[d.key]) return false;
      if (d.key === 'frequency' && r.six_nations !== 'addon') return false;
      return true;
    }).map(function (d) { return d.key; });
  }

  function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(d === undefined ? 1 : d).replace('.', ',').replace(/,0$/, '');
  }

  // --------------------------------------------------------------- rendu

  function render(data) {
    var scenarios = data.scenarios || [];
    var responses = data.responses || [];
    var config = data.config || {};
    var expected = WT.namesFrom(config);

    // Ordre d'affichage : celui de la config, puis les prénoms inattendus.
    var order = expected.slice();
    responses.forEach(function (r) { if (order.indexOf(r.name) === -1) order.push(r.name); });
    responses.sort(function (a, b) { return order.indexOf(a.name) - order.indexOf(b.name); });

    var byId = {};
    scenarios.forEach(function (s) { byId[s.id] = s; });

    var html = '';
    html += participation(scenarios, responses, expected);
    html += acceptability(scenarios, responses);
    html += formatPoints(scenarios, responses);
    html += mood(responses, config);
    html += singlePick(scenarios, responses);
    html += simpleCounts(responses);
    html += friction(scenarios, responses);
    html += freeText(responses);
    el.results.innerHTML = html;
  }

  function card(num, title, body) {
    return '<section class="card"><header><span class="num">' + num + '</span><h2>' + title + '</h2></header>' +
      '<div class="body">' + body + '</div></section>';
  }

  // 1 — participation
  function participation(scenarios, responses, expected) {
    var answered = responses.map(function (r) { return r.name; });
    var b = '<p><strong>' + responses.length + ' réponse' + (responses.length > 1 ? 's' : '') +
      '</strong> sur ' + expected.length + '.</p><div class="chips">' +
      expected.map(function (n) {
        var done = answered.indexOf(n) !== -1;
        return '<span class="chip ' + (done ? 'done' : 'todo') + '">' + WT.esc(n) + (done ? ' ✓' : '') + '</span>';
      }).join('') + '</div>';

    var added = scenarios.filter(function (s) { return s.proposed_by; });
    if (added.length && responses.length) {
      b += '<p class="legend" style="margin-top:16px">Scénarios proposés en cours de route et pas encore évalués par tout le monde&nbsp;:</p>';
      added.forEach(function (s) {
        var missing = responses.filter(function (r) { return !isRated(r, s.id); }).map(function (r) { return r.name; });
        b += '<div class="count-line"><span class="lab"><strong>' + WT.esc(s.label) + '</strong>' +
          ' <span class="small muted">proposé par ' + WT.esc(s.proposed_by) + '</span></span>' +
          '<span class="small">' + (missing.length ? 'manque : ' + WT.esc(missing.join(', ')) : 'tout le monde a donné son avis') +
          '</span></div>';
      });
    }
    return card('1', 'Qui a répondu', b);
  }

  // 2 — acceptabilité
  function acceptability(scenarios, responses) {
    if (!responses.length) return card('2', 'Chaud ou pas chaud', '<p class="muted">Pas encore de réponse.</p>');

    var head = '<tr><th class="row-head">Format</th>' +
      responses.map(function (r) { return '<th>' + WT.esc(r.name) + '</th>'; }).join('') +
      '<th>Moy.</th><th>Vetos</th><th>4-5</th></tr>';

    var rows = scenarios.map(function (s) {
      var vals = [], vetos = 0, hot = 0;
      var cells = responses.map(function (r) {
        if (!isRated(r, s.id)) return '<td class="na">non<br>évalué</td>';
        var v = r.accept[s.id];
        vals.push(v);
        if (v === 1) vetos++;
        if (v >= 4) hot++;
        return '<td class="v' + v + '">' + v + '</td>';
      }).join('');
      var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      return '<tr><td class="row-head">' + WT.esc(s.label) +
        (s.proposed_by ? '<br><span class="small muted">proposé par ' + WT.esc(s.proposed_by) + '</span>' : '') +
        '</td>' + cells +
        '<td><strong>' + fmt(avg) + '</strong></td>' +
        '<td' + (vetos ? ' class="v1"' : '') + '>' + vetos + '</td>' +
        '<td' + (hot ? ' class="v5"' : '') + '>' + hot + '</td></tr>';
    }).join('');

    var b = '<div class="tablewrap"><table class="grid">' + head + rows + '</table></div>' +
      '<p class="legend">1 = « je ne viens pas » (veto), 5 = « super chaud ». Gris = le scénario a été proposé après le vote de la personne.</p>';
    return card('2', 'Chaud ou pas chaud', b);
  }

  // 3 — points de format, trois lectures
  function formatPoints(scenarios, responses) {
    if (!responses.length) return card('3', 'Les points sur les formats', '<p class="muted">Pas encore de réponse.</p>');

    var raw = {}, weighted = {};
    scenarios.forEach(function (s) { raw[s.id] = 0; weighted[s.id] = 0; });
    responses.forEach(function (r) {
      var w = weightOf(r, scenarios);
      scenarios.forEach(function (s) {
        raw[s.id] += ptsOf(r, s.id);
        weighted[s.id] += ptsOf(r, s.id) * w;
      });
    });
    var borda = bordaIndex(responses, scenarios);

    var b = rankTable('Points bruts', 'Ce que les gens ont saisi, tel quel.', scenarios, raw, 0);
    b += rankTable('Points pondérés', 'Les points de chacun sont multipliés par (formats laissés ouverts / formats évalués). C\'est la lecture recommandée.', scenarios, weighted, 1);
    b += rankTable('Classement de Borda', 'Chaque personne classe ses formats ; indice 100 = premier chez tout le monde. Ne dépend pas de la concentration des points.', scenarios, borda, 0);

    // Détail par prénom
    var head = '<tr><th class="row-head">Format</th>' +
      responses.map(function (r) { return '<th>' + WT.esc(r.name) + '</th>'; }).join('') + '<th>Total</th></tr>';
    var rows = scenarios.map(function (s) {
      var cells = responses.map(function (r) {
        if (!isRated(r, s.id)) return '<td class="na">n.é.</td>';
        if (r.accept[s.id] === 1) return '<td class="v1">veto</td>';
        var p = ptsOf(r, s.id);
        return '<td' + (p ? '' : ' class="na"') + '>' + (p || '·') + '</td>';
      }).join('');
      return '<tr><td class="row-head">' + WT.esc(s.label) + '</td>' + cells +
        '<td><strong>' + raw[s.id] + '</strong></td></tr>';
    }).join('');
    var wRow = '<tr><td class="row-head">Poids de la personne</td>' +
      responses.map(function (r) { return '<td>×' + fmt(weightOf(r, scenarios), 2) + '</td>'; }).join('') +
      '<td></td></tr>';

    b += '<h3 style="margin-top:20px">Le détail</h3><div class="tablewrap"><table class="grid">' +
      head + rows + wRow + '</table></div>' +
      '<p class="legend">Si les trois lectures donnent le même podium, la décision est solide. Si elles divergent, c\'est là qu\'il faut discuter.</p>';

    return card('3', 'Les points sur les formats', b);
  }

  function rankTable(title, note, scenarios, values, decimals) {
    var list = scenarios.map(function (s) { return { s: s, v: values[s.id] }; })
      .filter(function (x) { return x.v !== null && x.v !== undefined; })
      .sort(function (a, b) { return b.v - a.v; });
    var max = list.length ? Math.max.apply(null, list.map(function (x) { return x.v; })) : 0;

    var rows = list.map(function (x, i) {
      var top = (i === 0 && x.v > 0) ? ' class="top"' : '';
      var w = max > 0 ? Math.round((x.v / max) * 100) : 0;
      return '<tr' + top + '><td class="pos">' + (i + 1) + '</td>' +
        '<td>' + WT.esc(x.s.label) + '</td>' +
        '<td style="width:28%"><span class="bar" style="width:' + w + '%"></span></td>' +
        '<td class="num"><strong>' + fmt(x.v, decimals) + '</strong></td></tr>';
    }).join('');

    return '<h3 style="margin-top:18px">' + WT.esc(title) + '</h3>' +
      '<p class="legend" style="margin:2px 0 8px">' + WT.esc(note) + '</p>' +
      '<table class="rank">' + rows + '</table>';
  }

  // 4 — ambiance
  function mood(responses, config) {
    if (!responses.length) return card('4', 'L\'ambiance', '<p class="muted">Pas encore de réponse.</p>');
    var moods = WT.moodsFrom(config);
    var totals = {};
    WT.MOOD_KEYS.forEach(function (k) {
      totals[k] = responses.reduce(function (a, r) { return a + (Number((r.mood || {})[k]) || 0); }, 0);
    });
    var max = Math.max.apply(null, WT.MOOD_KEYS.map(function (k) { return totals[k]; }).concat([1]));

    var b = WT.MOOD_KEYS.slice().sort(function (a, c) { return totals[c] - totals[a]; }).map(function (k) {
      return '<div class="count-line"><span class="lab">' + WT.esc(moods[k].label) + '</span>' +
        '<span class="bar" style="width:' + Math.round(totals[k] / max * 55) + '%"></span>' +
        '<span class="n">' + totals[k] + '</span></div>';
    }).join('');

    var head = '<tr><th class="row-head">Ambiance</th>' +
      responses.map(function (r) { return '<th>' + WT.esc(r.name) + '</th>'; }).join('') + '</tr>';
    var rows = WT.MOOD_KEYS.map(function (k) {
      return '<tr><td class="row-head">' + WT.esc(moods[k].label) + '</td>' +
        responses.map(function (r) {
          var v = Number((r.mood || {})[k]) || 0;
          return '<td' + (v ? '' : ' class="na"') + '>' + (v || '·') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    b += '<div class="tablewrap" style="margin-top:14px"><table class="grid">' + head + rows + '</table></div>';

    var others = responses.filter(function (r) { return (r.mood || {}).other_text; });
    if (others.length) {
      b += '<h3 style="margin-top:18px">Les « autre » précisés</h3>' + others.map(function (r) {
        return '<div class="quote"><span class="who">' + WT.esc(r.name) + ' · ' + (Number(r.mood.other) || 0) + ' pts</span>' +
          WT.esc(r.mood.other_text) + '</div>';
      }).join('');
    }
    return card('4', 'L\'ambiance', b);
  }

  // 5 — arbitrage
  function singlePick(scenarios, responses) {
    if (!responses.length) return card('5', 'Si on n\'en garde qu\'un', '<p class="muted">Pas encore de réponse.</p>');
    var counts = {};
    scenarios.forEach(function (s) { counts[s.id] = []; });
    responses.forEach(function (r) {
      if (counts[r.single_pick]) counts[r.single_pick].push(r.name);
    });
    var list = scenarios.slice().sort(function (a, b) { return counts[b.id].length - counts[a.id].length; });
    var b = list.map(function (s) {
      return '<div class="count-line"><span class="lab">' + WT.esc(s.label) +
        (counts[s.id].length ? ' <span class="small muted">' + WT.esc(counts[s.id].join(', ')) + '</span>' : '') +
        '</span><span class="n">' + counts[s.id].length + '</span></div>';
    }).join('');
    b += '<p class="legend">Une voix par personne&nbsp;: cette question n\'est pas touchée par le biais de concentration des points.</p>';
    return card('5', 'Si on n\'en garde qu\'un', b);
  }

  // 6 — 6 Nations et dates
  function simpleCounts(responses) {
    if (!responses.length) return card('6', '6 Nations & dates', '<p class="muted">Pas encore de réponse.</p>');
    var b = '<h3>Le 6 Nations à l\'étranger</h3>' + countBlock(responses, 'six_nations', WT.SIX_NATIONS_OPTIONS);
    b += '<h3 style="margin-top:18px">Le weekend des demi-finales</h3>' + countBlock(responses, 'date_constraint', WT.DATE_OPTIONS);
    return card('6', '6 Nations & dates', b);
  }

  function countBlock(responses, field, options) {
    return options.map(function (o) {
      var who = responses.filter(function (r) { return r[field] === o.value; }).map(function (r) { return r.name; });
      return '<div class="count-line"><span class="lab">' + WT.esc(o.label) +
        (who.length ? ' <span class="small muted">' + WT.esc(who.join(', ')) + '</span>' : '') +
        '</span><span class="n">' + who.length + '</span></div>';
    }).join('');
  }

  // 7 — friction domestique
  function friction(scenarios, responses) {
    if (!responses.length) return card('7', 'La friction domestique', '<p class="muted">Pas encore de réponse.</p>');
    var labels = { easy: 'sans discussion', negotiate: 'en négociant', hard: 'compliqué' };

    var head = '<tr><th class="row-head">Changement</th>' +
      responses.map(function (r) { return '<th>' + WT.esc(r.name) + '</th>'; }).join('') + '</tr>';
    var rows = WT.DIMENSIONS.map(function (d) {
      return '<tr><td class="row-head">' + WT.esc(d.short) + '<br><span class="small muted">' + WT.esc(d.label) + '</span></td>' +
        responses.map(function (r) {
          var v = (r.family || {})[d.key];
          if (!v) return '<td class="f-na">—</td>';
          return '<td class="f-' + v + '">' + WT.esc(labels[v]) + '</td>';
        }).join('') + '</tr>';
    }).join('');

    var b = '<div class="tablewrap"><table class="grid">' + head + rows + '</table></div>';

    b += '<h3 style="margin-top:18px">Par format</h3>' +
      '<p class="legend" style="margin:2px 0 8px">Nombre de personnes pour qui au moins une dimension activée par ce format est «&nbsp;compliqué&nbsp;».</p>';

    b += scenarios.map(function (s) {
      var hard = [], nego = [];
      responses.forEach(function (r) {
        var dims = activeDims(s, r);
        var vals = dims.map(function (k) { return (r.family || {})[k]; });
        if (vals.indexOf('hard') !== -1) hard.push(r.name);
        else if (vals.indexOf('negotiate') !== -1) nego.push(r.name);
      });
      var dimNames = WT.DIMENSIONS.filter(function (d) { return s.dims && s.dims[d.key]; })
        .map(function (d) { return d.short; });
      return '<div class="count-line"><span class="lab"><strong>' + WT.esc(s.label) + '</strong>' +
        '<br><span class="small muted">' + (dimNames.length ? 'active&nbsp;: ' + WT.esc(dimNames.join(', ')) : 'ne change rien à la maison') +
        (hard.length ? ' · bloqué chez ' + WT.esc(hard.join(', ')) : '') +
        (nego.length ? ' · à négocier chez ' + WT.esc(nego.join(', ')) : '') +
        '</span></span><span class="n"' + (hard.length ? ' style="color:var(--veto)"' : '') + '>' + hard.length + '</span></div>';
    }).join('');

    b += '<p class="legend">« Passer à deux weekends par an » n\'est compté que pour ceux qui voient le 6 Nations <em>en plus</em> du Top 14.</p>';
    return card('7', 'La friction domestique', b);
  }

  // 8 — textes libres
  function freeText(responses) {
    var dates = responses.filter(function (r) { return r.date_notes; });
    var comments = responses.filter(function (r) { return r.comment; });
    if (!dates.length && !comments.length) {
      return card('8', 'Ce qu\'ils ont écrit', '<p class="muted">Rien pour l\'instant.</p>');
    }
    var b = '';
    if (dates.length) {
      b += '<h3>Contraintes de dates</h3>' + dates.map(function (r) {
        return '<div class="quote"><span class="who">' + WT.esc(r.name) + '</span>' + WT.esc(r.date_notes) + '</div>';
      }).join('');
    }
    if (comments.length) {
      b += '<h3 style="margin-top:18px">Commentaires</h3>' + comments.map(function (r) {
        return '<div class="quote"><span class="who">' + WT.esc(r.name) + '</span>' +
          WT.esc(r.comment).replace(/\n/g, '<br>') + '</div>';
      }).join('');
    }
    return card('8', 'Ce qu\'ils ont écrit', b);
  }
})();
