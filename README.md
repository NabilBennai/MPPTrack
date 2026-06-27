# MPP Track

Projet Express + TypeScript + Tailwind + HTMX

## Installation

```bash
npm install
npm run dev
```

## Historique Turso

Définir `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET` et
`STANDINGS_SNAPSHOT_INTERVAL_MINUTES` dans `.env` et dans les variables
d'environnement du projet Vercel.

Le cron externe appelle `GET /api/cron/snapshot`. La route exige l'en-tête
`Authorization: Bearer <CRON_SECRET>`. Les appels sont regroupés dans des
créneaux définis par `STANDINGS_SNAPSHOT_INTERVAL_MINUTES` : avec `60`, un seul
instantané est conservé par heure; avec `15`, un par quart d'heure.

Le tableau de bord historique est disponible sur `/history`.

La planification Vercel est volontairement désactivée dans `vercel.json` pour
éviter la limite du plan Hobby. Utiliser cron-job.org avec une exécution horaire
à l'heure pile sur la route `/api/cron/snapshot`.

En local, `npm run dev` lance automatiquement une capture au démarrage puis
toutes les `STANDINGS_SNAPSHOT_INTERVAL_MINUTES`. Pour le désactiver :
`LOCAL_SNAPSHOT_SCHEDULER_ENABLED=false`.
