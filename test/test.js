/*global before after beforeEach afterEach describe it*/

var expect = require('chai').expect;
var async = require('async');
var nano = require('nano')('http://localhost:5984');
var cores = require('../index.js');


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
        expect(err).to.not.exist;
        expect(r).to.be.a('object');
        done();
      });
    });
    

    it('should not create without name', function(done) {
      createResource({ schema: schema, design: design, hooks: hooks }, function(err, r) {
        expect(err).to.exist;
        done();
      });
    });
    
    
    it('should not create with invalid schema', function(done) {
      createResource({ name: resName, schema: {bar:42} }, function(err, r) {
        expect(err).to.exist;
        done();
      });
    });


    it('should not create with invalid design', function(done) {
      createResource({ name: resName, schema: schema, design: {views:''} }, function(err, r) {
        expect(err).to.exist;
        done();
      });
    });

    it('should create with schema and design and hooks', function(done) {
      createResource({ name: resName, schema: schema, design: design,
                       hooks: hooks, createOption: 'create', loadOption: 'load', saveOption: 'save' }, function(err, r) {
        expect(err).to.not.exist;
        expect(r).to.be.a('object');

        res = r;

        expect(res.create).to.be.a('function');
        expect(res.load).to.be.a('function');
        expect(res.save).to.be.a('function');
        expect(res.destroy).to.be.a('function');
        expect(res.view).to.be.a('function');
        
        done();
      });
    });

    it('should upload design and schema to db', function(done) {
      db.get('_design/' + res.design.name, function(err, doc) {
        expect(err).to.not.exist;
        expect(doc.views).to.be.a('object');
        expect(doc.views.all).to.exist;
        expect(doc.views.titles).to.exist;
        expect(doc.schema).to.be.a('object');
        done();
      });
    });
  });


  describe('Resource document methods', function() {

    var doc;

    it('should create a document', function(done) {
      res.create(function(err, d) {
        expect(err).to.not.exist;
        expect(d).to.be.a('object');
        expect(res.checkType(d)).to.not.exist;
        done();
      });
    });

    it('should create a document with data', function(done) {
      res.create(data, function(err, d) {
        expect(err).to.not.exist;
        expect(d).to.be.a('object');
        expect(res.checkType(d)).to.not.exist;

        doc = d;
        
        done();
      });
    });

    it('should not validate data without required properties', function(done) {
      res.validate({ type_: 'Article' }, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should validate with required properties', function(done) {
      res.validate(data, function(err) {
        expect(err).to.not.exist;
        done();
      });
    });
    
    it('should not save when not valid', function(done) {
      res.save({ type_: 'Article' }, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should save when valid', function(done) {
      res.save(doc, function(err, d) {
        expect(err).to.not.exist;
        expect(d).to.be.a('object');
        expect(d._id).to.be.a('string');
        expect(d._rev).to.be.a('string');
        done();
      });
    });

    it('should save when updated', function(done) {
      doc.title = 'Some other title';
      res.save(doc, function(err, d) {
        expect(err).to.not.exist;
        expect(d).to.be.a('object');
        expect(d._id).to.equal(doc._id);
        expect(d._rev).to.equal(doc._rev);
        done();
      });
    });

    it('should not save when has wrong type', function(done) {
      res.save({ _id: 'somefoo', type_: 'Foo' }, function(err, d) {
        expect(err).to.exist;
        done();
      });
    });
    
    it('should load', function(done) {
      res.load(doc._id, function(err, d) {
        expect(err).to.not.exist;
        expect(d.title).to.equal(doc.title);
        done();
      });
    });

    it('should have the properties from the hooks', function(done) {
      res.load(doc._id, function(err, d) {
        expect(err).to.not.exist;
        expect(d.createHook).to.equal('create');
        expect(d.loadHook).to.equal('load');
        expect(d.saveHook).to.equal('save');
        done();
      });
    });

    it('should destroy', function(done) {
      res.destroy(doc, function(err) {
        expect(err).to.not.exist;
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
        expect(err).to.not.exist;
        expect(docs).to.be.a('object');
        expect(docs.total_rows).to.equal(numDocs);
        done();
      });
    });


    it('should call the all view with params', function(done) {
      res.view('all', { limit: 2  }, function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('object');
        expect(docs.total_rows).to.equal(numDocs);
        expect(docs.rows.length).to.equal(2);
        done();
      });
    });

    it('should call the titles view', function(done) {
      res.view('titles', function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('object');
        expect(docs.total_rows).to.equal(numDocs);
        done();
      });
    });

    it('should call the titles view with params', function(done) {
      res.view('titles', { limit: 1 }, function(err, docs) {
        expect(err).to.not.exist;
        expect(docs.total_rows).to.equal(numDocs);
        expect(docs.rows.length).to.equal(1);
        done();
      });
    });

    it('should respond with error when view does not exist', function(done) {
      res.view('foo', function(err, docs) {
        expect(err).to.exist;
        done();
      });
    });
  });
});