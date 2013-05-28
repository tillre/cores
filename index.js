var nano = require('nano');

var createResource = require('./lib/create.js');
var loadResources = require('./lib/load.js');


module.exports = function(db) {

  return {

    create: function(config, callback) {
      return createResource(db, config, callback);
    },

    load: function(dir, options, callback) {
      return loadResources(db, dir, options, callback);
    },

    uuids: function(count, callback) {

      if (typeof count === 'function') {
        callback = count;
        count = 1;
      }
      nano(db.config.url).relax({ path: '_uuids', params: { count: count }}, callback);
    }
  };
};
