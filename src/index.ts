import AgentAPI from "apminsight";

AgentAPI.config();

import "dotenv/config";
import express from "express";
import cors from "cors";
import { auth } from "./lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import usersRouter from "./routes/users.js";
import subjectsRouter from "./routes/subjects.js";
import classesRouter from "./routes/classes.js";
import departmentRouter from "./routes/departments.js";
// import securityMiddleware from "./middleware/security.js";
const app = express();
const PORT = 8000;

if (!process.env.FRONTEND_URL) throw new Error("FRONTEND_URL is not defined");

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// app.use(securityMiddleware);

app.use("/api/subjects", subjectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/classes", classesRouter);
app.use("/api/departments", departmentRouter);

app.get("/", (req, res) => {
  res.send("Hello, welcome to the classroom backend!");
});

app.listen(PORT, () =>
  console.log(`server running in http://localhost:${PORT}`),
);
