var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('joskito');


var emptyFunction = function() {};


var Model = function(db, name, schema) {
  this.db = db;
  this.name = name;
  this.schema = schema;

  this.data = null;
  this.id = null;
  this.rev = null;
};
_.extend(Model.prototype, {


  setData: function(data, cb) {
    cb = cb || emptyFunction;
    var self = this,
        oldData = this.data;
    
    this.data = data;
    this.validate(function(err) {
      if (err) self.data = oldData;
      cb(err);
    });
  },


  getData: function() {
    return this.data;
  },


  load: function(id, cb) {
    this.db.get(id, cb);
  },


  validate: function(cb) {
    cb = cb || emptyFunction;
    
    var errs = validate(this.schema, this.data);
    if (errs) {
      var err = new Error('Validation failed.', errs);
      err.errors = errs;
      cb(err);
      return;
    }
    cb();
  },


  save: function(cb) {
    cb = cb || emptyFunction;
    
    var self = this;
    // always validate before saving
    this.validate(function(err) {
      if (err) {
        cb(err);
        return;
      }
      if (self.id) {
        // set id and rev on data for couchdb
        self.data._id = self.id;
        self.data._rev = self.rev;
      }
      self.db.insert(self.data, function(err, body) {
        if (!err) {
          self.id = body.id;
          self.rev = body.rev;
        }
        cb(err);
      });
    });
  },

  destroy: function(cb) {
    var cb = cb || emptyFunction;
    
    if (!this.id) {
      cb();
      return;
    }
    var self = this;
    this.db.destroy(this.id, this.rev, function(err) {
      if(!err) {
        self.id = null;
        self.rev = null;
      }
      cb(err);
    });
  },


  syncDesign: function(design, cb) {
    cb = cb || emptyFunction;
    
    var self = this;
    design._id = '_design/' + this.name;
    
    // check for existing design
    this.db.get(design._id, function(err, doc) {
      if (err && err.error === 'not_found') {
        // initial upload of design
        self.db.insert(design, cb);
        return;
      }
      if (err) {
        cb(err);
        return;
      }
      // update design
      // TODO: update only if changed, put timestamp on design doc
      design._rev = doc._rev;
      self.db.insert(design, cb);
    });
  },


  view: function(name, params, cb) {
    this.db.get('_design/' + this.name + '/_design/' + name, params, cb);
  }
  
});



module.exports = function moskito(db) {

  var models = {};
  
  return {
    createModel: function(name, schema) {
      if (models[name]) {
        throw new Error('Model with name "' + name + '" already exists');
      }
      var m =  new Model(db, name, schema);
      models[m.name] = m;
      return m;
    },

    createModelFromDescription: function(schema, design, cb) {
      cb = cb || emptyFunction;
      
      if (!schema.name) {
        cb(new Error('Model schema has no name property.'));
        return;
      }
      var m = new Model(db, schema.name, schema, design);
      m.syncDesign(design, function(err) {
        cb(err, m);
      });
    }
  };
};


