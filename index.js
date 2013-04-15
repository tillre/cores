var _ = require('underscore');
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
  // create a doc layout (name, schema, [design], [callback])
  //
  function createLayout(name, schema, design, callback) {
    design = design || {};

    if (arguments.length === 3 && _.isFunction(design)) {
      callback = design;
      design = {};
    }
    callback = callback || emptyFunction;

    
    if (comodl.layouts[name]) {
      return callback(new Error('Layout name ' + schema.name + ' already taken.'));
    }

    var err, errors;
    
    // validate schema against model schema
    errors = validate(modelSchema, schema);
    if (errors) {
      err = new Error('Schema does not validate');
      err.errors = errors;
      return callback(err);
    }

    // validate design against design schema
    errors = validate(designSchema, design);
    if (errors) {
      err = new Error('Design does not validate');
      err.errors = errors;
      return callback(err);
    }
    
    // add _id, _rev and type to schema
    _.extend(schema.properties, {
      _id: { type: 'string' },
      _rev: { type: 'string' },
      type: { type: 'string' }
    });

    // put schema on design
    design.schema = schema;
    
    var l = {
      design: design,
      name: name
    };

    comodl.layouts[l.name] = l;

    l.design.name = l.name.toLowerCase();
    addStandardViews(l.design, name);

    // upload the design to the db
    syncDesign(l, function(err) {
      callback(err, err ? null : l);
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
        map: 'function(doc) { if (doc.type === \"' + name + '\") { emit(doc._id, doc); }}',
        layout: function(comodl, result, callback) {
          callback(null, result.rows.map(function(doc) {
            return doc.value;
          }));
        }
      };
    }
  }
  

  //
  // save/update design with schema in db
  //
  function syncDesign(layout, callback) {
    callback = callback || emptyFunction;

    var id = '_design/' + layout.design.name;
    layout.design._id = id;

    db.get(id, function(err, doc) {
      if (err && err.error === 'not_found') {
        // inital upload
        return db.insert(layout.design, callback);
      }
      if (err) {
        return callback(err);
      }
      // update
      layout.design._rev = doc._rev;
      db.insert(layout.design, callback);
    });
  }


  //
  // call a view function from the db
  //
  function callView(layoutName, viewName, params, callback) {
    callback = callback || emptyFunction;
    if (_.isFunction(params)) {
      callback = params;
      params = null;
    }
    
    var layout = comodl.layouts[layoutName];

    if (!layout)  {
      var err = new Error('Layout not found with name, ' + layoutName + '.');
      err.code = 404;
      return callback(err);
    }
    
    if (!layout.design.views[viewName]) {
      var err = new Error('Layout view not found with name, ' + viewName + '.');
      err.code = 404;
      return callback(err);
    }

    var view = '_design/' + layout.design.name + '/_view/' + viewName;
    
    db.get(view, params, function(err, result) {
      if (err) callback(err);
      else {
        // call layout function from design file
        var f = layout.design.views[viewName].layout;
        if (f) f(comodl, result, callback);
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
  function validateDoc(doc, callback) {
    callback = callback || emptyFunction;

    if (!doc.type || !comodl.layouts[doc.type]) {
      var uErr = new Error('Unknown doc type: ' + doc.type);
      uErr.code = 400;
      return callback(uErr);
    }

    var schema = comodl.layouts[doc.type].design.schema;
    var errs = validate(schema, doc);
    if (errs) {
      var valErr = new Error('Validation failed', errs);
      valErr.code = 400;
      valErr.errors = errs;
      return callback(valErr);
    }
    callback(null, doc);
  }

  
  //
  // save a doc to the db
  //
  function saveDoc(doc, callback) {
    callback = callback || emptyFunction;
    // always validate before saving
    validateDoc(doc, function(err) {

      if (err) return callback(err);

      db.insert(doc, function(err, body) {
        if (!err) {
          doc._id = body.id;
          doc._rev = body.rev;
        }
        callback(err, doc);
      });
    });
  }

  
  //
  // load a doc from the db
  //
  function loadDoc(id, callback) {
    callback = callback || emptyFunction;

    db.get(id, function(err, doc) {

      if (err) return callback(err);

      if (!doc.type || !_.isString(doc.type)) {
        var typeErr = new Error('No valid type name on data with id, ' + id + '.');
        typeErr.code = 400;
        return callback(typeErr);
      }
      callback(null, doc);
    });
  }
  

  //
  // delete the doc in the db
  //
  function destroyDoc(id, rev, callback) {
    callback = callback || emptyFunction;

    if (!id || !rev) {
      var err = new Error('Destroy needs an id and rev.');
      err.code = 400;
      return callback(err);
    }
    db.destroy(id, rev, callback);
  }

  return comodl;
};
