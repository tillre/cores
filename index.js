var nano = require('nano');
var Q = require('kew');
var createResource = require('./lib/create-resource.js');
var fetchRefs = require('./lib/fetch-refs.js');


module.exports = function(db) {

  return {

    db: db,

    //
    // fetch a couple of documents from couchdb by keys
    //
    fetch: function(keys, params) {
      params = params || {};
      var defer = Q.defer();

      db.fetch({ keys: keys }, params, function(err, result) {
        if (err) return defer.reject(err);
        defer.resolve(result);
      });
      return defer.promise;
    },

    //
    // fetch a documents refs
    //
    fetchDocRefs: function(doc) {
      return fetchRefs(this, [doc]).then(function(docs) {
        return docs[0];
      });
    },

    //
    // fetch multiple documents refs
    //
    fetchDocsRefs: function(docs) {
      return fetchRefs(this, docs);
    },

    //
    // create a new resource object
    //
    create: function(name, config) {
      return createResource(this, name, config);
    },

    //
    // get a number of fresh uuids from the couchdb
    //
    uuids: function(count) {

      count = count || 1;
      var defer = Q.defer();

      nano(db.config.url).relax({
        path: '_uuids', params: { count: count }

      }, function(err, result) {
        if (err) return defer.reject();
        defer.resolve(result);
      });
      return defer.promise;
    }
  };
};
