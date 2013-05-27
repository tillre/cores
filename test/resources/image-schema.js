var js = require('jski');

module.exports = js.object({
  name: js.string(),
  url: js.string().format('url')
});