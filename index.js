const express = require("express");
const cors = require("cors");
const loggingMiddleWare = require("./middleware/logging");
const dbRouter = require("./routes/dbRouter");
const optimizationRouter = require("./routes/optimizationRouter")

const app = express();
const port = 3000;

const corsOptions = {
    origin: ["http://localhost:3000", "https://mongo-es-front.vercel.app/", "https://mongo-es.vercel.app/"],
    methods: ["POST", "GET", "DELETE", "PATCH", "PUT"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.use(loggingMiddleWare);

app.use("/api/v1", dbRouter);
app.use("/api/v1", optimizationRouter);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});