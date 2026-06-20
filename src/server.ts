import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import mppRouter from "./routes/mpp.routes.js";

const app = express();

// process.cwd() = racine du projet, fiable en local et sur Vercel
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/", mppRouter);

app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).send(`
    <div class="p-8 text-center text-red-400">
      <p class="font-semibold">Une erreur inattendue s'est produite.</p>
    </div>
  `);
});

// En local uniquement — Vercel gère lui-même le cycle requête/réponse
if (!process.env["VERCEL"]) {
  const PORT = process.env["PORT"] ?? 3000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}

export default app;
