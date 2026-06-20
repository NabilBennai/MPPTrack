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

Le cron Vercel appelle `GET /api/cron/snapshot` chaque minute. La route exige
l'en-tête `Authorization: Bearer <CRON_SECRET>`. Les appels sont regroupés
dans des créneaux définis par `STANDINGS_SNAPSHOT_INTERVAL_MINUTES` : avec
`60`, un seul instantané est conservé par heure; avec `15`, un par quart
d'heure.

Le tableau de bord historique est disponible sur `/history`.

Le plan Vercel Hobby limite les cron jobs à une exécution quotidienne. Une
fréquence variable infrajournalière nécessite un plan compatible ou un
ordonnanceur externe appelant la même route chaque minute.

En local, `npm run dev` lance automatiquement une capture au démarrage puis
toutes les `STANDINGS_SNAPSHOT_INTERVAL_MINUTES`. Pour le désactiver :
`LOCAL_SNAPSHOT_SCHEDULER_ENABLED=false`.
