var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('jski');


var emptyFunction = function() {};
var deepClone = function(d) { return JSON.parse(JSON.stringify(d)); };


module.exports = function(db) {

  var comodl = {
    layouts: {},
    layout: createLayout,

    view: callView,
    
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
  function createLayout(name, schema, design, hooks, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(hooks)) {
      cb = hooks;
      hooks = null;
    }
    
    if (comodl.layouts[name]) {
      cb(new Error('Layout name ' + schema.name + ' already taken.'));
      return;
    }

    var l = {
      schema: schema,
      design: design,
      name: name,
      hooks: hooks || {} // TODO: implement hooks
    };
    comodl.layouts[l.name] = l;
    if (!l.design) {
      cb(null, l);
    }
    else {
      l.design.name = l.name.toLowerCase();
      addStandardViews(l.design, name);
      // upload the design to the db
      syncDesign(l.design.name, design, function(err) {
        cb(err, err ? null : l);
      });
    }
  }


  //
  // add some standard views to the design when not present
  //
  function addStandardViews(design, name) {
    design.views = design.views || {};
    if (!design.views.all) {
      design.views.all = {
        // set map function as string, to hardcode the value of name into it
        map: 'function(doc) { if (doc.type == \"' + name + '\") { emit(doc._id, doc); }}',
        layout: function(cm, result, cb) {
          cb(null, result.rows.map(function(doc) {
            return doc.value;
          }));
        }
      };
    }
  }
  

  //
  // save/update the couchdb design doc
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
    
    var layout = comodl.layouts[layoutName];
    if (!layout)  {
      cb(new Error('Layout not found with name, ' + layoutName + '.'));
      return;
    }
    var view = '_design/' + layout.design.name + '/_view/' + viewName;

    
    db.get(view, params, function(err, result) {
      if (err) cb(err);
      else {
        // call layout function from design file
        layout.design.views[viewName].layout(comodl, result, cb);
      }
    });
  }
  

  //
  // create a model instance (type, [data], [cb])
  //
  function createModel(type, data, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(data)) {
      cb = data;
      data = null;
    }
    
    if (!comodl.layouts[type]) {
      cb(new Error('No model layout found with type name, '  + type));
      return;
    }

    var model = {
      type: type,
      data: null,
      id: null,
      rev: null
    };

    if (!data) {
      cb(null, model);
    }
    else {
      setDataToModel(model, data);
      validateModel(model, cb);
    }
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
    
    var errs = validate(comodl.layouts[model.type].schema, model.data);
    if (errs) {
      var err = new Error('Validation failed.', errs);
      err.errors = errs;
      cb(err);
      return;
    }
    cb(null, model);
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

      addMetaDataFromModel(data, model);
      
      db.insert(data, function(err, body) {
        if (!err) {
          model.id = body.id;
          model.rev = body.rev;
        }
        cb(err, err ? null : model);
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
      var type = doc.type;
      if (!type || !_.isString(type)) {
        cb(new Error('No valid type name on data with id, ' + id + '.'));
        return;
      }
      
      var m = createModel(type, doc, function(err, model) {
        if (err) cb(err);
        else cb(err, err ? null : model);
      });
    });
  }


  //
  // move metadata from data to model and clone rest of data
  //
  function setDataToModel(model, data) {
    if (data._id) {
      model.id = data._id;
      model.rev = data._rev;
    }

    // delete metadata when present
    delete data._id;
    delete data._rev;
    delete data.type;

    model.data = deepClone(data);
  }

  
  //
  // add metadata from model to doc
  //
  function addMetaDataFromModel(doc, model) {
    if (model.id) {
      doc._id = model.id;
      doc._rev = model.rev;
    }
    doc.type = model.type;
  }
  

  //
  // delete the model in the db
  //
  function destroyModel(id, rev, cb) {
    cb = cb || emptyFunction;
    db.destroy(id, rev, cb);
  }

  return comodl;
};
