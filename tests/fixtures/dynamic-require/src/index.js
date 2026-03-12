const suffix = process.env.FEATURE || 'a';
module.exports = require('./feature-' + suffix + '.js');
