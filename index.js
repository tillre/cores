var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('joskito');


var emptyFunction = function() {};
var deepClone = function(d) { return JSON.parse(JSON.stringify(d)); };

// name property of layouts, that gets set on models when saved
var layoutNameProp = 'type';


module.exports = function moskito(db) {

  var mosi = {
    view: callView,
    // list: callList,
    // show: callShow,
    
    layouts: {},
    layout: {
      create: createLayout
    },
    model: {
      create: createModel,
      validate: validateModel,
      save: saveModel,
      load: loadModel,
      destroy: destroyModel
    }
  };

  
  //
  // create a model layout (schema, design, [hooks], [cb])
  //
  function createLayout(schema, design, hooks, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(hooks)) {
      cb = hooks;
      hooks = null;
    }
    
    if (!schema.name) {
      cb(new Error('Schema needs a name property'));
      return;
    }
    if (mosi.layouts[schema.name]) {
      cb(new Error('Layout name ' + schema.name + ' already taken.'));
      return;
    }

    var l = {
      schema: schema,
      design: design,
      name: schema.name,
      hooks: hooks || {} // TODO: implement hooks
    };
    mosi.layouts[l.name] = l;
    if (!l.design) {
      cb(null, l);
    }
    else {
      l.design.name = l.schema.name.toLowerCase();
      // upload the design to the db
      syncDesign(l.design.name, design, function(err) {
        cb(err, err ? null : l);
      });
    }
  }


  //
  // save/update the douchdb design doc
  //
  function syncDesign(name, design, cb) {
    cb = cb || emptyFunction;

    design._id = '_design/' + name;
    
    // check for existing design
    db.get(design._id, function(err, doc) {
      if (err && err.error === 'not_found') {
        // initial upload of design
        db.insert(design, cb);
        return;
      }
      if (err) {
        cb(err);
        return;
      }
      // update design
      // TODO: update only if changed, put timestamp on design doc
      design._rev = doc._rev;
      db.insert(design, cb);
    });
  }


  //
  // call a view function from the db
  //
  function callView(layoutName, viewName, params, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(params)) {
      cb = params;
      params = null;
    }
    
    var layout = mosi.layouts[layoutName];
    if (!layout)  {
      cb(new Error('Layout not found with name, ' + layoutName + '.'));
      return;
    }
    var view = '_design/' + layout.design.name + '/_view/' + viewName;

    
    db.get(view, params, function(err, result) {
      if (err) cb(err);
      else {
        // call layout function from design file
        layout.design.views[viewName].layout(mosi, result, cb);
      }
    });
  }
  

  //
  // create a model instance (layoutName, [data], [cb])
  //
  function createModel(layoutName, data, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(data)) {
      cb = data;
      data = null;
    }
    
    if (!mosi.layouts[layoutName]) {
      cb(new Error('No model layout found with name, '  + layoutName));
      return;
    }
    var m = {
      layout: mosi.layouts[layoutName],
      data: deepClone(data),
      id: null,
      rev: null
    };
    if (!data) {
      cb(null, m);
      return;
    }
    validateModel(m, function(err) {
      cb(err, err ? null : m);
    });
  }


  //
  // validate a model
  //
  function validateModel(model, cb) {
    cb = cb || emptyFunction;

    if (!model.data || !_.isObject(model.data)) {
      cb(new Error('Cannot validate model with no data.'));
      return;
    }
    
    var errs = validate(model.layout.schema, model.data);
    if (errs) {
      var err = new Error('Validation failed.', errs);
      err.errors = errs;
      cb(err);
      return;
    }
    cb();
  }

  
  //
  // save a model to the db
  //
  function saveModel(model, cb) {
    cb = cb || emptyFunction;
    // always validate before saving
    validateModel(model, function(err) {
      if (err) {
        cb(err);
        return;
      }
      // clone data before saving
      var data = deepClone(model.data);
      if (model.id) {
        // set id and rev on data for couchdb
        data._id = model.id;
        data._rev = model.rev;
      }
      // save name, to be able to infer the layout later
      data[layoutNameProp] = model.layout.name;
      db.insert(data, function(err, body) {
        if (!err) {
          model.id = body.id;
          model.rev = body.rev;
        }
        cb(err);
      });
    });
  }

  
  //
  // load a model from the db
  //
  function loadModel(id, cb) {
    cb = cb || emptyFunction;
    db.get(id, function(err, doc) {
      if (err) {
        cb(err);
        return;
      }
      var layoutName = doc[layoutNameProp];
      if (!layoutName || !_.isString(layoutName)) {
        cb(new Error('No valid layout name property on data with id, ' + id + '.'));
        return;
      }
      var m = createModel(layoutName, doc, cb);
    });
  }


  //
  // delete the model in the db
  //
  function destroyModel(model, cb) {
    cb = cb || emptyFunction;
    
    if (!model.id) {
      cb();
      return;
    }
    db.destroy(model.id, model.rev, function(err) {
      if(!err) {
        model.id = null;
        model.rev = null;
      }
      cb(err);
    });
  }

  return mosi;
};



