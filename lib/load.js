var path = require('path');
var jski = require('jski');
var walk = require('walk-fs');

var createResource = require('./resource');


function camelize(str) {
  return str.replace(/(^\w)|(\-\w)/g, function(m) {
    return m.slice(-1).toUpperCase();
  });
};


function extend(a, b) {
  for (var x in b) a[x] = b[x];
  return a;
};


module.exports = function loadResources(db, dir, options, callback) {

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  options = extend({
    recursive: false,
    validateRefs: false
  }, options);
  
  dir = path.resolve(dir);
  
  var configs = {};
  var resources = {};
  var re = /([\w\-]+)-(schema|design)\.js$/i;
  
  walk(dir, { recursive: options.recursive }, function(path, stats) {

    if (stats.isFile()) {
      var m = path.match(re);
      if (m) {
        var name = m[1].toLowerCase();
        var type = m[2].toLowerCase();
        var cname = camelize(name);

        if (!configs[name]) {
          configs[name] = { name: cname };
        }
        configs[name][type] = require(path);
      }
    }
  }, function(err) {

    var keys = Object.keys(configs);
    var numRes = keys.length;
    var schemas = {};

    // convert schema to jski schemas if needed
    // and collect all schemas to put them on each schema as definitions
    keys.forEach(function(name) {
      var config = configs[name];
      if (!config.schema.__jski__) {
        config.schema = jski.schema(config.schema);
      }
      config.schema.definitions(schemas);
      schemas[config.name] = config.schema;
    });

    // create the resources
    keys.forEach(function(name) {

      var config = configs[name];
      config.validateRefs = options.validateRefs;

      createResource(db, config, function(err, res) {
        if (err) return callback(err);
        
        resources[config.name] = res;
        if (--numRes === 0) {
          callback(null, resources);
        }
      });
    });
  });
};
