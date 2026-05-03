const express = require('express');
const { getAnalytics } = require('../services/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const analytics = await getAnalytics(req.companyId);
    return sendSuccess(res, analytics);
  })
);

module.exports = router;
