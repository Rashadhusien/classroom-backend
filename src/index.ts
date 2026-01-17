import express from "express";

const app = express();
const PORT = 8000;

app.get("/", (req, res) => {
  res.send("Hello, welcome to the classroom backend!");
});

app.listen(PORT, () =>
  console.log(`server running in http://localhost:${PORT}`),
);
