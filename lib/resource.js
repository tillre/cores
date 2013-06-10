var jski = require('jski');


function extend(a, b) {
  for (var x in b) a[x] = b[x];
  return a;
};


//
// Resource contructor
//

function Resource(db, config) {

  this.db = db;
  
  this.name = config.name;
  this.design = config.design || {};
  this.hooks = config.hooks || {};

  this.validateRefs = config.validateRefs || false;
  
  this.schema = config.schema || {};
  if (!this.schema.__jski__) {
    this.schema = jski.schema(this.schema);
  }
  
  // application specific state passed into the hooks
  this.app = config.app || {};
  
  // add _id, _rev and type to schema
  extend(this.schema.properties, {
    _id: { type: 'string' },
    _rev: { type: 'string' },
    type_: { type: 'string' }
  });
  
  // put schema on design
  this.design.name = this.name.toLowerCase();
  
  // add standard view
  this.design.views = this.design.views || {};
  if (!this.design.views.all) {
    this.design.views.all = {
      // set map function as string, to hardcode the value of name into it
      map: 'function(doc) { if (doc.type_ === \"' + this.name + '\") { emit(doc._id, doc); }}'
    };
  }
}


//
// Sync design with couchdb
//

Resource.prototype.sync = function(callback) {

  var self = this;
  var id = '_design/' + this.design.name;
  this.design._id = id;

  this.db.get(id, function(err, doc) {

    if (err && err.error !== 'not_found') {
      return callback(err);
    }
    else if (!err) {
      // update design
      self.design._rev = doc._rev;
    }

    self.db.insert(self.design, function(err) {
      if (err) callback(err);
      else callback(null, self);
    });
  });
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

Resource.prototype.view = function(name, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = {};
  }
  
  if (!this.design.views[name]) {
    var err = new Error('Resource view not found with name: ' + name + '.');
    err.code = 404;
    return callback(err);
  }
  
  this.db.view(this.design.name, name, params, function(err, result) {
    if (err) callback(err);
    else callback(null, result);
  });
};


//
// Validate a document
//

Resource.prototype.validate = function(doc, callback) {

  var typeErr = this._checkType(doc);
  if (typeErr) callback(typeErr);

  var errs = this.schema.validate(doc, { omitRefs: !this.validateRefs });
  if (errs.length) {
    var valErr = new Error('Validation failed', errs);
    valErr.code = 400;
    valErr.errors = errs;
    return callback(valErr);
  }
  callback(null, doc);
};


//
// Load a document from the DB
//

Resource.prototype.load = function(id, callback) {

  var self = this;
  
  this.db.get(id, function(err, doc) {

    if (err) return callback(err);

    if (!doc.type_ || !(typeof doc.type_ === 'string')) {
      var typeErr = new Error('Doc has wrong type.');
      typeErr.code = 400;
      return callback(typeErr);
    }

    self.runHook('load', doc, function(err, doc) {
      if (err) return callback(err);
      callback(null, doc);
    });
  });
};


//
// Save a document to the DB
//

Resource.prototype.save = function(doc, callback) {

  if (doc._id) {
    // typecheck update
    var typeErr = this._checkType(doc);
    if (typeErr) return callback(typeErr);
  }

  // enforce type
  doc.type_ = this.name;

  var self = this;
  
  this.runHook('save', doc, function(err, doc) {
    if (err) return callback(err);
    
    // always validate before saving
    self.validate(doc, function(err) {

      if (err) return callback(err);

      // set id & rev on params for update
      var params = {};
      if (doc._id) {
        params.doc_name = doc._id;
        if (doc._ref) params.rev = doc._ref;
      }
      
      self.db.insert(doc, params, function(err, body) {

        if (!err) {
          doc._id = body.id;
          doc._rev = body.rev;
        }
        callback(err, doc);
      });
    });
  });
};


//
// Delete document from the DB
//

Resource.prototype.destroy = function(doc, callback) {

  var typeErr = this._checkType(doc);
  if (typeErr) callback(typeErr);

  if (!doc._id || !doc._rev) {
    var err = new Error('Destroy needs an id and rev.');
    err.code = 400;
    return callback(err);
  }

  // get the doc first, to ensure it has the correct type

  var self = this;
  
  this.runHook('destroy', doc, function(err, doc) {
    if (err) return callback(err);
    
    self.db.get(doc._id, function(err, d) {
      if (err) {
        err.code = 400;
        return callback(err);
      }
      typeErr = self._checkType(d);
      if (typeErr) callback(typeErr);
      
      self.db.destroy(doc._id, doc._rev, callback);
    });
  });
};



//
// Run a hook on a document
//

Resource.prototype.runHook = function(name, doc, callback) {

  if (this.hooks[name]) {
    return this.hooks[name](this.app, doc, callback);
  }
  // no hook
  callback(null, doc);
};



module.exports = Resource;