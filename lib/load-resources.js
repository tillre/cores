var path = require('path');
var jski = require('jski');
var walk = require('walk-fs');
var Q = require('kew');


function camelize(str) {
  return str.replace(/(^\w)|(\-\w)/g, function(m) {
    return m.slice(-1).toUpperCase();
  });
};


function extend(a, b) {
  for (var x in b) a[x] = b[x];
  return a;
};


module.exports = function loadResources(cores, dir) {

  var defer = Q.defer();
  if (!dir) {
    return Q.resolve({});
  }

  dir = path.resolve(dir);

  var configs = {};
  var re = /([\w\-]+)-(schema|design)\.js$/i;

  walk(dir, { recursive: true }, function(path, stats) {

    if (stats.isFile()) {
      var m = path.match(re);
      if (m) {
        var name = m[1].toLowerCase();
        var type = m[2].toLowerCase();
        var cname = camelize(name);
        var config = configs[cname] = configs[cname] || {};

        var obj = require(path);
        // convert pure json schemas to jski schemas
        if (type === 'schema' && !obj.__jski__) {
          obj = jski.createValidator(obj);
        }
        config[type] = obj;
      }
    }
  }, function(err) {
    if (err) return defer.reject(err);

    var keys = Object.keys(configs);
    var numRes = keys.length;
    var resources = {};

    var promises = Object.keys(configs).map(function(name) {

      var config = configs[name];
      config.validateRefs = false;
      return cores.create(name, config).then(function(res) {
        resources[name] = res;
      });
    });

    Q.all(promises).then(function() {
      defer.resolve(resources);
    }, function(err) {
      defer.reject(err);
    });
  });

  return defer.promise;
};
