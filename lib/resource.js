var Q = require('kew');
var J = require('jski')();


function extend(a, b) {
  for (var x in b) a[x] = b[x];
  return a;
};


//
// Resource contructor
//
function Resource(cores, name, config) {

  this.cores = cores;

  this.name = name;
  this.design = config.design || {};

  this.validateRefs = config.validateRefs || false;

  this.schema = config.schema || J.object();
  if (!this.schema.__jski__) {
    // wrap schema in jski schema validator
    this.schema = J.createValidator(this.schema);
  }

  this.design.name = this.name.toLowerCase();
  this.design.views = this.design.views || {};

  // add an all view, to get all docs of this resource type
  if (!this.design.views.all) {
    this.design.views.all = {
      // set map function as string, to hardcode the value of name into it
      map: 'function(doc) { if (doc.type_ === \"' + this.name + '\") { emit(doc._id, null); }}'
    };
  }
}


//
// Sync design with couchdb
//
Resource.prototype.sync = function() {

  var self = this;
  var defer = Q.defer();
  var id = '_design/' + this.design.name;
  this.design._id = id;

  this.cores.db.get(id, function(err, doc) {

    if (err && err.error !== 'not_found') {
      return defer.reject(err);
    }
    else if (!err) {
      // update design
      self.design._rev = doc._rev;
    }

    self.cores.db.insert(self.design, function(err) {
      if (err) return defer.reject(err);
      defer.resolve(true);
    });
  });
  return defer.promise;
};


//
// Check if type matches the Resource name
//
Resource.prototype._checkType = function(doc) {

  if (!doc.type_ === this.name) {
    var typeErr = new Error('Doc type does not match resource type: ' + doc.type_ + ' != ' + this.name);
    typeErr.code = 400;
    return typeErr;
  }
  // type matches
  return null;
};


//
// Call a couchdb design view function
//
Resource.prototype.view = function(name, params) {

  params = params || {};

  if (!this.design.views[name]) {
    var err = new Error('Resource view not found: ' + name + '.');
    err.code = 404;
    return Q.reject(err);
  }

  var defer = Q.defer();
  this.cores.db.view(this.design.name, name, params, function(err, result) {
    if (err) return defer.reject(err);
    defer.resolve(result);
  });
  return defer.promise;
};


//
// Validate a document
//
Resource.prototype.validate = function(doc) {

  var typeErr = this._checkType(doc);
  if (typeErr) return Q.reject(typeErr);

  var errs = this.schema.validate(doc, { omitRefs: !this.validateRefs });
  if (errs.length) {
    var valErr = new Error('Validation failed', errs);
    valErr.code = 400;
    valErr.errors = errs;
    return Q.reject(valErr);
  }
  return Q.resolve(doc);
};


//
// Load a document from the DB
//
Resource.prototype.load = function(id) {

  var self = this;
  var defer = Q.defer();

  this.cores.db.get(id, function(err, doc) {

    if (err) return defer.reject(err);

    if (!doc.type_ || !(typeof doc.type_ === 'string')) {
      var typeErr = new Error('Doc has wrong type.');
      typeErr.code = 400;
      return defer.reject(typeErr);
    }
    return defer.resolve(doc);
  });
  return defer.promise;
};


//
// Save a document to the DB
//
Resource.prototype.save = function(doc) {

  var self = this;

  if (doc._id && doc._rev) {
    // typecheck update
    var typeErr = this._checkType(doc);
    if (typeErr) return Q.reject(typeErr);
  }

  // enforce type
  doc.type_ = this.name;

  // always validate before saving
  return this.validate(doc).then(function(doc) {

    // set id & rev on params for update
    var params = {};
    if (doc._id) {
      params.doc_name = doc._id;
      if (doc._ref) params.rev = doc._ref;
    }

    var defer = Q.defer();
    self.cores.db.insert(doc, params, function(err, body) {

      if (err) return defer.reject(err);
      doc._id = body.id;
      doc._rev = body.rev;
      defer.resolve(doc);
    });
    return defer.promise;
  });
};


//
// Delete document from the DB
//
Resource.prototype.destroy = function(doc) {

  var self = this;
  var typeErr = this._checkType(doc);
  if (typeErr) Q.reject(typeErr);

  if (!doc._id || !doc._rev) {
    var err = new Error('Destroy needs an id and rev.');
    err.code = 400;
    return Q.reject(err);
  }

  // get the doc first, to ensure it has the correct type

  if (err) return Q.reject(err);

  var defer = Q.defer();
  self.cores.db.get(doc._id, function(err, d) {
    if (err) {
      err.code = 400;
      return defer.reject(err);
    }
    typeErr = self._checkType(d);
    if (typeErr) defer.reject(typeErr);

    self.cores.db.destroy(doc._id, doc._rev, function(err) {
      if (err) return defer.reject(err);
      defer.resolve();
    });
  });
  return defer.promise;
};


//
// Load a bunch of docs, call the map function on them, and save them
// Warning: This may trigger rebuilding the view index for a lot of docs
//
Resource.prototype.map = function(viewName, viewParams, fn) {

  viewName = viewName || 'all';
  if (typeof viewParams === 'function') {
    fn = viewParams;
    viewParams = null;
  }
  var self = this;

  return this.view(viewName, viewParams || { include_docs: true }).then(function(result) {

    var docs = result.rows.map(function(row, index) {
      var d = fn(row.doc);
      if (typeof d !== 'object' || !d) {
        throw new Error('Map function result must be an object');
      }
      if (!d._id) {
        throw new Error('Map function result must have an _id');
      }
      if (!d._rev) {
        throw new Error('Map function result must have an _rev');
      }
      if (d.type_ !== self.name) {
        throw new Error('Map function result must have correct type');
      }
      return d;
    });

    var defer = Q.defer();
    self.cores.db.bulk({ docs: docs }, function(err, result) {
      if (err) return defer.reject(err);
      return defer.resolve(result);
    });
    return defer.promise;
  });
};


module.exports = Resource;
