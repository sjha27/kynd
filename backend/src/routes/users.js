'use strict';

const express = require('express');
const usersService = require('../services/users');
const { parseUuidParam } = require('../lib/uuid');

const router = express.Router();

router.get('/:id/profile', async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'user id');
    const profile = await usersService.getUserProfile(id);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
