import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import mppRouter from "./routes/mpp.routes.js";

const app = express();
const PORT = process.env["PORT"] ?? 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes MPP (à la racine)
// ---------------------------------------------------------------------------
app.use("/", mppRouter);

// ---------------------------------------------------------------------------
// Gestion d'erreurs globale
// ---------------------------------------------------------------------------
app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).send(`
      <div class="p-8 text-center text-red-400">
        <p class="font-semibold">Une erreur inattendue s'est produite.</p>
      </div>
    `);
});

app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
});