const express = require("express");
const router = express.Router();
const dbController = require("../controllers/dbController");

router.post("/db/connect-mongo", dbController.connectMongo);
router.post("/db/aggregate", dbController.aggregate);
router.post("/db/aggregate/part", dbController.runPartialPipeline);
router.post("/db/explain", dbController.explain);
router.post("/db/schema", dbController.getSampleSchema);
router.post("/db/cardinality", dbController.getCardinality);
router.post("/db/recommend", dbController.recommend);
router.post("/db/index", dbController.createIndexOnKey);

module.exports = router;