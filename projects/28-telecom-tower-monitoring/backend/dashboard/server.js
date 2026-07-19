import process from "node:process";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT || 8000);
buildApp().listen(port, () => console.log(`tower dashboard listening on :${port}`));
