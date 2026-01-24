import express from "express";
import subjectsRouter from "./routes/subjects";
import cors from "cors";
import securityMiddleware from "./middleware/security";
const app = express();
const PORT = 8000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

app.use(securityMiddleware);

app.use("/api/subjects", subjectsRouter);

app.get("/", (req, res) => {
  res.send("Hello, welcome to the classroom backend!");
});

app.listen(PORT, () =>
  console.log(`server running in http://localhost:${PORT}`),
);
