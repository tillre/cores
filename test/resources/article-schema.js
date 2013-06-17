var js = require('jski');

module.exports = js.object({

  title: js.string(),
  author: js.object({
    firstname: js.string(),
    lastname: js.string()
  }),
  tags: js.array(js.string()),
  image: js.ref('Image'),
  body: js.string()
  
}).required('title', 'author', 'body');
