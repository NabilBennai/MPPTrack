import express from "express";
import path from "path";

const app = express();

app.use(express.static("public"));
app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.get("/", (_, res) => {
    res.sendFile(path.resolve("src/views/index.html"));
});

app.get("/api/message", (_, res) => {
    res.send(`
    <div class="rounded-lg border border-slate-700 bg-slate-900 p-4">
      HTMX fonctionne avec Express
    </div>
  `);
});

app.listen(3000, () => {
    console.log("http://localhost:3000");
});