const express = require("express");
const router = express.Router();
const dbController = require("../controllers/dbController");

router.post("/db/connect-mongo", dbController.connectMongo);
router.post("/db/aggregate", dbController.aggregate);
router.post("/db/explain", dbController.explain);
router.post("/db/schema", dbController.getSampleSchema)

module.exports = router;