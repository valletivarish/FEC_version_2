import serverless from "serverless-http";
import { buildApp } from "./app.js";

export const handler = serverless(buildApp());
