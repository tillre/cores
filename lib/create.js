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


module.exports = function createResource(db, config, callback) {

  var err, errs;
  
  if (!config.name) {
    err = new Error('Resource config has no name property');
    err.code = 400;
    return callback(err);
  }

  if (config.schema) {
    errs = resourceSchema.validate(config.schema);
    if (errs.length) {
      err = new Error('Resource schema does not validate');
      err.errors = errs;
      err.code = 400;
      return callback(err);
    }
  }

  if (config.design) {
    errs = designSchema.validate(config.design);
    if (errs.length) {
      err = new Error('Resource design does not validate');
      err.errors = errs;
      err.code = 400;
      return callback(err);
    }
  }
  
  var res = new Resource(db, config);
  res.sync(callback);
};
