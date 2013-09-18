var Q = require('kew');
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
module.exports = function createResource(cores, name, config) {

  var err, errs;

  if (config.schema) {
    errs = resourceSchema.validate(config.schema);
    if (errs.length) {
      err = new Error('Resource schema does not validate');
      err.errors = errs;
      return Q.reject(err);
    }
  }

  if (config.design) {
    errs = designSchema.validate(config.design);
    if (errs.length) {
      err = new Error('Resource design does not validate');
      err.errors = errs;
      return Q.reject(err);
    }
  }

  var res = new Resource(cores, name, config);
  return Q.resolve(res.sync());
};
