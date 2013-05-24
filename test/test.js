/*global before after beforeEach afterEach describe it*/

var async = require('async');
var nano = require('nano')('http://localhost:5984');
var cores = require('../index.js');
var jski = require('jski');

var assert = require('assert');
var util = require('util');


describe('cores', function() {

  // test data
  var resName = 'Article',
      schema = require('./schema'),
      design = require('./design'),
      hooks = require('./hooks'),
      data = require('./data');

  // create db before tests and destroy afterwards
  var dbName = 'test-cores',
      db = nano.use(dbName),
      createResource = cores(db);

 
  before(function(done) {
    // setup test db
    nano.db.get(dbName, function(err, body) {
      if (!err) {
        // db exists, recreate
        nano.db.destroy(dbName, function(err) {
          if (err) done(err);
          nano.db.create(dbName, done);
        });
      }
      else if (err.reason === 'no_db_file'){
        // create the db
        nano.db.create(dbName, done);
      }
      else done(err);
    });
  });

  after(function(done) {
    nano.db.destroy(dbName, done);
  });

  var res = null;

  
  describe('Resource creation', function() {

    it('should create with schema', function(done) {
      createResource({ name: resName, schema: schema }, function(err, r) {
        assert(!err);
        assert(typeof r === 'object');
        done();
      });
    });


    it('should not create without name', function(done) {
      createResource({ schema: schema, design: design, hooks: hooks }, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });
    
    
    it('should not create with invalid schema', function(done) {
      createResource({ name: resName, schema: {bar:42} }, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });


    it('should not create with invalid design', function(done) {
      createResource({ name: resName, schema: schema, design: {views:''} }, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });

    it('should create with schema and design and hooks', function(done) {
      createResource(
        { name: resName, schema: schema, design: design, hooks: hooks,
          app: { createOption: 'create', loadOption: 'load', saveOption: 'save' } },

        function(err, r) {
          assert(!err);
          assert(typeof r === 'object');

          res = r;

          assert(typeof res.create === 'function');
          assert(typeof res.load === 'function');
          assert(typeof res.save === 'function');
          assert(typeof res.destroy === 'function');
          assert(typeof res.view === 'function');
          
          done();
        }
      );
    });

    
    it('should upload design and schema to db', function(done) {
      db.get('_design/' + res.design.name, function(err, doc) {
        assert(!err);
        assert(typeof doc.views === 'object');
        assert(doc.views.all);
        assert(doc.views.titles);
        assert(typeof doc.schema === 'object');
        done();
      });
    });
  });


  describe('Resource document methods', function() {

    var doc;

    it('should create a document', function(done) {
      res.create(function(err, d) {
        assert(!err);
        assert(typeof d === 'object');
        assert(!res.checkType(d));
        done();
      });
    });

    
    it('should create a document with data', function(done) {
      res.create(data, function(err, d) {
        assert(!err);
        assert(typeof d === 'object');
        assert(!res.checkType(d));

        doc = d;
        
        done();
      });
    });

    
    it('should not validate data without required properties', function(done) {
      res.validate({ type_: 'Article' }, function(err) {
        assert(util.isError(err));
        done();
      });
    });

    
    it('should validate with required properties', function(done) {
      res.validate(data, function(err) {
        assert(!err);
        done();
      });
    });


    it('should use a custom validation function', function(done) {

      var b = false;
      var v = function(value) {
        b = true;
        return jski.schema(schema).validate(value);
      };
      
      createResource({ name: resName + '2', schema: schema, validate: v }, function(err, r) {
        r.validate(data, function(errs) {
          assert(b);
          done();
        });
      });
    });

    
    it('should not save when not valid', function(done) {
      res.save({ type_: 'Article' }, function(err) {
        assert(util.isError(err));
        done();
      });
    });

    
    it('should save when valid', function(done) {
      res.save(doc, function(err, d) {
        assert(!err);
        assert(typeof d === 'object');
        assert(typeof d._id === 'string');
        assert(typeof d._rev === 'string');
        done();
      });
    });

    
    it('should save when updated', function(done) {
      doc.title = 'Some other title';
      res.save(doc, function(err, d) {
        assert(!err);
        assert(typeof d === 'object');
        assert(d._id === doc._id);
        assert(d._rev === doc._rev);
        done();
      });
    });

    
    it('should not save when has wrong type', function(done) {
      res.save({ _id: 'somefoo', type_: 'Foo' }, function(err, d) {
        assert(util.isError(err));
        done();
      });
    });

    
    it('should load', function(done) {
      res.load(doc._id, function(err, d) {
        assert(!err);
        assert(d.title === doc.title);
        done();
      });
    });

    
    it('should have the properties from the hooks', function(done) {
      res.load(doc._id, function(err, d) {
        assert(!err);
        assert(d.createHook === 'create');
        assert(d.loadHook === 'load');
        assert(d.saveHook === 'save');
        
        done();
      });
    });

    
    it('should destroy', function(done) {
      res.destroy(doc, function(err) {
        assert(!err);
        done();
      });
    });
  });


  describe('Resource views', function() {

    var docs = [];
    var numDocs = 3;
    
    before(function(done) {

      async.times(numDocs, function(i, cb) {
        
        res.create(data, function(err, d) {
          d.title = d.title + ' ' + i;
          res.save(d, function(err, sd) {
            if (err) cb(err);
            else {
              docs.push(sd);
              cb();
            }
          });
        });
        
      }, done);
    });

    after(function(done) {
      async.each(docs, function(d, cb) {
        res.destroy(d, cb);
      }, done);
    });

    
    it('should call the all view with no params', function(done) {
      res.view('all', function(err, docs) {
        assert(!err);
        assert(typeof docs === 'object');
        assert(docs.total_rows === numDocs);
        done();
      });
    });


    it('should call the all view with params', function(done) {
      res.view('all', { limit: 2  }, function(err, docs) {
        assert(!err);
        assert(docs.total_rows === numDocs);
        assert(docs.rows.length === 2);
        done();
      });
    });

    
    it('should call the titles view', function(done) {
      res.view('titles', function(err, docs) {
        assert(!err);
        assert(typeof docs === 'object');
        assert(docs.total_rows === numDocs);
        done();
      });
    });

    
    it('should call the titles view with params', function(done) {
      res.view('titles', { limit: 1 }, function(err, docs) {
        assert(!err);
        assert(docs.total_rows === numDocs);
        assert(docs.rows.length === 1);
        done();
      });
    });

    
    it('should respond with error when view does not exist', function(done) {
      res.view('foo', function(err, docs) {
        assert(util.isError(err));
        done();
      });
    });
  });
});