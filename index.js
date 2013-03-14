var _ = require('underscore');
var nano = require('nano')('http://localhost:5984');
var validate = require('jski');


var emptyFunction = function() {};
var deepClone = function(d) { return JSON.parse(JSON.stringify(d)); };

// name property of layouts, that gets set on models when saved
var layoutNameProp = 'type';


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
  // create a model instance (layoutName, [data], [cb])
  //
  function createModel(layoutName, data, cb) {
    cb = cb || emptyFunction;
    if (_.isFunction(data)) {
      cb = data;
      data = null;
    }
    
    if (!comodl.layouts[layoutName]) {
      cb(new Error('No model layout found with name, '  + layoutName));
      return;
    }
    var m = {
      layout: comodl.layouts[layoutName],
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

  return comodl;
};
