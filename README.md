# weekendtop14

Sondage du groupe sur le format du weekend des demi-finales du Top 14.
Page statique (GitHub Pages) + Google Sheet comme base + un Apps Script comme
seule couche serveur. Pas de framework, pas de build.

```
index.html            le formulaire
results.html          la page de résultats
assets/config.js      l'URL de la web app (le seul fichier à éditer après déploiement)
assets/api.js         mot de passe, appels réseau, petits SVG
assets/form.js        logique du formulaire
assets/results.js     calculs et rendu des résultats
assets/theme.css      le thème « feuille de match »
apps-script/Code.gs   le backend, à copier-coller dans l'éditeur Apps Script
```

Compter 30 minutes pour tout redéployer à partir de zéro.

---

## 1. La Google Sheet et le script (~15 min)

1. Crée une Google Sheet vide, nomme-la `weekendtop14`.
2. Dans la Sheet : **Extensions → Apps Script**.
3. Supprime le contenu de `Code.gs` et colle celui de `apps-script/Code.gs`.
4. Dans l'éditeur, choisis la fonction `setupSheet` et lance-la. Autorise le
   script quand Google le demande (c'est ton propre script, l'avertissement
   « application non vérifiée » est normal : *Paramètres avancées → Accéder à…*).
   Elle crée les quatre onglets (`scenarios`, `responses`, `config`,
   `responses_log`), les en-têtes, les cinq scénarios de départ et la liste des
   prénoms. Elle est relançable sans risque.
5. Enregistre le mot de passe du groupe : **Paramètres du projet → Propriétés du
   script → Ajouter une propriété**, nom `POLL_PASSWORD`, valeur = le mot de
   passe. (Alternative : renseigne `pw` dans `setPassword()`, lance la fonction,
   puis efface la valeur du code.)
   Le mot de passe ne doit jamais se retrouver dans le dépôt.
6. **Déployer → Nouveau déploiement → Application web** :
   - Exécuter en tant que : **moi**
   - Qui a accès : **tout le monde** (anonyme)
   - Déployer, puis copie l'**URL de l'application web** (elle finit par `/exec`).

> À chaque modification de `Code.gs`, il faut **Déployer → Gérer les déploiements
> → modifier → Nouvelle version**. Sans ça, l'ancienne version reste servie.

### Vérifier avec curl

Remplace `<URL>` par l'URL `/exec` et `<MDP>` par le mot de passe.

```bash
curl -sL "<URL>?action=getScenarios&password=<MDP>" | head -c 400
```

Doit renvoyer `{"ok":true,"scenarios":[...` avec les cinq scénarios.
Sans mot de passe, on obtient `{"ok":false,"error":"unauthorized",...}`.

```bash
curl -sL -X POST "<URL>" -H 'Content-Type: text/plain' -d '{
  "action":"submit","password":"<MDP>","name":"Pierrot",
  "accept":{"S0":5,"S1":3,"S2":2,"S3":4,"S4":1},
  "points":{"S0":7,"S3":3},
  "mood":{"sport":2,"chill":4,"party":4,"mix":0,"other":0,"other_text":""},
  "single_pick":"S0","six_nations":"addon","date_constraint":"prefer",
  "date_notes":"","family":{"frequency":"negotiate","date":"easy",
  "stadium":"easy","activities":"easy","abroad":"hard"},"comment":"test"}'
```

```bash
curl -sL "<URL>?action=getResponses&password=<MDP>" | head -c 400
```

Pense à supprimer la ligne de test dans l'onglet `responses` avant d'envoyer le
lien au groupe (et la ligne correspondante dans `responses_log`).

## 2. Le dépôt et GitHub Pages (~10 min)

1. Colle l'URL `/exec` dans `assets/config.js`, dans `WEB_APP_URL`.
2. Crée le dépôt `weekendtop14` et pousse le contenu de ce dossier.
3. **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier
   `/ (root)`. L'URL publiée s'affiche au bout d'une minute.
4. Ouvre l'URL, entre le mot de passe, remplis le formulaire, vérifie que la
   ligne arrive dans la Sheet.

GitHub Pages sur un dépôt **privé** demande un compte Pro. Sinon le dépôt passe
en public : ce n'est pas un problème ici, puisque le mot de passe n'est pas dans
le code et que sans lui la page n'affiche rien d'autre que l'écran d'accueil.

## 3. Envoyer au groupe

