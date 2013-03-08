var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('joskito');


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
	var errs = validate(this.schema, data);
	if (!errs) {
      this.data = data;
	}
	cb(errs);
  },


  getData: function() {
	return this.data;
  },

  
  save: function(cb) {
	if (this.id) {
      // set id and rev on data for couchdb
	  this.data._id = this.id;
	  this.data._rev = this.rev;
	}
    var self = this;
	this.db.insert(this.data, function(err, body) {
      if (!err) {
        self.id = body.id;
        self.rev = body.rev;
      }
      cb(err);
	});
  },

  destroy: function(cb) {
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
    }
  };
};


