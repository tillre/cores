var fs = require('fs');
var path = require('path');
var async = require('async');
var jski = require('jski');

var createResource = require('./create');


function camelize(str) {
  return str.replace(/(^\w)|(\-\w)/g, function(m) {
    return m.slice(-1).toUpperCase();
  });
};


function extend(a, b) {
  for (var x in b) a[x] = b[x];
  return a;
};


function walkFiles(dir, rec, iterator, callback) {

  // make sure we are working with a absolute directory
  dir = path.resolve(dir);
  
  fs.readdir(dir, function(err, contents) {
    if (err) return callback(err);

    async.each(
      contents,

      function(item, callback) {
        var p = path.join(dir, item);

        fs.stat(p, function(err, stats) {
          if (err) return callback(err);
          
          if (stats.isFile()) {
            return iterator(p, callback);
          }
          if (rec && stats.isDirectory()) {
            return walkFiles(p, rec, iterator, callback);
          }
          callback();
        });
      },

      function(err) {
        callback(err);
      }
    );
  });
}


function walkDir(dir, rec, iterator, callback) {

  fs.readdir(dir, function(err, contents) {
    if (err) return callback(err);

    async.each(
      contents,

      function(item, callback) {
        var p = path.join(dir, item);

        fs.stat(p, function(err, stats) {
          if (err) return callback(err);
          
          if (stats.isFile()) {
            iterator(p, callback);
          }
          else if (rec && stats.isDirectory) {
            walkDir(p, iterator, callback);
          }
          else callback();
        });
      },

      function(err) {
        callback(err);
      }
    );
  });
}


function loadDir(dir, recursive, callback) {

  var re = /([\w\-]+)-(schema|design|hooks)\.js$/i;
  var configs = {};
  
  walkFiles(
    dir,
    recursive,

    function iterator(file, callback) {
      var m = file.match(re);
      if (m) {
        var name = m[1].toLowerCase();
        var type = m[2].toLowerCase();
        var cname = camelize(name);

        if (!configs[name]) {
          // create a new config entry
          configs[name] = { name: cname };
        };

        // add schema/design/hooks to config
        configs[name][type] = require(file);
      }
      callback();
    },

    function finish(err) {
      callback(err, configs);
    }
  );
}


module.exports = function loadResources(db, dir, options, callback) {

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  options = extend({
    // recurse into directories
    recursive: false,
    // application specific state passed on to the resources
    app: {},
    // validate schema refs
    validateRefs: false
  }, options);


  function createResources(configs, callback) {

    var schemas = {};
    var resources = {};
    
    // create a dict of schemas and pass it to the validators
    
    for (var n in configs) {
      var c = configs[n];
      if (!c.schema.__jski__) {
        c.schema = jski.schema(c.schema);
      }
      c.schema.definitions(schemas);
      schemas[c.name] = c.schema;
    }

    // create the resources from the configs
    
    async.each(
      Object.keys(configs),

      function(name, callback) {
        var config = configs[name];

        // add app specific state to resource obj
        config.app = options.app;

        // do not validate defs
        config.validateRefs = options.validateRefs;

        createResource(db, config, function(err, res) {
          if (err)  return callback(err);
          resources[config.name] = res;
          callback();
        });
      },
      
      function(err) {
        callback(err, resources);
      }
    );
  }

  // load resources from directory and optionally subdirectories

  loadDir(dir, options.recursive, function(err, configs) {
    if (err) return callback(err);
    createResources(configs, callback);
  });
};