// ------------------------------------------------------------

// var Model = function(db, schema) {
//   this.db = db;
//   this.schema = schema;
//   this.name = schema.name;

//   this.data = null;
//   this.id = null;
//   this.rev = null;
// };
// _.extend(Model.prototype, {


//   setData: function(data, cb) {
//     cb = cb || emptyFunction;
//     var self = this,
//         oldData = this.data;
    
//     this.data = data;
//     this.validate(function(err) {
//       if (err) self.data = oldData;
//       cb(err);
//     });
//   },


//   getData: function() {
//     return this.data;
//   },


//   load: function(id, cb) {
//     this.db.get(id, cb);
//   },


//   validate: function(cb) {
//     cb = cb || emptyFunction;
    
//     var errs = validate(this.schema, this.data);
//     if (errs) {
//       var err = new Error('Validation failed.', errs);
//       err.errors = errs;
//       cb(err);
//       return;
//     }
//     cb();
//   },


//   save: function(cb) {
//     cb = cb || emptyFunction;
    
//     var self = this;
//     // always validate before saving
//     this.validate(function(err) {
//       if (err) {
//         cb(err);
//         return;
//       }
//       if (self.id) {
//         // set id and rev on data for couchdb
//         self.data._id = self.id;
//         self.data._rev = self.rev;
//       }
//       self.db.insert(self.data, function(err, body) {
//         if (!err) {
//           self.id = body.id;
//           self.rev = body.rev;
//         }
//         cb(err);
//       });
//     });
//   },

//   destroy: function(cb) {
//     var cb = cb || emptyFunction;
    
//     if (!this.id) {
//       cb();
//       return;
//     }
//     var self = this;
//     this.db.destroy(this.id, this.rev, function(err) {
//       if(!err) {
//         self.id = null;
//         self.rev = null;
//       }
//       cb(err);
//     });
//   },


//   syncDesign: function(design, cb) {
//     cb = cb || emptyFunction;
    
//     var self = this;
//     design._id = '_design/' + this.name;
    
//     // check for existing design
//     this.db.get(design._id, function(err, doc) {
//       if (err && err.error === 'not_found') {
//         // initial upload of design
//         self.db.insert(design, cb);
//         return;
//       }
//       if (err) {
//         cb(err);
//         return;
//       }
//       // update design
//       // TODO: update only if changed, put timestamp on design doc
//       design._rev = doc._rev;
//       self.db.insert(design, cb);
//     });
//   },


//   view: function(name, params, cb) {
//     this.db.get('_design/' + this.name + '/_view/' + name, params, cb);
//   }
  
// });



// module.exports = function moskito(db) {

//   var models = {};
  
//   return {

//     createModel: function(schema, design, cb) {
//       cb = cb || emptyFunction;
      
//       if (_.isFunction(design)) {
//         cb = design;
//         design = null;
//       }

//       if (!schema.name) {
//         cb(new Error('Model schema has no name property'));
//         return;
//       }
//       var m = new Model(db, schema);
//       models[m.name] = m;
      
//       if (!design) cb(null, m);
//       else {
//         m.syncDesign(design, function(err) {
//           cb(err, m);
//         });
//       }
//     }

//   };
// };


