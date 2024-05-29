const express = require("express");
const router = express.Router();
const optimizationController = require("../controllers/optimizationController")

router.post("/optimize", optimizationController.optimizePipeline);

module.exports = router;