Le lien Pages + le mot de passe dans WhatsApp. Pas de date limite : le sondage
reste ouvert et chacun peut revenir modifier sa réponse.

---

## Ce que fait le script

Trois actions, en `GET` (pratique pour curl) comme en `POST` (ce qu'utilise la page) :

| action | ce qu'elle renvoie |
|---|---|
| `getScenarios` | les scénarios `visible` + la config (prénoms, libellés d'ambiance) |
| `getResponses` | toutes les réponses ; avec `name=Ju`, seulement celle de Ju (pré-remplissage) |
| `submit` | enregistre ou remplace la réponse d'un prénom, et crée le scénario proposé s'il y en a un |

**CORS.** Les web apps Apps Script ne répondent pas aux requêtes de préflight.
La page envoie donc du JSON avec l'en-tête `Content-Type: text/plain;charset=utf-8`,
ce qui en fait une requête « simple » que le navigateur envoie sans préflight.
Ne remplace pas ça par `application/json` : la page cesserait de fonctionner.

**Mot de passe.** Il est comparé côté script à la propriété `POLL_PASSWORD` ;
toute requête sans lui repart avec `{"ok":false,"error":"unauthorized"}`.
Apps Script ne permet pas de choisir le code HTTP : le refus est dans le corps
de la réponse, pas dans un 403. Côté page, ça revient au même : rien ne
s'affiche. La page mémorise le mot de passe dans `localStorage` et ne le
redemande pas sur le même navigateur.

**Scénario proposé.** Le formulaire ne connaît pas encore l'identifiant du
scénario que le répondant est en train d'écrire : il envoie ses notes et ses
points sous la clé `NEW`, et le script la remplace par l'identifiant attribué
(`S5`, `S6`…) avant d'enregistrer.

## Modération et réglages, sans toucher au code

Tout se fait dans la Sheet :

- **Retirer un scénario** : passe son `status` à `hidden`. Il disparaît de la
  page ; ses points restent dans les données brutes.
- **Renommer un scénario** : édite `label` / `description`.
- **Corriger les dimensions d'un scénario proposé** : les cinq colonnes
  `dim_frequency`, `dim_date`, `dim_stadium`, `dim_activities`, `dim_abroad`
  (`TRUE` / `FALSE`). Elles alimentent l'indicateur de friction domestique.
- **Changer la liste des prénoms** : ligne `names` de l'onglet `config`,
  séparés par des virgules.
- **Changer les libellés d'ambiance** : lignes `mood_*` de l'onglet `config`
  (`value` = le libellé, `note` = l'explication affichée).

Les modes d'emploi affichés sous chaque question vivent dans le code, pas dans
la Sheet : ils sont en clair dans `index.html`, à ajuster avant l'envoi.

## Comment sont calculés les résultats

- **Points bruts** : la somme des points saisis. Ce que les gens ont fait.
- **Points pondérés** : les points de chaque personne sont multipliés par
  (formats laissés ouverts / formats évalués). Quelqu'un qui n'a laissé que
  deux formats ouverts sur cinq pèse 4 points au lieu de 10. C'est la
  correction du biais de concentration, et la lecture recommandée.
- **Indice de Borda** : les points de chacun sont convertis en un rang (ex æquo
  partagés, vetos derniers), normalisé entre 0 et 100 puis moyenné sur les
  personnes ayant évalué le scénario. 100 = premier chez tout le monde. Cette
  lecture ne dépend pas du tout de la concentration.
- **Non évalué** : un scénario proposé après le vote de quelqu'un n'entre ni
  dans sa moyenne d'acceptabilité, ni dans son classement de Borda. Il apparaît
  en gris dans les tableaux.
- **Friction domestique** : pour chaque format, le nombre de personnes pour qui
  au moins une dimension activée par ce format est « compliqué ». Nuance :
  « passer à deux weekends par an » n'est comptée que pour ceux qui ont répondu
  que le 6 Nations serait *en plus* du Top 14.

## Limites assumées

- L'accès aux résultats est conditionné à un `localStorage` posé après le vote :
  c'est une barrière de politesse, pas une sécurité.
- Un seul mot de passe pour tout le groupe, pas de comptes.
- Une réponse par prénom : on remplace, on ne supprime pas. L'onglet
  `responses_log` garde l'historique brut de chaque soumission.
- Les scénarios proposés sont visibles immédiatement, sans validation préalable.
