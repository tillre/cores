var jski = require('jski');
var Resource = require('./resource.js');


var resourceSchema = jski.object({
  title: jski.string(),
  description: jski.string(),
  properties: jski.object({
    type: jski.enum(['object']),
    properties: jski.object()
  }),
  default: jski.any()
});


var designSchema = jski.object({
  title: jski.string(),
  description: jski.string(),
  views: jski.object(),
  shows: jski.object(),
  lists: jski.object()
});


//
// create a resource
//

module.exports = function createResource(cores, config, callback) {

  var err, errs;

  if (!config.name) {
    return callback (new Error('Resource config has no name property'));
  }

  if (config.schema) {
    errs = resourceSchema.validate(config.schema);
    if (errs.length) {
      err = new Error('Resource schema does not validate');
      err.errors = errs;
      return callback(err);
    }
  }

  if (config.design) {
    errs = designSchema.validate(config.design);
    if (errs.length) {
      err = new Error('Resource design does not validate');
      err.errors = errs;
      return callback(err);
    }
  }

  var res = new Resource(cores, config);
  res.sync(callback);
};
