const express = require('express');
const router = express.Router();
const {chatbot, email, obtenerChat} = require('./controllers/celeste.js');

router.post('/chatbot', chatbot);
router.post('/obtenerChat', obtenerChat);
router.post('/email', email);

module.exports = router;