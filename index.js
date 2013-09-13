var nano = require('nano');
var createResource = require('./lib/create.js');


module.exports = function(db) {

  return {

    db: db,

    //
    // fetch a couple of documents from couchdb by keys
    //
    fetch: function(keys, params, callback) {
      if (arguments.length === 2 && typeof params === 'function') {
        callback = params;
        params = {};
      }
      db.fetch({ keys: keys }, params, callback);
    },


    //
    // create a new resource object
    //
    create: function(name, config, callback) {
      return createResource(this, name, config, callback);
    },


    //
    // get a number of fresh uuids from the couchdb
    //
    uuids: function(count, callback) {

      if (typeof count === 'function') {
        callback = count;
        count = 1;
      }
      nano(db.config.url).relax({ path: '_uuids', params: { count: count }}, callback);
    }
  };
};
