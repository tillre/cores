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
  cores.fetchRefs = function(docs, deep) {
    if (util.isArray(docs)) {
      // fetch refs of array of document
      return fetchRefs(this, docs, deep);
    }
    else if (typeof docs === 'object' && docs) {
      // fetch refs of single document
      return fetchRefs(this, [docs], deep).then(function(result) {
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
  cores.create = function(name, config, syncNow) {
    var self = this;
    return createResource(this, name, config, syncNow).then(function(res) {
      self.resources[res.name] = res;
      return res;
    });
  };


  //
  // load resource definitions from a directory
  //
  cores.load = function(dir, syncDesign) {
    var self = this;
    return loadResources(this, dir, syncDesign).then(function(resources) {
      common.merge(self.resources, resources);
      return resources;
    });
  };


  //
  // sync all design docs with the database
  // Warning: this will update the view index
  //
  cores.sync = function() {
    var self = this;
    var pms = [];
    Object.keys(this.resources).forEach(function(key) {
      pms.push(self.resources[key].sync());
    });
    return Q.all(pms);
  };


  return cores;
};
