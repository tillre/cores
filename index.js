var util = require('util');
var nano = require('nano');
var Q = require('kew');

var common = require('./lib/common.js');
var createResource = require('./lib/create-resource.js');
var loadResources = require('./lib/load-resources.js');
var fetchRefs = require('./lib/fetch-refs.js');


module.exports = function(dbConfig) {

  var cores = {
    db: nano(dbConfig),
    resources: {}
  };


  //
  // fetch a couple of documents by keys
  //
  cores.fetch = function(keys, params) {
    params = params || {};
    var defer = Q.defer();

    this.db.fetch({ keys: keys }, params, function(err, result) {
      if (err) return defer.reject(err);
      return defer.resolve(result);
    });
    return defer.promise;
  };


  //
  // fetch documents refs
  //
  cores.fetchRefs = function(docs) {
    if (util.isArray(docs)) {
      // fetch refs of array of document
      return fetchRefs(this, docs);
    }
    else if (typeof docs === 'object' && docs) {
      // fetch refs of single document
      return fetchRefs(this, [docs]).then(function(result) {
        return result[0];
      });
    }
    return null;
  };


  //
  // get a number of fresh uuids from the couchdb
  //
  cores.uuids = function(count) {

    count = count || 1;
    var defer = Q.defer();

    nano(this.db.config.url).relax({
      path: '_uuids', params: { count: count }

    }, function(err, result) {
      if (err) return defer.reject();
      return defer.resolve(result);
    });
    return defer.promise;
  };


  //
  // create a new resource object
  //
  cores.create = function(name, config) {
    var self = this;
    return createResource(this, name, config).then(function(resource) {
      self.resources[resource.name] = resource;
      return resource;
    });
  };


  //
  // load resource definitions from a directory
  //
  cores.load = function(dir) {
    var self = this;
    return loadResources(this, dir).then(function(resources) {
      common.merge(self.resources, resources);
      return resources;
    });
  };

  return cores;
};
