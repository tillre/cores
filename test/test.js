/*global before after beforeEach afterEach describe it*/

var async = require('async');
var nano = require('nano')('http://localhost:5984');
var cores = require('../index.js');
var jski = require('jski');

var assert = require('assert');
var util = require('util');


describe('cores', function() {

  // create db before tests and destroy afterwards
  var dbName = 'test-cores';
  var db = nano.use(dbName);
  cores = cores(db);

 
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

  
  describe('resource', function() {

    // test data
    var resName = 'Article';
    var schema = require('./resources/article-schema.js');
    var design = require('./resources/article-design.js');
    var hooks = require('./resources/article-hooks.js');
    var data = require('./article-data.js');

    var res = null;

    var appData = {};
    

    it('should create with schema', function(done) {
      cores.create({ name: resName, schema: schema }, function(err, r) {
        assert(!err);
        assert(typeof r === 'object');
        done();
      });
    });


    it('should not create without name', function(done) {
      cores.create({ schema: schema, design: design, hooks: hooks }, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });
    
    
    it('should not create with invalid schema', function(done) {
      cores.create({ name: resName, schema: { properties: { type: 'boolean' }}}, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });


    it('should not create with invalid design', function(done) {
      cores.create({ name: resName, schema: schema, design: { views:'' } }, function(err, r) {
        assert(util.isError(err));
        done();
      });
    });

    it('should create with schema design and hooks', function(done) {
      cores.create(
        { name: resName, schema: schema, design: design, hooks: hooks,
          app: appData },

        function(err, r) {
          assert(!err);

          res = r;

          assert(typeof res.load === 'function');
          assert(typeof res.save === 'function');
          assert(typeof res.destroy === 'function');
          assert(typeof res.view === 'function');
          
          done();
        }
      );
    });

    
    it('should upload design to db', function(done) {
      db.get('_design/' + res.design.name, function(err, doc) {
        assert(!err);
        assert(doc.views.all);
        assert(doc.views.titles);
        done();
      });
    });



    describe('crud', function() {

      var doc = JSON.parse(JSON.stringify(data));

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


      it('should not save when not valid', function(done) {
        res.save({ type_: 'Article' }, function(err) {
          assert(util.isError(err));
          done();
        });
      });

      
      it('should save when valid', function(done) {
        res.save(doc, function(err, d) {
          assert(!err);
          assert(typeof d._id === 'string');
          assert(typeof d._rev === 'string');
          done();
        });
      });

      
      it('should save when updated', function(done) {
        doc.title = 'Some other title';
        res.save(doc, function(err, d) {
          assert(!err);
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

      
      it('should destroy', function(done) {
        res.destroy(doc, function(err) {
          assert(!err);
          done();
        });
      });


      it('should have called the hooks', function(done) {
        assert(appData.loadHook);
        assert(appData.createHook);
        assert(appData.updateHook);
        assert(appData.destroyHook);
        done();
      });

      
      it('should save with id', function(done) {
        var d = JSON.parse(JSON.stringify(doc));
        delete d._rev;
        d._id = 'my-id';
        res.save(d, function(err, savedDoc) {
          assert(!err);
          res.load('my-id', function(err, loadedDoc) {
            assert(!err);
            res.destroy(loadedDoc, done);
          });
        });
      });
    });


    describe('views', function() {

      var docs = [];
      var numDocs = 3;
      
      before(function(done) {

        async.times(numDocs, function(i, cb) {
          
          var d = JSON.parse(JSON.stringify(data));
          d.title = d.title + ' ' + i;
          res.save(d, function(err, sd) {
            if (err) cb(err);
            else {
              docs.push(sd);
              cb();
            }
          });
          
        }, done);
      });

      after(function(done) {
        async.each(docs, function(d, cb) {
          res.destroy(d, cb);
        }, done);
      });


      it('should call the alias all view', function(done) {
        res.all(function(err, result) {
          assert(!err);
          assert(result.total_rows === numDocs);
          done();
        });
      });


      it('should call the alias all view with params', function(done) {
        res.all({ limit: 1 }, function(err, result) {
          assert(!err);
          assert(result.total_rows === numDocs);
          assert(result.rows.length === 1);
          done();
        });
      });

      
      it('should call the all view with no params', function(done) {
        res.view('all', function(err, docs) {
          assert(!err);
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

  
  describe('loading', function() {

    var resources = null;
    
    it('should load from a directory', function(done) {
      cores.load('./test/resources', { validateRefs: true }, function(err, res) {
        assert(!err);
        assert(res.Article);
        assert(res.Image);

        resources = res;

        done();
      });
    });


    it('should load recursively from a directory', function(done) {
      cores.load('./test/resources', { recursive: true }, function(err, res) {
        assert(!err);
        assert(res.Article);
        assert(res.Image);
        assert(res.SubDir);
        done();
      });
    });


    it('should load and add app data to resources', function(done) {
      cores.load('./test/resources', { app: { foo: 42 } }, function(err, res) {
        assert(!err);
        assert(res.Article.app.foo === 42);
        done();
      });
    });
    
    
    it('should have hooks defined for Image resource', function() {
      assert(typeof resources.Image.hooks.save === 'function');
      assert(typeof resources.Image.hooks.load === 'function');
    });

    
    it('should validate a referenced resource', function(done) {

      var doc = {
        title: 'Hello',
        author: { firstname: 'Tim', lastname: 'Bo' },
        image: {
          name: 'Hello',
          url: 'http://host.com/some/path/bar.jpg'
        },
        body: 'Text...'
      };
      
      resources.Article.validate(doc, function(err) {
        assert(!err);
        done();
      });
    });

    it('should not validate a invalid referenced resource', function(done) {

      var doc = {
        title: 'Hello',
        author: { firstname: 'Tim', lastname: 'Bo' },
        image: {
          name: 42,
          url: '/some/path/bar.jpg'
        },
        body: 'Text...'
      };
      
      resources.Article.validate(doc, function(err) {
        assert(err);
        done();
      });
    });

    it('should validate invalid ref when validateRefs is false', function(done) {
      cores.load('./test/resources', { validateRefs: false }, function(err, res) {
        assert(!err);

        var doc = {
          title: 'Hello',
          author: { firstname: 'Tim', lastname: 'Bo' },
          image: {
            name: 42,
            url: '/some/path/bar.jpg'
          },
          body: 'Text...'
        };
        
        res.Article.validate(doc, function(err) {
          assert(!err);
          done();
        });
      });
    });
  });

  describe('uuids', function() {

    it('should get a uuid', function(done) {
      cores.uuids(function(err, ids) {
        assert(!err);
        assert(ids.uuids.length === 1);
        done();
      });
    });

    it('should get multiple uuids', function(done) {
      cores.uuids(5, function(err, ids) {
        assert(!err);
        assert(ids.uuids.length === 5);
        done();
      });
    });
  });
});