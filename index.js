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
      create: createDoc,
      update: updateDoc,
      validate: validateDoc,
      save: saveDoc,
      load: loadDoc,
      destroy: destroyDoc
    }
  };

  
  //
  // create a doc layout (schema, design, [hooks], [cb])
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

    if (!schema.properties) {
      cb(new Error('Schema should be of type "object" and must have a "properties" property.'));
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
            return cm.model.create(doc.value);
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
    if (!layout.design.views[viewName]) {
      cb(new Error('Layout view not found with name, ' + viewName + '.'));
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
  function updateDoc(doc, data) {
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
      cb(new Error('Unknown doc type: ' + doc.type));
      return;
    }
    var schema = comodl.layouts[doc.type].schema;
    var errs = validate(comodl.layouts[doc.type].schema, doc);
    if (errs) {
      var err = new Error('Validation failed.', errs);
      err.errors = errs;
      cb(err);
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
        cb(new Error('No valid type name on data with id, ' + id + '.'));
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
      cb(new Error('Destroy needs an id and rev.'));
      return;
    }
    db.destroy(id, rev, cb);
  }

  return comodl;
};
