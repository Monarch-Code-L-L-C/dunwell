// Vercel entry point: every /api/* request is rewritten here (see vercel.json).
// Static files in public/ are served by Vercel directly.
module.exports = require('../server').handler;
