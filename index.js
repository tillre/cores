var _ = require('underscore');
var i = require('i')();
var nano = require('nano')('http://localhost:5984');
var validate = require('jski');

var modelSchema = require('./lib/model-schema');
var designSchema = require('./lib/design-schema');

var emptyFunction = function() {};
var deepClone = function(d) { return JSON.parse(JSON.stringify(d)); };



module.exports = function(db) {

  var comodl = {
    layouts: {},
    layout: createLayout,

    view: callView,
    
    model: {
      create: createDoc,
      setData: setDocData,
      validate: validateDoc,
      save: saveDoc,
      load: loadDoc,
      destroy: destroyDoc
    }
  };

  
  //
  // create a doc layout (schema, design, [cb])
  //
  function createLayout(name, schema, design, cb) {
    design = design || {};
    // (name, schema, cb)
    if (arguments.length === 3) {
      cb = design;
      design = {};
    }
    cb = cb || emptyFunction;
    
    if (comodl.layouts[name]) {
      cb(new Error('Layout name ' + schema.name + ' already taken.'));
      return;
    }

    var err, errors;
    
    // validate schema against model schema
    errors = validate(modelSchema, schema);
    if (errors) {
      err = new Error('Schema does not validate');
      err.errors = errors;
      cb(err);
      return;
    }

    // validate design against design schema
    errors = validate(designSchema, design);
    if (errors) {
      err = new Error('Design does not validate');
      err.errors = errors;
      cb(err);
      return;
    }
    
    // add _id, _rev and type to schema
    _.extend(schema.properties, {
      _id: { type: 'string' },
      _rev: { type: 'string' },
      type: { type: 'string' }
    });

    var l = {
      schema: schema,
      design: design,
      name: name,
      path: '/' + i.pluralize(name.toLowerCase()),
      viewPaths: {}
    };

    // create view paths
    _.each(design.views, function(view, viewName) {
      l.viewPaths[viewName] = '/' + name.toLowerCase() + '-' + viewName.toLowerCase();
    });
    
    comodl.layouts[l.name] = l;

    l.design.name = l.name.toLowerCase();
    addStandardViews(l.design, name);
    // upload the design to the db
    syncDesign(design, function(err) {
      cb(err, err ? null : l);
    });
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
            return cm.model.create(doc.value);
          }));
        }
      };
    }
  }
  

  //
  // save/update the couchdb design doc
  //
  function syncDesign(design, cb) {
    cb = cb || emptyFunction;

    design._id = '_design/' + design.name;
    
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
      var err = new Error('Layout not found with name, ' + layoutName + '.');
      err.code = 404;
      cb(err);
      return;
    }
    if (!layout.design.views[viewName]) {
      var err = new Error('Layout view not found with name, ' + viewName + '.');
      err.code = 404;
      cb(err);
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
  // create a doc instance (type, data)
  //
  function createDoc(type, data) {
    // allow passing just the data with a type property
    if (_.isObject(type)) {
      data = type;
      type = data.type;
    }
    var doc = {
      type: type
    };
    _.extend(doc, data);
    return doc;
  }


  //
  // create a new doc from old doc with data
  //
  function setDocData(doc, data) {
    var newDoc = deepClone(data);
    if (doc._id) {
      newDoc._id = doc._id;
      newDoc._rev = doc._rev;
    }
    newDoc.type = doc.type;
    return newDoc;
  }
  

  //
  // validate a doc
  //
  function validateDoc(doc, cb) {
    cb = cb || emptyFunction;

    if (!doc.type || !comodl.layouts[doc.type]) {
      var uErr = new Error('Unknown doc type: ' + doc.type);
      uErr.code = 400;
      cb(uErr);
      return;
    }
    var schema = comodl.layouts[doc.type].schema;
    var errs = validate(comodl.layouts[doc.type].schema, doc);
    if (errs) {
      var valErr = new Error('Validation failed', errs);
      valErr.code = 400;
      valErr.errors = errs;
      cb(valErr);
      return;
    }
    cb(null, doc);
  }

  
  //
  // save a doc to the db
  //
  function saveDoc(doc, cb) {
    cb = cb || emptyFunction;
    // always validate before saving
    validateDoc(doc, function(err) {
      if (err) {
        cb(err);
        return;
      }
      db.insert(doc, function(err, body) {
        if (!err) {
          doc._id = body.id;
          doc._rev = body.rev;
        }
        cb(null, doc);
      });
    });
  }

  
  //
  // load a doc from the db
  //
  function loadDoc(id, cb) {
    cb = cb || emptyFunction;
    db.get(id, function(err, doc) {
      if (err) {
        cb(err);
        return;
      }
      if (!doc.type || !_.isString(doc.type)) {
        var typeErr = new Error('No valid type name on data with id, ' + id + '.');
        typeErr.code = 400;
        cb(typeErr);
        return;
      }
      cb(null, doc);
    });
  }
  

  //
  // delete the doc in the db
  //
  function destroyDoc(id, rev, cb) {
    cb = cb || emptyFunction;
    if (!id || !rev) {
      var err = new Error('Destroy needs an id and rev.');
      err.code = 400;
      cb(err);
      return;
    }
    db.destroy(id, rev, cb);
  }

  return comodl;
};
