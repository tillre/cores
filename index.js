var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('jski');

var modelSchema = require('./lib/model-schema');
var designSchema = require('./lib/design-schema');



module.exports = function(db) {


  //
  // Resource contructor
  //

  function Resource(config) {

    _.extend(this, config);

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
  // Sync design/schema with couchdb
  //

  Resource.prototype.sync = function(callback) {

    var self = this;
    var id = '_design/' + this.design.name;
    this.design._id = id;

    db.get(id, function(err, doc) {

      if (err && err.error !== 'not_found') {
        return callback(err);
      }
      else if (!err) {
        // update design
        self.design._id = doc._id;
        self.design._rev = doc._rev;
      }

      db.insert(self.design, function(err) {
        if (err) callback(err);
        else callback(null, self);
      });
    });
  };


  //
  // Check if type matches the Resource name
  //

  Resource.prototype.checkType = function(doc) {

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
    if (_.isFunction(params)) {
      callback = params;
      params = {};
    }
    
    if (!this.design.views[name]) {
      var err = new Error('Resource view not found with name: ' + name + '.');
      err.code = 404;
      return callback(err);
    }
    
    db.view(this.design.name, name, params, function(err, result) {
      if (err) callback(err);
      else callback(null, result);
    });
  };


  //
  // Create a document with optional data
  //

  Resource.prototype.create = function(data, callback) {

    if (typeof data === 'function') {
      callback = data;
      data = {};
    }
    
    var d = {};
    _.extend(d, data);
    d.type_ = this.name;
    
    this.runHook('create', d, callback);
  };


  //
  // Validate a document
  //

  Resource.prototype.validate = function(doc, callback) {

    var typeErr = this.checkType(doc);
    if (typeErr) callback(typeErr);

    var errs = validate(this.schema, doc);
    if (errs) {
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
    
    db.get(id, function(err, doc) {

      if (err) return callback(err);

      if (!doc.type_ || !_.isString(doc.type_)) {
        var typeErr = new Error('No valid type name on data with id, ' + id + '.');
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
      var typeErr = this.checkType(doc);
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
        
        db.insert(doc, function(err, body) {

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

    var typeErr = this.checkType(doc);
    if (typeErr) callback(typeErr);

    if (!doc._id || !doc._rev) {
      var err = new Error('Destroy needs an id and rev.');
      err.code = 400;
      return callback(err);
    }

    // get the doc first, to ensure it has the correct type

    var self = this;
    
    db.get(doc._id, function(err, d) {
      if (err) {
        err.code = 400;
        return callback(err);
      }
      typeErr = self.checkType(d);
      if (typeErr) callback(typeErr);
      
      db.destroy(doc._id, doc._rev, callback);
    });
  };



  //
  // Run a hook on a document
  //

  Resource.prototype.runHook = function(name, doc, callback) {

    if (this.hooks[name]) {
      return this.hooks[name](this, doc, callback);
    }
    // no hook
    callback(null, doc);
  };


  //
  // Create a Resource object
  //

  function createResource(config, callback) {

    var err, errors;
    
    if (!config.name) {
      err = new Error('Resource config misses name property');
      err.code = 400;
      return callback(err);
    }
    
    config = _.extend({
      schema: {},
      design: {},
      hooks: {}
    }, config);

    // validate schema against model schema
    errors = validate(modelSchema, config.schema);
    if (errors) {
      err = new Error('Schema does not validate');
      err.errors = errors;
      return callback(err);
    }

    // validate design against design schema
    errors = validate(designSchema, config.design);
    if (errors) {
      err = new Error('Design does not validate');
      err.errors = errors;
      return callback(err);
    }

    // add _id, _rev and type to schema
    _.extend(config.schema.properties, {
      _id: { type: 'string' },
      _rev: { type: 'string' },
      type_: { type: 'string' }
    });

    // put schema on design
    config.design.schema = config.schema;
    config.design.name = config.name.toLowerCase();
    
    var res = new Resource(config);
    res.sync(callback);
  }


  return createResource;
};
