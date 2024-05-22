const express = require("express");
const cors = require("cors");
const dbRouter = require("./routes/dbRouter");

const app = express();
const port = 3000;

const corsOptions = {
    origin: "http://localhost:3000",
    methods: ["POST", "GET", "DELETE", "PATCH", "PUT"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/v1", dbRouter);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});